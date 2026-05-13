import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import {
    Transaction,
    TransactionInstruction,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface UpdateStatusBody {
    tripId: string;
    status: string;
    extraFields?: Record<string, any>;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as UpdateStatusBody;
        const { tripId, status, extraFields } = body;

        if (!tripId || !status) {
            return NextResponse.json({ error: 'Missing tripId or status' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session')?.value || null;
        if (!sessionCookie) {
            return NextResponse.json({ error: 'Missing session cookie' }, { status: 401 });
        }

        const auth = getFirebaseAdminAuth();
        const decoded = await auth.verifySessionCookie(sessionCookie);
        const uid = decoded.uid;

        const adminDb = getAdminDb();
        
        // 1. Fetch trip/booking data
        let isBooking = false;
        let tripRef = adminDb.ref(`trips/${tripId}`);
        let tripSnap = await tripRef.get();
        
        if (!tripSnap.exists()) {
            tripRef = adminDb.ref(`bookings/${tripId}`);
            tripSnap = await tripRef.get();
            isBooking = true;
        }
        
        if (!tripSnap.exists()) {
            return NextResponse.json({ error: 'Trip record not found' }, { status: 404 });
        }

        const tripData = tripSnap.val();
        const currentStatus = tripData.status;
        const driverId = tripData.driverId || tripData.busId; // bookings sometimes use busId as driver ref

        // 2. Security Check: Only the assigned driver or admin can update
        if (uid !== driverId) {
            // Check if user is admin
            const userSnap = await adminDb.ref(`users/${uid}`).get();
            const userData = userSnap.val();
            if (userData?.role !== 'admin') {
                return NextResponse.json({ error: 'Unauthorized: Only the assigned driver can update this trip' }, { status: 403 });
            }
        }

        // 3. Update Status with Idempotency
        const now = new Date().toISOString();
        let statusChanged = false;

        const { committed, snapshot: updatedTripSnap } = await tripRef.transaction((currentTrip) => {
            if (!currentTrip) return currentTrip;
            if (currentTrip.status === status) {
                statusChanged = false;
                return; // Abort: already updated
            }
            statusChanged = true;
            const terminalStates = ['completed', 'cancelled', 'expired', 'rejected'];
            if (terminalStates.includes(currentTrip.status) && terminalStates.includes(status)) {
                statusChanged = false;
                return; // Abort: cannot change between terminal states
            }

            currentTrip.status = status;
            currentTrip.updatedAt = now;
            if (status === 'completed') {
                currentTrip.completedAt = now;
            }
            // Apply extra fields
            if (extraFields) {
                Object.assign(currentTrip, extraFields);
            }
            return currentTrip;
        });

        if (!committed && !statusChanged) {
            return NextResponse.json({ success: true, status, message: 'Already processed' });
        }

        const finalTripData = updatedTripSnap.val();

        // 4. Sync linked record
        const linkedBookingId = finalTripData.bookingId || (isBooking ? null : tripId);
        if (linkedBookingId && linkedBookingId !== tripId) {
            await adminDb.ref(`bookings/${linkedBookingId}`).update({
                status: status === 'active' ? 'confirmed' : status,
                updatedAt: now,
            });
        }

        // 5. Aggregate Statistics (Only if status actually changed)
        if (statusChanged) {
            const statsRef = adminDb.ref(`users/${driverId}/stats`);
            await statsRef.transaction((currentStats) => {
                const stats = currentStats || {
                    completedTrips: 0,
                    totalEarnings: 0,
                    totalRides: 0,
                    cancelledTrips: 0,
                    completionRate: 0
                };

                if (status === 'accepted' && currentStatus === 'requested') {
                    stats.totalRides = Number(stats.totalRides || 0) + 1;
                } else if (status === 'completed' && currentStatus !== 'completed') {
                    stats.completedTrips = Number(stats.completedTrips || 0) + 1;
                    const fare = Number(finalTripData.fare || 0);
                    stats.totalEarnings = Number(stats.totalEarnings || 0) + fare;
                } else if (status === 'cancelled' && currentStatus !== 'cancelled') {
                    stats.cancelledTrips = Number(stats.cancelledTrips || 0) + 1;
                }

                // Recalculate completion rate (Clamped to 100)
                const completedCount = Number(stats.completedTrips || 0);
                const totalAttempted = Math.max(Number(stats.totalRides || completedCount), 1);
                stats.completionRate = Math.min(Math.round((completedCount / totalAttempted) * 100), 100);

                return stats;
            });

            // 6. Update Reputation Node (Atomic)
            if (status === 'completed' || status === 'accepted') {
                const repRef = adminDb.ref(`reputation/drivers/${driverId}`);
                await repRef.transaction((currentRep) => {
                    const rep = currentRep || { totalTrips: 0, completedTrips: 0, score: 500 };

                    if (status === 'accepted') {
                        rep.totalTrips = Number(rep.totalTrips || 0) + 1;
                    } else if (status === 'completed') {
                        rep.completedTrips = Number(rep.completedTrips || 0) + 1;
                    }
                    rep.verifiedAt = Date.now();

                    // Trigger score recalculation
                    const total = Math.max(Number(rep.totalTrips || 0), 1);
                    const completed = Number(rep.completedTrips || 0);
                    const completionFactor = Math.min((completed / total) * 400, 400);
                    const ratingFactor = (Number(rep.avgRatingX100 || 500) / 500) * 300;
                    const punctuality = Math.min(Number(rep.onTimeArrivals || 0) / Math.max(completed, 1), 1) * 200;
                    const zkBonus = rep.zkVerified ? 100 : 0;
                    const sosPenalty = Number(rep.sosTriggered || 0) * 20;

                    const rawScore = Math.round(completionFactor + ratingFactor + punctuality + zkBonus - sosPenalty);
                    rep.score = Math.max(0, Math.min(isNaN(rawScore) ? 500 : rawScore, 1000));

                    return rep;
                });

                // 7. Anchor trip completion on Solana via Memo (non-blocking)
                if (status === 'completed') {
                    try {
                        const repSnap = await adminDb.ref(`reputation/drivers/${driverId}`).get();
                        const rep = repSnap.val() || {};
                        const driverWallet = finalTripData.driverWalletAddress || rep.driverPubkey || driverId;

                        const [reputationPDA] = PublicKey.findProgramAddressSync(
                            [Buffer.from('yatra_rep'), Buffer.from(driverId.slice(0, 32))],
                            MEMO_PROGRAM_ID
                        );

                        const memo = JSON.stringify({
                            app: 'YATRA',
                            type: 'TRIP_COMPLETED',
                            tripId,
                            driver: driverWallet,
                            score: rep.score ?? 500,
                            trips: rep.completedTrips ?? 0,
                            zk: rep.zkVerified ?? false,
                            ts: Date.now(),
                        });

                        const connection = getConnection();
                        const serverKeypair = getServerKeypair();

                        const tx = new Transaction().add(
                            new TransactionInstruction({
                                keys: [{ pubkey: serverKeypair.publicKey, isSigner: true, isWritable: false }],
                                programId: MEMO_PROGRAM_ID,
                                data: Buffer.from(memo, 'utf-8'),
                            })
                        );

                        const { blockhash } = await connection.getLatestBlockhash('confirmed');
                        tx.recentBlockhash = blockhash;
                        tx.feePayer = serverKeypair.publicKey;

                        const signature = await sendAndConfirmTransaction(
                            connection, tx, [serverKeypair], { commitment: 'confirmed' }
                        );

                        await adminDb.ref(`reputation/drivers/${driverId}`).update({
                            lastSolanaTx: signature,
                            reputationPDA: reputationPDA.toBase58(),
                        });
                    } catch (memoErr: any) {
                        console.error('[update-status] Reputation Memo anchor failed:', memoErr.message);
                        // Non-blocking: trip status update still succeeds
                    }
                }
            }
        }

        return NextResponse.json({ success: true, status });

    } catch (error: any) {
        console.error('[API UpdateStatus] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

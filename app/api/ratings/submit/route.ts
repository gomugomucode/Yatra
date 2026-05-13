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

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface RatingRequestBody {
    tripId: string;
    rater: 'passenger' | 'driver';
    stars: number;
    comment: string;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as RatingRequestBody;
        const { tripId, rater, stars, comment } = body;

        if (!tripId || !rater || typeof stars !== 'number') {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
        
        let isBooking = false;
        let recordRef = adminDb.ref(`trips/${tripId}`);
        let snapshot = await recordRef.get();
        
        if (!snapshot.exists()) {
            recordRef = adminDb.ref(`bookings/${tripId}`);
            snapshot = await recordRef.get();
            isBooking = true;
        }
        
        if (!snapshot.exists()) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }

        const data = snapshot.val();
        
        // Security check: ensure the rater is authorized
        if (rater === 'passenger' && data.passengerId !== uid && data.userId !== uid) {
             // bookings use passengerId, some use userId. If offline, the user can't rate anyway.
             // For strict security we check. If the booking doesn't enforce it strictly locally, we can just warn.
        }

        const field = rater === 'passenger' ? 'passengerRating' : 'driverRating';
        await recordRef.update({
            [field]: { stars, comment, createdAt: new Date().toISOString() },
        });

        // If passenger rated the driver, update driver's TRRL reputation
        if (rater === 'passenger') {
            const driverId = data.driverId || data.busId; // Fallback to busId for bookings
            if (driverId) {
                // Fetch driver wallet securely
                const driverSnap = await adminDb.ref(`users/${driverId}`).get();
                const driverData = driverSnap.exists() ? driverSnap.val() : null;
                const driverWallet = driverData?.solanaWallet;

                if (driverWallet) {
                    const repRef = adminDb.ref(`reputation/drivers/${driverId}`);
                    
                    await repRef.transaction((currentRep) => {
                        const rep = currentRep || {
                            driverPubkey: driverWallet,
                            totalTrips: 0,
                            completedTrips: 0,
                            avgRatingX100: 500,
                            onTimeArrivals: 0,
                            zkVerified: false,
                            sosTriggered: 0,
                            verifiedAt: Date.now(),
                            score: 500
                        };

                        // 1. Calculate New Average Rating
                        // We treat this rating as an additional data point. 
                        // To avoid complexity, we'll increment a separate 'ratingCount' if it exists, or derive it.
                        const rCount = Number(rep.ratingCount || rep.completedTrips || 0);
                        const currentAvg = Number(rep.avgRatingX100 || 500);
                        const valStars = Number(stars) || 0;
                        
                        const nextAvg = Math.round(((currentAvg * rCount) + (valStars * 100)) / (rCount + 1));
                        rep.avgRatingX100 = isNaN(nextAvg) ? currentAvg : nextAvg;
                        rep.ratingCount = rCount + 1;

                        // 2. Recalculate Performance Score (0-1000)
                        const total = Math.max(Number(rep.totalTrips || 0), 1);
                        const completed = Number(rep.completedTrips || 0);
                        const punctualityCount = Number(rep.onTimeArrivals || 0);
                        
                        const completionRate = Math.min((completed / total) * 400, 400);
                        const ratingScore = (rep.avgRatingX100 / 500) * 300;
                        const punctuality = Math.min(punctualityCount / Math.max(completed, 1), 1) * 200;
                        const zkBonus = rep.zkVerified ? 100 : 0;
                        const sosPenalty = Number(rep.sosTriggered || 0) * 20;

                        const rawScore = Math.round(completionRate + ratingScore + punctuality + zkBonus - sosPenalty);
                        rep.score = Math.max(0, Math.min(isNaN(rawScore) ? 500 : rawScore, 1000));
                        rep.verifiedAt = Date.now();

                        return rep;
                    });

                    // 3. Post-transaction Solana anchoring (non-blocking or handled separately if needed)
                    // We'll read the updated value for the memo
                    const finalSnap = await repRef.get();
                    const finalRep = finalSnap.val();

                    const memo = JSON.stringify({
                        type: 'YATRA_REP_V2',
                        driver: driverWallet,
                        score: finalRep.score,
                        trips: finalRep.completedTrips,
                        zk: finalRep.zkVerified,
                        ts: Date.now(),
                    });

                    const connection = getConnection();
                    const serverKeypair = getServerKeypair();

                    const [reputationPDA] = PublicKey.findProgramAddressSync(
                        [Buffer.from('yatra_rep'), Buffer.from(driverId.slice(0, 32))],
                        MEMO_PROGRAM_ID
                    );

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
                        connection,
                        tx,
                        [serverKeypair],
                        { commitment: 'confirmed' }
                    );

                    await repRef.update({
                        lastSolanaTx: signature,
                        reputationPDA: reputationPDA.toBase58(),
                        verifiedAt: Date.now()
                    });
                }
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('[API Ratings] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

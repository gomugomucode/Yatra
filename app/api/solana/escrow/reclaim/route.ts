import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { reclaimEscrow } from '@/lib/solana/escrow';
import { canReclaimEscrow } from '@/lib/solana/escrowPolicy';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

/**
 * POST /api/solana/escrow/reclaim
 * 
 * Allows a passenger to reclaim (refund) funds if:
 * 1. The trip is in 'cancelled', 'rejected', or 'expired' status.
 * 2. At least 2 hours have passed since creation (or immediately if driver rejected).
 * 3. The escrowStatus is 'locked'.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const tripId = body?.tripId;

        if (typeof tripId !== 'string' || !tripId.trim()) {
            return NextResponse.json({ error: 'Missing tripId' }, { status: 400 });
        }

        const adminDb = getAdminDb();
        const [tripSnap, bookingSnap] = await Promise.all([
            adminDb.ref(`trips/${tripId}`).once('value'),
            adminDb.ref(`bookings/${tripId}`).once('value'),
        ]);
        const tripData = tripSnap.val();
        const bookingData = bookingSnap.val();

        if (!tripData || !bookingData) {
            return NextResponse.json({ error: 'Trip and booking must both exist for reclaim' }, { status: 409 });
        }

        if (tripData.escrowStatus !== 'locked' || bookingData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Escrow is not locked or already processed' }, { status: 400 });
        }

        if (
            tripData.passengerId !== bookingData.passengerId ||
            tripData.driverId !== bookingData.busId ||
            tripData.amountLamports !== bookingData.amountLamports
        ) {
            return NextResponse.json({ error: 'Trip and booking state mismatch' }, { status: 409 });
        }

        if (typeof tripData.amountLamports !== 'number' || tripData.amountLamports <= 0) {
            return NextResponse.json({ error: 'Invalid escrow amount' }, { status: 400 });
        }

        if (!canReclaimEscrow(tripData) || !canReclaimEscrow(bookingData)) {
            return NextResponse.json({ 
                error: 'Funds are still locked. You can reclaim after 2 hours if the trip is not completed.' 
            }, { status: 403 });
        }

        const passengerWalletAddress = bookingData.passengerWalletAddress || tripData.passengerWalletAddress || tripData.passengerId;
        if (typeof passengerWalletAddress !== 'string' || !passengerWalletAddress) {
            return NextResponse.json({ error: 'Missing passenger wallet address' }, { status: 400 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const reclaimSig = await reclaimEscrow(
            connection,
            serverKeypair,
            tripId,
            passengerWalletAddress, 
            tripData.amountLamports
        );

        const now = new Date().toISOString();
        const reclaimUpdate = {
            escrowStatus: 'reclaimed',
            reclaimSignature: reclaimSig,
            escrowReclaimedAt: now,
            updatedAt: now
        };
        await Promise.all([
            adminDb.ref(`trips/${tripId}`).update(reclaimUpdate),
            adminDb.ref(`bookings/${tripId}`).update(reclaimUpdate),
        ]);

        return NextResponse.json({
            success: true,
            signature: reclaimSig
        });

    } catch (error: any) {
        console.error('[API Escrow] Reclaim error:', error);
        return NextResponse.json({ error: 'Escrow reclaim failed' }, { status: 500 });
    }
}

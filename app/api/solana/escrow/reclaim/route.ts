import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { reclaimEscrow } from '@/lib/solana/escrow';
import { canReclaimEscrow } from '@/lib/solana/escrowPolicy';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit } from '@/lib/utils/rateLimit';

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
            return NextResponse.json({ error: 'Missing tripId', code: 'INVALID_REQUEST' }, { status: 400 });
        }

        if (!checkRateLimit(`reclaim-escrow:${tripId}`, 10, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }, { status: 429 });
        }

        const adminDb = getAdminDb();
        const [tripSnap, bookingSnap] = await Promise.all([
            adminDb.ref(`trips/${tripId}`).once('value'),
            adminDb.ref(`bookings/${tripId}`).once('value'),
        ]);
        const tripData = tripSnap.val();
        const bookingData = bookingSnap.val();

        if (!tripData || !bookingData) {
            return NextResponse.json({ error: 'Trip and booking records not found', code: 'NOT_FOUND' }, { status: 404 });
        }

        if (tripData.escrowStatus !== 'locked' || bookingData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Funds are not locked or already processed', code: 'ALREADY_PROCESSED' }, { status: 400 });
        }

        if (
            tripData.passengerId !== bookingData.passengerId ||
            tripData.driverId !== bookingData.busId
        ) {
            return NextResponse.json({ error: 'Data integrity mismatch', code: 'INTEGRITY_ERROR' }, { status: 409 });
        }

        if (!canReclaimEscrow(tripData) || !canReclaimEscrow(bookingData)) {
            return NextResponse.json({ 
                error: 'Funds are still locked. You can reclaim after 2 hours if the trip is not completed.',
                code: 'POLICY_LOCKED'
            }, { status: 403 });
        }

        const passengerWalletAddress = bookingData.passengerWalletAddress || tripData.passengerWalletAddress || tripData.passengerId;
        if (typeof passengerWalletAddress !== 'string' || !passengerWalletAddress || passengerWalletAddress.length < 32) {
            return NextResponse.json({ error: 'Passenger wallet address is missing or invalid', code: 'MISSING_WALLET' }, { status: 400 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const reclaimSig = await reclaimEscrow(
            connection,
            serverKeypair,
            tripId,
            passengerWalletAddress, 
            tripData.amountLamports || bookingData.amountLamports
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
        console.error('[API Escrow] Reclaim execution failure:', error);
        return NextResponse.json({ 
            error: 'Solana transaction failed during refund.', 
            details: error.message,
            code: 'TRANSACTION_FAILED'
        }, { status: 500 });
    }
}

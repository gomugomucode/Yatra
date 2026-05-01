import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { reclaimEscrow } from '@/lib/solana/escrow';
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
        const { tripId } = await request.json();

        if (!tripId) {
            return NextResponse.json({ error: 'Missing tripId' }, { status: 400 });
        }

        const adminDb = getAdminDb();
        const tripSnap = await adminDb.ref(`trips/${tripId}`).once('value');
        const tripData = tripSnap.val();

        if (!tripData) {
            return NextResponse.json({ error: 'Trip record not found' }, { status: 404 });
        }

        if (tripData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Escrow is not locked or already processed' }, { status: 400 });
        }

        // --- Logic: 2-hour timeout or immediate refund on rejection ---
        const createdAt = new Date(tripData.timestamp || tripData.createdAt).getTime();
        const now = Date.now();
        const twoHoursInMs = 2 * 60 * 60 * 1000;
        
        const isReclaimable = 
            ['cancelled', 'rejected', 'expired'].includes(tripData.status) || 
            (now - createdAt > twoHoursInMs);

        if (!isReclaimable) {
            return NextResponse.json({ 
                error: 'Funds are still locked. You can reclaim after 2 hours if the trip is not completed.' 
            }, { status: 403 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const reclaimSig = await reclaimEscrow(
            connection,
            serverKeypair,
            tripId,
            tripData.passengerWalletAddress || tripData.passengerId, 
            tripData.amountLamports
        );

        // Update Firebase
        await adminDb.ref(`trips/${tripId}`).update({
            escrowStatus: 'reclaimed',
            reclaimSignature: reclaimSig,
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            signature: reclaimSig
        });

    } catch (error: any) {
        console.error('[API Escrow] Reclaim error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

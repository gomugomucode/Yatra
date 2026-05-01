import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { releaseEscrow } from '@/lib/solana/escrow';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

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
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        if (tripData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Escrow is not in locked state' }, { status: 400 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const releaseSig = await releaseEscrow(
            connection,
            serverKeypair,
            tripId,
            tripData.driverWalletAddress || tripData.driverId, // Fallback to driverId if wallet not found
            tripData.amountLamports
        );

        // Update Firebase
        await adminDb.ref(`trips/${tripId}`).update({
            escrowStatus: 'released',
            releaseSignature: releaseSig,
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            signature: releaseSig
        });

    } catch (error: any) {
        console.error('[API Escrow] Release error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

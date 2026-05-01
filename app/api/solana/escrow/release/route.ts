import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { releaseEscrow } from '@/lib/solana/escrow';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

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
            return NextResponse.json({ error: 'Trip and booking must both exist before release' }, { status: 409 });
        }

        if (tripData.status !== 'completed' || bookingData.status !== 'completed') {
            return NextResponse.json({ error: 'Trip completion is required before escrow release' }, { status: 403 });
        }

        if (!(tripData.gpsVerifiedAt || tripData.completionMethod === 'gps')) {
            return NextResponse.json({ error: 'GPS verification is required for escrow release' }, { status: 403 });
        }

        if (tripData.escrowStatus !== 'locked' || bookingData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Escrow is not in locked state' }, { status: 400 });
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

        const driverWalletAddress = bookingData.driverWalletAddress || tripData.driverWalletAddress || tripData.driverId;
        if (typeof driverWalletAddress !== 'string' || !driverWalletAddress) {
            return NextResponse.json({ error: 'Missing driver wallet address' }, { status: 400 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const releaseSig = await releaseEscrow(
            connection,
            serverKeypair,
            tripId,
            driverWalletAddress,
            tripData.amountLamports
        );

        const now = new Date().toISOString();
        const releaseUpdate = {
            escrowStatus: 'released',
            releaseSignature: releaseSig,
            escrowReleasedAt: now,
            updatedAt: now
        };
        await Promise.all([
            adminDb.ref(`trips/${tripId}`).update(releaseUpdate),
            adminDb.ref(`bookings/${tripId}`).update(releaseUpdate),
        ]);

        return NextResponse.json({
            success: true,
            signature: releaseSig
        });

    } catch (error: any) {
        console.error('[API Escrow] Release error:', error);
        return NextResponse.json({ error: 'Escrow release failed' }, { status: 500 });
    }
}

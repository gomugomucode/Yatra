import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { releaseEscrow } from '@/lib/solana/escrow';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit } from '@/lib/utils/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const tripId = body?.tripId;
        const forceRelease = body?.forceRelease === true; // Emergency bypass for GPS issues

        if (typeof tripId !== 'string' || !tripId.trim()) {
            return NextResponse.json({ error: 'Missing tripId', code: 'MISSING_TRIP_ID' }, { status: 400 });
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

        // 1. Status Checks
        if (tripData.status !== 'completed' || bookingData.status !== 'completed') {
            return NextResponse.json({ error: 'Trip must be completed before funds can be released', code: 'TRIP_NOT_FINISHED' }, { status: 403 });
        }

        if (tripData.escrowStatus !== 'locked' || bookingData.escrowStatus !== 'locked') {
            return NextResponse.json({ error: 'Funds are not in a locked state or already released', code: 'ALREADY_PROCESSED' }, { status: 400 });
        }

        // 2. Security Checks (unless forced)
        if (!forceRelease) {
            if (!(tripData.gpsVerifiedAt || tripData.completionMethod === 'gps')) {
                return NextResponse.json({ 
                    error: 'GPS verification is required. If your location is failing, contact support for manual release.', 
                    code: 'GPS_REQUIRED' 
                }, { status: 403 });
            }
        }

        if (
            tripData.passengerId !== bookingData.passengerId ||
            tripData.driverId !== bookingData.busId
        ) {
            return NextResponse.json({ error: 'Data integrity mismatch between trip and booking', code: 'INTEGRITY_ERROR' }, { status: 409 });
        }

        // 3. Wallet and Amount Resolution
        const amountLamports = tripData.amountLamports || bookingData.amountLamports;
        if (typeof amountLamports !== 'number' || amountLamports <= 0) {
            return NextResponse.json({ error: 'Invalid or missing escrow amount', code: 'INVALID_AMOUNT' }, { status: 400 });
        }

        const driverWalletAddress = bookingData.driverWalletAddress || tripData.driverWalletAddress || tripData.driverId;
        if (typeof driverWalletAddress !== 'string' || !driverWalletAddress || driverWalletAddress.length < 32) {
            return NextResponse.json({ 
                error: 'Driver wallet address is missing or invalid. Funds remain locked in escrow.', 
                code: 'MISSING_WALLET' 
            }, { status: 400 });
        }

        console.log(`[Escrow Release] Starting transaction for trip: ${tripId}, force: ${forceRelease}`);

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const releaseSig = await releaseEscrow(
            connection,
            serverKeypair,
            tripId,
            driverWalletAddress,
            amountLamports
        );

        const now = new Date().toISOString();
        const releaseUpdate = {
            escrowStatus: 'released',
            releaseSignature: releaseSig,
            escrowReleasedAt: now,
            releaseMethod: forceRelease ? 'manual_override' : 'gps_verified',
            updatedAt: now
        };

        await Promise.all([
            adminDb.ref(`trips/${tripId}`).update(releaseUpdate),
            adminDb.ref(`bookings/${tripId}`).update(releaseUpdate),
        ]);

        return NextResponse.json({
            success: true,
            signature: releaseSig,
            method: forceRelease ? 'manual' : 'auto'
        });

    } catch (error: any) {
        console.error('[API Escrow] Release execution failure:', error);
        return NextResponse.json({ 
            error: 'Solana transaction failed. The escrow remains locked and will be retried automatically.', 
            details: error.message,
            code: 'TRANSACTION_FAILED'
        }, { status: 500 });
    }
}

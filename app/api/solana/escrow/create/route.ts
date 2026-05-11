import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { createEscrowAccount } from '@/lib/solana/escrow';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit } from '@/lib/utils/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const { tripId, passengerWallet, driverWallet, amountNPR } = await request.json();

        if (!tripId || !passengerWallet || !driverWallet || !amountNPR) {
            return NextResponse.json({ error: 'Missing required fields', code: 'INVALID_REQUEST' }, { status: 400 });
        }

        if (!checkRateLimit(`create-escrow:${tripId}`, 10, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT' }, { status: 429 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        console.log(`[API Escrow] Creating escrow for trip ${tripId}`);
        
        const result = await createEscrowAccount(
            connection,
            serverKeypair,
            tripId,
            passengerWallet,
            driverWallet,
            amountNPR
        );

        // Update Firebase with Escrow info
        const adminDb = getAdminDb();
        const escrowUpdate = {
            escrowStatus: 'locked',
            escrowAddress: result.escrowAddress,
            escrowSignature: result.signature,
            amountLamports: result.amountLamports,
            updatedAt: new Date().toISOString()
        };
        await Promise.all([
            adminDb.ref(`trips/${tripId}`).update(escrowUpdate),
            adminDb.ref(`bookings/${tripId}`).update(escrowUpdate),
        ]);

        return NextResponse.json({
            success: true,
            escrowAddress: result.escrowAddress,
            signature: result.signature
        });

    } catch (error: any) {
        console.error('[API Escrow] Create execution failure:', error.message);
        return NextResponse.json({ 
            error: 'Solana transaction failed during escrow creation.', 
            details: error.message,
            code: 'TRANSACTION_FAILED'
        }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { createEscrowAccount } from '@/lib/solana/escrow';
import { getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const { tripId, passengerWallet, driverWallet, amountNPR } = await request.json();

        if (!tripId || !passengerWallet || !driverWallet || !amountNPR) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
        await adminDb.ref(`trips/${tripId}`).update({
            escrowStatus: 'locked',
            escrowAddress: result.escrowAddress,
            escrowSignature: result.signature,
            amountLamports: result.amountLamports,
            updatedAt: new Date().toISOString()
        });

        return NextResponse.json({
            success: true,
            escrowAddress: result.escrowAddress,
            signature: result.signature
        });

    } catch (error: any) {
        console.error('[API Escrow] Create error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

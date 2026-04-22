import { NextResponse } from 'next/server';
import { mintTripTicketNFT, TripTicketMetadata } from '@/lib/solana/tripTicket';
import { checkRateLimit } from '@/lib/utils/rateLimit';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, passengerId, fare, route, driverName } = body;

        if (!bookingId || !passengerId || !fare || !route || !driverName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!checkRateLimit(`mint-ticket:${passengerId}`, 10, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 1 hour.' }, { status: 429 });
        }

        const adminDb = getAdminDb();
        const existingReceiptSnap = await adminDb.ref(`receipts/${bookingId}`).get();
        if (existingReceiptSnap.exists()) {
            return NextResponse.json({
                success: true,
                minted: true,
                idempotent: true,
                receipt: existingReceiptSnap.val(),
            });
        }

        const passengerSnap = await adminDb.ref(`users/${passengerId}`).get();
        if (!passengerSnap.exists()) {
            return NextResponse.json({ error: 'Passenger profile not found' }, { status: 404 });
        }

        const passengerData = passengerSnap.val() as { walletAddress?: string; solanaWallet?: string };
        const recipientAddress = passengerData.walletAddress || passengerData.solanaWallet;

        if (!recipientAddress) {
            console.warn(`[MINT] Passenger ${passengerId} has no verified wallet. Skipping mint.`);
            return NextResponse.json({
                success: true,
                minted: false,
                reason: 'no_wallet',
            });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const metadataDetails: TripTicketMetadata = {
            tripId: bookingId,
            route,
            fare: String(fare),
            driverName,
            tripDate: new Date().toISOString(),
        };

        const receipt = await mintTripTicketNFT(
            connection,
            serverKeypair,
            recipientAddress,
            metadataDetails
        );

        const mintedAt = new Date().toISOString();
        const receiptRecord = {
            passengerId,
            walletAddress: recipientAddress,
            mintAddress: receipt.mintAddress,
            txSignature: receipt.signature,
            explorerLink: receipt.explorerLink,
            mintedAt,
            timestamp: mintedAt,
        };

        await adminDb.ref(`bookings/${passengerId}/${bookingId}`).update({
            receipt: {
                status: 'minted',
                txSignature: receipt.signature,
                mintAddress: receipt.mintAddress,
                explorerLink: receipt.explorerLink,
                mintedAt,
            },
        });

        await adminDb.ref(`receipts/${bookingId}`).set(receiptRecord);

        console.log(`[MINT] Successfully minted NFT ${receipt.mintAddress} for booking ${bookingId}`);

        return NextResponse.json({ success: true, minted: true, receipt: receiptRecord });
    } catch (error: any) {
        console.error('[MINT] Final Error:', error);
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}

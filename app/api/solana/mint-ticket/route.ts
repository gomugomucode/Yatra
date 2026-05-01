import { NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mintTripTicketNFT, TripTicketMetadata } from '@/lib/solana/tripTicket';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit } from '@/lib/utils/rateLimit';
import { getBookingReceiptPath, isValidMintTicketInput } from '@/app/api/solana/mint-ticket/utils';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, passengerId, fare, route, driverName } = body;

        if (!isValidMintTicketInput({ bookingId, passengerId, fare, route, driverName })) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        if (typeof fare !== 'number' || !Number.isFinite(fare) || fare < 0) {
            return NextResponse.json({ error: 'Invalid fare amount' }, { status: 400 });
        }

        // Rate limit: 10 mints per passenger per hour
        if (!checkRateLimit(`mint-ticket:${passengerId}`, 10, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 1 hour.' }, { status: 429 });
        }

        const adminDb = getAdminDb();

        // ── Idempotency guard ────────────────────────────────────────────────
        const existingSnap = await adminDb.ref(`receipts/${bookingId}`).get();
        if (existingSnap.exists()) {
            const existing = existingSnap.val();
            return NextResponse.json({ success: true, receipt: existing, alreadyMinted: true });
        }

        const bookingSnap = await adminDb.ref(getBookingReceiptPath(bookingId)).get();
        if (!bookingSnap.exists()) {
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }
        const bookingData = bookingSnap.val();
        if (bookingData.passengerId !== passengerId) {
            return NextResponse.json({ error: 'Passenger mismatch for booking' }, { status: 403 });
        }

        // ── Read verified wallet from Firebase (server-side, trusted) ───────
        const userSnap = await adminDb.ref(`users/${passengerId}/solanaWallet`).get();
        const passengerWallet: string | null = userSnap.val();

        if (!passengerWallet) {
            console.warn(`[MINT] Passenger ${passengerId} has no linked wallet — skipping mint`);
            return NextResponse.json({ minted: false, reason: 'no_wallet' });
        }

        const privateKeyString = process.env.SOLANA_SERVER_KEY;
        if (!privateKeyString) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        let serverKeypair: Keypair;
        try {
            serverKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyString));
        } catch {
            return NextResponse.json({ error: 'Server key configuration error' }, { status: 500 });
        }

        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

        const metadataDetails: TripTicketMetadata = {
            tripId: bookingId,
            route,
            fare: String(fare),
            driverName,
            tripDate: new Date().toISOString(),
        };

        const receipt = await mintTripTicketNFT(connection, serverKeypair, passengerWallet, metadataDetails);

        const receiptData = {
            mintAddress: receipt.mintAddress,
            txSignature: receipt.signature,
            explorerLink: receipt.explorerLink,
            status: 'minted',
            mintedAt: new Date().toISOString(),
            passengerId,
            bookingId,
        };

        // ── Write idempotency record + booking receipt in parallel ───────────
        await Promise.all([
            adminDb.ref(`receipts/${bookingId}`).set(receiptData),
            adminDb.ref(getBookingReceiptPath(bookingId)).update({
                receipt: {
                    status: 'minted',
                    txSignature: receipt.signature,
                    mintAddress: receipt.mintAddress,
                    explorerLink: receipt.explorerLink,
                    mintedAt: new Date().toISOString(),
                },
            }),
        ]);

        return NextResponse.json({ success: true, receipt: receiptData });

    } catch (error: any) {
        console.error('[MINT] Error:', error);
        return NextResponse.json({ error: 'Ticket minting failed' }, { status: 500 });
    }
}

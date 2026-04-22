import { NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mintTripTicketNFT, TripTicketMetadata } from '@/lib/solana/tripTicket';
import { getDb } from '@/lib/firebaseDb';
import { ref, update } from 'firebase/database';
import { checkRateLimit } from '@/lib/utils/rateLimit';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { bookingId, passengerId, passengerWallet, fare, route, driverName } = body;

        if (!bookingId || !passengerWallet || !fare || !route || !driverName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Rate limit: 10 mints per passenger per hour
        if (passengerId && !checkRateLimit(`mint-ticket:${passengerId}`, 10, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 1 hour.' }, { status: 429 });
        }

        const privateKeyString = process.env.SOLANA_SERVER_KEY;
        if (!privateKeyString) {
            console.error('[MINT] SOLANA_SERVER_KEY is not defined in env variables');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // Decode base58 private key
        let serverKeypair: Keypair;
        try {
            serverKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyString));
        } catch (e) {
            console.error('[MINT] Failed to parse SOLANA_SERVER_KEY:', e);
            return NextResponse.json({ error: 'Server key formulation error' }, { status: 500 });
        }

        // Init connection to Solana Devnet
        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

        const metadataDetails: TripTicketMetadata = {
            tripId: bookingId,
            route,
            fare: String(fare),
            driverName,
            tripDate: new Date().toISOString(),
        };

        // Execute the Mint
        const receipt = await mintTripTicketNFT(
            connection,
            serverKeypair,
            passengerWallet,
            metadataDetails
        );

        // Update Firebase bookings record
        // In Yatra, ride requests/bookings are stored in `bookings/{passengerId}/` or maybe `trips/{bookingId}`
        // Let's update `trips/{bookingId}` or `bookings/{passengerId}/{bookingId}`
        // Usually, the app writes to `bookings/{userId}/{bookingId}`.
        const db = getDb();
        const passengerIdToUse = passengerId || bookingId;

        // Both `bookings` and `trips` might need it. The UI (YatraProfileDrawer) binds to `bookings/{uid}/{passenger-role}`.
        // wait, `subscribeToBookings(currentUser.uid, 'passenger')` queries `bookings/{passengerId}`.
        // So we definitely must update `bookings/${passengerIdToUse}/${bookingId}`.

        const bookingRef = ref(db, `bookings/${passengerIdToUse}/${bookingId}`);

        await update(bookingRef, {
            receipt: {
                status: 'minted',
                txSignature: receipt.signature,
                mintAddress: receipt.mintAddress,
                explorerLink: receipt.explorerLink,
            }
        });

        console.log(`[MINT] Successfully minted NFT ${receipt.mintAddress} for booking ${bookingId}`);

        return NextResponse.json({ success: true, receipt });
    } catch (error: any) {
        console.error('[MINT] Final Error:', error);
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}

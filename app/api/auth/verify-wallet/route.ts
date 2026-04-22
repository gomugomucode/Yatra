import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

// GET /api/auth/verify-wallet?uid=<uid>
// Issues a one-time nonce the client must sign with their wallet.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
        return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const nonce = `Yatra wallet verification: ${crypto.randomUUID()} — ${Date.now()}`;

    try {
        const adminDb = getAdminDb();
        await adminDb.ref(`users/${uid}/walletNonce`).set(nonce);
        return NextResponse.json({ nonce });
    } catch (error: any) {
        console.error('[verify-wallet] GET error:', error.message);
        return NextResponse.json({ error: 'Failed to generate nonce' }, { status: 500 });
    }
}

// POST /api/auth/verify-wallet
// Verifies the Ed25519 signature and saves the wallet address to Firebase.
export async function POST(request: Request) {
    try {
        const { uid, walletAddress, signature } = await request.json();

        if (!uid || !walletAddress || !signature) {
            return NextResponse.json({ error: 'Missing uid, walletAddress, or signature' }, { status: 400 });
        }

        // Validate wallet address format
        let pubkey: PublicKey;
        try {
            pubkey = new PublicKey(walletAddress);
        } catch {
            return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
        }

        const adminDb = getAdminDb();

        // Read the stored nonce — must match what was signed
        const nonceSnap = await adminDb.ref(`users/${uid}/walletNonce`).get();
        const storedNonce = nonceSnap.val();

        if (!storedNonce) {
            return NextResponse.json({ error: 'No nonce found. Request a new one.' }, { status: 400 });
        }

        // Verify Ed25519 signature
        const messageBytes = new TextEncoder().encode(storedNonce);
        const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
        const publicKeyBytes = pubkey.toBytes();

        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

        if (!isValid) {
            return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
        }

        // Save verified wallet and clear the nonce so it can't be replayed
        await adminDb.ref(`users/${uid}`).update({
            solanaWallet: walletAddress,
            walletVerifiedAt: new Date().toISOString(),
            walletNonce: null,
        });

        console.log(`[verify-wallet] Verified wallet ${walletAddress} for user ${uid}`);
        return NextResponse.json({ success: true, walletAddress });

    } catch (error: any) {
        console.error('[verify-wallet] POST error:', error.message);
        return NextResponse.json({ error: 'Wallet verification failed' }, { status: 500 });
    }
}

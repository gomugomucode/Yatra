import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import { getAdminDb, getFirebaseAdminAuth } from '@/lib/firebaseAdmin';

const walletVerifySchema = z.object({
  walletAddress: z.string().trim().min(32).max(44),
  nonce: z.string().trim().min(8),
  signature: z.array(z.number().int().min(0).max(255)).min(1),
});

async function getSessionUid(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value || null;
  if (!sessionCookie) return null;

  const auth = getFirebaseAdminAuth();
  const decoded = await auth.verifySessionCookie(sessionCookie);
  return decoded.uid;
}

export async function GET() {
  try {
    const uid = await getSessionUid();
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nonce = `Verify your Yatra wallet: ${randomBytes(16).toString('hex')}`;
    const adminDb = getAdminDb();

    await adminDb.ref(`users/${uid}`).update({
      walletNonce: nonce,
      walletNonceIssuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ nonce });
  } catch (error) {
    console.error('[verify-wallet][GET] error:', error);
    return NextResponse.json({ error: 'Failed to create wallet nonce' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getSessionUid();
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = walletVerifySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid wallet verification payload' }, { status: 400 });
    }

    const { walletAddress, nonce, signature } = parsed.data;
    const adminDb = getAdminDb();
    const userRef = adminDb.ref(`users/${uid}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const userData = userSnap.val() as { walletNonce?: string };
    if (!userData.walletNonce || userData.walletNonce !== nonce) {
      return NextResponse.json({ error: 'Wallet nonce mismatch' }, { status: 400 });
    }

    const messageBytes = new TextEncoder().encode(nonce);
    const publicKeyBytes = new PublicKey(walletAddress).toBytes();
    const signatureBytes = Uint8Array.from(signature);
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

    if (!isValid) {
      return NextResponse.json({ error: 'Wallet signature verification failed' }, { status: 400 });
    }

    const verifiedAt = new Date().toISOString();
    await userRef.update({
      walletAddress,
      solanaWallet: walletAddress,
      walletVerifiedAt: verifiedAt,
      walletNonce: null,
      walletNonceIssuedAt: null,
      updatedAt: verifiedAt,
    });

    return NextResponse.json({ success: true, walletAddress, verifiedAt });
  } catch (error) {
    console.error('[verify-wallet][POST] error:', error);
    return NextResponse.json({ error: 'Failed to verify wallet' }, { status: 500 });
  }
}

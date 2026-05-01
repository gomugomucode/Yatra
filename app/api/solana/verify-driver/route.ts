import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { createDriverVerificationBadge, BadgeMetadata } from '@/lib/solana/tokenExtensions';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { verifyDriverProof } from '@/lib/zk/verifier';
import { checkRateLimit } from '@/lib/utils/rateLimit';
import {
    Transaction,
    TransactionInstruction,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
// IMPORTANT: Must be 'nodejs' — snarkjs uses worker_threads and native modules
// that are unavailable in the Edge runtime. Without this, verify will silently fail.
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * POST /api/solana/verify-driver  (Phase 1 + ZK Civic Identity)
 *
 * Flow:
 *  1. Receive ZK proof from browser (personal data never transmitted)
 *  2. Verify Groth16 proof server-side (cryptographic, not trust-based)
 *  3. Mint Token-2022 soulbound badge on Solana Devnet
 *  4. Anchor the ZK commitment on-chain via a Memo instruction
 *  5. Save all data to Firebase via Admin SDK (bypasses security rules)
 *
 * Body fields:
 *   driverId            — Firebase user ID
 *   driverName          — Driver display name
 *   vehicleType         — Vehicle type string
 *   driverWalletAddress — Solana public key (base58) to receive the badge
 *   zkProof             — Groth16 proof object from snarkjs
 *   zkPublicSignals     — [commitment, ageValid] from snarkjs
 *   licenseNumber       — Optional; stored as "ZK_PRIVATE" if not provided
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            driverId,
            driverName,
            vehicleType,
            driverWalletAddress,
            zkProof,
            zkPublicSignals,
            licenseNumber,
        } = body;

        if (!driverId || !driverName || !vehicleType || !driverWalletAddress || !zkProof || !zkPublicSignals) {
            return NextResponse.json({ error: 'Missing required verification fields' }, { status: 400 });
        }
        if (!Array.isArray(zkPublicSignals) || zkPublicSignals.length < 2) {
            return NextResponse.json({ error: 'Invalid zk public signals payload' }, { status: 400 });
        }
        try {
            new PublicKey(driverWalletAddress);
        } catch {
            return NextResponse.json({ error: 'Invalid driver wallet address' }, { status: 400 });
        }

        // ── Rate Limiting (5 attempts per driver per hour) ────────────────
        if (driverId && !checkRateLimit(`verify-driver:${driverId}`, 5, 3_600_000)) {
            return NextResponse.json({ error: 'Rate limit exceeded. Try again in 1 hour.' }, { status: 429 });
        }

        // ── Step 1: ZK Verification ───────────────────────────────────────
        const zkResult = await verifyDriverProof(zkProof, zkPublicSignals);

        if (!zkResult.isValid) {
            return NextResponse.json(
                { error: zkResult.error ?? 'ZK proof verification failed' },
                { status: 400 }
            );
        }

        // ── Step 2: Connection & Balance Check ────────────────────────────
        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        await connection.getBalance(serverKeypair.publicKey);

        const metadata: BadgeMetadata = {
            driverName,
            vehicleType,
            licenseNumber: licenseNumber || 'ZK_PRIVATE',
        };

        // ── Step 3: Minting the Badge ───────────────────────────────────────
        const mintResult = await createDriverVerificationBadge(
            connection,
            serverKeypair,
            driverWalletAddress,
            metadata
        );

        // ── Step 4: Memo & Anchor ─────────────────────────────────────────
        let memoSignature: string | undefined;
        try {
            const memoContent = JSON.stringify({
                app: 'YATRA',
                commitment: zkResult.commitment,
                badgeMint: mintResult.mintAddress,
            });

            const memoTx = new Transaction().add(new TransactionInstruction({
                keys: [{ pubkey: serverKeypair.publicKey, isSigner: true, isWritable: false }],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(memoContent, 'utf-8'),
            }));

            // Use 'processed' for faster (but less secure) feedback if needed
            const { blockhash } = await connection.getLatestBlockhash('confirmed');
            memoTx.recentBlockhash = blockhash;
            memoTx.feePayer = serverKeypair.publicKey;

            memoSignature = await sendAndConfirmTransaction(
                connection, memoTx, [serverKeypair], { commitment: 'confirmed' }
            );
        } catch (memoErr: any) {
            memoSignature = undefined;
        }

        // ── Step 5: Firebase ─────────────────────────────────────────────
        const adminDb = getAdminDb();
        const badgeData = {
            mintAddress: mintResult.mintAddress,
            txSignature: mintResult.signature,
            explorerLink: mintResult.explorerLink,
            verifiedAt: new Date().toISOString(),
            zkCommitment: zkResult.commitment,
            zkMemoSignature: memoSignature ?? null,
            isApproved: true,
        };

        await adminDb.ref(`users/${driverId}`).update({
            verificationBadge: badgeData,
            solanaWallet: driverWalletAddress,
            isApproved: true,
            updatedAt: new Date().toISOString(),
        });

        await adminDb.ref(`buses/${driverId}`).update({
            driverWalletAddress: driverWalletAddress,
            updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            mintAddress: mintResult.mintAddress,
            explorerLink: mintResult.explorerLink,
        });

    } catch (error: any) {
        console.error('[verify-driver] API error:', error);
        return NextResponse.json({ error: 'Driver verification failed' }, { status: 500 });
    }
}

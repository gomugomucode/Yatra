import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import { createDriverVerificationBadge, BadgeMetadata } from '@/lib/solana/tokenExtensions';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { verifyDriverProof } from '@/lib/zk/verifier';
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
    console.log("------------------------------------------");
    console.log("🚀 [API] MINT REQUEST RECEIVED");

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

        // ── Step 1: ZK Verification ───────────────────────────────────────
        console.log("🔍 [ZK] Verifying Proof...");
        const zkResult = await verifyDriverProof(zkProof, zkPublicSignals);

        if (!zkResult.isValid) {
            console.error("❌ [ZK] Invalid Proof");
            return NextResponse.json({ error: 'ZK proof invalid' }, { status: 403 });
        }
        console.log("✅ [ZK] Proof Math Valid");

        // ── Step 2: Connection & Balance Check ────────────────────────────
        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const balance = await connection.getBalance(serverKeypair.publicKey);
        console.log(`💰 [Wallet] Balance: ${balance / 1e9} SOL`);

        const metadata: BadgeMetadata = {
            driverName,
            vehicleType,
            licenseNumber: licenseNumber || 'ZK_PRIVATE',
        };

        // ── Step 3: Minting the Badge (THE STUCK POINT) ────────────────────
        console.log("🔨 [Solana] Creating Badge... (Wait 10-20s)");
        const mintResult = await createDriverVerificationBadge(
            connection,
            serverKeypair,
            driverWalletAddress,
            metadata
        );
        console.log(`✅ [Solana] Badge Minted: ${mintResult.mintAddress}`);

        // ── Step 4: Memo & Anchor ─────────────────────────────────────────
        console.log("📝 [Solana] Anchoring Memo...");
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
            console.log(`✅ [Solana] Memo Sig: ${memoSignature}`);
        } catch (memoErr: any) {
            console.warn('⚠️ [Solana] Memo failed, continuing anyway:', memoErr.message);
        }

        // ── Step 5: Firebase ─────────────────────────────────────────────
        console.log("🔥 [Firebase] Updating Driver Record...");
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

        console.log("🏁 [API] ALL STEPS COMPLETE");
        console.log("------------------------------------------");

        return NextResponse.json({
            success: true,
            mintAddress: mintResult.mintAddress,
            explorerLink: mintResult.explorerLink,
        });

    } catch (error: any) {
        console.error('❌ [API ERROR]:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

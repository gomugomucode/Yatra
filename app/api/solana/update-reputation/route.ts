import { NextResponse } from 'next/server';
import { getConnection, getServerKeypair } from '@/lib/solana/connection';
import {
    Transaction,
    TransactionInstruction,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export async function POST(request: Request) {
    try {
        const { driverId, driverPubkey, score, memo } = await request.json();

        if (!driverId || !driverPubkey) {
            return NextResponse.json({ error: 'Missing driver info' }, { status: 400 });
        }

        const connection = getConnection();
        const serverKeypair = getServerKeypair();

        const tx = new Transaction().add(
            new TransactionInstruction({
                keys: [{ pubkey: serverKeypair.publicKey, isSigner: true, isWritable: false }],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(memo, 'utf-8'),
            })
        );

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = serverKeypair.publicKey;

        const signature = await sendAndConfirmTransaction(
            connection,
            tx,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        return NextResponse.json({ success: true, signature });

    } catch (error: any) {
        console.error('[update-reputation] Memo tx failed:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

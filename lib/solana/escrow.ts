import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
    TransactionInstruction
} from '@solana/web3.js';

/**
 * Yatra Escrow System (Digital Payments)
 *
 * Server-wallet custodian pattern (no custom on-chain program):
 * 1. Server wallet holds the escrowed funds
 * 2. A PDA is derived per trip as a deterministic on-chain identifier
 * 3. A Memo tx anchors the escrow commitment on-chain at creation
 * 4. Server releases to driver on completion, or refunds passenger on cancel
 */

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export interface EscrowState {
    tripId: string;
    passengerPubkey: string;
    driverPubkey: string;
    amountLamports: number;
    status: 'locked' | 'released' | 'reclaimed';
    createdAt: number;
}

/**
 * Derives a deterministic off-curve PDA for a trip escrow.
 * Used as a tracking identifier stored in Firebase — not the fund custodian.
 * Seeds: ["yatra_escrow", tripId (first 32 bytes)]
 */
export function getEscrowPDA(tripId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('yatra_escrow'), Buffer.from(tripId.slice(0, 32))],
        MEMO_PROGRAM_ID
    );
    return pda;
}

/**
 * Executes a function with a simple exponential backoff retry strategy.
 */
async function executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            // Only retry on potential transient errors
            const isTransient = 
                error.message?.includes('timeout') || 
                error.message?.includes('429') || 
                error.message?.includes('network') ||
                error.message?.includes('too many requests');
            
            if (!isTransient && attempt > 0) break; 
            
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`[Solana] Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

/**
 * Creates an escrow for a trip.
 * Anchors the commitment on-chain via Memo. Server wallet holds the funds.
 */
export async function createEscrowAccount(
    connection: Connection,
    serverKeypair: Keypair,
    tripId: string,
    passengerWallet: string,
    driverWallet: string,
    amountNPR: number
) {
    const amountSOL = amountNPR * 0.0001;
    const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);
    const escrowPDA = getEscrowPDA(tripId);

    const memoContent = JSON.stringify({
        app: 'YATRA',
        type: 'ESCROW_CREATED',
        tripId,
        escrow: escrowPDA.toBase58(),
        passenger: passengerWallet,
        driver: driverWallet,
        lamports: amountLamports,
        ts: Date.now(),
    });

    const transaction = new Transaction().add(
        new TransactionInstruction({
            keys: [{ pubkey: serverKeypair.publicKey, isSigner: true, isWritable: false }],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(memoContent, 'utf-8'),
        })
    );

    return executeWithRetry(async () => {
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = serverKeypair.publicKey;

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        return {
            escrowAddress: escrowPDA.toBase58(),
            signature,
            amountLamports,
        };
    });
}

/**
 * Releases escrowed funds to the driver.
 */
export async function releaseEscrow(
    connection: Connection,
    serverKeypair: Keypair,
    tripId: string,
    driverWallet: string,
    amountLamports: number
) {
    const driverPubkey = new PublicKey(driverWallet);
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: driverPubkey,
            lamports: amountLamports,
        })
    );

    return executeWithRetry(async () => {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        return signature;
    });
}

/**
 * Reclaims escrowed funds back to the passenger (Refund).
 */
export async function reclaimEscrow(
    connection: Connection,
    serverKeypair: Keypair,
    tripId: string,
    passengerWallet: string,
    amountLamports: number
) {
    const passengerPubkey = new PublicKey(passengerWallet);
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: passengerPubkey,
            lamports: amountLamports,
        })
    );

    return executeWithRetry(async () => {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        return signature;
    });
}

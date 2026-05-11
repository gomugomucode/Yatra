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
 * Since this is an MVP, we are using a "System Escrow" pattern:
 * 1. Funds are sent from Passenger to a unique PDA (Program Derived Address)
 * 2. The PDA is derived from the tripId
 * 3. The Server Wallet acts as the authority to release funds
 */

export interface EscrowState {
    tripId: string;
    passengerPubkey: string;
    driverPubkey: string;
    amountLamports: number;
    status: 'locked' | 'released' | 'reclaimed';
    createdAt: number;
}

/**
 * Generates a PDA for a specific trip.
 * In a real on-chain program, this would be derived from the programId.
 * For this implementation, we use a consistent derivation for tracking.
 */
export function getEscrowPDA(tripId: string): PublicKey {
    // Mocking PDA derivation using the tripId string as a seed
    // In production, use PublicKey.findProgramAddressSync
    const seed = Buffer.from(`yatra_escrow_${tripId.slice(0, 16)}`);
    return Keypair.fromSeed(seed.slice(0, 32)).publicKey;
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
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: escrowPDA,
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

        return {
            escrowAddress: escrowPDA.toBase58(),
            signature,
            amountLamports
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

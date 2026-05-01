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
 * Creates an escrow for a trip.
 * Currently simulates the "locking" phase by ensuring the passenger has 
 * committed funds (verified by the server).
 */
export async function createEscrowAccount(
    connection: Connection,
    serverKeypair: Keypair,
    tripId: string,
    passengerWallet: string,
    driverWallet: string,
    amountNPR: number
) {
    console.log(`🛠️ [Escrow] Initializing Escrow for Trip: ${tripId}`);
    
    // Convert NPR to SOL 
    // Mock rate: 1 SOL ≈ $130 (devnet stability). 1 USD ≈ 130 NPR.
    // So 1 NPR ≈ 0.00006 SOL.
    // We use a slightly higher rate (0.0001) for visible Devnet transactions.
    const amountSOL = amountNPR * 0.0001;
    const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);
    
    const escrowPDA = getEscrowPDA(tripId);
    
    // For MVP, we use the Server Wallet to "fund" the escrow on behalf of the passenger
    // after verifying they have paid or authorized. 
    // In production, the passenger would sign a transaction to move funds.
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: escrowPDA,
            lamports: amountLamports,
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        console.log(`✅ [Escrow] Funds locked in PDA: ${escrowPDA.toBase58()}`);
        return {
            escrowAddress: escrowPDA.toBase58(),
            signature,
            amountLamports
        };
    } catch (error: any) {
        console.error('❌ [Escrow] Initialization failed:', error.message);
        throw error;
    }
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
    console.log(`💸 [Escrow] Releasing funds to Driver: ${driverWallet}`);
    
    // Note: Since PDAs are not real wallets, in this simulation the server 
    // (which holds the funds for the trip) transfers them to the driver.
    
    const driverPubkey = new PublicKey(driverWallet);
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: driverPubkey,
            lamports: amountLamports,
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        console.log(`✅ [Escrow] Payment released! Sig: ${signature}`);
        return signature;
    } catch (error: any) {
        console.error('❌ [Escrow] Release failed:', error.message);
        throw error;
    }
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
    console.log(`↩️ [Escrow] Reclaiming funds for Passenger: ${passengerWallet}`);
    
    const passengerPubkey = new PublicKey(passengerWallet);
    
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: serverKeypair.publicKey,
            toPubkey: passengerPubkey,
            lamports: amountLamports,
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair],
            { commitment: 'confirmed' }
        );

        console.log(`✅ [Escrow] Refund processed! Sig: ${signature}`);
        return signature;
    } catch (error: any) {
        console.error('❌ [Escrow] Reclaim failed:', error.message);
        throw error;
    }
}

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
    ExtensionType,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    createInitializeNonTransferableMintInstruction,
    createInitializePermanentDelegateInstruction,
    createMintToInstruction,
    getMintLen,
    getAccountLen,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createInitializeMetadataPointerInstruction,
} from '@solana/spl-token';
import { pack, createInitializeInstruction, createUpdateFieldInstruction } from '@solana/spl-token-metadata';
import type { TokenMetadata } from '@solana/spl-token-metadata';

export interface TripTicketMetadata {
    tripId: string;
    route: string;
    fare: string;
    driverName: string;
    tripDate: string;
}

export interface TripTicketMintOptions {
    // Optional priority fee for congested slots. Keep 0 to minimize SOL spent.
    priorityFeeMicroLamports?: number;
    // Optional permanent delegate for operational controls (burn/freeze in supported flows).
    permanentDelegate?: PublicKey;
}

export interface TripTicketRentBreakdown {
    mintAccountBytes: number;
    tokenAccountBytes: number;
    metadataBytes: number;
    mintRentLamports: number;
    tokenAccountRentLamports: number;
    totalRentLamports: number;
}

const RECEIPT_NAME = 'Yatra Trip Ticket';
const RECEIPT_SYMBOL = 'YATRA';

function buildCompactReceiptPayload(metadataDetails: TripTicketMetadata): string {
    return JSON.stringify({
        tripId: metadataDetails.tripId,
        route: metadataDetails.route,
        fare: metadataDetails.fare,
        driver: metadataDetails.driverName,
        tripDate: metadataDetails.tripDate,
    });
}

function buildTokenMetadata(
    mint: PublicKey,
    updateAuthority: PublicKey,
    metadataDetails: TripTicketMetadata
): TokenMetadata {
    return {
        updateAuthority,
        mint,
        name: RECEIPT_NAME,
        symbol: RECEIPT_SYMBOL,
        // Keep this compact. Extra details are stored in one "receipt" key to reduce instruction count.
        uri: `yatra://receipt/${metadataDetails.tripId}`,
        additionalMetadata: [['receipt', buildCompactReceiptPayload(metadataDetails)]],
    };
}

function getReceiptMintBytes(tokenMetadata: TokenMetadata): { mintBytes: number; metadataBytes: number } {
    const metadataBytes = pack(tokenMetadata).length;
    const mintBytes = getMintLen(
        [ExtensionType.NonTransferable, ExtensionType.MetadataPointer, ExtensionType.PermanentDelegate],
        {
            [ExtensionType.TokenMetadata]: metadataBytes,
        }
    );
    return { mintBytes, metadataBytes };
}

function getReceiptTokenAccountBytes(): number {
    // ATA for Token-2022 includes ImmutableOwner and NonTransferableAccount for NonTransferable mints.
    return getAccountLen([ExtensionType.ImmutableOwner, ExtensionType.NonTransferableAccount]);
}

export async function getTripTicketRentBreakdown(
    connection: Connection,
    metadataDetails: TripTicketMetadata
): Promise<TripTicketRentBreakdown> {
    // Length is independent from the actual pubkey values; placeholders are safe for size estimation.
    const sizeProbeMetadata = buildTokenMetadata(PublicKey.default, PublicKey.default, metadataDetails);
    const { mintBytes, metadataBytes } = getReceiptMintBytes(sizeProbeMetadata);
    const tokenAccountBytes = getReceiptTokenAccountBytes();

    const [mintRentLamports, tokenAccountRentLamports] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(mintBytes),
        connection.getMinimumBalanceForRentExemption(tokenAccountBytes),
    ]);

    return {
        mintAccountBytes: mintBytes,
        tokenAccountBytes,
        metadataBytes,
        mintRentLamports,
        tokenAccountRentLamports,
        totalRentLamports: mintRentLamports + tokenAccountRentLamports,
    };
}

/**
 * Creates a Soulbound (NonTransferable) Token-2022 Trip Ticket NFT with embedded Metadata.
 */
export async function mintTripTicketNFT(
    connection: Connection,
    serverKeypair: Keypair,
    recipientAddress: string,
    metadataDetails: TripTicketMetadata,
    options: TripTicketMintOptions = {}
) {
    console.log("🛠️ [Trip Ticket] Initializing Ticket Mint...");

    const passengerPubkey = new PublicKey(recipientAddress);
    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey;
    const permanentDelegate = options.permanentDelegate ?? serverKeypair.publicKey;
    const decimals = 0; // NFTs have 0 decimals

    // 1. Exact rent calculation for minimum SOL spending
    const tokenMetadata = buildTokenMetadata(mintPubkey, serverKeypair.publicKey, metadataDetails);
    const { mintBytes, metadataBytes } = getReceiptMintBytes(tokenMetadata);
    const tokenAccountBytes = getReceiptTokenAccountBytes();
    const [mintRentLamports, tokenAccountRentLamports] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(mintBytes),
        connection.getMinimumBalanceForRentExemption(tokenAccountBytes),
    ]);
    const totalRentLamports = mintRentLamports + tokenAccountRentLamports;

    // 2. Balance check (rent + small tx fee buffer)
    const balance = await connection.getBalance(serverKeypair.publicKey);
    console.log(`💰 [Trip Ticket] Server balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < totalRentLamports + 100_000) {
        throw new Error("Server wallet has insufficient SOL for exact rent + transaction fees.");
    }

    const transaction = new Transaction();

    // 3. Instructions Setup

    // Optional priority fee. Keep disabled to minimize cost.
    if (options.priorityFeeMicroLamports && options.priorityFeeMicroLamports > 0) {
        transaction.add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: options.priorityFeeMicroLamports })
        );
    }

    // (b) Create Mint Account with exact space needed
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: serverKeypair.publicKey,
            newAccountPubkey: mintPubkey,
            space: mintBytes,
            lamports: mintRentLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        })
    );

    // (c) Initialize Metadata Pointer Extension
    // This must come before InitializeMint
    transaction.add(
        createInitializeMetadataPointerInstruction(
            mintPubkey,
            serverKeypair.publicKey,
            mintPubkey, // The mint account itself holds the metadata
            TOKEN_2022_PROGRAM_ID
        )
    );

    // (d) Soulbound extension (Non-transferable)
    // This must come before InitializeMint
    transaction.add(
        createInitializeNonTransferableMintInstruction(mintPubkey, TOKEN_2022_PROGRAM_ID)
    );

    // (e) Permanent Delegate extension
    // Initialized before InitializeMint, per Token-2022 extension ordering rules.
    transaction.add(
        createInitializePermanentDelegateInstruction(
            mintPubkey,
            permanentDelegate,
            TOKEN_2022_PROGRAM_ID
        )
    );

    // (e) Initialize Mint
    transaction.add(
        createInitializeMintInstruction(
            mintPubkey,
            decimals,
            serverKeypair.publicKey,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    );

    // (f) Initialize Token Metadata Custom Data
    transaction.add(
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mintPubkey,
            updateAuthority: serverKeypair.publicKey,
            mint: mintPubkey,
            mintAuthority: serverKeypair.publicKey,
            name: tokenMetadata.name,
            symbol: tokenMetadata.symbol,
            uri: tokenMetadata.uri,
        })
    );

    // (g) Add one compact custom field to minimize compute units.
    transaction.add(
        createUpdateFieldInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mintPubkey,
            updateAuthority: serverKeypair.publicKey,
            field: 'receipt',
            value: tokenMetadata.additionalMetadata[0][1],
        })
    );


    // (h) Associated Token Account (ATA) & Mint 1 unit
    const passengerAta = getAssociatedTokenAddressSync(
        mintPubkey,
        passengerPubkey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    transaction.add(
        createAssociatedTokenAccountInstruction(
            serverKeypair.publicKey,
            passengerAta,
            passengerPubkey,
            mintPubkey,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
            mintPubkey,
            passengerAta,
            serverKeypair.publicKey,
            1,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    );

    // 3. Sign & Send Transaction
    try {
        console.log("📨 [Trip Ticket] Sending transaction to Devnet...");

        // Using 'processed' commitment here makes the UI update much faster.
        const { blockhash } = await connection.getLatestBlockhash('processed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = serverKeypair.publicKey;

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [serverKeypair, mintKeypair],
            {
                commitment: 'processed',
                skipPreflight: false,
                preflightCommitment: 'processed'
            }
        );

        console.log(`✅ [Trip Ticket] Success! Mint: ${mintPubkey.toBase58()}`);

        return {
            mintAddress: mintPubkey.toBase58(),
            signature,
            explorerLink: `https://explorer.solana.com/address/${mintPubkey.toBase58()}?cluster=devnet`,
            rentBreakdown: {
                mintAccountBytes: mintBytes,
                tokenAccountBytes,
                metadataBytes,
                mintRentLamports,
                tokenAccountRentLamports,
                totalRentLamports,
            },
        };
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error('❌ [Trip Ticket] Transaction Failed:', errorMessage);

        if (errorMessage.includes("0x0")) {
            throw new Error("Transaction simulation failed. Check if wallet setup is correct.");
        }

        throw new Error(`Solana Transaction Failed: ${errorMessage}`);
    }
}

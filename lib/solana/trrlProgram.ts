import {
    Connection,
    Keypair,
    PublicKey,
} from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/esm/nodewallet.js';

// Program ID — matches declare_id! in lib.rs
export const TRRL_PROGRAM_ID = new PublicKey('9BvgVETSbpoccubSqkTZUuqaTaZVwPXzvhDi4ies88HN');

const DRIVER_REP_SEED    = Buffer.from('driver_rep');
const PLATFORM_SEED      = Buffer.from('platform');
const REGISTRY_ADMIN_SEED = Buffer.from('registry_admin');

// ── PDA Derivations ───────────────────────────────────────────────────────────

export function getDriverRepPDA(driverWallet: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [DRIVER_REP_SEED, new PublicKey(driverWallet).toBytes()],
        TRRL_PROGRAM_ID
    );
    return pda;
}

export function getPlatformEntryPDA(platformPubkey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [PLATFORM_SEED, platformPubkey.toBytes()],
        TRRL_PROGRAM_ID
    );
    return pda;
}

export function getRegistryAdminPDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [REGISTRY_ADMIN_SEED],
        TRRL_PROGRAM_ID
    );
    return pda;
}

// ── Program Factory ───────────────────────────────────────────────────────────

function getProgram(connection: Connection, serverKeypair: Keypair) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const idl = require('./trrl_idl.json');
    const wallet = new NodeWallet(serverKeypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    return new Program(idl, provider);
}

// ── Registry Admin ────────────────────────────────────────────────────────────

/**
 * One-time setup: deploy the RegistryAdmin PDA.
 * Caller becomes the admin. Idempotent — skips if already initialized.
 */
export async function initRegistry(
    connection: Connection,
    adminKeypair: Keypair,
): Promise<string> {
    const program = getProgram(connection, adminKeypair);
    const pda = getRegistryAdminPDA();

    const existing = await connection.getAccountInfo(pda);
    if (existing) {
        console.log('[TRRL] Registry already initialized');
        return pda.toBase58();
    }

    const tx = await program.methods
        .initRegistry()
        .accounts({
            registryAdmin: pda,
            payer: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc({ commitment: 'confirmed' });

    console.log(`[TRRL] Registry initialized — tx: ${tx}`);
    return pda.toBase58();
}

// ── Platform Management ───────────────────────────────────────────────────────

/**
 * Register a platform so its keypair can submit rep updates.
 * Admin-only. Idempotent — skips if already registered.
 */
export async function registerPlatform(
    connection: Connection,
    adminKeypair: Keypair,
    platformPubkey: PublicKey,
    name: string,
): Promise<string> {
    const program = getProgram(connection, adminKeypair);
    const platformEntryPDA = getPlatformEntryPDA(platformPubkey);
    const registryAdminPDA = getRegistryAdminPDA();

    const existing = await connection.getAccountInfo(platformEntryPDA);
    if (existing) {
        console.log(`[TRRL] Platform ${name} already registered`);
        return platformEntryPDA.toBase58();
    }

    const tx = await program.methods
        .registerPlatform(platformPubkey, name)
        .accounts({
            platformEntry: platformEntryPDA,
            registryAdmin: registryAdminPDA,
            adminSigner: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc({ commitment: 'confirmed' });

    console.log(`[TRRL] Registered platform '${name}' — tx: ${tx}`);
    return platformEntryPDA.toBase58();
}

/**
 * Revoke a platform's write access. Sets is_active = false.
 * The PlatformEntry PDA is kept on-chain as an audit trail.
 */
export async function deregisterPlatform(
    connection: Connection,
    adminKeypair: Keypair,
    platformPubkey: PublicKey,
): Promise<string> {
    const program = getProgram(connection, adminKeypair);
    const platformEntryPDA = getPlatformEntryPDA(platformPubkey);
    const registryAdminPDA = getRegistryAdminPDA();

    const tx = await program.methods
        .deregisterPlatform()
        .accounts({
            platformEntry: platformEntryPDA,
            registryAdmin: registryAdminPDA,
            adminSigner: adminKeypair.publicKey,
        })
        .signers([adminKeypair])
        .rpc({ commitment: 'confirmed' });

    console.log(`[TRRL] Deregistered platform ${platformPubkey.toBase58()} — tx: ${tx}`);
    return tx;
}

// ── Driver Rep ────────────────────────────────────────────────────────────────

/**
 * Creates the on-chain DriverRep PDA for a driver.
 * Idempotent — skips if already initialized.
 */
export async function initializeDriverRep(
    connection: Connection,
    serverKeypair: Keypair,
    driverWallet: string,
): Promise<string> {
    const program = getProgram(connection, serverKeypair);
    const driverPubkey = new PublicKey(driverWallet);
    const pda = getDriverRepPDA(driverWallet);

    const existing = await connection.getAccountInfo(pda);
    if (existing) return pda.toBase58();

    const tx = await program.methods
        .initializeRep(driverPubkey)
        .accounts({
            driverRep: pda,
            authority: serverKeypair.publicKey,
        })
        .signers([serverKeypair])
        .rpc({ commitment: 'confirmed' });

    console.log(`[TRRL] Initialized PDA for ${driverWallet} — tx: ${tx}`);
    return pda.toBase58();
}

/**
 * Updates the driver's on-chain reputation PDA.
 * Caller must be a registered, active platform (Anchor validates via PlatformEntry PDA).
 * Auto-initializes the DriverRep PDA if it doesn't exist yet.
 */
export async function updateDriverRepOnChain(
    connection: Connection,
    platformKeypair: Keypair,
    driverWallet: string,
    rep: {
        totalTrips: number;
        completedTrips: number;
        avgRatingX100: number;
        onTimeArrivals: number;
        zkVerified: boolean;
        sosTriggered: number;
    }
): Promise<{ signature: string; pda: string }> {
    const program = getProgram(connection, platformKeypair);
    const driverRepPDA = getDriverRepPDA(driverWallet);
    const platformEntryPDA = getPlatformEntryPDA(platformKeypair.publicKey);

    // Auto-initialize DriverRep if first time
    const existing = await connection.getAccountInfo(driverRepPDA);
    if (!existing) {
        await initializeDriverRep(connection, platformKeypair, driverWallet);
    }

    const tx = await program.methods
        .updateRep({
            totalTrips: rep.totalTrips,
            completedTrips: rep.completedTrips,
            avgRatingX100: rep.avgRatingX100,
            onTimeArrivals: rep.onTimeArrivals,
            zkVerified: rep.zkVerified,
            sosTriggered: rep.sosTriggered,
        })
        .accounts({
            driverRep: driverRepPDA,
            authority: platformKeypair.publicKey,
            platformEntry: platformEntryPDA,
        })
        .signers([platformKeypair])
        .rpc({ commitment: 'confirmed' });

    return { signature: tx, pda: driverRepPDA.toBase58() };
}

/**
 * Reads the driver's reputation directly from the on-chain PDA.
 * No auth required — any platform can call this to verify a driver.
 */
export async function readDriverRepOnChain(
    connection: Connection,
    driverWallet: string,
): Promise<{
    score: number;
    totalTrips: number;
    completedTrips: number;
    avgRating: number;
    onTimePct: number;
    zkVerified: boolean;
    lastUpdated: string;
    lastPlatform: string;
} | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const idl = require('./trrl_idl.json');
        const provider = new AnchorProvider(
            connection,
            { publicKey: PublicKey.default } as any,
            { commitment: 'confirmed' }
        );
        const program = new Program(idl, provider);
        const pda = getDriverRepPDA(driverWallet);

        const rep = await (program.account as any).driverRep.fetch(pda);

        const completed = Number(rep.completedTrips);
        const onTime = Number(rep.onTimeArrivals);

        return {
            score: Number(rep.score),
            totalTrips: Number(rep.totalTrips),
            completedTrips: completed,
            avgRating: Number(rep.avgRatingX100) / 100,
            onTimePct: Math.round((onTime / Math.max(completed, 1)) * 100),
            zkVerified: Boolean(rep.zkVerified),
            lastUpdated: new Date(Number(rep.lastUpdated) * 1000).toISOString(),
            lastPlatform: rep.lastPlatform?.toBase58() ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Read a platform's registry entry — useful for other platforms to verify
 * a peer platform is legitimately registered before trusting its attestations.
 */
export async function readPlatformEntry(
    connection: Connection,
    platformPubkey: PublicKey,
): Promise<{
    name: string;
    isActive: boolean;
    registeredAt: string;
    totalUpdates: number;
} | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const idl = require('./trrl_idl.json');
        const provider = new AnchorProvider(
            connection,
            { publicKey: PublicKey.default } as any,
            { commitment: 'confirmed' }
        );
        const program = new Program(idl, provider);
        const pda = getPlatformEntryPDA(platformPubkey);

        const entry = await (program.account as any).platformEntry.fetch(pda);

        return {
            name: entry.name,
            isActive: Boolean(entry.isActive),
            registeredAt: new Date(Number(entry.registeredAt) * 1000).toISOString(),
            totalUpdates: Number(entry.totalUpdates),
        };
    } catch {
        return null;
    }
}

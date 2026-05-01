import * as snarkjs from 'snarkjs';

export interface DriverProofInput {
    licenseNumber: string;
    birthYear: number;
}

export interface DriverProofOutput {
    proof: object;
    publicSignals: string[];
    commitment: string;
    ageValid: boolean;
}

// ── Validation Patterns ──────────────────────────────────────────────────
export const VALIDATION_PATTERNS = {
    // Nepal format e.g., BA-12-PA-3456 or 01-12345678
    LICENSE: /^[a-zA-Z0-9-]{5,20}$/,
    // Nepal format e.g., Lu 1 Pa 2345 or BA 2 PA 1234
    VEHICLE: /^[a-zA-Z0-9\s]{5,15}$/,
    // Solana Base58 format
    SOLANA_WALLET: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
};

export const isValidLicense = (val: string) => VALIDATION_PATTERNS.LICENSE.test(val);
export const isValidVehicle = (val: string) => VALIDATION_PATTERNS.VEHICLE.test(val);
export const isValidSolana = (val: string) => VALIDATION_PATTERNS.SOLANA_WALLET.test(val);

// BN128 Field Prime used by Circom/snarkjs
const FIELD_PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

/**
 * Formats the commitment for the UI (e.g., 0xabc123...890)
 */
export function formatCommitment(commitment: string): string {
    if (!commitment || commitment === '0') return 'Not Generated';
    // Handle both hex and decimal strings
    const clean = commitment.startsWith('0x') ? commitment.slice(2) : commitment;
    return `0x${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

/**
 * Simple hash to convert license string to BigInt
 */
function stringToBigInt(str: string): bigint {
    const prime = BigInt(1000000007);
    let hash = BigInt(0);
    for (let i = 0; i < str.length; i++) {
        hash = (hash * BigInt(31) + BigInt(str.charCodeAt(i))) % prime;
    }
    return hash;
}

/** * Computes local commitment to show the user immediately.
 * MUST MATCH THE CIRCOM LOGIC: (license + year*10^9 + salt) % prime
 */
function computeCommitment(licenseHash: bigint, birthYear: number, salt: bigint): bigint {
    const yearWeight = BigInt(1000000000);
    return (licenseHash + (BigInt(birthYear) * yearWeight) + salt) % FIELD_PRIME;
}

/**
 * Helper to safely convert BigInts to strings for JSON transport.
 * Bypasses issues with snarkjs.utils in Next.js/Turbopack environments.
 */
const stringifyBigInts = (obj: any): any => {
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(stringifyBigInts);
    if (typeof obj === 'object' && obj !== null) {
        const res: any = {};
        for (const key in obj) {
            res[key] = stringifyBigInts(obj[key]);
        }
        return res;
    }
    return obj;
};

/**
 * Generates the ZK Proof client-side
 */
export async function generateDriverProof(input: DriverProofInput): Promise<DriverProofOutput> {
    const { licenseNumber, birthYear } = input;

    // ── 1. Validation ──────────────────────────────────────────────────────
    // Aligned with 2026 current year and VerificationPanel requirements
    if (2026 - birthYear < 21) {
        throw new Error("Age requirement not met: You must be at least 21 years old.");
    }

    // ── 2. Input Preparation ───────────────────────────────────────────────
    const licenseHash = stringToBigInt(licenseNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
    const salt = BigInt(777); // Matches the server-side expectation
    const localCommitment = computeCommitment(licenseHash, birthYear, salt);

    // ── 3. Run Groth16 Prover ──────────────────────────────────────────────
    // The browser fetches these from the /public/zk/ directory
    try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            {
                licenseHash: licenseHash.toString(),
                birthYear: birthYear.toString(),
                salt: salt.toString()
            },
            '/zk/driverIdentity.wasm',
            '/zk/driverIdentity.zkey'
        );

        // ── 4. Serialization ───────────────────────────────────────────────────
        // Using the internal helper to ensure all BigInts are stringified correctly
        const editedProof = stringifyBigInts(proof);

        return {
            proof: editedProof,
            publicSignals,
            commitment: localCommitment.toString(16),
            ageValid: publicSignals[1] === '1' // Index 1 is the 'ageValid' signal in the circuit
        };
    } catch (err: any) {
        console.error('[ZK Prover] fullProve failed:', err);
        throw new Error(`ZK Proof generation failed: ${err.message || 'Check if driverIdentity.wasm/zkey exist in /public/zk/'}`);
    }
}
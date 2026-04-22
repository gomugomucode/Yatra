import * as snarkjs from 'snarkjs';
import vKey from './verification_key.json';

export interface ZKVerifyResult {
    isValid: boolean;
    commitment?: string;
    ageValid?: boolean;
    error?: string;
}

export async function verifyDriverProof(
    proof: any,
    publicSignals: any
): Promise<ZKVerifyResult> {
    try {
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        if (!isValid) {
            console.warn('[ZK Verifier] Groth16 verification failed — invalid proof');
            return { isValid: false, error: 'Groth16 proof invalid' };
        }

        const commitment = String(publicSignals?.[0] ?? '');
        const ageValidSignal = String(publicSignals?.[1] ?? '0');
        const ageValid = ageValidSignal === '1';

        if (!ageValid) {
            console.warn('[ZK Verifier] Proof valid but ageValid=0 — driver underage');
            return { isValid: false, commitment, ageValid: false, error: 'Age requirement not met' };
        }

        console.log(`[ZK Verifier] Proof verified — commitment: ${commitment.slice(0, 10)}...`);
        return { isValid: true, commitment, ageValid: true };

    } catch (error: any) {
        console.error('[ZK Verifier] Exception during verification:', error.message);
        return { isValid: false, error: error.message };
    }
}

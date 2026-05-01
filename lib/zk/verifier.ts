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
        if (!proof || !publicSignals || !Array.isArray(publicSignals) || publicSignals.length < 2) {
            return { isValid: false, error: 'Invalid proof payload' };
        }

        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        if (!isValid) {
            return { isValid: false, error: 'Groth16 proof invalid' };
        }

        const commitment = String(publicSignals?.[0] ?? '');
        const ageValidSignal = String(publicSignals?.[1] ?? '0');
        const ageValid = ageValidSignal === '1';

        if (!ageValid) {
            return { isValid: false, commitment, ageValid: false, error: 'Age requirement not met' };
        }

        return { isValid: true, commitment, ageValid: true };

    } catch (error: any) {
        return { isValid: false, error: error.message };
    }
}

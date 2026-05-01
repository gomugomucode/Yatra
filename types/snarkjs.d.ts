declare module 'snarkjs' {
    export const groth16: {
        fullProve: (
            input: any,
            wasmPath: string,
            zkeyPath: string
        ) => Promise<{ proof: any; publicSignals: string[] }>;
        verify: (
            vkey: any,
            publicSignals: string[],
            proof: any
        ) => Promise<boolean>;
    };
    export const utils: {
        stringifyBigInts: (obj: any) => any;
    };
}

import { Connection, Keypair } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { initRegistry, registerPlatform } from '../lib/solana/trrlProgram';

async function main() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const rawKey = JSON.parse(readFileSync('/home/npc/.config/solana/server-keypair.json', 'utf-8'));
    const serverKeypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));

    console.log('Admin keypair:', serverKeypair.publicKey.toBase58());

    console.log('\n1. Initializing TRRL registry...');
    const registryPDA = await initRegistry(connection, serverKeypair);
    console.log('   Registry PDA:', registryPDA);

    console.log('\n2. Registering Yatra as platform...');
    const platformPDA = await registerPlatform(
        connection,
        serverKeypair,
        serverKeypair.publicKey,
        'Yatra',
    );
    console.log('   Yatra PlatformEntry PDA:', platformPDA);

    console.log('\nBootstrap complete. Yatra is now a registered TRRL platform.');
    console.log('Other platforms (Pathao, InDrive) can be registered via registerPlatform()');
    console.log('with their own keypair pubkey once they integrate.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

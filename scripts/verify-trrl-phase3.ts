import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import {
    getRegistryAdminPDA,
    getPlatformEntryPDA,
    getDriverRepPDA,
    readDriverRepOnChain,
    readPlatformEntry,
    updateDriverRepOnChain,
} from '../lib/solana/trrlProgram';

async function main() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const rawKey = JSON.parse(readFileSync('/home/npc/.config/solana/server-keypair.json', 'utf-8'));
    const serverKeypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));

    console.log('=== TRRL Phase 3 Verification ===\n');

    // 1. Check RegistryAdmin PDA
    console.log('1. RegistryAdmin PDA');
    const registryPDA = getRegistryAdminPDA();
    const registryAccount = await connection.getAccountInfo(registryPDA);
    console.log('   PDA:', registryPDA.toBase58());
    console.log('   Exists:', !!registryAccount);
    console.log('   Data size:', registryAccount?.data.length, 'bytes');

    // 2. Check Yatra PlatformEntry PDA
    console.log('\n2. Yatra PlatformEntry PDA');
    const yatrapDA = getPlatformEntryPDA(serverKeypair.publicKey);
    const yatraEntry = await readPlatformEntry(connection, serverKeypair.publicKey);
    console.log('   PDA:', yatrapDA.toBase58());
    console.log('   Name:', yatraEntry?.name);
    console.log('   Active:', yatraEntry?.isActive);
    console.log('   Registered:', yatraEntry?.registeredAt);
    console.log('   Total updates submitted:', yatraEntry?.totalUpdates);

    // 3. Test a live update_rep call (uses a dummy driver wallet)
    console.log('\n3. Test update_rep with Yatra platform keypair');
    const testDriverKeypair = Keypair.generate();
    const testDriverWallet = testDriverKeypair.publicKey.toBase58();
    console.log('   Test driver wallet:', testDriverWallet);

    try {
        const { signature, pda } = await updateDriverRepOnChain(
            connection,
            serverKeypair,
            testDriverWallet,
            {
                totalTrips: 10,
                completedTrips: 9,
                avgRatingX100: 460,
                onTimeArrivals: 8,
                zkVerified: false,
                sosTriggered: 0,
            }
        );
        console.log('   ✓ update_rep succeeded');
        console.log('   Signature:', signature);
        console.log('   Driver PDA:', pda);

        // 4. Read back the result
        console.log('\n4. Read back driver rep from PDA');
        const rep = await readDriverRepOnChain(connection, testDriverWallet);
        console.log('   Score:', rep?.score, '/ 1000');
        console.log('   Avg rating:', rep?.avgRating, '★');
        console.log('   Completed trips:', rep?.completedTrips);
        console.log('   Last platform:', rep?.lastPlatform);
        console.log('   Last updated:', rep?.lastUpdated);

    } catch (err: any) {
        console.log('   ✗ update_rep failed:', err.message);
    }

    // 5. Confirm an unregistered keypair cannot write
    console.log('\n5. Confirm unregistered keypair is rejected');
    const fakeKeypair = Keypair.generate();
    console.log('   Fake keypair:', fakeKeypair.publicKey.toBase58());
    try {
        await updateDriverRepOnChain(connection, fakeKeypair, testDriverWallet, {
            totalTrips: 999, completedTrips: 999, avgRatingX100: 500,
            onTimeArrivals: 999, zkVerified: true, sosTriggered: 0,
        });
        console.log('   ✗ ERROR: should have been rejected but was not!');
    } catch (err: any) {
        console.log('   ✓ Correctly rejected:', err.message.split('\n')[0]);
    }

    console.log('\n=== All checks complete ===');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { YatraTrrl } from "../target/types/yatra_trrl";
import { assert } from "chai";

describe("yatra_trrl", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program: any = anchor.workspace.YatraTrrl;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  
  // Create a new keypair for the driver
  const driverKeypair = anchor.web3.Keypair.generate();
  
  // PDA for the driver's reputation
  const [driverRepPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("driver_rep"), driverKeypair.publicKey.toBuffer()],
    program.programId
  );

  it("Is initialized!", async () => {
    // 1) Initialize the driver profile
    const tx = await program.methods
      .initializeRep()
      .accounts({
        driverRep: driverRepPda,
        authority: provider.wallet.publicKey,
        driver: driverKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Your transaction signature", tx);

    const account = await program.account.driverReputationProfile.fetch(driverRepPda);
    assert.strictEqual(account.trustScore, 500);
    assert.strictEqual(account.totalTrips, 0);
    assert.strictEqual(account.completedTrips, 0);
    assert.strictEqual(account.pathFidelityX100, 10000);
    assert.strictEqual(account.hardBrakeEvents, 0);
  });

  it("Simulates a perfect trip", async () => {
    // 2) Perfect trip telemetry
    const telemetry = {
      isCompleted: true,
      fidelityX100: 9900, // 99% fidelity
      arrivalDeltaS: 0,   // perfect on time
      hardBrakes: 0,
      deviations: 0,
      sosTriggered: 0,
    };

    await program.methods
      .updateRep(telemetry)
      .accounts({
        driverRep: driverRepPda,
        authority: provider.wallet.publicKey,
        driver: driverKeypair.publicKey,
      })
      .rpc();

    const account = await program.account.driverReputationProfile.fetch(driverRepPda);
    
    // total_trips should be 1, completed = 1
    assert.strictEqual(account.totalTrips, 1);
    assert.strictEqual(account.completedTrips, 1);
    
    // Score should increase from base because completion is 100% and fidelity is 99%
    console.log("Score after perfect trip: ", account.trustScore);
    assert.isAbove(account.trustScore, 400); // Base should be around 250 (completion) + 99 (fidelity) + 100 (punctuality) = ~449
  });

  it("Simulates a terrible trip and asserts anomaly penalties clamp", async () => {
    // 3) Terrible trip telemetry
    const telemetry = {
      isCompleted: true,
      fidelityX100: 5000, // 50% fidelity, wildly off route
      arrivalDeltaS: 400, // 400 seconds late
      hardBrakes: 5,      // reckless driving
      deviations: 3,      // 3 route deviations
      sosTriggered: 0,
    };

    await program.methods
      .updateRep(telemetry)
      .accounts({
        driverRep: driverRepPda,
        authority: provider.wallet.publicKey,
        driver: driverKeypair.publicKey,
      })
      .rpc();

    const account = await program.account.driverReputationProfile.fetch(driverRepPda);
    
    // Check counters updated
    assert.strictEqual(account.totalTrips, 2);
    assert.strictEqual(account.hardBrakeEvents, 5);
    assert.strictEqual(account.routeDeviationEvents, 3);

    // Calculate expected score deduction: 
    // anomalies = (5 + 3) * 10 = 80 -> capped at 50 points
    // Punctuality = 0 (since > 300)
    console.log("Score after terrible trip: ", account.trustScore);
    
    // Score should drop significantly due to caps and penalties
    assert.isBelow(account.trustScore, 400); 
  });
});

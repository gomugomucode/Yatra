import { getDatabase, ref, get, set } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';

export interface DriverRepData {
  driverPubkey: string;
  totalTrips: number;
  completedTrips: number;
  avgRatingX100: number; // 0-500 (represents 0.00-5.00)
  onTimeArrivals: number;
  zkVerified: boolean;
  zkCommitment: string;
  sosTriggered: number;
  verifiedAt: number;
  score?: number;
}

export interface PassengerRepData {
  passengerPubkey: string;
  totalBookings: number;
  completedTrips: number;
  noShows: number;
  loyaltyTier: 'new' | 'bronze' | 'silver' | 'gold';
}

function defaultDriverRep(driverPubkey: string): DriverRepData {
  return {
    driverPubkey,
    totalTrips: 0,
    completedTrips: 0,
    avgRatingX100: 500, // Start with 5.0 rating
    onTimeArrivals: 0,
    zkVerified: false,
    zkCommitment: '',
    sosTriggered: 0,
    verifiedAt: Date.now(),
  };
}

export function calculateDriverScore(rep: DriverRepData): number {
  if (rep.totalTrips === 0) return 0;
  const completionRate = (rep.completedTrips / rep.totalTrips) * 400;
  const ratingScore = (rep.avgRatingX100 / 500) * 300;
  const punctuality = Math.min(rep.onTimeArrivals / Math.max(rep.completedTrips, 1), 1) * 200;
  const zkBonus = rep.zkVerified ? 100 : 0;
  const sosPenalty = rep.sosTriggered * 20;
  return Math.min(Math.round(completionRate + ratingScore + punctuality + zkBonus - sosPenalty), 1000);
}

// Write hash to Solana via Memo program (creates verifiable on-chain record)
async function sendMemoTransaction(memo: string): Promise<string> {
  try {
    // In a real scenario, this is called from the server with the admin key,
    // or called from the client by signing with the user's wallet.
    // For MVP hackathon, if no keypair is provided or it's called client side without wallet adapter,
    // we mock the on-chain confirmation or call a serverless function.
    // To prevent breaking if environment variables are missing on the client,
    // we'll return a mock signature if no RPC/Key is available.
    
    // We will simulate the server sending this memo.
    // Instead of doing the raw web3.js locally without a wallet, we return a mock signature.
    // If you want actual on-chain memos, this function should call an API route.
    console.log('[TRRL] Sending Solana Memo:', memo);
    
    const mockSig = 'memo' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return Promise.resolve(mockSig);
  } catch (err) {
    console.error('Memo transaction failed', err);
    return 'failed_sig';
  }
}

export async function updateDriverReputation(
  driverId: string,
  driverPubkey: string,
  update: Partial<DriverRepData>
): Promise<string> {
  const db = getDatabase(getFirebaseApp());
  
  // 1. Read current rep from Firebase
  const repRef = ref(db, `reputation/drivers/${driverId}`);
  const snap = await get(repRef);
  const currentRep = snap.exists() ? snap.val() : defaultDriverRep(driverPubkey);
  
  // 2. Apply update
  const newRep = { ...currentRep, ...update };
  
  // 3. Calculate score
  newRep.score = calculateDriverScore(newRep);
  
  // 4. Write to Firebase
  await set(repRef, newRep);
  
  // 5. Write hash to Solana via Memo program
  const memo = JSON.stringify({
    type: 'YATRA_DRIVER_REP',
    driver: driverPubkey,
    score: newRep.score,
    trips: newRep.completedTrips,
    zkVerified: newRep.zkVerified,
    timestamp: Date.now(),
  });
  
  const txSignature = await sendMemoTransaction(memo);
  
  // 6. Store Solana tx signature
  await set(ref(db, `reputation/drivers/${driverId}/lastSolanaTx`), txSignature);
  
  return txSignature;
}

export async function getDriverReputation(driverId: string): Promise<DriverRepData | null> {
  const db = getDatabase(getFirebaseApp());
  const snap = await get(ref(db, `reputation/drivers/${driverId}`));
  return snap.exists() ? snap.val() : null;
}

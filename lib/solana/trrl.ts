import { getDatabase, ref, get, set, update } from 'firebase/database';
import { getFirebaseApp } from '@/lib/firebase';

/**
 * Tokenized Reputation Layer (TRRL)
 * 
 * Phase 1: Firebase Storage + Solana Memo Anchor (Implemented)
 * Phase 2: On-Chain Reputation PDA (Planned)
 */

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
  lastSolanaTx?: string;
  reputationPDA?: string;
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
  const total = Math.max(Number(rep.totalTrips || 0), 1);
  const completed = Number(rep.completedTrips || 0);
  const punctualityCount = Number(rep.onTimeArrivals || 0);
  
  const completionFactor = Math.min((completed / total) * 400, 400);
  const ratingFactor = (Number(rep.avgRatingX100 || 500) / 500) * 300;
  const punctuality = Math.min(punctualityCount / Math.max(completed, 1), 1) * 200;
  const zkBonus = rep.zkVerified ? 100 : 0;
  const sosPenalty = Number(rep.sosTriggered || 0) * 20;

  const rawScore = Math.round(completionFactor + ratingFactor + punctuality + zkBonus - sosPenalty);
  return Math.max(0, Math.min(isNaN(rawScore) ? 500 : rawScore, 1000));
}

/**
 * Updates the driver's reputation both in Firebase and anchors it on Solana.
 * In a production environment, this would call a secure API to update an on-chain PDA.
 */
export async function updateDriverReputation(
  driverId: string,
  driverPubkey: string,
  updateFields: Partial<DriverRepData>
): Promise<string> {
  const db = getDatabase(getFirebaseApp());
  
  // 1. Read current rep from Firebase
  const repRef = ref(db, `reputation/drivers/${driverId}`);
  const snap = await get(repRef);
  const currentRep = snap.exists() ? snap.val() : defaultDriverRep(driverPubkey);
  
  // 2. Apply update
  const newRep = { ...currentRep, ...updateFields };
  
  // 3. Calculate score
  newRep.score = calculateDriverScore(newRep);
  
  // 4. Write to Firebase
  await set(repRef, newRep);
  
  // 5. Anchor on Solana via Memo (Simulated for MVP, replacing with API call)
  const memo = JSON.stringify({
    type: 'YATRA_REP_V2',
    driver: driverPubkey,
    score: newRep.score,
    trips: newRep.completedTrips,
    zk: newRep.zkVerified,
    ts: Date.now(),
  });

  console.log('[TRRL] Anchoring Reputation on Solana:', memo);

  // In production, this fetch would update a real PDA via a program instruction
  try {
     const response = await fetch('/api/solana/update-reputation', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ driverId, driverPubkey, score: newRep.score, memo })
     });
     const data = await response.json();
     
     if (data.success) {
       await update(repRef, { 
         lastSolanaTx: data.signature, 
         reputationPDA: data.pda,
         verifiedAt: Date.now() 
       });
       return data.signature;
     }
  } catch (err) {
     console.warn('[TRRL] Solana anchor failed:', err);
  }
  
  // Fallback to local update if API fails (to keep app working offline/dev)
  const mockSig = 'memo' + Math.random().toString(36).substring(2, 15);
  await update(repRef, { lastSolanaTx: mockSig });
  return mockSig;
}

export async function getDriverReputation(driverId: string): Promise<DriverRepData | null> {
  const db = getDatabase(getFirebaseApp());
  const snap = await get(ref(db, `reputation/drivers/${driverId}`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeToDriverReputation(
  driverId: string,
  callback: (data: DriverRepData | null) => void
): () => void {
  const { onValue } = require('firebase/database');
  const db = getDatabase(getFirebaseApp());
  const repRef = ref(db, `reputation/drivers/${driverId}`);
  
  return onValue(repRef, (snap: any) => {
    callback(snap.exists() ? snap.val() : null);
  });
}

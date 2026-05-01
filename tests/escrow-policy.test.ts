import { describe, expect, it } from 'vitest';
import { canReclaimEscrow } from '@/lib/solana/escrowPolicy';

describe('escrow reclaim policy', () => {
  it('allows reclaim immediately for rejected/cancelled/expired', () => {
    expect(canReclaimEscrow({ status: 'rejected' })).toBe(true);
    expect(canReclaimEscrow({ status: 'cancelled' })).toBe(true);
    expect(canReclaimEscrow({ status: 'expired' })).toBe(true);
  });

  it('allows reclaim after timeout for non-terminal status', () => {
    const now = Date.now();
    const createdAt = new Date(now - 2 * 60 * 60 * 1000 - 1).toISOString();
    expect(canReclaimEscrow({ status: 'active', createdAt }, now)).toBe(true);
  });

  it('denies reclaim before timeout for non-terminal status', () => {
    const now = Date.now();
    const createdAt = new Date(now - 15 * 60 * 1000).toISOString();
    expect(canReclaimEscrow({ status: 'active', createdAt }, now)).toBe(false);
  });

  it('denies reclaim when timestamp is missing/invalid', () => {
    expect(canReclaimEscrow({ status: 'active' })).toBe(false);
    expect(canReclaimEscrow({ status: 'active', createdAt: 'invalid-date' })).toBe(false);
  });
});


import { beforeEach, describe, expect, it, vi } from 'vitest';

type DbState = Record<string, any>;

function createSnapshot(value: any) {
  return {
    exists: () => value !== null && value !== undefined,
    val: () => value,
  };
}

function createMockAdminDb(state: DbState, updates: Array<{ path: string; value: any }>) {
  return {
    ref: (path: string) => ({
      get: async () => createSnapshot(state[path]),
      once: async () => createSnapshot(state[path]),
      set: async (value: any) => {
        state[path] = value;
      },
      update: async (value: any) => {
        const previous = state[path] ?? {};
        state[path] = { ...previous, ...value };
        updates.push({ path, value });
      },
    }),
  };
}

describe('solana API integration boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SOLANA_SERVER_KEY = '11111111111111111111111111111111';
  });

  it('mint-ticket is deterministic and rejects passenger mismatch', async () => {
    const state: DbState = {
      'receipts/booking-1': null,
      'bookings/booking-1': { id: 'booking-1', passengerId: 'real-passenger' },
      'users/passenger-1/solanaWallet': 'wallet-1',
    };
    const updates: Array<{ path: string; value: any }> = [];
    const adminDb = createMockAdminDb(state, updates);
    const mintTripTicketNFT = vi.fn();

    vi.doMock('@/lib/firebaseAdmin', () => ({ getAdminDb: () => adminDb }));
    vi.doMock('@/lib/utils/rateLimit', () => ({ checkRateLimit: () => true }));
    vi.doMock('@/lib/solana/tripTicket', () => ({ mintTripTicketNFT }));
    vi.doMock('bs58', () => ({ default: { decode: () => new Uint8Array(64) } }));
    vi.doMock('@solana/web3.js', async (importOriginal) => {
      const actual = await importOriginal<any>();
      return {
        ...actual,
        Connection: vi.fn(() => ({})),
        Keypair: { fromSecretKey: vi.fn(() => ({ publicKey: 'server-pubkey' })) },
      };
    });

    const { POST } = await import('@/app/api/solana/mint-ticket/route');
    const mismatchResponse = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-1',
        passengerId: 'passenger-1',
        fare: 120,
        route: 'A-B',
        driverName: 'Driver',
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(mismatchResponse.status).toBe(403);
    expect(await mismatchResponse.json()).toEqual({ error: 'Passenger mismatch for booking' });
    expect(mintTripTicketNFT).not.toHaveBeenCalled();

    state['bookings/booking-1'] = { id: 'booking-1', passengerId: 'passenger-1' };
    mintTripTicketNFT.mockResolvedValue({
      mintAddress: 'mint-1',
      signature: 'sig-1',
      explorerLink: 'https://explorer/tx/sig-1',
    });
    const successResponse = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'booking-1',
        passengerId: 'passenger-1',
        fare: 120,
        route: 'A-B',
        driverName: 'Driver',
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(successResponse.status).toBe(200);
    const body = await successResponse.json();
    expect(body.success).toBe(true);
    expect(mintTripTicketNFT).toHaveBeenCalledTimes(1);
    expect(state['receipts/booking-1'].status).toBe('minted');
  }, 15000);

  it('escrow release blocks fake completion and requires GPS-completed trip', async () => {
    const state: DbState = {
      'trips/t1': {
        id: 't1',
        status: 'active',
        gpsVerifiedAt: null,
        escrowStatus: 'locked',
        passengerId: 'p1',
        driverId: 'd1',
        amountLamports: 1000,
      },
      'bookings/t1': {
        id: 't1',
        status: 'confirmed',
        escrowStatus: 'locked',
        passengerId: 'p1',
        busId: 'd1',
        amountLamports: 1000,
        driverWalletAddress: 'driver-wallet',
      },
    };
    const updates: Array<{ path: string; value: any }> = [];
    const adminDb = createMockAdminDb(state, updates);
    const releaseEscrow = vi.fn().mockResolvedValue('release-sig');

    vi.doMock('@/lib/firebaseAdmin', () => ({ getAdminDb: () => adminDb }));
    vi.doMock('@/lib/solana/connection', () => ({
      getConnection: () => ({ rpc: 'mock' }),
      getServerKeypair: () => ({ publicKey: 'server' }),
    }));
    vi.doMock('@/lib/solana/escrow', () => ({ releaseEscrow }));

    const { POST } = await import('@/app/api/solana/escrow/release/route');
    const denied = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ tripId: 't1' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(denied.status).toBe(403);
    expect(releaseEscrow).not.toHaveBeenCalled();

    state['trips/t1'] = {
      ...state['trips/t1'],
      status: 'completed',
      gpsVerifiedAt: '2026-01-01T00:00:00.000Z',
    };
    state['bookings/t1'] = { ...state['bookings/t1'], status: 'completed' };

    const allowed = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ tripId: 't1' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(allowed.status).toBe(200);
    expect(releaseEscrow).toHaveBeenCalledWith(expect.anything(), expect.anything(), 't1', 'driver-wallet', 1000);
    expect(state['trips/t1'].escrowStatus).toBe('released');
    expect(state['bookings/t1'].escrowStatus).toBe('released');
  });

  it('escrow reclaim enforces deterministic policy checks', async () => {
    const state: DbState = {
      'trips/t2': {
        id: 't2',
        status: 'active',
        createdAt: new Date(Date.now()).toISOString(),
        escrowStatus: 'locked',
        passengerId: 'p2',
        driverId: 'd2',
        amountLamports: 2000,
      },
      'bookings/t2': {
        id: 't2',
        status: 'confirmed',
        createdAt: new Date(Date.now()).toISOString(),
        escrowStatus: 'locked',
        passengerId: 'p2',
        busId: 'd2',
        amountLamports: 2000,
        passengerWalletAddress: 'passenger-wallet',
      },
    };
    const updates: Array<{ path: string; value: any }> = [];
    const adminDb = createMockAdminDb(state, updates);
    const reclaimEscrow = vi.fn().mockResolvedValue('reclaim-sig');

    vi.doMock('@/lib/firebaseAdmin', () => ({ getAdminDb: () => adminDb }));
    vi.doMock('@/lib/solana/connection', () => ({
      getConnection: () => ({ rpc: 'mock' }),
      getServerKeypair: () => ({ publicKey: 'server' }),
    }));
    vi.doMock('@/lib/solana/escrow', () => ({ reclaimEscrow }));

    const { POST } = await import('@/app/api/solana/escrow/reclaim/route');
    const denied = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ tripId: 't2' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(denied.status).toBe(403);
    expect(reclaimEscrow).not.toHaveBeenCalled();

    state['trips/t2'] = { ...state['trips/t2'], status: 'cancelled' };
    state['bookings/t2'] = { ...state['bookings/t2'], status: 'cancelled' };

    const allowed = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ tripId: 't2' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(allowed.status).toBe(200);
    expect(reclaimEscrow).toHaveBeenCalledWith(expect.anything(), expect.anything(), 't2', 'passenger-wallet', 2000);
    expect(state['trips/t2'].escrowStatus).toBe('reclaimed');
    expect(state['bookings/t2'].escrowStatus).toBe('reclaimed');
  });

  it('verify-driver validates wallet and persists deterministic badge fields', async () => {
    const state: DbState = {};
    const updates: Array<{ path: string; value: any }> = [];
    const adminDb = createMockAdminDb(state, updates);
    const createDriverVerificationBadge = vi.fn().mockResolvedValue({
      mintAddress: 'mint-verify',
      signature: 'sig-verify',
      explorerLink: 'https://explorer/tx/sig-verify',
    });

    vi.doMock('@/lib/firebaseAdmin', () => ({ getAdminDb: () => adminDb }));
    vi.doMock('@/lib/utils/rateLimit', () => ({ checkRateLimit: () => true }));
    vi.doMock('@/lib/zk/verifier', () => ({
      verifyDriverProof: vi.fn().mockResolvedValue({ isValid: true, commitment: 'commitment-1' }),
    }));
    vi.doMock('@/lib/solana/connection', () => ({
      getConnection: () => ({
        getBalance: vi.fn().mockResolvedValue(1000),
        getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'hash-1' }),
      }),
      getServerKeypair: () => ({ publicKey: { toString: () => 'server' } }),
    }));
    vi.doMock('@/lib/solana/tokenExtensions', () => ({ createDriverVerificationBadge }));
    vi.doMock('@solana/web3.js', async (importOriginal) => {
      const actual = await importOriginal<any>();
      return {
        ...actual,
        PublicKey: class {
          constructor(value: string) {
            if (value === 'bad-wallet') throw new Error('invalid');
          }
        },
        Transaction: class {
          add() { return this; }
          recentBlockhash?: string;
          feePayer?: unknown;
        },
        TransactionInstruction: class {},
        sendAndConfirmTransaction: vi.fn().mockResolvedValue('memo-sig'),
      };
    });

    const { POST } = await import('@/app/api/solana/verify-driver/route');
    const invalidWallet = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        driverId: 'd1',
        driverName: 'Driver',
        vehicleType: 'bus',
        driverWalletAddress: 'bad-wallet',
        zkProof: { pi_a: [] },
        zkPublicSignals: ['c1', '1'],
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(invalidWallet.status).toBe(400);
    expect(createDriverVerificationBadge).not.toHaveBeenCalled();

    const success = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        driverId: 'd1',
        driverName: 'Driver',
        vehicleType: 'bus',
        driverWalletAddress: 'good-wallet',
        zkProof: { pi_a: [] },
        zkPublicSignals: ['c1', '1'],
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(success.status).toBe(200);
    expect(createDriverVerificationBadge).toHaveBeenCalledTimes(1);
    expect(state['users/d1'].verificationBadge.mintAddress).toBe('mint-verify');
    expect(state['buses/d1'].driverWalletAddress).toBe('good-wallet');
  });
});

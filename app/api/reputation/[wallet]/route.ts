import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { PublicKey } from '@solana/web3.js';
import { checkRateLimit } from '@/lib/utils/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEVNET_EXPLORER = 'https://explorer.solana.com/tx';

/**
 * GET /api/reputation/:wallet
 *
 * Public — no auth required. Designed for cross-platform consumption.
 * Any platform (Pathao, InDrive, etc.) can call this with a driver's
 * Solana wallet address and receive their TRRL reputation score.
 *
 * The `lastSolanaTx` field links to a real devnet Memo transaction so
 * callers can independently verify the score was anchored on-chain.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ wallet: string }> }
) {
    const { wallet } = await params;

    // Rate limit: 60 requests per IP per minute
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (!checkRateLimit(`rep-lookup:${ip}`, 60, 60_000)) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Validate Solana address format
    try {
        new PublicKey(wallet);
    } catch {
        return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 });
    }

    try {
        const adminDb = getAdminDb();

        // Query reputation index by driverPubkey (indexed in database.rules.json)
        const snap = await adminDb
            .ref('reputation/drivers')
            .orderByChild('driverPubkey')
            .equalTo(wallet)
            .limitToFirst(1)
            .once('value');

        if (!snap.exists()) {
            return NextResponse.json({ error: 'No reputation record found for this wallet' }, { status: 404 });
        }

        // Firebase returns an object keyed by driverId — grab the first (and only) value
        const records = snap.val() as Record<string, any>;
        const rep = Object.values(records)[0];

        const completedTrips = Number(rep.completedTrips ?? 0);
        const onTimeArrivals = Number(rep.onTimeArrivals ?? 0);
        const avgRatingX100 = Number(rep.avgRatingX100 ?? 500);

        const response = {
            // Identity
            wallet: rep.driverPubkey,
            source: 'YATRA_TRRL_V1',

            // Score (0–1000)
            score: Number(rep.score ?? 500),

            // Trip stats
            totalTrips: Number(rep.totalTrips ?? 0),
            completedTrips,
            avgRating: parseFloat((avgRatingX100 / 100).toFixed(2)),
            onTimePct: Math.round((onTimeArrivals / Math.max(completedTrips, 1)) * 100),

            // Trust signals
            zkVerified: Boolean(rep.zkVerified),
            zkCommitment: rep.zkCommitment || null,

            // On-chain proof — callers can verify this independently
            lastSolanaTx: rep.lastSolanaTx || null,
            explorerUrl: rep.lastSolanaTx
                ? `${DEVNET_EXPLORER}/${rep.lastSolanaTx}?cluster=devnet`
                : null,

            verifiedAt: rep.verifiedAt
                ? new Date(rep.verifiedAt).toISOString()
                : null,
        };

        return NextResponse.json(response, {
            headers: {
                // Allow any platform to call this from their frontend too
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
            },
        });

    } catch (error: any) {
        console.error('[reputation] lookup failed:', error.message);
        return NextResponse.json({ error: 'Failed to fetch reputation' }, { status: 500 });
    }
}

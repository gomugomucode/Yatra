import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { checkRateLimit } from '@/lib/utils/rateLimit';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const driverId = searchParams.get('driverId');
        const pubkey = searchParams.get('pubkey');

        if (!driverId && !pubkey) {
            return NextResponse.json({ error: 'Missing driverId or pubkey parameter' }, { status: 400 });
        }

        const ip = request.headers.get('x-forwarded-for') || 'unknown';
        const isAllowed = checkRateLimit(`admin-rep-lookup-${ip}`, 60, 60000); // 60 requests per minute
        if (!isAllowed) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        const db = getAdminDb();

        let targetDriverId = driverId;

        // If only pubkey is provided, we need to find the driverId
        if (pubkey && !driverId) {
            const usersRef = db.ref('users');
            const usersSnap = await usersRef.orderByChild('solanaWallet').equalTo(pubkey).once('value');
            if (usersSnap.exists()) {
                const users = usersSnap.val();
                targetDriverId = Object.keys(users)[0];
            } else {
                 return NextResponse.json({ error: 'Driver not found for given pubkey' }, { status: 404 });
            }
        }

        if (!targetDriverId) {
             return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
        }

        const repRef = db.ref(`reputation/drivers/${targetDriverId}`);
        const snap = await repRef.once('value');

        if (!snap.exists()) {
             // Return default representation if no reputation exists yet
             return NextResponse.json({
                reputation: {
                    driverId: targetDriverId,
                    driverPubkey: pubkey || '',
                    score: 0,
                    totalTrips: 0,
                    completedTrips: 0,
                    avgRatingX100: 0,
                    onTimeArrivals: 0,
                    sosTriggered: 0,
                    zkVerified: false
                }
             });
        }

        return NextResponse.json({ reputation: snap.val() });
    } catch (error: any) {
        console.error('[Admin Reputation API] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

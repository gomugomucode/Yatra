import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

interface UpdateStatusBody {
    tripId: string;
    status: string;
    extraFields?: Record<string, any>;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as UpdateStatusBody;
        const { tripId, status, extraFields } = body;

        if (!tripId || !status) {
            return NextResponse.json({ error: 'Missing tripId or status' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session')?.value || null;
        if (!sessionCookie) {
            return NextResponse.json({ error: 'Missing session cookie' }, { status: 401 });
        }

        const auth = getFirebaseAdminAuth();
        const decoded = await auth.verifySessionCookie(sessionCookie);
        const uid = decoded.uid;

        const adminDb = getAdminDb();
        
        // 1. Fetch trip/booking data
        let isBooking = false;
        let tripRef = adminDb.ref(`trips/${tripId}`);
        let tripSnap = await tripRef.get();
        
        if (!tripSnap.exists()) {
            tripRef = adminDb.ref(`bookings/${tripId}`);
            tripSnap = await tripRef.get();
            isBooking = true;
        }
        
        if (!tripSnap.exists()) {
            return NextResponse.json({ error: 'Trip record not found' }, { status: 404 });
        }

        const tripData = tripSnap.val();
        const currentStatus = tripData.status;
        const driverId = tripData.driverId || tripData.busId; // bookings sometimes use busId as driver ref

        // 2. Security Check: Only the assigned driver or admin can update
        if (uid !== driverId) {
            // Check if user is admin
            const userSnap = await adminDb.ref(`users/${uid}`).get();
            const userData = userSnap.val();
            if (userData?.role !== 'admin') {
                return NextResponse.json({ error: 'Unauthorized: Only the assigned driver can update this trip' }, { status: 403 });
            }
        }

        // 3. Update Status
        const now = new Date().toISOString();
        const updates: Record<string, any> = {
            status,
            updatedAt: now,
            ...extraFields
        };
        if (status === 'completed') {
            updates.completedAt = now;
        }
        await tripRef.update(updates);

        // 4. Sync linked record
        const linkedBookingId = tripData.bookingId || (isBooking ? null : tripId);
        if (linkedBookingId && linkedBookingId !== tripId) {
            await adminDb.ref(`bookings/${linkedBookingId}`).update({
                status: status === 'active' ? 'confirmed' : status, // map internal statuses
                updatedAt: now,
            });
        }

        // 5. Aggregate Statistics (Only on state changes)
        if (currentStatus !== status) {
            const statsRef = adminDb.ref(`users/${driverId}/stats`);
            
            await statsRef.transaction((currentStats) => {
                const stats = currentStats || {
                    completedTrips: 0,
                    totalEarnings: 0,
                    totalRides: 0,
                    cancelledTrips: 0,
                    completionRate: 0
                };

                if (status === 'accepted' && currentStatus === 'requested') {
                    stats.totalRides = (stats.totalRides || 0) + 1;
                } else if (status === 'completed' && currentStatus !== 'completed') {
                    stats.completedTrips = (stats.completedTrips || 0) + 1;
                    const fare = tripData.fare || 0;
                    stats.totalEarnings = (stats.totalEarnings || 0) + fare;
                } else if (status === 'cancelled' && currentStatus !== 'cancelled') {
                    stats.cancelledTrips = (stats.cancelledTrips || 0) + 1;
                }

                // Recalculate completion rate
                const total = stats.totalRides || stats.completedTrips || 1;
                stats.completionRate = Math.round(((stats.completedTrips || 0) / total) * 100);

                return stats;
            });

            // 6. Update Reputation Node (Sync with stats)
            if (status === 'completed' || status === 'accepted') {
                const repRef = adminDb.ref(`reputation/drivers/${driverId}`);
                const repSnap = await repRef.get();
                const repData = repSnap.exists() ? repSnap.val() : { totalTrips: 0, completedTrips: 0 };
                
                await repRef.update({
                    totalTrips: (status === 'accepted' ? (repData.totalTrips || 0) + 1 : repData.totalTrips || 0),
                    completedTrips: (status === 'completed' ? (repData.completedTrips || 0) + 1 : repData.completedTrips || 0),
                    verifiedAt: Date.now()
                });
            }
        }

        return NextResponse.json({ success: true, status });

    } catch (error: any) {
        console.error('[API UpdateStatus] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

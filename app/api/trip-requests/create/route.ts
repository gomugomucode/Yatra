import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { getMessaging } from 'firebase-admin/messaging';

interface TripRequestBody {
  busId: string;
  pickupLocation?: { lat: number; lng: number; address?: string };
  dropoffLocation?: { lat: number; lng: number; address?: string };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TripRequestBody;
    const { busId, pickupLocation, dropoffLocation } = body;

    if (!busId) {
      return NextResponse.json({ error: 'Missing required field: busId' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || null;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Missing session cookie' }, { status: 401 });
    }

    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const passengerId = decoded.uid;

    const adminDb = getAdminDb();

    const [passengerSnap, busSnap] = await Promise.all([
      adminDb.ref(`users/${passengerId}`).once('value'),
      adminDb.ref(`buses/${busId}`).once('value'),
    ]);

    if (!busSnap.exists()) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busSnap.val() as { isActive?: boolean; busNumber?: string };
    if (busData.isActive === false) {
      return NextResponse.json({ error: 'Bus is currently offline' }, { status: 409 });
    }

    const passengerData = passengerSnap.exists() ? passengerSnap.val() as { name?: string } : {};
    const passengerName = passengerData.name || 'Passenger';

    if (!pickupLocation || !Number.isFinite(pickupLocation.lat) || !Number.isFinite(pickupLocation.lng)) {
      return NextResponse.json({ error: 'Missing pickupLocation coordinates' }, { status: 400 });
    }

    const tripRequestRef = adminDb.ref('trips').push();
    const tripRequest = {
      id: tripRequestRef.key!,
      tripId: tripRequestRef.key!,
      busId,
      driverId: busId,
      passengerId,
      passengerName,
      status: 'requested' as const,
      lat: pickupLocation.lat,
      lng: pickupLocation.lng,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(pickupLocation ? { pickupLocation } : {}),
      ...(dropoffLocation ? { dropoffLocation } : {}),
    };

    await tripRequestRef.set(tripRequest);

    // Push notification to the driver device(s), if registered.
    const driverSnap = await adminDb.ref(`users/${busId}`).once('value');
    if (driverSnap.exists()) {
      const driverData = driverSnap.val() as { pushTokens?: string[]; pushToken?: string };
      const tokens = Array.from(
        new Set([...(driverData.pushTokens || []), ...(driverData.pushToken ? [driverData.pushToken] : [])])
      ).filter(Boolean);

      if (tokens.length > 0) {
        const messaging = getMessaging();
        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: 'New Trip Request',
            body: `${passengerName} tapped your bus${busData.busNumber ? ` (${busData.busNumber})` : ''}.`,
          },
          data: {
            type: 'trip_request',
            busId,
            tripRequestId: tripRequest.id,
            passengerId,
          },
          webpush: {
            notification: {
              title: 'New Trip Request',
              body: `${passengerName} tapped your bus.`,
              icon: '/icons/pwa-192.svg',
              badge: '/icons/pwa-192.svg',
              tag: `trip-request-${tripRequest.id}`,
              requireInteraction: true,
            },
            fcmOptions: {
              link: '/driver',
            },
          },
        });
      }
    }

    return NextResponse.json({ success: true, tripRequest });
  } catch (error) {
    console.error('[trip-request-create] error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create trip request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

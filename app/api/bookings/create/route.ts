import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin';
import { getDatabase } from 'firebase-admin/database';
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { calculateFareFromLocations } from '@/lib/utils/fareCalculator';
import { Booking, VehicleTypeId } from '@/lib/types';
import { coordWithOptionalAddressSchema } from '@/lib/utils/coordSchema';

// Initialize Firebase Admin for database access
function getAdminApp() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase admin configuration');
    }

    const databaseURL = process.env.FIREBASE_DATABASE_URL ||
      `https://${projectId}-default-rtdb.europe-west1.firebasedatabase.app`;

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey } as ServiceAccount),
      databaseURL,
    });
  }
  return getApps()[0]!;
}

export async function POST(request: Request) {
  try {
    const { bookingData } = await request.json();

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value || null;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Missing session cookie' },
        { status: 401 }
      );
    }

    // Verify session
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const passengerId = decoded.uid;

    // Validate booking data
    const {
      busId,
      passengerName,
      phoneNumber,
      email,
      pickupLocation,
      dropoffLocation,
      numberOfPassengers = 1,
      notes,
      paymentMethod = 'cash',
      vehicleType: requestedVehicleType,
    } = bookingData;

    if (!busId || !passengerName || !phoneNumber || !pickupLocation || !dropoffLocation) {
      return NextResponse.json(
        {
          error: 'Missing required fields: busId, passengerName, phoneNumber, pickupLocation, dropoffLocation',
        },
        { status: 400 }
      );
    }

    const pickupParse = coordWithOptionalAddressSchema.safeParse(pickupLocation);
    if (!pickupParse.success) {
      return NextResponse.json(
        { error: 'Invalid pickupLocation coordinates' },
        { status: 400 }
      );
    }

    const dropoffParse = coordWithOptionalAddressSchema.safeParse(dropoffLocation);
    if (!dropoffParse.success) {
      return NextResponse.json(
        { error: 'Invalid dropoffLocation coordinates' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin
    const adminApp = getAdminApp();
    const db = getDatabase(adminApp);

    const busRef = db.ref(`buses/${busId}`);

    // 1. Fetch bus first for static data (vehicleType) and initial validation
    const busSnapshot = await busRef.once('value');
    const initialBusData = busSnapshot.val();

    if (!initialBusData) {
      return NextResponse.json(
        { error: 'Bus not found' },
        { status: 404 }
      );
    }

    if (initialBusData.isActive === false) {
      return NextResponse.json(
        { error: 'Bus is currently offline. Please choose another bus.' },
        { status: 409 }
      );
    }

    // Determine vehicle type: prefer request, fallback to bus data, fallback to 'bus'
    const vehicleType = requestedVehicleType || initialBusData.vehicleType || 'bus';

    // 2. Calculate fare (local logic, no side effects)
    let fare = 0;
    try {
      fare = calculateFareFromLocations(
        pickupParse.data,
        dropoffParse.data,
        vehicleType as VehicleTypeId,
        numberOfPassengers
      );
    } catch (err) {
      console.warn('Error calculating fare:', err);
      fare = 0;
    }

    // 3. Run Transaction to reserve seats atomically
    const { committed, snapshot: transactionSnapshot } = await busRef.transaction((currentBus) => {
      if (!currentBus) return null; // Should not happen if we found it above, but safety first

      // Re-check active status inside transaction to be sure
      if (currentBus.isActive === false) return; // Abort

      const capacity = currentBus.capacity || 0;
      const online = currentBus.onlineBookedSeats || 0;
      const offline = currentBus.offlineOccupiedSeats || 0;
      const available = Math.max(0, capacity - online - offline);

      if (numberOfPassengers > available) {
        return; // Abort transaction if not enough seats
      }

      // Update seats
      const newOnline = online + numberOfPassengers;
      currentBus.onlineBookedSeats = newOnline;
      currentBus.availableSeats = Math.max(0, capacity - newOnline - offline);
      currentBus.lastSeatUpdate = new Date().toISOString();

      return currentBus;
    });

    if (!committed) {
      // Transaction failed (likely due to abort from lack of seats or offline)
      // We can check transactionSnapshot to see if it was null (bus deleted) or just aborted
      return NextResponse.json(
        {
          error: `Booking failed. The bus may be full, offline, or deleted. Please try again.`,
        },
        { status: 409 }
      );
    }

    // 4. Create Booking Record (only if transaction succeeded)
    const bookingsRef = db.ref('bookings');
    const newBookingRef = bookingsRef.push();

    const reservationExpiresAt = new Date();
    reservationExpiresAt.setMinutes(reservationExpiresAt.getMinutes() + 10); // 10-minute timeout

    const booking: Omit<Booking, 'id'> = {
      passengerId,
      busId,
      passengerName,
      phoneNumber,
      email: email || null,
      numberOfPassengers,
      pickupLocation: {
        ...pickupParse.data,
        timestamp: new Date(),
      },
      dropoffLocation: {
        ...dropoffParse.data,
        timestamp: new Date(),
      },
      fare,
      status: bookingData.status || 'pending',
      timestamp: new Date(),
      notes: notes || null,
      paymentMethod: paymentMethod as 'cash' | 'digital',
      reservationExpiresAt,
      isExpired: false,
    };

    const bookingWithId = {
      ...booking,
      id: newBookingRef.key!,
    };

    await newBookingRef.set(bookingWithId);

    // Send SMS Notification (Fire and forget)
    import('@/lib/utils/sms').then(({ sendSMS }) => {
      sendSMS(
        phoneNumber,
        `DriveUp: Your booking for ${vehicleType} is confirmed! Ticket: ${bookingWithId.id.slice(-6)}. Total: Rs. ${fare}.`
      ).catch(err => console.error('Failed to send SMS:', err));
    });

    return NextResponse.json({
      success: true,
      booking: bookingWithId,
    });
  } catch (error) {
    console.error('[create-booking] error', error);
    const message =
      error instanceof Error ? error.message : 'Failed to create booking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


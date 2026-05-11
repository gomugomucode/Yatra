import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin';
import { getDatabase } from 'firebase-admin/database';
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { calculateFareFromLocations } from '@/lib/utils/fareCalculator';
import { Booking, VehicleTypeId } from '@/lib/types';

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

    // 1. Initialize Firebase Admin
    const adminApp = getAdminApp();
    const db = getDatabase(adminApp);

    // LAZY CLEANUP: Expire old bookings for this bus before proceeding
    // This ensures availableSeats is accurate.
    try {
        const { expireOldBookings } = await import('@/lib/seatManagement');
        await expireOldBookings(busId);
    } catch (e) {
        console.warn('[Booking] Lazy cleanup failed, continuing anyway:', e);
    }

    const busRef = db.ref(`buses/${busId}`);
    
    // 2. Fetch bus first for static data (vehicleType) and initial validation
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

    if (!initialBusData.driverId) {
      return NextResponse.json(
        { error: 'This vehicle has no driver linked. Please try another or wait for the driver to go online.' },
        { status: 422 }
      );
    }

    // Determine vehicle type: prefer request, fallback to bus data, fallback to 'bus'
    const vehicleType = requestedVehicleType || initialBusData.vehicleType || 'bus';

    // 2. Prevent Duplicate Active Bookings
    const activeBookingsSnap = await db.ref('bookings')
        .orderByChild('passengerId')
        .equalTo(passengerId)
        .once('value');
    
    if (activeBookingsSnap.exists()) {
        const activeBookings = Object.values(activeBookingsSnap.val()) as Booking[];
        const hasDuplicate = activeBookings.some(b => 
            b.busId === busId && 
            ['pending', 'confirmed', 'requested', 'accepted', 'active'].includes(b.status)
        );
        
        if (hasDuplicate) {
            return NextResponse.json(
                { error: 'You already have an active booking for this bus. Please cancel it first.' },
                { status: 409 }
            );
        }
    }

    // 3. Calculate fare (local logic, no side effects)
    let fare = 0;
    try {
      fare = calculateFareFromLocations(
        pickupLocation,
        dropoffLocation,
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
      driverId: initialBusData.driverId,
      busId,
      passengerName,
      phoneNumber,
      email: email || null,
      numberOfPassengers,
      pickupLocation: {
        ...pickupLocation,
        timestamp: new Date(),
      },
      dropoffLocation: {
        ...dropoffLocation,
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

    try {
      await newBookingRef.set(bookingWithId);
    } catch (bookingWriteError) {
      console.error('[Booking] Record write failed, rolling back seats:', bookingWriteError);
      // ROLLBACK: Decrement seats on bus if booking write failed
      await busRef.transaction((currentBus) => {
        if (!currentBus) return;
        const online = currentBus.onlineBookedSeats || 0;
        const newOnline = Math.max(0, online - numberOfPassengers);
        currentBus.onlineBookedSeats = newOnline;
        currentBus.availableSeats = Math.max(0, (currentBus.capacity || 0) - newOnline - (currentBus.offlineOccupiedSeats || 0));
        return currentBus;
      });
      throw bookingWriteError; // Re-throw to catch block
    }

    // 5. Solana Escrow (for Digital Payments)
    if (paymentMethod === 'digital') {
      try {
        console.log(`[Escrow] Initializing escrow for booking: ${bookingWithId.id}`);
        
        const driverWallet = initialBusData.driverWalletAddress;
        const passengerProfileSnap = await db.ref(`users/${passengerId}`).once('value');
        const passengerWallet = passengerProfileSnap.exists()
          ? passengerProfileSnap.val()?.solanaWallet
          : null;
        
        if (!driverWallet || !passengerWallet) {
          const errorMsg = !passengerWallet
            ? 'Your Solana wallet is not linked. Please link it in your profile to use digital payments.'
            : 'The driver for this bus has not linked their Solana wallet. Please choose another bus or use cash.';
          
          console.warn(`[Escrow] Missing wallet linkage: ${errorMsg}`);
          
          // Revert booking creation if digital payment fails due to setup
          await newBookingRef.remove();
          return NextResponse.json({ 
            error: errorMsg,
            code: 'WALLET_MISSING'
          }, { status: 400 });
        }

        // Internal call to escrow API
        const { getAppUrl } = await import('@/lib/utils/url');
        const baseUrl = getAppUrl();
        
        const escrowRes = await fetch(`${baseUrl}/api/solana/escrow/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId: bookingWithId.id,
            passengerWallet: passengerWallet,
            driverWallet: driverWallet,
            amountNPR: fare
          })
        });

        if (!escrowRes.ok) {
          const escrowData = await escrowRes.json().catch(() => ({}));
          console.error('[Escrow] API Error:', escrowData?.error);
          
          await newBookingRef.update({
            escrowStatus: 'failed',
            escrowError: escrowData?.error || 'Escrow transaction failed',
          });
          
          // We don't remove the booking here as it might be a transient Solana failure,
          // but we notify the user.
          return NextResponse.json({ 
            error: 'Solana network error. Funds could not be locked. Please try again or use cash.',
            code: 'SOLANA_ERROR'
          }, { status: 503 });
        } else {
          await newBookingRef.update({
            escrowStatus: 'locked',
            passengerWalletAddress: passengerWallet,
            driverWalletAddress: driverWallet,
          });
        }
      } catch (escrowErr) {
        console.error('[Escrow] Integration failed:', escrowErr);
        await newBookingRef.update({
          escrowStatus: 'failed',
          escrowError: escrowErr instanceof Error ? escrowErr.message : 'Escrow integration failed',
        });
        return NextResponse.json({ 
          error: 'Internal escrow service error. Please use cash or try again later.',
          code: 'ESCROW_SERVICE_ERROR'
        }, { status: 500 });
      }
    }

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


import { Bus, Booking } from './types';
import { getDatabase, ref, update, get, onValue, off } from 'firebase/database';
import { getFirebaseApp } from './firebase';

/**
 * Calculate available seats based on capacity and current bookings
 */
export function calculateAvailableSeats(bus: Bus): number {
    const available = bus.capacity - bus.onlineBookedSeats - bus.offlineOccupiedSeats;
    return Math.max(0, available); // Never return negative
}

/**
 * Check if bus can accommodate a booking request
 */
export function canAccommodateBooking(bus: Bus, numberOfPassengers: number): boolean {
    const available = calculateAvailableSeats(bus);
    return available >= numberOfPassengers;
}

/**
 * Update offline passenger count in Firebase Realtime Database atomically.
 */
export async function updateOfflineSeats(
    busId: string,
    offlineSeats: number
): Promise<void> {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);
    
    const { runTransaction } = await import('firebase/database');

    await runTransaction(busRef, (currentBus) => {
        if (!currentBus) return currentBus;

        const validOfflineSeats = Math.max(0, offlineSeats);
        const capacity = currentBus.capacity || 0;
        const onlineBooked = currentBus.onlineBookedSeats || 0;
        const availableSeats = capacity - onlineBooked - validOfflineSeats;

        currentBus.offlineOccupiedSeats = validOfflineSeats;
        currentBus.availableSeats = Math.max(0, availableSeats);
        currentBus.lastSeatUpdate = new Date().toISOString();

        return currentBus;
    });
}

/**
 * Increment offline passenger count
 */
export async function addOfflinePassenger(busId: string): Promise<void> {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);

    const snapshot = await get(busRef);
    if (!snapshot.exists()) {
        throw new Error(`Bus ${busId} not found`);
    }

    const busData = snapshot.val();
    const currentOffline = busData.offlineOccupiedSeats || 0;
    const capacity = busData.capacity || 0;
    const onlineBooked = busData.onlineBookedSeats || 0;

    // Don't exceed capacity
    if (currentOffline + onlineBooked >= capacity) {
        throw new Error('Bus is at full capacity');
    }

    await updateOfflineSeats(busId, currentOffline + 1);
}

/**
 * Decrement offline passenger count
 */
export async function removeOfflinePassenger(busId: string): Promise<void> {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);

    const snapshot = await get(busRef);
    if (!snapshot.exists()) {
        throw new Error(`Bus ${busId} not found`);
    }

    const busData = snapshot.val();
    const currentOffline = busData.offlineOccupiedSeats || 0;

    // Don't go below zero
    if (currentOffline <= 0) {
        return;
    }

    await updateOfflineSeats(busId, currentOffline - 1);
}

/**
 * Update online booked seats count using an atomic transaction.
 */
export async function updateOnlineBookedSeats(
    busId: string,
    onlineSeats: number
): Promise<void> {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);

    const { runTransaction } = await import('firebase/database');
    
    await runTransaction(busRef, (currentBus) => {
        if (!currentBus) return currentBus;
        
        const validOnlineSeats = Math.max(0, onlineSeats);
        const capacity = currentBus.capacity || 0;
        const offlineOccupied = currentBus.offlineOccupiedSeats || 0;
        const availableSeats = capacity - validOnlineSeats - offlineOccupied;

        currentBus.onlineBookedSeats = validOnlineSeats;
        currentBus.availableSeats = Math.max(0, availableSeats);
        currentBus.lastSeatUpdate = new Date().toISOString();
        
        return currentBus;
    });
}

/**
 * Atomically release a specific number of online seats.
 */
export async function releaseOnlineSeats(
    busId: string,
    seatsToRelease: number
): Promise<void> {
    if (seatsToRelease <= 0) return;
    
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);

    const { runTransaction } = await import('firebase/database');
    
    await runTransaction(busRef, (currentBus) => {
        if (!currentBus) return currentBus;
        
        const currentOnline = currentBus.onlineBookedSeats || 0;
        const newOnline = Math.max(0, currentOnline - seatsToRelease);
        const capacity = currentBus.capacity || 0;
        const offlineOccupied = currentBus.offlineOccupiedSeats || 0;
        
        currentBus.onlineBookedSeats = newOnline;
        currentBus.availableSeats = Math.max(0, capacity - newOnline - offlineOccupied);
        currentBus.lastSeatUpdate = new Date().toISOString();
        
        return currentBus;
    });
}

/**
 * Subscribe to real-time seat updates for a bus
 */
export function subscribeToBusSeatUpdates(
    busId: string,
    callback: (bus: any) => void
): () => void {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const busRef = ref(db, `buses/${busId}`);

    onValue(busRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });

    // Return unsubscribe function
    return () => off(busRef);
}

/**
 * Check if a booking has expired (10 minutes timeout)
 */
export function isBookingExpired(booking: Booking): boolean {
    if (!booking.reservationExpiresAt) {
        return false;
    }

    const expirationTime = new Date(booking.reservationExpiresAt).getTime();
    const now = new Date().getTime();

    return now > expirationTime;
}

/**
 * Create a new booking with expiration time
 */
export function createBookingWithTimeout(
    bookingData: Omit<Booking, 'reservationExpiresAt' | 'isExpired'>,
    timeoutMinutes: number = 10
): Booking {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    return {
        ...bookingData,
        reservationExpiresAt: expiresAt,
        isExpired: false,
    };
}

/**
 * Expire old bookings and release their seats atomically.
 */
export async function expireOldBookings(busId: string): Promise<number> {
    const app = getFirebaseApp();
    const db = getDatabase(app);
    const bookingsRef = ref(db, `bookings`);

    const snapshot = await get(bookingsRef);
    if (!snapshot.exists()) {
        return 0;
    }

    const bookings = snapshot.val();
    let totalSeatsToRelease = 0;

    // First, identify expired bookings
    const expiredBookingIds: string[] = [];
    for (const [bookingId, booking] of Object.entries(bookings as Record<string, any>)) {
        if (
            booking.busId === busId &&
            booking.status === 'pending' &&
            isBookingExpired(booking)
        ) {
            expiredBookingIds.push(bookingId);
            totalSeatsToRelease += booking.numberOfPassengers || 1;
        }
    }

    if (expiredBookingIds.length === 0) return 0;

    // Atomically update both bookings and the bus
    const { runTransaction } = await import('firebase/database');
    const busRef = ref(db, `buses/${busId}`);

    // Mark bookings as expired
    const updates: Record<string, any> = {};
    expiredBookingIds.forEach(id => {
        updates[`bookings/${id}/status`] = 'expired';
        updates[`bookings/${id}/isExpired`] = true;
        updates[`bookings/${id}/updatedAt`] = new Date().toISOString();
    });
    
    // Use transaction for the bus seat release
    await runTransaction(busRef, (currentBus) => {
        if (!currentBus) return currentBus;
        const online = currentBus.onlineBookedSeats || 0;
        const newOnline = Math.max(0, online - totalSeatsToRelease);
        currentBus.onlineBookedSeats = newOnline;
        currentBus.availableSeats = Math.max(0, (currentBus.capacity || 0) - newOnline - (currentBus.offlineOccupiedSeats || 0));
        currentBus.lastSeatUpdate = new Date().toISOString();
        return currentBus;
    });

    // Apply booking status updates
    const dbRef = ref(db);
    await update(dbRef, updates);

    return expiredBookingIds.length;
}

/**
 * Format time ago (e.g., "30s ago", "2m ago")
 */
export function formatTimeAgo(date: Date | string): string {
    const now = new Date().getTime();
    const then = new Date(date).getTime();
    const diffSeconds = Math.floor((now - then) / 1000);

    if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
    } else if (diffSeconds < 3600) {
        const minutes = Math.floor(diffSeconds / 60);
        return `${minutes}m ago`;
    } else if (diffSeconds < 86400) {
        const hours = Math.floor(diffSeconds / 3600);
        return `${hours}h ago`;
    } else {
        const days = Math.floor(diffSeconds / 86400);
        return `${days}d ago`;
    }
}

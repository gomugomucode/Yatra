import { getDatabase, ref, set, update, onValue, push, get } from 'firebase/database';
import { getFirebaseApp } from './firebase';
import { Bus, Booking, Location, LiveUser } from './types';

const getDb = () => getDatabase(getFirebaseApp());

// --- Bus Functions ---

export const subscribeToBuses = (callback: (buses: Bus[]) => void) => {
    const db = getDb();
    const busesRef = ref(db, 'buses');

    const unsubscribe = onValue(busesRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const busesList = Object.values(data).map((bus: any) => {
                // Parse Location timestamps properly
                if (bus.currentLocation) {
                    const timestamp = bus.currentLocation.timestamp instanceof Date
                        ? bus.currentLocation.timestamp
                        : typeof bus.currentLocation.timestamp === 'string'
                            ? new Date(bus.currentLocation.timestamp)
                            : new Date();

                    return {
                        ...bus,
                        currentLocation: {
                            ...bus.currentLocation,
                            timestamp,
                        },
                    };
                }
                return bus;
            }) as Bus[];
            callback(busesList);
        } else {
            callback([]);
        }
    });

    return unsubscribe;
};

export const updateBusLocation = async (
    busId: string,
    location: { lat: number; lng: number; heading?: number; speed?: number }
) => {
    const db = getDb();
    // Write high-frequency updates to separate 'locations' node
    const locationRef = ref(db, `locations/${busId}`);

    // Serialize location with timestamp as ISO string for Firebase
    const locationData = {
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date().toISOString(),
        ...(location.heading !== undefined && { heading: location.heading }),
        ...(location.speed !== undefined && { speed: location.speed }),
    };

    await set(locationRef, locationData);

    // Update active status in main bus object (low frequency)
    // We do NOT write location here anymore to save bandwidth
    const busMainRef = ref(db, `buses/${busId}`);
    await update(busMainRef, {
        locationSharingEnabled: true,
        isActive: true,
    });
};

/**
 * Update location sharing status for a bus
 * @param busId - Bus ID
 * @param enabled - Whether location sharing is enabled
 */
export const updateLocationSharingStatus = async (busId: string, enabled: boolean) => {
    const db = getDb();
    const busRef = ref(db, `buses/${busId}`);
    await update(busRef, {
        locationSharingEnabled: enabled,
        isActive: enabled,
    });
};

/**
 * Subscribe to real-time location updates for a specific bus
 * @param busId - Bus ID to listen to
 * @param callback - Callback function that receives location updates
 * @returns Unsubscribe function
 */
export const subscribeToBusLocation = (
    busId: string,
    callback: (location: { lat: number; lng: number; timestamp: string; heading?: number; speed?: number } | null) => void
) => {
    const db = getDb();
    // Listen to separate 'locations' node
    const locationRef = ref(db, `locations/${busId}`);

    const unsubscribe = onValue(locationRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            callback({
                lat: data.lat,
                lng: data.lng,
                timestamp: data.timestamp || new Date().toISOString(),
                heading: data.heading,
                speed: data.speed,
            });
        } else {
            callback(null);
        }
    });

    return unsubscribe;
};

export const updateBusSeatStatus = async (busId: string, online: number, offline: number) => {
    const db = getDb();
    const busRef = ref(db, `buses/${busId}`);

    // Get capacity first to calculate available
    const snapshot = await get(busRef);
    const bus = snapshot.val() as Bus;

    if (bus) {
        const available = Math.max(0, bus.capacity - online - offline);
        await update(busRef, {
            onlineBookedSeats: online,
            offlineOccupiedSeats: offline,
            availableSeats: available,
            lastSeatUpdate: new Date().toISOString()
        });
    }
};

// --- Booking Functions ---

export const createBooking = async (booking: Omit<Booking, 'id'>) => {
    const db = getDb();
    const bookingsRef = ref(db, 'bookings');
    const newBookingRef = push(bookingsRef);

    const newBooking = {
        ...booking,
        id: newBookingRef.key,
        timestamp: new Date().toISOString()
    };

    await set(newBookingRef, newBooking);
    return newBooking;
};

export const subscribeToBookings = (
    id: string,
    role: 'driver' | 'passenger' | 'admin',
    callback: (bookings: Booking[]) => void
) => {
    const db = getDb();
    const bookingsRef = ref(db, 'bookings');

    const unsubscribe = onValue(bookingsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const allBookings = Object.values(data) as Booking[];
            // Filter based on role
            const filtered = allBookings.filter((b) => {
                if (role === 'admin') return true;
                if (role === 'passenger') {
                    // id = passengerId
                    return b.passengerId === id;
                }
                // role === 'driver' -> id = busId
                return b.busId === id;
            });
            callback(filtered);
        } else {
            callback([]);
        }
    });

    return unsubscribe;
};

// --- User Profile Functions ---

export const createUserProfile = async (userId: string, userData: any) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);
    await set(userRef, {
        ...userData,
        id: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
};

export const getUserProfile = async (userId: string) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : null;
};

export const updateUserProfile = async (userId: string, updates: any) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);
    await update(userRef, {
        ...updates,
        updatedAt: new Date().toISOString()
    });
};

export const updateDriverVerificationStatus = async (
    userId: string,
    badgeData: { mintAddress: string; txSignature: string; explorerLink: string; verifiedAt: string }
) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);
    await update(userRef, {
        verificationBadge: badgeData,
        isApproved: true, // Automatically mark as approved if verified on-chain
        updatedAt: new Date().toISOString()
    });
};

export const subscribeToUserProfile = (userId: string, callback: (userData: any) => void) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);

    const unsubscribe = onValue(userRef, (snapshot) => {
        const data = snapshot.val();
        callback(data || null);
    });

    return unsubscribe;
};

// --- Alert Functions ---

export const createAlert = async (alertData: Omit<import('./types').Alert, 'id'>) => {
    const db = getDb();
    const alertsRef = ref(db, 'alerts');
    const newAlertRef = push(alertsRef);

    const newAlert = {
        ...alertData,
        id: newAlertRef.key,
        timestamp: new Date().toISOString(),
        status: 'active'
    };

    await set(newAlertRef, newAlert);
    return newAlert;
};

export const resolveAlert = async (alertId: string) => {
    const db = getDb();
    const alertRef = ref(db, `alerts/${alertId}`);
    await update(alertRef, {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
    });
};

export const subscribeToAlerts = (callback: (alerts: import('./types').Alert[]) => void) => {
    const db = getDb();
    const alertsRef = ref(db, 'alerts');

    const unsubscribe = onValue(alertsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const alertsList = Object.values(data) as import('./types').Alert[];
            // Sort by timestamp desc
            alertsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            callback(alertsList);
        } else {
            callback([]);
        }
    });

    return unsubscribe;
};

// --- Seed Data (for demo) ---
export const seedInitialData = async (buses: Bus[]) => {
    const db = getDb();
    const busesRef = ref(db, 'buses');

    // Check if data exists
    const snapshot = await get(busesRef);
    if (!snapshot.exists()) {
        const updates: Record<string, any> = {};
        buses.forEach(bus => {
            updates[bus.id] = bus;
        });
        await update(busesRef, updates);
        console.log('Seeded initial bus data');
    }
};

// --- Live User Functions (Real-Time GPS Tracking) ---

export const subscribeToLiveUsers = (callback: (users: LiveUser[]) => void) => {
    const db = getDb();
    const usersRef = ref(db, 'live_users');

    const unsubscribe = onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const usersList = Object.values(data) as LiveUser[];
            callback(usersList);
        } else {
            callback([]);
        }
    });

    return unsubscribe;
};

export const updateLiveUserStatus = async (user: LiveUser) => {
    const db = getDb();
    const userRef = ref(db, `live_users/${user.uid}`);
    await set(userRef, {
        ...user,
        updatedAt: new Date().toISOString()
    });
};

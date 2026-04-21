import { getDatabase, ref, set, update, remove, onValue, push, get, onDisconnect } from 'firebase/database';
import { getFirebaseApp } from './firebase';
import { Bus, Booking, Location, LiveUser, TripStatus } from './types';

export const getDb = () => getDatabase(getFirebaseApp());
const getActiveDriverRef = (driverId: string) => ref(getDb(), `drivers/active/${driverId}`);

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
    walletAddress: string,
    location: { lat: number; lng: number; heading?: number; speed?: number }
) => {
    const db = getDb();
    // Canonical real-time driver location path (keyed by driverId / busId).
    const locationRef = getActiveDriverRef(busId);

    // Serialize location with timestamp as ISO string for Firebase
    const locationData = {
        id: busId,
        driverId: busId,
        walletAddress: walletAddress || null,
        role: 'driver',
        status: 'online',
        isOnline: true,
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
        driverWalletAddress: walletAddress,
        locationSharingEnabled: true,
        isActive: true,
    });
};

export const setDriverOffline = async (driverId: string, walletAddress: string) => {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const locationRef = getActiveDriverRef(driverId);
    const busRef = ref(db, `buses/${driverId}`);

    await Promise.all([
        update(locationRef, {
            id: driverId,
            driverId,
            walletAddress: walletAddress || null,
            role: 'driver',
            status: 'offline',
            isOnline: false,
            timestamp: nowIso,
        }),
        update(busRef, {
            isActive: false,
            locationSharingEnabled: false,
        }),
    ]);
};

/**
 * Registers RTDB presence hooks for a driver so dead-zone disconnects immediately
 * mark the bus offline via onDisconnect().
 *
 * Return value is an async cleanup function that cancels onDisconnect hooks.
 */
export const attachDriverPresence = (driverId: string, walletAddress: string) => {
    const db = getDb();
    const connectedRef = ref(db, '.info/connected');
    const locationRef = getActiveDriverRef(driverId);
    const busRef = ref(db, `buses/${driverId}`);

    const unsubscribe = onValue(connectedRef, async (snapshot) => {
        if (snapshot.val() !== true) return;

        try {
            await Promise.all([
                onDisconnect(locationRef).update({
                    id: driverId,
                    driverId,
                    walletAddress: walletAddress || null,
                    role: 'driver',
                    status: 'offline',
                    isOnline: false,
                }),
                onDisconnect(busRef).update({
                    isActive: false,
                    locationSharingEnabled: false,
                }),
                update(busRef, {
                    isActive: true,
                    locationSharingEnabled: true,
                }),
            ]);
        } catch (error) {
            console.error('[Presence] Failed to attach onDisconnect handlers:', error);
        }
    });

    return async () => {
        unsubscribe();
        await Promise.allSettled([
            onDisconnect(locationRef).cancel(),
            onDisconnect(busRef).cancel(),
        ]);
    };
};

/**
 * Update location sharing status for a bus
 * @param busId - Bus ID
 * @param enabled - Whether location sharing is enabled
 */
export const updateLocationSharingStatus = async (busId: string, enabled: boolean, walletAddress?: string) => {
    const db = getDb();
    const busRef = ref(db, `buses/${busId}`);
    const updates: Record<string, boolean> = {
        locationSharingEnabled: enabled,
        isActive: enabled,
    };

    await update(busRef, updates);

    if (!enabled) {
        const locationRef = getActiveDriverRef(busId);
        await update(locationRef, {
            id: busId,
            driverId: busId,
            walletAddress: walletAddress || null,
            role: 'driver',
            status: 'offline',
            isOnline: false,
            timestamp: new Date().toISOString(),
        });
    }
};

export interface TripRequest {
    id: string;
    tripId: string;
    busId: string;
    driverId: string;
    passengerId: string;
    bookingId?: string;
    passengerName: string;
    status: TripStatus | 'pending';
    lat: number;
    lng: number;
    createdAt: string;
    updatedAt: string;
    pickupLocation?: { lat: number; lng: number; address?: string };
    dropoffLocation?: { lat: number; lng: number; address?: string };
}

export const subscribeToTripRequests = (
    busId: string,
    callback: (requests: TripRequest[]) => void
) => {
    const db = getDb();
    const tripRequestsRef = ref(db, 'trips');

    const unsubscribe = onValue(tripRequestsRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }

        const requests = Object.values(data)
            .map((entry: any) => ({
                id: entry.id || entry.tripId,
                tripId: entry.tripId || entry.id,
                busId: entry.busId || entry.driverId,
                driverId: entry.driverId || entry.busId,
                passengerId: entry.passengerId,
                bookingId: entry.bookingId,
                passengerName: entry.passengerName || 'Passenger',
                status: entry.status || 'requested',
                lat: entry.lat ?? entry.pickupLocation?.lat,
                lng: entry.lng ?? entry.pickupLocation?.lng,
                createdAt: entry.createdAt || new Date().toISOString(),
                updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
                pickupLocation: entry.pickupLocation || (entry.lat !== undefined && entry.lng !== undefined
                    ? { lat: entry.lat, lng: entry.lng }
                    : undefined),
                dropoffLocation: entry.dropoffLocation,
            }))
            .filter((entry: TripRequest) => entry.driverId === busId && Number.isFinite(entry.lat) && Number.isFinite(entry.lng)) as TripRequest[];
        requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(requests);
    });

    return unsubscribe;
};

export const subscribeToTrip = (
    tripId: string,
    callback: (trip: TripRequest | null) => void
) => {
    const db = getDb();
    const tripRef = ref(db, `trips/${tripId}`);

    const unsubscribe = onValue(tripRef, (snapshot) => {
        const entry = snapshot.val();
        if (!entry) {
            callback(null);
            return;
        }

        callback({
            id: entry.id || entry.tripId || tripId,
            tripId: entry.tripId || entry.id || tripId,
            busId: entry.busId || entry.driverId,
            driverId: entry.driverId || entry.busId,
            passengerId: entry.passengerId,
            bookingId: entry.bookingId,
            passengerName: entry.passengerName || 'Passenger',
            status: entry.status || 'requested',
            lat: entry.lat ?? entry.pickupLocation?.lat,
            lng: entry.lng ?? entry.pickupLocation?.lng,
            createdAt: entry.createdAt || new Date().toISOString(),
            updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
            pickupLocation: entry.pickupLocation || (entry.lat !== undefined && entry.lng !== undefined
                ? { lat: entry.lat, lng: entry.lng }
                : undefined),
            dropoffLocation: entry.dropoffLocation,
        });
    });

    return unsubscribe;
};

/**
 * Subscribe to real-time location updates for a specific driver.
 * Uses canonical `drivers/active/{driverId}` path.
 * @param driverLocator - Driver uid / busId
 * @param callback - Callback function that receives location updates
 * @returns Unsubscribe function
 */
export const subscribeToBusLocation = (
    driverLocator: string,
    callback: (location: { lat: number; lng: number; timestamp: string; heading?: number; speed?: number } | null) => void
) => {
    const locationRef = getActiveDriverRef(driverLocator);
    return onValue(locationRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback(null);
            return;
        }

        callback({
            lat: data.lat,
            lng: data.lng,
            timestamp: data.timestamp || new Date().toISOString(),
            heading: data.heading,
            speed: data.speed,
        });
    });
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

export const registerPushToken = async (userId: string, token: string) => {
    const db = getDb();
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    const existing = snapshot.exists() ? snapshot.val() : {};
    const existingTokens = Array.isArray(existing.pushTokens) ? existing.pushTokens : [];
    const nextTokens = Array.from(new Set([...existingTokens, token]));

    await update(userRef, {
        pushTokens: nextTokens,
        updatedAt: new Date().toISOString(),
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
// Active drivers are stored under `drivers/active/{driverId}`.
// Passenger live updates remain in `locations/{id}`.

export const subscribeToLiveUsers = (callback: (users: LiveUser[]) => void) => {
    const db = getDb();
    const activeDriversRef = ref(db, 'drivers/active');
    const passengerLocationsRef = ref(db, 'locations');

    let driverData: Record<string, any> = {};
    let passengerData: Record<string, any> = {};
    let cancelled = false;
    // badge cache: fetched once per driver id per subscription lifetime
    const badgeCache = new Map<string, LiveUser['verificationBadge'] | null>();

    const emit = async () => {
        const rawDrivers = Object.entries(driverData)
            .map(([driverId, entry]: [string, any]) => ({
                id: entry.id || driverId,
                role: 'driver' as const,
                lat: entry.lat,
                lng: entry.lng,
                isOnline: entry.isOnline ?? entry.status === 'online',
                status: entry.status,
                timestamp: entry.timestamp,
                route: entry.route,
                vehicleType: entry.vehicleType,
                requestStatus: entry.requestStatus,
            }))
            .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng));

        const rawPassengers = Object.entries(passengerData)
            .map(([passengerId, entry]: [string, any]) => ({
                id: entry.id || passengerId,
                role: 'passenger' as const,
                lat: entry.lat,
                lng: entry.lng,
                isOnline: entry.isOnline ?? true,
                status: entry.status,
                timestamp: entry.timestamp,
                route: entry.route,
                vehicleType: entry.vehicleType,
                requestStatus: entry.requestStatus,
                sourceRole: entry.role,
            }))
            .filter((entry) =>
                Number.isFinite(entry.lat) &&
                Number.isFinite(entry.lng) &&
                (entry.sourceRole === 'passenger' || entry.sourceRole === undefined)
            )
            .map(({ sourceRole, ...entry }) => entry);

        const rawList = [...rawDrivers, ...rawPassengers] as LiveUser[];

        // Attach verificationBadge for drivers — fetch once per driver, then serve from cache.
        const list = await Promise.all(
            rawList.map(async (user) => {
                if (user.role !== 'driver') return user;
                if (badgeCache.has(user.id)) {
                    const cached = badgeCache.get(user.id);
                    return cached ? { ...user, verificationBadge: cached } : user;
                }
                try {
                    const userRef = ref(db, `users/${user.id}`);
                    const userSnap = await get(userRef);
                    const badge = userSnap.exists() ? userSnap.val().verificationBadge ?? null : null;
                    badgeCache.set(user.id, badge);
                    return badge ? { ...user, verificationBadge: badge } : user;
                } catch {
                    badgeCache.set(user.id, null);
                    return user;
                }
            })
        );

        if (!cancelled) callback(list);
    };

    const unsubscribeDrivers = onValue(activeDriversRef, (snapshot) => {
        driverData = snapshot.val() || {};
        emit().catch((error) => console.error('[LiveUsers] driver emit failed:', error));
    });

    const unsubscribePassengers = onValue(passengerLocationsRef, (snapshot) => {
        passengerData = snapshot.val() || {};
        emit().catch((error) => console.error('[LiveUsers] passenger emit failed:', error));
    });

    return () => {
        cancelled = true;
        unsubscribeDrivers();
        unsubscribePassengers();
    };
};

export const updateLiveUserStatus = async (user: LiveUser) => {
    const db = getDb();

    const locationPayload: Record<string, any> = {
        id: user.id,
        role: user.role,
        lat: user.lat,
        lng: user.lng,
        isOnline: user.isOnline,
        timestamp: typeof user.timestamp === 'number'
            ? new Date(user.timestamp).toISOString()
            : user.timestamp,
        // ✅ Include optional fields so filters can read them
        ...(user.route ? { route: user.route } : {}),
        ...(user.vehicleType ? { vehicleType: user.vehicleType } : {}),
        ...(user.requestStatus ? { requestStatus: user.requestStatus } : {}),
    };

    const locationRef = user.role === 'driver'
        ? ref(db, `drivers/active/${user.id}`)
        : ref(db, `locations/${user.id}`);

    await set(locationRef, {
        ...locationPayload,
        status: user.isOnline ? 'online' : 'offline',
    });
    console.log('📡 LOCATION WRITTEN:', locationPayload);

    // If this is a driver, also keep `buses/{id}/currentLocation` up to date
    // so the bus list / existing bus-tracking components stay in sync.
    if (user.role === 'driver' && user.isOnline) {
        const busRef = ref(db, `buses/${user.id}`);
        const busSnapshot = await get(busRef);
        if (busSnapshot.exists()) {
            await update(busRef, {
                currentLocation: {
                    lat: user.lat,
                    lng: user.lng,
                    timestamp: locationPayload.timestamp,
                },
                locationSharingEnabled: true,
                isActive: true,
            });
        }
    }
};

// --- Trip State Machine Write Functions ---

export async function updateTripStatus(
    tripId: string,
    status: TripStatus,
    extraFields?: Record<string, unknown>
): Promise<void> {
    const db = getDb();
    await update(ref(db, `trips/${tripId}`), {
        status,
        updatedAt: new Date().toISOString(),
        ...extraFields,
    });
}

export async function publishTripLocation(
    tripId: string,
    role: 'driver' | 'passenger',
    lat: number,
    lng: number
): Promise<void> {
    if (
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180
    ) {
        console.warn('[publishTripLocation] Invalid coordinates', { lat, lng });
        return;
    }
    const db = getDb();
    await set(ref(db, `tripLocations/${tripId}/${role}`), {
        lat,
        lng,
        timestamp: new Date().toISOString(),
    });
}

export function subscribeTripLocation(
    tripId: string,
    role: 'driver' | 'passenger',
    callback: (loc: { lat: number; lng: number } | null) => void
): () => void {
    const db = getDb();
    const locRef = ref(db, `tripLocations/${tripId}/${role}`);
    const unsubscribe = onValue(locRef, (snap) => {
        const val = snap.val();
        if (val && typeof val.lat === 'number' && typeof val.lng === 'number') {
            callback({ lat: val.lat, lng: val.lng });
        } else {
            callback(null);
        }
    });
    return unsubscribe;
}

export async function cleanupTripLocation(tripId: string): Promise<void> {
    const db = getDb();
    await remove(ref(db, `tripLocations/${tripId}`));
}

export async function submitTripRating(
    tripId: string,
    rater: 'passenger' | 'driver',
    stars: number,
    comment: string
): Promise<void> {
    const db = getDb();
    const field = rater === 'passenger' ? 'passengerRating' : 'driverRating';
    await update(ref(db, `trips/${tripId}`), {
        [field]: { stars, comment, createdAt: new Date().toISOString() },
    });
}

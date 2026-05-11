import { getDatabase, ref, set, update, remove, onValue, push, get, onDisconnect, query, orderByChild, equalTo, off, limitToLast } from 'firebase/database';
import { getFirebaseApp } from './firebase';
import { Bus, Booking, Location, LiveUser, TripStatus } from './types';
import { isValidTripTransition } from '@/lib/tripStateMachine';
import { releaseOnlineSeats } from './seatManagement';

export const getDb = () => getDatabase(getFirebaseApp());
const getActiveDriverRef = (driverId: string) => ref(getDb(), `drivers/active/${driverId}`);

// --- Bus Functions ---

export const subscribeToBuses = (callback: (buses: Bus[]) => void) => {
    const db = getDb();
    const busesRef = ref(db, 'buses');

    const unsubscribe = onValue(busesRef, (snapshot) => {
        try {
            const data = snapshot.val();
            console.log('[FirebaseDb] Buses snapshot received');
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
        } catch (error) {
            console.error('[FirebaseDb] subscribeToBuses callback error:', error);
        }
    }, (error) => {
        console.error('[FirebaseDb] subscribeToBuses failed:', error);
    });

    return unsubscribe;
};

export const updateBusLocation = async (
    busId: string,
    driverId: string,
    walletAddress: string,
    location: { lat: number; lng: number; heading?: number; speed?: number }
) => {
    const db = getDb();
    // Canonical real-time driver location path (keyed by driverId / busId).
    const locationRef = getActiveDriverRef(busId);

    // Serialize location with timestamp as ISO string for Firebase
    const locationData = {
        id: busId,
        driverId: driverId,
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
        driverId: driverId,
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
            driverId: driverId,
        }),
    ]);
};

/**
 * Registers RTDB presence hooks for a driver so dead-zone disconnects immediately
 * mark the bus offline via onDisconnect().
 *
 * Return value is an async cleanup function that cancels onDisconnect hooks.
 */
export const attachDriverPresence = (busId: string, driverId: string, walletAddress: string) => {
    const db = getDb();
    const connectedRef = ref(db, '.info/connected');
    const locationRef = getActiveDriverRef(driverId);
    const busRef = ref(db, `buses/${busId}`);

    const unsubscribe = onValue(connectedRef, async (snapshot) => {
        if (snapshot.val() !== true) return;

        try {
            console.log(`[Presence] Initializing bus state and attaching onDisconnect for bus=${busId}, driver=${driverId}`);
            
            // 1. First initialize/ensure the bus record exists with correct driverId.
            // This satisfies security rules for subsequent onDisconnect registrations.
            await update(busRef, {
                isActive: true,
                locationSharingEnabled: true,
                driverId: driverId,
                driverWalletAddress: walletAddress || null
            });

            // 2. Attach onDisconnect handlers
            await Promise.all([
                onDisconnect(locationRef).update({
                    status: 'offline',
                    isOnline: false,
                }),
                onDisconnect(busRef).update({
                    isActive: false,
                    locationSharingEnabled: false,
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
export const updateLocationSharingStatus = async (busId: string, enabled: boolean, driverId: string, walletAddress?: string) => {
    const db = getDb();
    const busRef = ref(db, `buses/${busId}`);
    const updates: Record<string, string | boolean | null> = {
        locationSharingEnabled: enabled,
        isActive: enabled,
        driverId: driverId,
    };

    await update(busRef, updates);

    if (!enabled) {
        const locationRef = getActiveDriverRef(busId);
        await update(locationRef, {
            id: busId,
            driverId: driverId,
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

function mapTripStatusToBookingStatus(status: TripStatus): Booking['status'] {
    switch (status) {
        case 'completed':
            return 'completed';
        case 'cancelled':
        case 'rejected':
            return 'cancelled';
        case 'expired':
            return 'expired';
        default:
            return 'confirmed';
    }
}

export const subscribeToTripRequests = (
    busId: string,
    callback: (requests: TripRequest[]) => void
) => {
    const db = getDb();
    const tripsRef = ref(db, 'trips');
    console.log(`[FirebaseDb] Subscribing to trips for driverId: ${busId}`);
    const driverQuery = query(tripsRef, orderByChild('driverId'), equalTo(busId), limitToLast(20));

    const unsubscribe = onValue(driverQuery, (snapshot) => {
        try {
            const data = snapshot.val();
            console.log(`[FirebaseDb] Trip update received for ${busId}. Count: ${data ? Object.keys(data).length : 0}`);

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
        } catch (error) {
            console.error('[FirebaseDb] subscribeToTripRequests callback error:', error);
        }
    }, (error) => {
        console.error('[FirebaseDb] subscribeToTripRequests failed:', error);
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
        try {
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
        } catch (error) {
            console.error('[FirebaseDb] subscribeToBusLocation callback error:', error);
        }
    }, (error) => {
        console.error('[FirebaseDb] subscribeToBusLocation failed:', error);
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
    const queryField = role === 'passenger' ? 'passengerId' : (role === 'driver' ? 'driverId' : 'busId');
    
    console.log(`[FirebaseDb] subscribeToBookings: role=${role}, field=${queryField}, id=${id}`);
    
    const targetRef = role === 'admin'
        ? bookingsRef
        : query(bookingsRef, orderByChild(queryField), equalTo(id));

    const unsubscribe = onValue(targetRef, (snapshot) => {
        try {
            const data = snapshot.val();
            if (data) {
                callback(Object.values(data) as Booking[]);
            } else {
                callback([]);
            }
        } catch (error) {
            console.error('[FirebaseDb] subscribeToBookings callback error:', error);
        }
    }, (error) => {
        console.error('[FirebaseDb] subscribeToBookings failed:', error);
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
    let emitTimeout: NodeJS.Timeout | null = null;
    const badgeCache = new Map<string, LiveUser['verificationBadge'] | null>();

    const emit = async () => {
        if (cancelled) return;

        try {
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

            // Optimize badge fetching: only fetch if not in cache
            const list = await Promise.all(
                rawList.map(async (user) => {
                    if (user.role !== 'driver') return user;
                    if (badgeCache.has(user.id)) {
                        const cached = badgeCache.get(user.id);
                        return cached ? { ...user, verificationBadge: cached } : user;
                    }
                    try {
                        const userSnap = await get(ref(db, `users/${user.id}`));
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
        } catch (error) {
            console.error('[FirebaseDb] subscribeToLiveUsers emit error:', error);
        }
    };

    const throttledEmit = () => {
        if (emitTimeout) return;
        emitTimeout = setTimeout(() => {
            emitTimeout = null;
            emit().catch(err => console.error('[LiveUsers] emit failed:', err));
        }, 100); // Throttle to 10fps max for location updates
    };

    const unsubscribeDrivers = onValue(activeDriversRef, (snapshot) => {
        driverData = snapshot.val() || {};
        throttledEmit();
    }, (error) => console.error('[LiveUsers] drivers failed:', error));

    const unsubscribePassengers = onValue(passengerLocationsRef, (snapshot) => {
        passengerData = snapshot.val() || {};
        throttledEmit();
    }, (error) => console.error('[LiveUsers] passengers failed:', error));

    return () => {
        cancelled = true;
        if (emitTimeout) clearTimeout(emitTimeout);
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
    console.log(`[FirebaseDb] updateTripStatus: ${tripId} -> ${status}`, extraFields);
    const db = getDb();
    let isBooking = false;
    let tripRef = ref(db, `trips/${tripId}`);
    let tripSnap = await get(tripRef);
    if (!tripSnap.exists()) {
        tripRef = ref(db, `bookings/${tripId}`);
        tripSnap = await get(tripRef);
        isBooking = true;
    }
    if (!tripSnap.exists()) {
        console.warn(`[FirebaseDb] updateTripStatus: Record not found for id ${tripId}`);
        return;
    }

    const currentStatus = tripSnap.val()?.status as TripStatus | undefined;
    const tripData = tripSnap.val() as { bookingId?: string };

    if (currentStatus && currentStatus !== status) {
        if (!isValidTripTransition(currentStatus, status)) {
            console.warn(`[FirebaseDb] Invalid trip transition: ${currentStatus} -> ${status}`);
        }
    }

    const now = new Date().toISOString();
    await update(tripRef, {
        status,
        updatedAt: now,
        ...extraFields,
    });

    // Keep booking lifecycle in sync with trip lifecycle when linked.
    const linkedBookingId = tripData.bookingId || tripId;
    const bookingRef = ref(db, `bookings/${linkedBookingId}`);
    const bookingSnap = await get(bookingRef);
    if (bookingSnap.exists()) {
        const bookingData = bookingSnap.val();
        await update(bookingRef, {
            status: mapTripStatusToBookingStatus(status),
            updatedAt: now,
        });

        // CAPACITY GUARD: If trip is finishing, restore seats
        const terminalStates = ['completed', 'cancelled', 'expired', 'rejected'];
        const isFinishing = terminalStates.includes(status);
        const wasAlreadyFinished = currentStatus && terminalStates.includes(currentStatus);

        if (isFinishing && !wasAlreadyFinished) {
            const seats = bookingData.numberOfPassengers || 1;
            const busId = bookingData.busId;
            if (busId) {
                console.log(`[FirebaseDb] Releasing ${seats} seats for bus ${busId} (Trip ${status} from ${currentStatus})`);
                await releaseOnlineSeats(busId, seats);
            }
        }
    }
}

/**
 * GPS-verified trip completion.
 * Updates status and handles cleanup of real-time location data.
 */
export async function autoCompleteTripByGPS(
    tripId: string,
    extraFields?: Record<string, unknown>
): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    const tripRef = ref(db, `trips/${tripId}`);
    const tripSnap = await get(tripRef);
    if (!tripSnap.exists()) {
        throw new Error(`Trip not found: ${tripId}`);
    }
    const tripData = tripSnap.val() as { bookingId?: string, status?: TripStatus };
    const currentStatus = tripData.status;

    // 1. Update main trip record
    await update(tripRef, {
        status: 'completed',
        completedAt: now,
        completionMethod: 'gps',
        gpsVerifiedAt: now,
        updatedAt: now,
        ...extraFields,
    });

    const linkedBookingId = tripData.bookingId || tripId;
    const bookingRef = ref(db, `bookings/${linkedBookingId}`);
    const bookingSnap = await get(bookingRef);
    if (bookingSnap.exists()) {
        const bookingData = bookingSnap.val();
        await update(bookingRef, {
            status: 'completed',
            updatedAt: now,
        });

        // CAPACITY GUARD: Restore seats on GPS completion (if not already finished)
        const terminalStates = ['completed', 'cancelled', 'expired', 'rejected'];
        if (!currentStatus || !terminalStates.includes(currentStatus)) {
            const seats = bookingData.numberOfPassengers || 1;
            const busId = bookingData.busId;
            if (busId) {
                console.log(`[FirebaseDb] Releasing ${seats} seats for bus ${busId} (GPS Completed from ${currentStatus})`);
                await releaseOnlineSeats(busId, seats);
            }
        }
    }

    // 2. Cleanup trip-specific location data
    await cleanupTripLocation(tripId);
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
        throw new Error('Invalid coordinates for trip location update');
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
    try {
        const response = await fetch('/api/ratings/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tripId, rater, stars, comment }),
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to submit rating');
        }
    } catch (err) {
        console.error('[FirebaseDb] submitTripRating error:', err);
        throw err;
    }
}

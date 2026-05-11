import { useEffect, useState, useRef } from 'react';
import { updateLiveUserStatus } from '@/lib/firebaseDb';
import { LiveUser, VehicleTypeId, RequestStatus } from '@/lib/types';

export function useLiveLocation(
    id: string | undefined,
    role: 'driver' | 'passenger' | 'admin' | undefined,
    initialTracking: boolean = false,
    route?: string,
    vehicleType?: VehicleTypeId,
    requestStatus?: RequestStatus // 'idle' | 'requesting' | 'on-trip'
) {
    const [isTracking, setIsTracking] = useState(initialTracking);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const lastPushRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
    const watchIdRef = useRef<number | null>(null);

    const toggleTracking = () => {
        setIsTracking((prev) => !prev);
    };

    // Derive the effective status:
    // - Passengers default to 'idle' unless explicitly set
    // - Drivers don't need a requestStatus
    const effectiveStatus: RequestStatus | undefined =
        role === 'passenger'
            ? (requestStatus ?? 'idle')
            : undefined;

    useEffect(() => {
        if (!isTracking || !id) {
            if (id && role) {
                const validRole = role as 'driver' | 'passenger';
                updateLiveUserStatus({
                    id,
                    role: validRole,
                    lat: location?.lat || 0,
                    lng: location?.lng || 0,
                    isOnline: false,
                    timestamp: new Date().toISOString(),
                    vehicleType,
                    requestStatus: effectiveStatus,
                }).catch(console.error);
            }

            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.');
            return;
        }

        let isActive = true;
        let hasLoggedError = false;

        const startWatching = () => {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    if (!isActive) return;
                    const { latitude, longitude } = position.coords;
                    const now = Date.now();

                    let shouldUpdate = false;
                    if (!lastPushRef.current) {
                        shouldUpdate = true;
                    } else {
                        const timeElapsed = now - lastPushRef.current.time;
                        if (timeElapsed >= 3000) {
                            shouldUpdate = true;
                        }
                    }

                    if (shouldUpdate) {
                        setLocation({ lat: latitude, lng: longitude });

                        if (id && role) {
                            const validRole = role as 'driver' | 'passenger';
                            const userPayload: LiveUser = {
                                id,
                                role: validRole,
                                lat: latitude,
                                lng: longitude,
                                isOnline: true,
                                timestamp: new Date(now).toISOString(),
                                vehicleType,
                                requestStatus: effectiveStatus,
                                ...(route ? { route } : {})
                            };

                            updateLiveUserStatus(userPayload).catch((err) => {
                                console.error('Failed to update live location in Firebase:', err);
                            });
                        }

                        lastPushRef.current = { lat: latitude, lng: longitude, time: now };
                    }
                },
                (err) => {
                    if (!isActive) return;
                    setError(err.message);
                    if (!hasLoggedError) {
                        console.warn('[useLiveLocation] Geolocation watch error:', err.message);
                        hasLoggedError = true;
                    }
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 10000
                }
            );
        };

        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                if (result.state === 'denied') {
                    if (!hasLoggedError) {
                        console.warn('[useLiveLocation] Location permission denied.');
                        setError('Location permission denied.');
                        hasLoggedError = true;
                    }
                } else {
                    startWatching();
                }
            }).catch(() => startWatching());
        } else {
            startWatching();
        }

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [isTracking, id, role, vehicleType, route, effectiveStatus]);

    return {
        location,
        isTracking,
        toggleTracking,
        error
    };
}
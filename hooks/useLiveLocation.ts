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
    const timeoutErrorLoggedRef = useRef(false);

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

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
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
                    console.log('📍 SENDING LOCATION:', {
                        id,
                        role,
                        vehicleType,
                        requestStatus: effectiveStatus,
                        lat: latitude,
                        lng: longitude
                    });
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
                const errObj = err as { message?: string; code?: number | string };
                const message = errObj && typeof errObj === 'object'
                    ? errObj.message || String(errObj.code) || JSON.stringify(errObj)
                    : String(err);

                if (errObj?.code === 3 || message.toLowerCase().includes('timeout')) {
                    const friendly = 'Location timed out. Waiting for a stronger signal...';
                    setError(friendly);
                    if (!timeoutErrorLoggedRef.current) {
                        console.warn('Geolocation timeout:', message);
                        timeoutErrorLoggedRef.current = true;
                    }
                } else {
                    setError(message);
                    console.error('Geolocation watch error:', message);
                }
            },
            {
                enableHighAccuracy: false,
                maximumAge: 15000,
                timeout: 20000,
            }
        );

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
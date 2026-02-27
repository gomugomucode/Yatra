import { useEffect, useState, useRef } from 'react';
import { updateLiveUserStatus } from '@/lib/firebaseDb';
import { getDistanceInMeters } from '@/lib/utils';
import { LiveUser } from '@/lib/types';

export function useLiveLocation(
    uid: string | undefined,
    role: 'driver' | 'passenger' | 'admin' | undefined,
    initialTracking: boolean = false
) {
    const [isTracking, setIsTracking] = useState(initialTracking);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const lastPushRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
    const watchIdRef = useRef<number | null>(null);

    // Provide a toggle function for the driver
    const toggleTracking = () => {
        setIsTracking((prev) => !prev);
    };

    useEffect(() => {
        if (!isTracking || !uid) {
            // If tracking is turned off or invalid, update Firebase to show offline
            if (uid && role) {
                const validRole = role as 'driver' | 'passenger';
                updateLiveUserStatus({
                    uid,
                    role: validRole,
                    lat: location?.lat || 0,
                    lng: location?.lng || 0,
                    isOnline: false,
                    updatedAt: Date.now()
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

        // Start watching position
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const now = Date.now();

                // Throttle React state and Firebase push to once every 3 seconds
                // This prevents UI re-render storms and battery drain.
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

                    if (uid && role) {
                        // Provide a userPayload for driver or passenger
                        const validRole = role as 'driver' | 'passenger';

                        const userPayload: LiveUser = {
                            uid,
                            role: validRole,
                            lat: latitude,
                            lng: longitude,
                            isOnline: true,
                            updatedAt: now
                        };

                        updateLiveUserStatus(userPayload).catch((err) => {
                            console.error('Failed to update live location in Firebase:', err);
                        });
                    }

                    lastPushRef.current = { lat: latitude, lng: longitude, time: now };
                }
            },
            (err) => {
                setError(err.message);
                console.error('Geolocation watch error:', err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0, // Force fresh location
                timeout: 10000
            }
        );

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [isTracking, uid, role]);

    return {
        location,
        isTracking,
        toggleTracking,
        error
    };
}

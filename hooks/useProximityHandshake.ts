'use client';

/**
 * useProximityHandshake
 *
 * Centralised hook that:
 *  1. Subscribes to the hailed driver's live GPS (`drivers/active/{driverId}`)
 *  2. Computes Haversine distance to the passenger's pickup pin on every GPS tick
 *  3. When distance ≤ ARRIVAL_THRESHOLD_METERS, plays /public/alert.mp3
 *     at max volume and exposes `arrived = true`
 *
 * Both the driver's "PASSENGER REACHED" logic and the passenger's
 * "YOUR RIDE IS HERE" logic use the same underlying distance calc,
 * so this hook can be consumed on both sides.
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeToBusLocation } from '@/lib/firebaseDb';

export const ARRIVAL_THRESHOLD_METERS = 10;

function haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6_371_000; // Earth radius in metres
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Options {
    /** The driver's Firebase UID / busId to watch */
    driverId: string | null;
    /** The passenger's dropped pickup pin */
    pickupLat: number | null;
    pickupLng: number | null;
    /** Whether the handshake is active at all */
    enabled?: boolean;
}

interface HandshakeState {
    /** Latest driver position as seen by this hook */
    driverLocation: { lat: number; lng: number } | null;
    /** Current distance in metres (null if we lack data) */
    distanceMeters: number | null;
    /** True once we cross the 10-metre threshold (latches until reset) */
    arrived: boolean;
    /** ETA in seconds from the last OSRM response (updated lazily) */
    etaSeconds: number | null;
    /** Manually reset the arrived latch */
    resetArrived: () => void;
}

export function useProximityHandshake({
    driverId,
    pickupLat,
    pickupLng,
    enabled = true,
}: Options): HandshakeState {
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
    const [arrived, setArrived] = useState(false);
    const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const hasAlarmedRef = useRef(false);

    // ── Subscribe to driver GPS ──────────────────────────────────────────────
    useEffect(() => {
        if (!enabled || !driverId) {
            setDriverLocation(null);
            return;
        }

        return subscribeToBusLocation(driverId, (loc) => {
            if (!loc) { setDriverLocation(null); return; }
            setDriverLocation({ lat: loc.lat, lng: loc.lng });
        });
    }, [driverId, enabled]);

    // ── Compute distance + fire arrival alarm ────────────────────────────────
    useEffect(() => {
        if (!driverLocation || pickupLat == null || pickupLng == null) {
            setDistanceMeters(null);
            return;
        }

        const d = haversineMeters(
            driverLocation.lat, driverLocation.lng,
            pickupLat, pickupLng,
        );
        setDistanceMeters(d);

        if (d <= ARRIVAL_THRESHOLD_METERS && !hasAlarmedRef.current) {
            hasAlarmedRef.current = true;
            setArrived(true);

            // Play alert; silently fail if browser blocks autoplay
            try {
                const audio = new Audio('/alert.mp3');
                audio.volume = 1;
                audioRef.current = audio;
                audio.play().catch(() => undefined);
            } catch {
                // autoplay blocked – UI alert is still shown
            }
        }
    }, [driverLocation, pickupLat, pickupLng]);

    // ── Lazy OSRM ETA fetch (throttled to once every 30 s) ──────────────────
    const lastEtaFetchRef = useRef(0);
    useEffect(() => {
        if (!driverLocation || pickupLat == null || pickupLng == null) return;
        if (Date.now() - lastEtaFetchRef.current < 30_000) return;

        lastEtaFetchRef.current = Date.now();

        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${driverLocation.lng},${driverLocation.lat};${pickupLng},${pickupLat}` +
            `?overview=false`;

        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                if (data?.code === 'Ok' && data.routes?.[0]) {
                    setEtaSeconds(Math.round(data.routes[0].duration));
                }
            })
            .catch(() => undefined);
    }, [driverLocation, pickupLat, pickupLng]);

    const resetArrived = () => {
        hasAlarmedRef.current = false;
        setArrived(false);
        audioRef.current?.pause();
        audioRef.current = null;
    };

    return { driverLocation, distanceMeters, arrived, etaSeconds, resetArrived };
}

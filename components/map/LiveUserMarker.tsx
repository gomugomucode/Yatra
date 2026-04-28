'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { LiveUser, VehicleTypeId } from '@/lib/types';

// Helper to determine the emoji based on role and vehicle type
const getVehicleEmoji = (role: 'driver' | 'passenger', vehicleType?: string) => {
    if (role === 'passenger') return '👤';

    switch (vehicleType as VehicleTypeId) {
        case 'bike': return '🏍️';
        case 'bus': return '🚌';
        case 'taxi': return '🚕';
        case 'others': return '🚗';
        default: return '🚗'; // Default fallback for drivers
    }
};

const createRoleIcon = (role: 'driver' | 'passenger', vehicleType?: string) => {
    const label = getVehicleEmoji(role, vehicleType);

    return L.divIcon({
        html: `<div style="font-size: 28px; line-height: 1; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">${label}</div>`,
        className: 'custom-hackathon-icon flex items-center justify-center transition-transform hover:scale-110',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

export default function LiveUserMarker({
    user,
    onClick,
}: {
    user: LiveUser;
    onClick?: () => void;
}) {
    const targetPosition: [number, number] = [user.lat, user.lng];
    const [position, setPosition] = useState<[number, number]>(targetPosition);
    const positionRef = useRef<[number, number]>(targetPosition);
    const rafRef = useRef<number | null>(null);

    // Pass vehicleType to the icon creator
    const icon = createRoleIcon(user.role, user.vehicleType);
    const targetLat = targetPosition[0];
    const targetLng = targetPosition[1];

    // Smooth marker motion between streamed GPS points.
    useEffect(() => {
        const [startLat, startLng] = positionRef.current;
        const endLat = targetLat;
        const endLng = targetLng;
        const durationMs = 900;
        const startTime = performance.now();

        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const animate = (now: number) => {
            const tRaw = Math.min(1, (now - startTime) / durationMs);
            const t = tRaw * (2 - tRaw); // easeOutQuad
            const nextLat = startLat + (endLat - startLat) * t;
            const nextLng = startLng + (endLng - startLng) * t;
            const next: [number, number] = [nextLat, nextLng];
            positionRef.current = next;
            setPosition(next);

            if (tRaw < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [targetLat, targetLng]);

    return (
        <Marker
            position={position}
            icon={icon}
            zIndexOffset={100}
            eventHandlers={{
                click: onClick,
            }}
        />
    );
}

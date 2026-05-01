'use client';

import { useState, useEffect } from 'react';
import MapWrapper from '@/components/map/MapWrapper';
import { Bus } from '@/lib/types';
import { subscribeToBuses, subscribeToBusLocation } from '@/lib/firebaseDb';

export default function ActiveBusMap() {
    const [buses, setBuses] = useState<Bus[]>([]);
    const [busLocations, setBusLocations] = useState<Record<string, {
        lat: number;
        lng: number;
        timestamp: string;
        heading?: number;
        speed?: number;
    }>>({});

    // Subscribe to all buses
    useEffect(() => {
        const unsubscribe = subscribeToBuses((busesData) => {
            // Parse Location timestamps properly
            const parsedBuses = busesData.map(bus => {
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
            });
            setBuses(parsedBuses);
        });
        return () => unsubscribe();
    }, []);

    // Subscribe to locations for ALL active buses
    useEffect(() => {
        const unsubscribes: (() => void)[] = [];

        buses.forEach(bus => {
            if (bus.isActive) {
                const unsubscribe = subscribeToBusLocation(bus.id, (location) => {
                    if (location) {
                        setBusLocations(prev => ({
                            ...prev,
                            [bus.id]: location,
                        }));
                    }
                });
                unsubscribes.push(unsubscribe);
            }
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, [buses.map(b => b.id).join(',')]); // Re-subscribe if bus list changes

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border border-slate-100 relative">
            <MapWrapper
                role="admin"
                buses={buses}
                busLocations={busLocations}
                // Admin view doesn't need user location or routing for now
                userLocation={{ lat: 27.7172, lng: 85.3240 }} // Default center
            />

            {/* Legend Overlay */}
            <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-slate-200 text-xs text-slate-700">
                <div className="font-bold mb-2">Bus Status</div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></span>
                    <span>Active (Moving)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-slate-500 border border-white shadow-sm"></span>
                    <span>Inactive (Offline)</span>
                </div>
            </div>
        </div>
    );
}

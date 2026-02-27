'use client';

import React, { Component, ReactNode, useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Passenger, LiveUser } from '@/lib/types';
import { VEHICLE_TYPE_MAP, DEFAULT_LOCATION } from '@/lib/constants';
import { subscribeToLiveUsers } from '@/lib/firebaseDb';
import LiveUserMarker from './LiveUserMarker';

// Fix for default Leaflet marker icons in Next.js (configured in an effect with cleanup).
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

interface LeafletMapProps {
    role: 'driver' | 'passenger' | 'admin';
    buses: Bus[];
    passengers?: Passenger[];
    selectedBus?: Bus | null;
    onBusSelect?: (bus: Bus) => void;
    onLocationSelect?: (location: { lat: number; lng: number }) => void;
    showRoute?: boolean;
    pickupLocation?: { lat: number; lng: number; address?: string } | null;
    dropoffLocation?: { lat: number; lng: number; address?: string } | null;
    userLocation?: { lat: number; lng: number } | null;
    pickupProximityLevel?: 'far' | 'approaching' | 'nearby' | 'arrived' | null;
    busETAs?: Record<string, number | null>;
    busLocations?: Record<string, { lat: number; lng: number; timestamp: string; heading?: number; speed?: number }>;
}

// Component to handle map center updates - only on significant changes or initial load
function MapUpdater({ center, selectedBusId, userLocation }: { center: { lat: number; lng: number }, selectedBusId?: string, userLocation?: { lat: number; lng: number } | null }) {
    const map = useMap();
    const [lastBusId, setLastBusId] = useState<string | undefined>(undefined);
    const [hasCenteredOnUser, setHasCenteredOnUser] = useState(false);

    useEffect(() => {
        // Only auto-center if the selected bus changes
        if (selectedBusId && selectedBusId !== lastBusId) {
            map.flyTo([center.lat, center.lng], 16);
            setLastBusId(selectedBusId);
        }
    }, [center, selectedBusId, lastBusId, map]);

    useEffect(() => {
        // Auto-center on user location when it first becomes available
        if (userLocation && !hasCenteredOnUser) {
            map.flyTo([userLocation.lat, userLocation.lng], 16);
            setHasCenteredOnUser(true);
        }
    }, [userLocation, hasCenteredOnUser, map]);

    return null;
}

// Helper to create emoji icons with pulsing animation for active buses
const createBusIcon = (emoji: string, color: string, isActive: boolean = true, heading?: number) => {
    const rotation = heading !== undefined ? `transform: rotate(${heading}deg);` : '';
    const pulseClass = isActive ? 'bus-icon-pulse' : '';

    return L.divIcon({
        className: `custom-bus-icon cursor-pointer ${pulseClass}`,
        html: `<div style="
      background-color: ${color};
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      z-index: 1000;
      pointer-events: auto;
      ${rotation}
      transition: transform 0.3s ease-out;
    ">${emoji}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
    });
};

const createLocationIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-location-icon',
        html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      z-index: 900;
      pointer-events: auto;
    "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
};

// Component to handle map events
function MapEvents({
    onLocationSelect,
    role,
}: {
    onLocationSelect?: (loc: { lat: number; lng: number }) => void;
    role: string;
}) {
    useMapEvents({
        click(e) {
            if (onLocationSelect && role === 'passenger') {
                onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
            }
        },
    });
    return null;
}

// Touch friendly map controls
function MapControls({
    initialCenter,
    userLocation,
}: {
    initialCenter: { lat: number; lng: number };
    userLocation?: { lat: number; lng: number } | null;
}) {
    const map = useMap();
    const [locating, setLocating] = useState(false);

    const handleZoomIn = () => map.zoomIn();
    const handleZoomOut = () => map.zoomOut();
    const handleResetView = () => map.setView([initialCenter.lat, initialCenter.lng], 15);

    const handleLocateUser = () => {
        if (userLocation) {
            map.setView([userLocation.lat, userLocation.lng], 16);
            return;
        }
        if (!navigator.geolocation) return;

        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 16);
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
            <button
                type="button"
                onClick={handleZoomIn}
                className="rounded-full bg-white shadow-md w-12 h-12 flex items-center justify-center text-xl touch-manipulation"
                aria-label="Zoom in"
            >
                +
            </button>
            <button
                type="button"
                onClick={handleZoomOut}
                className="rounded-full bg-white shadow-md w-12 h-12 flex items-center justify-center text-xl touch-manipulation"
                aria-label="Zoom out"
            >
                −
            </button>
            <button
                type="button"
                onClick={handleResetView}
                className="rounded-full bg-white shadow-md w-12 h-12 flex items-center justify-center text-base touch-manipulation"
                aria-label="Reset view"
            >
                ⟳
            </button>
            <button
                type="button"
                onClick={handleLocateUser}
                className="rounded-full bg-blue-500 text-white shadow-md w-12 h-12 flex items-center justify-center text-base touch-manipulation disabled:opacity-60"
                aria-label="Locate me"
                disabled={locating}
            >
                {locating ? '…' : '◎'}
            </button>
        </div>
    );
}

// Error boundary
interface MapErrorBoundaryProps {
    children: ReactNode;
    onRetry?: () => void;
}

interface MapErrorBoundaryState {
    hasError: boolean;
    message?: string;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
    state: MapErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
        return { hasError: true, message: error.message };
    }

    componentDidCatch(error: Error, info: any) {
        // eslint-disable-next-line no-console
        console.error('Leaflet map error:', error, info);
    }

    handleRetry = () => {
        this.setState({ hasError: false, message: undefined });
        this.props.onRetry?.();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-50">
                    <div className="text-center px-4">
                        <p className="text-red-600 font-medium mb-2">Unable to load map.</p>
                        {this.state.message && (
                            <p className="text-xs text-gray-500 mb-3 break-all">{this.state.message}</p>
                        )}
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Component to handle smooth marker updates
function AnimatedBusMarker({
    bus,
    onBusSelect,
    busLocation,
    busETA
}: {
    bus: Bus;
    onBusSelect?: (bus: Bus) => void;
    busLocation?: { lat: number; lng: number; timestamp: string; heading?: number; speed?: number };
    busETA?: number | null;
}) {
    const markerRef = useRef<L.Marker>(null);
    const iconRef = useRef<L.DivIcon | null>(null);

    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        if (markerRef.current && busLocation) {
            const newLatLng = L.latLng(busLocation.lat, busLocation.lng);

            if (!isInitialized) {
                // First render - set position without animation
                markerRef.current.setLatLng(newLatLng);
                setIsInitialized(true);
            } else {
                // Subsequent updates - animate if position changed
                const currentLatLng = markerRef.current.getLatLng();
                const distance = currentLatLng.distanceTo(newLatLng);

                // Only animate if moved more than 1 meter
                if (distance > 1) {
                    // Manual smooth animation
                    const startLat = currentLatLng.lat;
                    const startLng = currentLatLng.lng;
                    const endLat = newLatLng.lat;
                    const endLng = newLatLng.lng;
                    const duration = 1000; // 1 second
                    const startTime = Date.now();

                    const animate = () => {
                        const elapsed = Date.now() - startTime;
                        const progress = Math.min(elapsed / duration, 1);

                        // Easing function (ease-out)
                        const easeOut = 1 - Math.pow(1 - progress, 3);

                        const currentLat = startLat + (endLat - startLat) * easeOut;
                        const currentLng = startLng + (endLng - startLng) * easeOut;

                        markerRef.current?.setLatLng([currentLat, currentLng]);

                        if (progress < 1) {
                            requestAnimationFrame(animate);
                        } else {
                            // Ensure final position is exact
                            markerRef.current?.setLatLng(newLatLng);
                        }
                    };

                    requestAnimationFrame(animate);
                } else {
                    // Small movement - just update directly
                    markerRef.current.setLatLng(newLatLng);
                }
            }

            // Update icon rotation if heading changed
            if (busLocation.heading !== undefined) {
                const newIcon = createBusIcon(
                    bus.emoji,
                    VEHICLE_TYPE_MAP[bus.vehicleType]?.color || '#2563eb',
                    bus.isActive,
                    busLocation.heading
                );
                if (markerRef.current) {
                    markerRef.current.setIcon(newIcon);
                }
                iconRef.current = newIcon;
            }
        }
    }, [busLocation, bus, isInitialized]);

    const icon = useMemo(() => {
        // Check if this bus has an active accident alert
        const hasAccident = bus.currentLocation && (bus as any).hasAccident;

        let color = bus.isActive ? (VEHICLE_TYPE_MAP[bus.vehicleType]?.color || '#2563eb') : '#64748b';

        // Override with red if accident detected
        if (hasAccident) {
            color = '#ef4444'; // Red for accident
        }

        const createdIcon = createBusIcon(
            bus.emoji,
            color,
            bus.isActive,
            busLocation?.heading
        );
        iconRef.current = createdIcon;
        return createdIcon;
    }, [bus.emoji, bus.vehicleType, bus.isActive, busLocation?.heading, (bus as any).hasAccident]);

    const position = busLocation
        ? [busLocation.lat, busLocation.lng] as [number, number]
        : (bus.currentLocation ? [bus.currentLocation.lat, bus.currentLocation.lng] as [number, number] : null);

    if (!position) return null;

    const getLastUpdateText = () => {
        if (!busLocation?.timestamp) return '';
        const updateTime = new Date(busLocation.timestamp).getTime();
        const secondsAgo = Math.floor((Date.now() - updateTime) / 1000);
        if (secondsAgo < 10) return `Updated ${secondsAgo}s ago`;
        if (secondsAgo < 60) return `Updated ${secondsAgo}s ago`;
        return `Updated ${Math.floor(secondsAgo / 60)}m ago`;
    };

    return (
        <Marker
            ref={markerRef}
            position={position}
            icon={icon}
            eventHandlers={{
                click: () => onBusSelect?.(bus),
            }}
            zIndexOffset={1000}
        >
            <Popup>
                <div className="p-2">
                    <h3 className="font-bold flex items-center gap-1.5">
                        {bus.busNumber}
                        {(bus as any).verificationBadge && (
                            <span title="Solana Verified Driver" className="flex items-center text-emerald-500 bg-emerald-500/10 rounded-full p-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
                            </span>
                        )}
                    </h3>
                    <p>{bus.driverName}</p>
                    <p className="text-sm text-gray-500">{bus.route}</p>
                    <div className="mt-2 text-xs">
                        Seats: {bus.availableSeats}/{bus.capacity}
                    </div>
                    {busLocation && (
                        <div className="mt-2 text-xs text-green-600">
                            🟢 Live
                        </div>
                    )}
                    {busLocation && getLastUpdateText() && (
                        <div className="text-xs text-gray-400">
                            {getLastUpdateText()}
                        </div>
                    )}
                    {busETA !== null && busETA !== undefined && (
                        <div className="mt-1 text-xs font-semibold text-blue-600">
                            {busETA === 0 ? 'Arriving now' : `ETA: ${busETA} min${busETA > 1 ? 's' : ''}`}
                        </div>
                    )}
                </div>
            </Popup>
        </Marker>
    );
}

function LeafletMapInner({
    role,
    buses,
    passengers = [],
    selectedBus,
    onBusSelect,
    onLocationSelect,
    pickupLocation,
    dropoffLocation,
    userLocation,
    busETAs = {},
    busLocations = {},
}: LeafletMapProps) {
    const [mounted, setMounted] = useState(false);
    const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);

    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const unsubscribe = subscribeToLiveUsers((users) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const visibleUsers = users.filter(
                    u => u.role !== role && u.isOnline && u.lat && u.lng
                );
                setLiveUsers(visibleUsers);
            }, 300);
        });

        return () => {
            unsubscribe();
            clearTimeout(timeout);
        };
    }, [role]);

    useEffect(() => {
        // Configure default marker icon with cleanup to avoid duplicated initialization across mounts
        const previousDefaultIcon = (L.Marker.prototype as any).options.icon;
        (L.Marker.prototype as any).options.icon = DefaultIcon;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);

        return () => {
            (L.Marker.prototype as any).options.icon = previousDefaultIcon;
        };
    }, []);

    if (!mounted) {
        return (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-100">
                <div className="animate-pulse w-11/12 max-w-xl h-64 rounded-lg bg-gray-200" />
            </div>
        );
    }

    // Calculate center: Priority = Selected Bus > User Location > Default
    let center = DEFAULT_LOCATION;
    if (selectedBus) {
        const liveLoc = busLocations[selectedBus.id];
        if (liveLoc) {
            center = liveLoc;
        } else if (selectedBus.currentLocation) {
            center = selectedBus.currentLocation;
        } else if (userLocation) {
            center = userLocation;
        }
    } else if (userLocation) {
        center = userLocation;
    }

    // Fallback center if everything else fails (Butwal area)
    if (!center || (center.lat === 0 && center.lng === 0)) {
        center = { lat: 27.700769, lng: 83.448558 };
    }

    return (
        <div className="relative w-full h-full min-h-[400px]">
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={15}
                className="w-full h-full"
                zoomControl={false}
            >
                <MapEvents onLocationSelect={onLocationSelect} role={role} />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapUpdater center={center} selectedBusId={selectedBus?.id} userLocation={userLocation} />
                <MapControls initialCenter={center} userLocation={userLocation} />

                {/* User Location */}
                {userLocation && (
                    <Marker
                        position={[userLocation.lat, userLocation.lng]}
                        icon={createLocationIcon('#3b82f6')}
                        zIndexOffset={1100}
                    >
                        <Popup>You are here</Popup>
                    </Marker>
                )}

                {/* Dynamic Real Users Rendered Here */}
                {liveUsers.map((user) => (
                    <LiveUserMarker key={`${user.uid}-${user.updatedAt}`} user={user} />
                ))}

                {/* Pickup/Dropoff Markers */}
                {pickupLocation && (
                    <>
                        {/* Proximity circles: 500m (green), 200m (yellow), 50m (red) */}
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={500}
                            pathOptions={{
                                color: '#22c55e',
                                fillColor: '#22c55e',
                                fillOpacity: 0.05,
                            }}
                        />
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={200}
                            pathOptions={{
                                color: '#eab308',
                                fillColor: '#eab308',
                                fillOpacity: 0.08,
                            }}
                        />
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={50}
                            pathOptions={{
                                color: '#ef4444',
                                fillColor: '#ef4444',
                                fillOpacity: 0.12,
                            }}
                        />
                        <Marker
                            position={[pickupLocation.lat, pickupLocation.lng]}
                            icon={createLocationIcon('#10b981')} // Green
                            zIndexOffset={950}
                        >
                            <Popup>Pickup Location</Popup>
                        </Marker>
                    </>
                )}

                {dropoffLocation && (
                    <Marker
                        position={[dropoffLocation.lat, dropoffLocation.lng]}
                        icon={createLocationIcon('#ef4444')} // Red
                        zIndexOffset={950}
                    >
                        <Popup>Dropoff Location</Popup>
                    </Marker>
                )}

                {/* Passengers (Driver View) */}
                {role === 'driver' && passengers.map(p => (
                    <React.Fragment key={p.id}>
                        <Marker
                            position={[p.pickupLocation.lat, p.pickupLocation.lng]}
                            icon={createLocationIcon('#f59e0b')} // Amber
                            zIndexOffset={900}
                        >
                            <Popup>
                                <div className="font-bold">{p.name}</div>
                                <div>Status: {p.status}</div>
                            </Popup>
                        </Marker>
                        {/* Line from Bus to Passenger */}
                        {selectedBus && (busLocations[selectedBus.id] || selectedBus.currentLocation) && (
                            <Polyline
                                positions={[
                                    [(busLocations[selectedBus.id] || selectedBus.currentLocation)!.lat, (busLocations[selectedBus.id] || selectedBus.currentLocation)!.lng],
                                    [p.pickupLocation.lat, p.pickupLocation.lng]
                                ]}
                                pathOptions={{ color: '#f59e0b', dashArray: '10, 10', weight: 3, opacity: 0.6 }}
                            />
                        )}
                    </React.Fragment>
                ))}

                {/* Route Line (Passenger View: User -> Bus) */}
                {role === 'passenger' && selectedBus && userLocation && (busLocations[selectedBus.id] || selectedBus.currentLocation) && (
                    <Polyline
                        positions={[
                            [userLocation.lat, userLocation.lng],
                            [(busLocations[selectedBus.id] || selectedBus.currentLocation)!.lat, (busLocations[selectedBus.id] || selectedBus.currentLocation)!.lng]
                        ]}
                        pathOptions={{ color: '#3b82f6', dashArray: '10, 10', weight: 4, opacity: 0.7 }}
                    />
                )}
            </MapContainer>
        </div>
    );
}

export default function LeafletMap(props: LeafletMapProps) {
    const [retryKey, setRetryKey] = useState(0);

    const handleRetry = () => {
        // Force remount of the inner map to avoid "container already initialized" from stale Leaflet instances
        setRetryKey(k => k + 1);
    };

    return (
        <MapErrorBoundary onRetry={handleRetry}>
            <LeafletMapInner key={retryKey} {...props} />
        </MapErrorBoundary>
    );
}

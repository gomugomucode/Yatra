'use client';

import React, { Component, ReactNode, useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polyline, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Passenger, LiveUser } from '@/lib/types';
import { DEFAULT_LOCATION } from '@/lib/constants';
import { subscribeToLiveUsers } from '@/lib/firebaseDb';
import LiveUserMarker from './LiveUserMarker';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { getRoute } from '@/lib/routing/osrm';

// Fix for default Leaflet marker icons in Next.js
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

interface LeafletMapProps {
    role: 'driver' | 'passenger' | 'admin';
    buses?: Bus[];
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

// Component to handle map center updates
function MapUpdater({ center, selectedUserId, userLocation }: { center: { lat: number; lng: number }, selectedUserId?: string, userLocation?: { lat: number; lng: number } | null }) {
    const map = useMap();
    const [lastUserId, setLastUserId] = useState<string | undefined>(undefined);
    const [hasCenteredOnUser, setHasCenteredOnUser] = useState(false);

    useEffect(() => {
        if (selectedUserId && selectedUserId !== lastUserId) {
            map.flyTo([center.lat, center.lng], 16);
            setLastUserId(selectedUserId);
        }
    }, [center, selectedUserId, lastUserId, map]);

    useEffect(() => {
        if (userLocation && !hasCenteredOnUser) {
            map.flyTo([userLocation.lat, userLocation.lng], 16);
            setHasCenteredOnUser(true);
        }
    }, [userLocation, hasCenteredOnUser, map]);

    return null;
}

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

function TrackingControls({ role, isTracking, onToggleTracking }: { role: string; isTracking: boolean; onToggleTracking: () => void }) {
    if (role === 'admin') return null;
    return (
        <div className="absolute top-4 left-4 z-[1000]">
            <button
                type="button"
                onClick={onToggleTracking}
                className={`px-5 py-3 rounded-full shadow-xl font-bold text-sm flex items-center gap-3 transition-all duration-300 hover:scale-105 active:scale-95 backdrop-blur-md border border-white/20 ${isTracking ? 'bg-emerald-500/90 text-white shadow-emerald-500/30' : 'bg-slate-800/90 text-white shadow-slate-900/20'}`}
            >
                <div className={`w-3 h-3 rounded-full shadow-inner ${isTracking ? 'bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-slate-400'}`}></div>
                {isTracking ? 'ONLINE - Tracking' : 'GO ONLINE'}
            </button>
        </div>
    )
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

function LeafletMapInner({
    role,
    onLocationSelect,
    pickupLocation,
    dropoffLocation,
    userLocation,
}: LeafletMapProps) {
    const [mounted, setMounted] = useState(false);
    const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
    const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);

    // Routing States
    const [selectedUser, setSelectedUser] = useState<LiveUser | null>(null);
    const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.LineString | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);

    const [uid] = useState(() =>
        role + "_" + Math.random().toString(36).substring(2, 9)
    );

    const currentUser = {
        uid,
        role,
        isOnline: true
    };

    // Call custom hook for pushing our own location to Firebase
    const { isTracking, toggleTracking, location: liveLocation } = useLiveLocation(
        uid,
        role === 'admin' ? undefined : role, // Admin won't broadcast
        false // Start offline
    );

    useEffect(() => {
        if (liveLocation) {
            setCurrentPosition([liveLocation.lat, liveLocation.lng]);
        }
    }, [liveLocation]);

    useEffect(() => {
        console.log("🗺 visibleUsers:", liveUsers);
    }, [liveUsers]);

    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const unsubscribe = subscribeToLiveUsers((users) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const visibleUsers = users.filter((u: any) => {
                    if (!u.lat || !u.lng) return false;
                    if (!u.isOnline) return false;

                    // Admin sees all
                    if (role === "admin") return true;

                    // Driver sees passenger
                    if (role === "driver" && u.role === "passenger") return true;

                    // Passenger sees driver
                    if (role === "passenger" && u.role === "driver") return true;

                    return false;
                });
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
        setMounted(true);
        console.log("👤 CURRENT SESSION:", currentUser);
        return () => {
            (L.Marker.prototype as any).options.icon = previousDefaultIcon;
        };
    }, []);

    // Fetch Route when selectedUser and currentPosition exist
    useEffect(() => {
        let isMounted = true;

        if (!selectedUser) {
            setRouteGeoJSON(null);
            setRouteInfo(null);
            return;
        }

        if (currentPosition && selectedUser) {
            getRoute(
                currentPosition[0],
                currentPosition[1],
                selectedUser.lat,
                selectedUser.lng
            ).then((res) => {
                if (isMounted && res) {
                    setRouteGeoJSON(res.geometry);
                    setRouteInfo({ distance: res.distance, duration: res.duration });
                }
            }).catch(err => {
                console.error("Failed to fetch route:", err);
            });
        }

        return () => {
            isMounted = false;
        };
    }, [selectedUser, currentPosition]);

    if (!mounted) {
        return (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-100">
                <div className="animate-pulse w-11/12 max-w-xl h-64 rounded-lg bg-gray-200" />
            </div>
        );
    }

    // Calculate center
    let center = DEFAULT_LOCATION;
    if (selectedUser) {
        center = { lat: selectedUser.lat, lng: selectedUser.lng };
    } else if (userLocation) {
        center = userLocation;
    } else if (currentPosition) {
        center = { lat: currentPosition[0], lng: currentPosition[1] };
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

                <MapUpdater center={center} selectedUserId={selectedUser?.uid} userLocation={userLocation} />
                <MapControls initialCenter={center} userLocation={userLocation} />

                {/* Live GPS Debug Widget (HUD) */}
                {currentPosition && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/60 backdrop-blur-md px-4 py-2 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 z-[1000] text-sm font-mono flex gap-4 items-center transition-all duration-300 hover:bg-white/80">
                        <div className="flex flex-col items-center">
                            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Lat</span>
                            <span className="font-semibold text-gray-800">{currentPosition[0].toFixed(4)}</span>
                        </div>
                        <div className="w-[1px] h-6 bg-gray-300/60"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Lng</span>
                            <span className="font-semibold text-gray-800">{currentPosition[1].toFixed(4)}</span>
                        </div>
                    </div>
                )}

                {/* Online/Offline Tracking Toggle UI */}
                <TrackingControls role={role} isTracking={isTracking} onToggleTracking={toggleTracking} />

                {/* Your Own Location Marker (from live GPS) */}
                {currentPosition && (
                    <Marker position={currentPosition} zIndexOffset={1200}>
                        <Popup>You (Current Location)</Popup>
                    </Marker>
                )}

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
                    <LiveUserMarker
                        key={`${user.uid}-${user.updatedAt}`}
                        user={user}
                        onClick={() => setSelectedUser(user)}
                        onPopupClose={() => setSelectedUser(null)}
                        routeInfo={selectedUser?.uid === user.uid ? routeInfo : null}
                    />
                ))}

                {/* Drawn Road Route */}
                {routeGeoJSON && (
                    <GeoJSON data={routeGeoJSON} style={{ color: "blue", weight: 5, opacity: 0.7 }} />
                )}

                {/* Route Line (Passenger View: User -> Bus) */}
                {role === 'passenger' && selectedUser && userLocation && (
                    <Polyline
                        positions={[
                            [userLocation.lat, userLocation.lng],
                            [selectedUser.lat, selectedUser.lng]
                        ]}
                        pathOptions={{ color: '#3b82f6', dashArray: '10, 10', weight: 4, opacity: 0.7 }}
                    />
                )}

                {/* Pickup/Dropoff Markers */}
                {pickupLocation && (
                    <>
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={500}
                            pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.05 }}
                        />
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={200}
                            pathOptions={{ color: '#eab308', fillColor: '#eab308', fillOpacity: 0.08 }}
                        />
                        <Circle
                            center={[pickupLocation.lat, pickupLocation.lng]}
                            radius={50}
                            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12 }}
                        />
                        <Marker
                            position={[pickupLocation.lat, pickupLocation.lng]}
                            icon={createLocationIcon('#10b981')}
                            zIndexOffset={950}
                        >
                            <Popup>Pickup Location</Popup>
                        </Marker>
                    </>
                )}

                {dropoffLocation && (
                    <Marker
                        position={[dropoffLocation.lat, dropoffLocation.lng]}
                        icon={createLocationIcon('#ef4444')}
                        zIndexOffset={950}
                    >
                        <Popup>Dropoff Location</Popup>
                    </Marker>
                )}

            </MapContainer>
        </div>
    );
}

export default function LeafletMap(props: LeafletMapProps) {
    const [retryKey, setRetryKey] = useState(0);

    const handleRetry = () => {
        setRetryKey(k => k + 1);
    };

    return (
        <MapErrorBoundary onRetry={handleRetry}>
            <LeafletMapInner key={retryKey} {...props} />
        </MapErrorBoundary>
    );
}

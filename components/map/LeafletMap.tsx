'use client';

import React, { Component, ReactNode, useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, GeoJSON, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Passenger, LiveUser } from '@/lib/types';
import { DEFAULT_LOCATION } from '@/lib/constants';
import { subscribeToBusLocation, subscribeToLiveUsers, subscribeToTrip, TripRequest } from '@/lib/firebaseDb';
import LiveUserMarker from './LiveUserMarker';
import { useLiveLocation } from '@/hooks/useLiveLocation';
import { getRoute } from '@/lib/routing/osrm';
// IMPORTANT: Import your Auth hook and Firestore functions
import { useAuth } from '@/lib/contexts/AuthContext';

// Fix for default Leaflet marker icons in Next.js
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

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
    requestStatus?: 'idle' | 'requesting' | 'accepted' | 'on-trip';
    hailedDriverId?: string | null;
    activeTripId?: string | null;
    passengerLocation?: { lat: number; lng: number } | null;
    activeRoute?: GeoJSON.LineString | null;
    routePhase?: 'pickup' | 'trip' | null;
    focusLocation?: { lat: number; lng: number } | null;
}

function FocusUpdater({ focusLocation }: { focusLocation?: { lat: number; lng: number } | null }) {
    const map = useMap();
    const prevKey = useRef<string | null>(null);
    useEffect(() => {
        if (!focusLocation) return;
        const key = `${focusLocation.lat.toFixed(4)},${focusLocation.lng.toFixed(4)}`;
        if (key === prevKey.current) return;
        prevKey.current = key;
        map.flyTo([focusLocation.lat, focusLocation.lng], 15, { duration: 1.2 });
    }, [focusLocation, map]);
    return null;
}

function MapUpdater({ center, selectedUserId, currentPosition }: { center: { lat: number; lng: number }, selectedUserId?: string, currentPosition?: [number, number] | null }) {
    const map = useMap();
    const lastUserIdRef = useRef<string | undefined>(undefined);
    const hasCenteredOnceRef = useRef(false);

    useEffect(() => {
        if (selectedUserId && selectedUserId !== lastUserIdRef.current) {
            map.flyTo([center.lat, center.lng], 16);
            lastUserIdRef.current = selectedUserId;
        }
    }, [center, selectedUserId, map]);

    useEffect(() => {
        if (!currentPosition) return;

        // Auto-center map to zoom level 14 once location is first acquired
        if (!hasCenteredOnceRef.current) {
            map.flyTo(currentPosition, 14);
            hasCenteredOnceRef.current = true;
        } else {
            // If GPS drifts drastically (e.g. initial fake location -> real location)
            const mapCenter = map.getCenter();
            const distance = map.distance(mapCenter, currentPosition);
            if (distance > 3000) { // 3km threshold
                map.flyTo(currentPosition, 14);
            }
        }
    }, [currentPosition, map]);

    return null;
}

const createLocationIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-location-icon',
        html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 900; pointer-events: auto;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
};

/** Animated ripple icon for the driver's own live GPS pin */
const createDriverRippleIcon = () => L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:48px;height:48px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(6,182,212,0.2);animation:gps-ripple 1.8s ease-out infinite;"></div>
        <div style="position:absolute;inset:8px;border-radius:50%;background:rgba(6,182,212,0.3);animation:gps-ripple 1.8s ease-out 0.5s infinite;"></div>
        <div style="position:absolute;inset:16px;border-radius:50%;background:#22d3ee;border:2.5px solid #fff;box-shadow:0 0 12px rgba(34,211,238,0.8);"></div>
      </div>
      <style>
        @keyframes gps-ripple{
          0%{transform:scale(0.6);opacity:0.9}
          100%{transform:scale(2.2);opacity:0}
        }
      </style>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
});

/** Smooth pulse effect for the passenger's current location to match the LIVE aesthetic */
const createUserPulseIcon = () => L.divIcon({
    className: 'custom-pulse-icon',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

function MapEvents({ onLocationSelect, role }: { onLocationSelect?: (loc: { lat: number; lng: number }) => void; role: string; }) {
    useMapEvents({
        click(e) {
            if (onLocationSelect && role === 'passenger') {
                onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
            }
        },
    });
    return null;
}

function MapControls({ initialCenter, userLocation }: { initialCenter: { lat: number; lng: number }; userLocation?: { lat: number; lng: number } | null; }) {
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
                map.flyTo([latitude, longitude], 14); // flyTo zooming to 14
                setLocating(false);
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const glassBtn = `w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white
        border border-white/10 transition-all active:scale-90 select-none`;
    return (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2.5">
            <button onClick={handleZoomIn} className={glassBtn} style={{ background: 'rgba(11,14,20,0.75)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)' }}>+</button>
            <button onClick={handleZoomOut} className={glassBtn} style={{ background: 'rgba(11,14,20,0.75)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)' }}>−</button>
            <button onClick={handleResetView} className={glassBtn} style={{ background: 'rgba(11,14,20,0.75)', backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)' }}>⟳</button>
            <button onClick={handleLocateUser} disabled={locating}
                className={`${glassBtn} disabled:opacity-50`}
                style={{ background: 'rgba(6,182,212,0.25)', backdropFilter: 'blur(10px)', boxShadow: '0 0 12px rgba(6,182,212,0.3),inset 0 1px 0 rgba(255,255,255,0.1)', border: '1px solid rgba(6,182,212,0.4)' }}>
                {locating ? '…' : '◎'}
            </button>
        </div>
    );
}

function TrackingControls({ role, isTracking, onToggleTracking, currentPosition }: { role: string; isTracking: boolean; onToggleTracking: () => void; currentPosition: [number, number] | null }) {
    if (role !== 'driver') return null;
    return (
        <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2">
            {/* GO ONLINE — glassmorphism pill */}
            <button
                type="button"
                onClick={onToggleTracking}
                className="h-11 px-5 rounded-2xl font-bold text-sm flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 select-none"
                style={{
                    background: isTracking ? 'rgba(16,185,129,0.25)' : 'rgba(11,14,20,0.70)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: isTracking ? '1px solid rgba(16,185,129,0.45)' : '1px solid rgba(255,255,255,0.10)',
                    boxShadow: isTracking
                        ? '0 0 16px rgba(16,185,129,0.30), inset 0 1px 0 rgba(255,255,255,0.08)'
                        : '0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
                    color: '#fff',
                }}
            >
                <span className={`w-2.5 h-2.5 rounded-full ${isTracking ? 'bg-emerald-400' : 'bg-slate-500'}`}
                    style={{
                        boxShadow: isTracking ? '0 0 8px #34d399' : 'none',
                        animation: isTracking ? 'pulse 1.5s ease-in-out infinite' : 'none'
                    }} />
                {isTracking ? 'ONLINE' : 'GO ONLINE'}
            </button>

            {/* LNG badge — glassmorphism */}
            {currentPosition && (
                <div
                    className="h-11 px-3 rounded-2xl font-mono text-xs flex items-center gap-2"
                    style={{
                        background: 'rgba(11,14,20,0.70)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        border: '1px solid rgba(6,182,212,0.25)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
                        color: '#fff',
                    }}
                >
                    <span style={{ color: '#67e8f9', fontSize: '9px', letterSpacing: '0.12em', fontWeight: 700 }}>LNG</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{currentPosition[1].toFixed(4)}</span>
                </div>
            )}
        </div>
    );
}

// Error boundary code...
class MapErrorBoundary extends Component<{ children: ReactNode, onRetry?: () => void }, { hasError: boolean, message?: string }> {
    state = { hasError: false, message: undefined as string | undefined };
    static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message }; }
    render() {
        if (this.state.hasError) return (
            <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-slate-900 text-center">
                <div><p className="text-red-400 font-medium text-sm">Unable to load map.</p><button onClick={() => { this.setState({ hasError: false }); this.props.onRetry?.(); }} className="mt-2 bg-slate-700 text-white px-4 py-1 rounded text-sm">Retry</button></div>
            </div>
        );
        return this.props.children;
    }
}

function LeafletMapInner({
    role,
    onLocationSelect,
    pickupLocation,
    userLocation,
    buses = [],
    onBusSelect,
    requestStatus,
    hailedDriverId,
    activeTripId,
    passengerLocation,
    activeRoute,
    routePhase,
    focusLocation,
}: LeafletMapProps) {
    const { currentUser } = useAuth(); // FIX: Access real UID
    const [locationFallbackReady, setLocationFallbackReady] = useState(false);
    const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
    // Routing States
    const [selectedUser, setSelectedUser] = useState<LiveUser | null>(null);
    const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.LineString | null>(null);
    const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
    const [handshakeDriverLocation, setHandshakeDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [handshakeTrip, setHandshakeTrip] = useState<TripRequest | null>(null);

    // FIX: STABLE ID from Auth UID
    const stableId = currentUser?.uid ?? `${role}_fallback`;
    const driverRoute = role === 'driver' ? (buses?.[0]?.route || 'Route 1') : undefined;

    // Call custom hook for pushing our own location to Firebase
    const { isTracking, toggleTracking, location: liveLocation } = useLiveLocation(
        stableId,
        role === 'driver' ? 'driver' : undefined,
        false,
        driverRoute,
        undefined,          // vehicleType - handled separately
        requestStatus       // Pass requestStatus so passengers can signal 'requesting'
    );
    const currentPosition = useMemo<[number, number] | null>(() => {
        if (liveLocation) return [liveLocation.lat, liveLocation.lng];
        if (userLocation) return [userLocation.lat, userLocation.lng];
        return null;
    }, [liveLocation, userLocation]);
    const isMapReady = !!currentPosition || locationFallbackReady;

    // Fallback: if GPS takes > 8s (denied / slow), load map at DEFAULT_LOCATION
    useEffect(() => {
        const timer = setTimeout(() => setLocationFallbackReady(true), 8000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const unsubscribe = subscribeToLiveUsers((users) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const visibleUsers = users.filter((u) => {
                    const user = u as LiveUser & { status?: string };
                    if (!Number.isFinite(user.lat) || !Number.isFinite(user.lng)) return false;
                    // Remove 'ghost' cars: require active online status AND location ping within last 30 seconds
                    if (!user.isOnline || user.status === 'offline') return false;

                    const now = Date.now();
                    const lastSeen = user.timestamp ? new Date(user.timestamp).getTime() : 0;
                    if (now - lastSeen > 30000) return false;

                    // Passenger map focuses to the hailed driver once handshake starts.
                    if (role === 'passenger' && user.role === 'driver') {
                        return hailedDriverId ? user.id === hailedDriverId : true;
                    }
                    return false;
                });
                setLiveUsers(visibleUsers);
            }, 300);
        });
        return () => { unsubscribe(); clearTimeout(timeout); };
    }, [role, stableId, hailedDriverId]);

    useEffect(() => {
        if (!hailedDriverId) {
            return;
        }

        const unsubscribe = subscribeToBusLocation(hailedDriverId, (location) => {
            if (!location) {
                setHandshakeDriverLocation(null);
                return;
            }
            setHandshakeDriverLocation({ lat: location.lat, lng: location.lng });
        });
        return () => {
            unsubscribe();
            setHandshakeDriverLocation(null);
        };
    }, [hailedDriverId]);

    useEffect(() => {
        if (!activeTripId) {
            return;
        }

        const unsubscribe = subscribeToTrip(activeTripId, (trip) => {
            setHandshakeTrip(trip);
        });
        return () => {
            unsubscribe();
            setHandshakeTrip(null);
        };
    }, [activeTripId]);
    useEffect(() => {
        let isMounted = true;

        const driverPoint = handshakeDriverLocation
            ? [handshakeDriverLocation.lat, handshakeDriverLocation.lng] as [number, number]
            : null;

        const passengerPoint = handshakeTrip
            ? [handshakeTrip.lat, handshakeTrip.lng] as [number, number]
            : null;

        const fallbackTarget = selectedUser
            ? [selectedUser.lat, selectedUser.lng] as [number, number]
            : null;

        const startPoint = driverPoint || currentPosition;
        const endPoint = passengerPoint || fallbackTarget;

        if (!startPoint || !endPoint) {
            queueMicrotask(() => {
                setRouteGeoJSON(null);
                setRouteInfo(null);
            });
            return;
        }

        getRoute(startPoint[0], startPoint[1], endPoint[0], endPoint[1])
            .then((res) => {
                if (!isMounted || !res) return;
                setRouteGeoJSON(res.geometry);
                setRouteInfo({ distance: res.distance, duration: res.duration });
            });

        return () => {
            isMounted = false;
        };
    }, [selectedUser, currentPosition, handshakeDriverLocation, handshakeTrip]);

    // Show GPS acquiring screen until we have a real location
    if (!isMapReady) {
        return (
            <div className="w-full h-full min-h-[300px] bg-slate-900 flex flex-col items-center justify-center gap-4">
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 bg-cyan-500/30 rounded-full animate-ping" />
                    <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl">
                        <span className="text-2xl">📍</span>
                    </div>
                </div>
                <p className="text-slate-300 font-semibold text-sm">Acquiring GPS...</p>
                <p className="text-slate-500 text-xs">Please allow location access</p>
            </div>
        );
    }

    let center = DEFAULT_LOCATION;
    if (selectedUser) center = { lat: selectedUser.lat, lng: selectedUser.lng };
    else if (userLocation) center = userLocation;
    else if (currentPosition) center = { lat: currentPosition[0], lng: currentPosition[1] };

    return (
        <div className="relative w-full h-full min-h-[400px]">
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={15}
                className="w-full h-full"
                zoomControl={false}
                preferCanvas={true}
                scrollWheelZoom={false}
                touchZoom={false}
            >
                <MapEvents onLocationSelect={onLocationSelect} role={role} />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapUpdater center={center} selectedUserId={selectedUser?.id} currentPosition={currentPosition} />
                {focusLocation && <FocusUpdater focusLocation={focusLocation} />}
                <MapControls initialCenter={center} userLocation={userLocation} />
                <TrackingControls role={role} isTracking={isTracking} onToggleTracking={toggleTracking} currentPosition={currentPosition} />

                {/* Driver/User live pin — ripple effect for driver, plain dot for passenger */}
                {currentPosition && role === 'driver' && (
                    <Marker position={currentPosition} icon={createDriverRippleIcon()} zIndexOffset={1200}>
                        <Popup><b>You (Live)</b><br />GPS Active</Popup>
                    </Marker>
                )}
                {currentPosition && role !== 'driver' && (
                    <Marker position={currentPosition} icon={createUserPulseIcon()} zIndexOffset={1200}>
                        <Popup><b>You (Live)</b></Popup>
                    </Marker>
                )}

                {liveUsers.map((user) => (
                    <LiveUserMarker
                        key={user.id}
                        user={user}
                        onClick={() => {
                            setSelectedUser(user);
                            if (role === 'passenger' && user.role === 'driver' && onBusSelect) {
                                const bus = buses.find((candidate) => candidate.id === user.id);
                                if (bus) onBusSelect(bus);
                            }
                        }}
                        onPopupClose={() => setSelectedUser(null)}
                        routeInfo={selectedUser?.id === user.id ? routeInfo : null}
                    />
                ))}

                {routeGeoJSON && (
                    <>
                        {/* Glow underlay */}
                        <GeoJSON
                            key={`route-glow-${JSON.stringify(routeGeoJSON.coordinates[0])}`}
                            data={routeGeoJSON}
                            style={{ color: '#ffffff', weight: 9, opacity: 0.18 }}
                        />
                        {/* Primary vivid line */}
                        <GeoJSON
                            key={`route-primary-${JSON.stringify(routeGeoJSON.coordinates[0])}`}
                            data={routeGeoJSON}
                            style={{ color: '#2563eb', weight: 5, opacity: 0.85, dashArray: undefined }}
                        />
                    </>
                )}

                {handshakeTrip && (
                    <>
                        <Circle center={[handshakeTrip.lat, handshakeTrip.lng]} radius={80} pathOptions={{ color: '#3b82f6' }} />
                        <Marker position={[handshakeTrip.lat, handshakeTrip.lng]} icon={createLocationIcon('#2563eb')}>
                            <Popup>Passenger Pickup Pin</Popup>
                        </Marker>
                    </>
                )}

                {pickupLocation && (
                    <>
                        <Circle center={[pickupLocation.lat, pickupLocation.lng]} radius={100} pathOptions={{ color: '#22c55e' }} />
                        <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={createLocationIcon('#10b981')}><Popup>Pickup</Popup></Marker>
                    </>
                )}

                {passengerLocation && (
                    <Marker
                        position={[passengerLocation.lat, passengerLocation.lng]}
                        icon={L.divIcon({
                            html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#10b981;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);color:white;font-size:13px;font-weight:bold;">P</div>`,
                            className: '',
                            iconSize: [32, 32],
                            iconAnchor: [16, 16],
                        })}
                    >
                        <Popup>Passenger</Popup>
                    </Marker>
                )}

                {activeRoute && (
                    <Polyline
                        positions={activeRoute.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])}
                        pathOptions={{
                            color: routePhase === 'trip' ? '#3b82f6' : '#22d3ee',
                            weight: 4,
                            opacity: 0.85,
                        }}
                    />
                )}
            </MapContainer>

            {routeInfo && !activeRoute && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] flex flex-col items-center px-5 py-2 rounded-2xl text-white text-xs font-semibold shadow-xl"
                    style={{ background: 'rgba(37,99,235,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(147,197,253,0.25)' }}>
                    <span className="text-sm font-bold">🕒 ETA {Math.max(1, Math.round(routeInfo.duration))} min</span>
                    <span className="opacity-75">{routeInfo.distance.toFixed(2)} km away</span>
                </div>
            )}
        </div>
    );
}

export default function LeafletMap(props: LeafletMapProps) {
    const [retryKey, setRetryKey] = useState(0);
    return (
        <MapErrorBoundary onRetry={() => setRetryKey(k => k + 1)}>
            <LeafletMapInner key={retryKey} {...props} />
        </MapErrorBoundary>
    );
}

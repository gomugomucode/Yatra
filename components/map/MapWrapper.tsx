'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Dynamically import LeafletMap to avoid SSR issues
const LeafletMap = dynamic(() => import('./LeafletMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading map...</p>
            </div>
        </div>
    ),
});

interface MapWrapperProps {
    role: 'driver' | 'passenger' | 'admin';
    buses: any[];
    passengers?: any[];
    selectedBus?: any;
    onBusSelect?: (bus: any) => void;
    onLocationSelect?: (location: { lat: number; lng: number }) => void;
    showRoute?: boolean;
    pickupLocation?: { lat: number; lng: number; address?: string } | null;
    dropoffLocation?: { lat: number; lng: number; address?: string } | null;
    userLocation?: { lat: number; lng: number } | null;
    pickupProximityLevel?: 'far' | 'approaching' | 'nearby' | 'arrived' | null;
    busETAs?: Record<string, number | null>;
    busLocations?: Record<string, { lat: number; lng: number; timestamp: string; heading?: number; speed?: number }>;
    requestStatus?: 'idle' | 'requesting' | 'on-trip';
    hailedDriverId?: string | null;
    activeTripId?: string | null;
}

export default function MapWrapper(props: MapWrapperProps) {
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    const handleRetry = () => {
        setLoadError(null);
        setRetryKey((k) => k + 1);
    };

    if (loadError) {
        return (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-gray-50">
                <div className="text-center px-4">
                    <p className="text-red-600 font-medium mb-2">Unable to initialize the map.</p>
                    <p className="text-xs text-gray-500 mb-3 break-all">{loadError}</p>
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[400px]">
            {/* Note: runtime errors inside LeafletMap are handled by its internal error boundary */}
            <LeafletMap
                key={retryKey}
                {...props}
            />
        </div>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { haversineDistance } from '@/lib/utils/geofencing';
import { TripStatus } from '@/lib/types';

interface TripRequestPanelProps {
  request: {
    id: string;
    passengerName: string;
    status: string;
    pickupLocation?: { lat: number; lng: number; address?: string };
    lat?: number;
    lng?: number;
  };
  driverLocation: { lat: number; lng: number } | null;
  tripStatus: TripStatus;
  onAccept: () => void;
  onReject: () => void;
  onPassengerBoarded: () => void;
  onCompleteTrip: () => void;
}

const COUNTDOWN_SECONDS = 90;

export default function TripRequestPanel({
  request,
  driverLocation,
  tripStatus,
  onAccept,
  onReject,
  onPassengerBoarded,
  onCompleteTrip,
}: TripRequestPanelProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const onRejectRef = useRef(onReject);
  onRejectRef.current = onReject;

  const pickupLat = request.pickupLocation?.lat ?? request.lat;
  const pickupLng = request.pickupLocation?.lng ?? request.lng;

  const distanceText = (() => {
    if (!driverLocation || pickupLat == null || pickupLng == null) return '—';
    const m = haversineDistance(driverLocation.lat, driverLocation.lng, pickupLat, pickupLng);
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  })();

  // Countdown timer — only active during 'requested' state
  useEffect(() => {
    if (tripStatus !== 'requested') return;
    setCountdown(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onRejectRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [tripStatus, request.id]);

  return (
    <AnimatePresence>
      <motion.div
        key="trip-request-panel"
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-[1300] bg-slate-900 border-t border-slate-700/60 shadow-2xl px-4 pt-4 pb-24"
      >
        {tripStatus === 'requested' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-lg">{request.passengerName}</p>
                <div className="flex items-center gap-2 text-slate-400 text-sm mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{distanceText} to pickup</span>
                </div>
              </div>
              <div
                role="timer"
                aria-live="off"
                aria-label={`${countdown} seconds to respond`}
                className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span className="text-amber-300 font-mono font-bold text-sm">{countdown}s</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 h-12 border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl"
                onClick={onReject}
              >
                <X className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30"
                onClick={onAccept}
              >
                <Check className="w-4 h-4 mr-2" />
                Accept
              </Button>
            </div>
          </div>
        )}

        {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-emerald-300 text-sm font-medium">
                Trip accepted — navigate to pickup
              </p>
            </div>
            <Button
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30"
              onClick={onPassengerBoarded}
            >
              Passenger Boarded →
            </Button>
          </div>
        )}

        {tripStatus === 'active' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <p className="text-blue-300 text-sm font-medium">Trip underway</p>
            </div>
            <Button
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30"
              onClick={onCompleteTrip}
            >
              Complete Trip ✓
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

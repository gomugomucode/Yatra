'use client';

import { useState, useEffect, useRef } from 'react';
import DriverPanel from '@/components/driver/DriverPanel';
import { DriverProfileDrawer } from '@/components/driver/DriverProfileDrawer';
import PassengerList from '@/components/driver/PassengerList';
import { Button } from '@/components/ui/button';
import { Bus, Passenger, Driver, checkProfileCompletion } from '@/lib/types';
import MapWrapper from '@/components/map/MapWrapper';
import {
  Navigation,
  Users,
  MapPin,
  Bus as BusIcon,
  LayoutDashboard,
  Route,
  CircleDollarSign,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import {
  subscribeToBuses,
  subscribeToBookings,
  subscribeToTripRequests,
  updateBusLocation,
  updateLocationSharingStatus,
  attachDriverPresence,
  setDriverOffline,
  registerPushToken,
  createAlert,
  updateTripStatus,
  autoCompleteTripByGPS,
  subscribeTripLocation,
  submitTripRating,
} from '@/lib/firebaseDb';
import { haversineDistance } from '@/lib/utils/geofencing';
import TripRatingModal from '@/components/shared/TripRatingModal';
import TripRequestPanel from '@/components/driver/TripRequestPanel';
import { TripStatus } from '@/lib/types';
import { addOfflinePassenger, removeOfflinePassenger } from '@/lib/seatManagement';
import { useToast } from '@/components/ui/use-toast';
import { updateDriverReputation, getDriverReputation } from '@/lib/solana/trrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { AlertTriangle, Car, Wrench } from 'lucide-react';
import { useAccidentDetection } from '@/hooks/useAccidentDetection';
import AccidentAlert from '@/components/driver/AccidentAlert';
import { getPushTokenFromBrowser } from '@/lib/push';
import { useProximityHandshake } from '@/hooks/useProximityHandshake';

interface BrowserAudioContextWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface DriverBookingLookup {
  id?: string;
  passengerId?: string;
  paymentMethod?: 'cash' | 'digital';
  escrowStatus?: 'locked' | 'released' | 'reclaimed';
  fare?: number;
  route?: string;
}

export default function DriverDashboard() {
  const router = useRouter();
  const { currentUser, role, loading, userData } = useAuth();
  const { toast } = useToast();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasGeolocationError, setHasGeolocationError] = useState(false);
  const [notificationPermissionRequested, setNotificationPermissionRequested] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [activeTripRequest, setActiveTripRequest] = useState<{ id: string; lat: number; lng: number; status: string; passengerId?: string; passengerName: string; pickupLocation?: { lat: number; lng: number; address?: string }; bookingId?: string } | null>(null);
  const [passengerLocation, setPassengerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverActiveRoute, setDriverActiveRoute] = useState<GeoJSON.LineString | null>(null);
  const driverLastEtaFetchRef = useRef<{ lat: number; lng: number } | null>(null);
  const [showPassengerReachedAlert, setShowPassengerReachedAlert] = useState(false);
  const [driverEta, setDriverEta] = useState<number | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trips' | 'earnings' | 'profile'>('dashboard');
  const [ratingTripId, setRatingTripId] = useState<string | null>(null);
  const [ratingPassengerName, setRatingPassengerName] = useState<string>('');
  const driverProfile = userData && userData.role === 'driver' ? userData as Driver : null;
  const driverWalletAddress =
    typeof driverProfile?.solanaWallet === 'string' ? driverProfile.solanaWallet.trim() : '';
  const lastKnownLocationRef = useRef<{ lat: number; lng: number; heading?: number; speed?: number } | null>(null);
  const lastFlushRef = useRef<number>(0);
  const lastTripRequestSeenRef = useRef<string | null>(null);
  const proximityAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedPassengerReachedRef = useRef(false);
  // Automated Accident Detection
  const { isAccidentDetected, resetDetection, triggerManualTest } = useAccidentDetection({
    currentLocation: userLocation ? { ...userLocation, timestamp: new Date() } : null,
    speed: currentSpeed,
    heading: undefined, // We could pass heading if available
    isTracking: isOnline && locationEnabled
  });

  const handleAccidentConfirm = async () => {
    resetDetection();
    await handleReportEmergency('accident');
  };

  const handleAccidentCancel = () => {
    resetDetection();
    toast({
      title: 'Alert Cancelled',
      description: 'Accident alert was cancelled.',
    });
  };

  // ── Centralised proximity handshake (driver side) ──
  const {
    arrived: passengerReached,
    resetArrived: resetPassengerReached,
  } = useProximityHandshake({
    // Driver watches their own GPS against the active trip's pickup pin.
    // We pass null as driverId to disable the Firebase subscription —
    // the driver's position is already tracked locally via geolocation.
    // Instead we compute from userLocation vs activeTripRequest directly.
    driverId: null, // driver has local GPS, no need to subscribe
    pickupLat: activeTripRequest?.lat ?? null,
    pickupLng: activeTripRequest?.lng ?? null,
    enabled: false, // local override below handles it
  });


  useEffect(() => {
    if (passengerReached) {
      setShowPassengerReachedAlert(true);
    }
  }, [passengerReached]);

  useEffect(() => {
    resetPassengerReached();
  }, [activeTripRequest?.id, resetPassengerReached]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default' && !notificationPermissionRequested) {
      Notification.requestPermission().finally(() => {
        setNotificationPermissionRequested(true);
      });
    }
  }, [notificationPermissionRequested]);

  // Register web-push token for background/browser notifications.
  useEffect(() => {
    if (!currentUser?.uid) return;

    const run = async () => {
      try {
        // Robust guards for push token registration
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (Notification.permission !== 'granted') return;

        const token = await getPushTokenFromBrowser();
        if (!token) return;
        await registerPushToken(currentUser.uid, token);
      } catch (error: any) {
        // Silent failure for non-critical push registration
        if (error?.name !== 'AbortError') {
          console.debug('[Driver] Push token registration skipped:', error?.message || error);
        }
      }
    };

    run();
  }, [currentUser?.uid]);

  // Subscribe to buses from Realtime Database
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    unsubscribe = subscribeToBuses((busesData) => {
      setBuses(busesData);

      // Try to find the driver's specific bus
      const driverBus =
        busesData.find((b) => b.id === currentUser?.uid) ||
        (driverProfile?.vehicleNumber
          ? busesData.find((b) => b.busNumber === driverProfile.vehicleNumber)
          : undefined);

      // Only update selectedBus if we found the driver's bus
      // This prevents showing "Rajesh Thapa" (demo data) to a new driver
      if (driverBus) {
        setSelectedBus(driverBus);
        // Sync online status with bus isActive
        setIsOnline(driverBus.isActive || false);
        setLocationEnabled(driverBus.isActive || false);
      } else if (!selectedBus && busesData.length > 0) {
        // If no bus selected yet and we can't find the driver's bus,
        // we might be in a state where the bus isn't created yet.
        // Do NOT default to busesData[0] for drivers.
        // Just leave selectedBus as null.
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedBus, currentUser, driverProfile]);

  // Subscribe to real passengers (bookings) for the selected bus
  useEffect(() => {
    if (!selectedBus) return;

    let previousBookingCount = 0;

    const unsubscribe = subscribeToBookings(selectedBus.id, 'driver', (bookings) => {
      const mapped: Passenger[] = bookings.map((b) => ({
        id: b.id,
        name: b.passengerName,
        pickupLocation: b.pickupLocation,
        dropoffLocation: b.dropoffLocation,
        status: 'waiting',
        bookingTime: b.timestamp,
      }));

      // Notify driver when new booking arrives
      if (bookings.length > previousBookingCount && previousBookingCount > 0) {
        const newBookings = bookings.slice(previousBookingCount);
        newBookings.forEach((booking) => {
          // Play notification sound using Web Audio API
          try {
            const AudioContextClass = window.AudioContext || (window as BrowserAudioContextWindow).webkitAudioContext;
            if (!AudioContextClass) {
              throw new Error('AudioContext unavailable');
            }
            const audioContext = new AudioContextClass();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
          } catch {
            // Fallback: use browser beep
            console.warn('[Driver] Web Audio API unavailable for notification sound');
          }

          // Show toast notification
          toast({
            title: 'New Booking! 🎉',
            description: `${booking.passengerName} wants to ride. Check passenger list below.`,
            duration: 5000,
          });

          // Vibrate if supported
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }

          // Request browser notification permission and show notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Booking!', {
              body: `${booking.passengerName} wants to ride`,
              icon: '/favicon.ico',
              tag: `booking-${booking.id}`,
            });
          }
        });
      }

      previousBookingCount = bookings.length;
      setPassengers(mapped);
    });

    return () => unsubscribe();
  }, [selectedBus, toast]);

  // Real-time passenger-driver handshake notifications from `trips/{tripId}`.
  useEffect(() => {
    if (!selectedBus) return;
    lastTripRequestSeenRef.current = null;
    hasPlayedPassengerReachedRef.current = false;
    setShowPassengerReachedAlert(false);

    const unsubscribe = subscribeToTripRequests(selectedBus.id, (requests) => {
      if (requests.length === 0) {
        setActiveTripRequest(null);
        return;
      }

      const newest = requests.find((request) =>
        ['requested', 'accepted', 'arrived', 'active', 'pending'].includes(request.status)
      );
      if (!newest) {
        setActiveTripRequest(null);
        return;
      }

      setActiveTripRequest({
        id: newest.id,
        lat: newest.lat,
        lng: newest.lng,
        status: newest.status,
        passengerId: newest.passengerId,
        passengerName: newest.passengerName || 'Passenger',
        pickupLocation: newest.pickupLocation,
        bookingId: newest.bookingId,
      });

      if (!lastTripRequestSeenRef.current) {
        lastTripRequestSeenRef.current = newest.id;
        return;
      }
      if (newest.id === lastTripRequestSeenRef.current) return;
      lastTripRequestSeenRef.current = newest.id;

      toast({
        title: 'New Trip Request',
        description: `${newest.passengerName} requested pickup from the map.`,
        duration: 6000,
      });

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Trip Request', {
          body: `${newest.passengerName} requested your bus.`,
          icon: '/icons/pwa-192.svg',
          tag: `trip-request-${newest.id}`,
        });
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) =>
            registration.showNotification('New Trip Request', {
              body: `${newest.passengerName} requested your bus.`,
              icon: '/icons/pwa-192.svg',
              badge: '/icons/pwa-192.svg',
              tag: `trip-request-${newest.id}`,
              data: { url: '/driver' },
              requireInteraction: true,
            })
          )
          .catch(() => undefined);
      }
    });

    return () => unsubscribe();
  }, [selectedBus, toast]);

  // Proximity alarm: driver approaches passenger pickup pin
  useEffect(() => {
    if (!userLocation || !activeTripRequest) return;

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(activeTripRequest.lat - userLocation.lat);
    const dLng = toRadians(activeTripRequest.lng - userLocation.lng);
    const lat1 = toRadians(userLocation.lat);
    const lat2 = toRadians(activeTripRequest.lat);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = 6371000 * c;

    if (distanceMeters <= 10 && !hasPlayedPassengerReachedRef.current) {
      hasPlayedPassengerReachedRef.current = true;
      setShowPassengerReachedAlert(true);

      const audio = new Audio('/alert.mp3');
      audio.volume = 1;
      proximityAudioRef.current = audio;
      audio.play().catch(() => undefined);
    }
  }, [userLocation, activeTripRequest]);
  // Subscribe to passenger location during active trip
  useEffect(() => {
    if (!activeTripRequest?.id || !['accepted', 'arrived', 'active'].includes(activeTripRequest.status)) {
      setPassengerLocation(null);
      return;
    }
    const unsubscribe = subscribeTripLocation(activeTripRequest.id, 'passenger', (loc) => setPassengerLocation(loc));
    return unsubscribe;
  }, [activeTripRequest?.id, activeTripRequest?.status]);

  // Fetch OSRM route from driver → pickup (accepted/arrived) or driver → passenger (active)
  useEffect(() => {
    const status = activeTripRequest?.status;
    if (!activeTripRequest || !userLocation || !['accepted', 'arrived', 'active'].includes(status ?? '')) {
      setDriverActiveRoute(null);
      setDriverEta(null);
      driverLastEtaFetchRef.current = null;
      return;
    }

    const last = driverLastEtaFetchRef.current;
    if (
      last &&
      Math.abs(last.lat - userLocation.lat) < 0.0001 &&
      Math.abs(last.lng - userLocation.lng) < 0.0001
    ) return;

    driverLastEtaFetchRef.current = { lat: userLocation.lat, lng: userLocation.lng };

    const target = status === 'active'
      ? (passengerLocation ?? activeTripRequest.pickupLocation)
      : activeTripRequest.pickupLocation;

    if (!target) return;

    const fetchRoute = async () => {
      try {
        const { getRoute } = await import('@/lib/routing/osrm');
        const result = await getRoute(userLocation.lat, userLocation.lng, target.lat, target.lng);
        if (result?.geometry) setDriverActiveRoute(result.geometry as GeoJSON.LineString);
        if (result?.duration != null) setDriverEta(Math.ceil(result.duration));
      } catch {
        // non-fatal
      }
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, 30_000);
    return () => clearInterval(interval);
  }, [activeTripRequest, userLocation, passengerLocation]);

  const handleAcceptTrip = async () => {
    if (!activeTripRequest) return;
    try {
      await updateTripStatus(activeTripRequest.id, 'accepted');
      setActiveTripRequest((prev) => prev ? { ...prev, status: 'accepted' } : null);
      toast({ title: 'Trip accepted', description: 'Navigate to pickup point.' });
    } catch {
      toast({ title: 'Failed to accept trip', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleRejectTrip = async () => {
    if (!activeTripRequest) return;
    try {
      await updateTripStatus(activeTripRequest.id, 'rejected');
      setActiveTripRequest(null);
      toast({ title: 'Trip rejected' });
    } catch {
      toast({ title: 'Failed to reject trip', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleExpireTrip = async () => {
    if (!activeTripRequest) return;
    try {
      await updateTripStatus(activeTripRequest.id, 'expired');
      setActiveTripRequest(null);
      toast({ title: 'Trip request expired' });
    } catch {
      toast({ title: 'Failed to expire trip', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handlePassengerBoarded = async () => {
    if (!activeTripRequest) return;
    try {
      await updateTripStatus(activeTripRequest.id, 'active');
      setActiveTripRequest((prev) => prev ? { ...prev, status: 'active' } : null);
      toast({ title: 'Trip started', description: 'Navigate to destination.' });
    } catch {
      toast({ title: 'Failed to start trip', description: 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeTripRequest || !userLocation) return;
    
    // Use lastKnownLocationRef for higher precision/stability if available
    const driverPos = lastKnownLocationRef.current || userLocation;

    // Enforce README GPS Constraint (200m)
    const distance = haversineDistance(
      driverPos.lat, driverPos.lng,
      activeTripRequest.lat, activeTripRequest.lng
    );

    if (distance > 200) {
      toast({
        title: 'Drop-off too far',
        description: `You must be within 200m of the destination to complete the trip. (Current distance: ${Math.round(distance)}m)`,
        variant: 'destructive',
      });
      return;
    }

    try {
      // 1. Use the new autoCompleteTripByGPS utility for status transition and cleanup
      await autoCompleteTripByGPS(activeTripRequest.id);
      
      const tripRecordId = activeTripRequest.bookingId ?? activeTripRequest.passengerId;
      if (tripRecordId) {
        await handlePassengerDropoff(tripRecordId);
      }

      // 2. Escrow Release (if digital)
      if (activeTripRequest.bookingId) {
        // Fetch trip data to check payment method & escrow status
        const { getDatabase, ref, get } = await import('firebase/database');
        const { getFirebaseApp } = await import('@/lib/firebase');
        const db = getDatabase(getFirebaseApp());
        const tripSnap = await get(ref(db, `trips/${activeTripRequest.id}`));
        const tripData = tripSnap.val();

        if (tripData?.escrowStatus === 'locked') {
          toast({ title: 'Releasing funds...', description: 'Verifying completion on-chain.' });
          try {
            const res = await fetch('/api/solana/escrow/release', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId: activeTripRequest.id })
            });
            const data = await res.json();
            if (data.success) {
              toast({ title: 'Payment Released', description: 'Funds transferred to your wallet.' });
            } else {
              throw new Error(data.error || 'Fund release failed');
            }
          } catch (err: any) {
            console.error('[Escrow] Release call failed:', err);
            toast({ 
              title: 'Escrow Release Error', 
              description: 'Funds are locked. Please contact support if not received.', 
              variant: 'destructive' 
            });
          }
        }
      }

      // 3. Update TRRL Reputation (only after successful completion)
      if (currentUser && driverWalletAddress) {
        const currentRep = await getDriverReputation(currentUser.uid);
        await updateDriverReputation(currentUser.uid, driverWalletAddress, {
          totalTrips: (currentRep?.totalTrips || 0) + 1,
          completedTrips: (currentRep?.completedTrips || 0) + 1,
          zkVerified: !!driverProfile?.verificationBadge?.ageVerified,
        });
      }

      setRatingTripId(activeTripRequest.id);
      setRatingPassengerName(activeTripRequest.passengerName);
      setActiveTripRequest(null);
      setShowRatingModal(true);
      toast({ title: 'Trip completed' });
    } catch (error: any) {
      console.error('[Driver] Complete trip failed:', error);
      toast({ title: 'Failed to complete trip', description: error?.message || 'Check your connection and try again.', variant: 'destructive' });
    }
  };

  // Driver foreground tracking with strict 5s heartbeat flush.
  useEffect(() => {
    if (!locationEnabled || !selectedBus?.id || !isOnline || !driverWalletAddress) return;

    if (!navigator.geolocation) {
      if (!hasGeolocationError) {
        toast({
          title: 'Location unavailable',
          description: 'Geolocation is not supported by this browser.',
          variant: 'destructive',
        });
        setHasGeolocationError(true);
      }
      return;
    }

    const busId = selectedBus.id;

    const flushLocation = async () => {
      const payload = lastKnownLocationRef.current;
      if (!payload) return;
      try {
        await updateBusLocation(busId, driverWalletAddress, payload);
        lastFlushRef.current = Date.now();
      } catch (error) {
        console.error('[DRIVER] Failed to flush location:', error);
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          ...(position.coords.heading !== null && !Number.isNaN(position.coords.heading)
            ? { heading: position.coords.heading }
            : {}),
          ...(position.coords.speed !== null && !Number.isNaN(position.coords.speed)
            ? { speed: Math.max(0, Math.round(position.coords.speed * 3.6)) }
            : {}),
        };

        lastKnownLocationRef.current = next;
        setUserLocation({ lat: next.lat, lng: next.lng });
        setCurrentSpeed(next.speed ?? 0);

        if (Date.now() - lastFlushRef.current >= 5000) {
          flushLocation().catch(() => undefined);
        }
      },
      (error: GeolocationPositionError) => {
        if (!hasGeolocationError) {
          const message =
            error.code === 1
              ? 'Location permission was denied. Turn it on in browser settings.'
              : error.code === 2
                ? 'Location unavailable. Enable high-accuracy GPS.'
                : 'Unable to access your location.';
          toast({ title: 'Location error', description: message, variant: 'destructive' });
          setHasGeolocationError(true);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    const heartbeatId = window.setInterval(() => {
      flushLocation().catch(() => undefined);
    }, 5000);

    const handleVisibility = () => {
      flushLocation().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleVisibility);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleVisibility);
    };
  }, [locationEnabled, selectedBus?.id, isOnline, toast, hasGeolocationError, driverWalletAddress]);

  // RTDB presence hooks: offline state is written immediately on disconnect.
  useEffect(() => {
    if (!locationEnabled || !selectedBus?.id || !isOnline || !driverWalletAddress) return;

    const cleanup = attachDriverPresence(selectedBus.id, driverWalletAddress);
    return () => {
      cleanup().catch((error) => {
        console.warn('[Presence] cleanup failed:', error);
      });
    };
  }, [locationEnabled, selectedBus?.id, isOnline, driverWalletAddress]);

  // Keep screen awake while tracking to maximize background reliability in installed mode.
  useEffect(() => {
    if (!locationEnabled || !isOnline) return;
    if (!('wakeLock' in navigator)) return;

    let wakeLock: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        // Not fatal; browser may block wake lock while hidden/low battery.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLock) {
        acquire().catch(() => undefined);
      }
    };

    acquire().catch(() => undefined);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLock) wakeLock.release().catch(() => undefined);
    };
  }, [locationEnabled, isOnline]);

  const handleLocationToggle = async (enabled: boolean) => {
    if (enabled && !driverWalletAddress) {
      toast({
        title: 'Wallet required',
        description: 'Link and verify your Solana wallet before going online.',
        variant: 'destructive',
      });
      return;
    }

    if (!enabled && selectedBus) {
      // Check for active passengers (online or offline)
      const hasActivePassengers = passengers.some(p => p.status === 'waiting' || p.status === 'picked');
      const hasOfflinePassengers = (selectedBus.offlineOccupiedSeats || 0) > 0;

      if (hasActivePassengers || hasOfflinePassengers) {
        const confirmed = window.confirm(
          `You have ${passengers.filter(p => p.status !== 'dropped').length} online and ${selectedBus.offlineOccupiedSeats || 0} offline passengers active.\n\nGoing offline will stop tracking. Are you sure?`
        );
        if (!confirmed) return;
      }
    }

    setLocationEnabled(enabled);
    setIsOnline(enabled);

    // Force geolocation permission prompt immediately
    if (enabled && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => { },
        () => { },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    if (selectedBus) {
      setSelectedBus({
        ...selectedBus,
        isActive: enabled,
      });

      // Update Firebase with location sharing status
      try {
        await updateLocationSharingStatus(selectedBus.id, enabled, driverWalletAddress);
        if (!enabled) {
          await setDriverOffline(selectedBus.id, driverWalletAddress);
        }

        toast({
          title: enabled ? 'You are now online' : 'You are now offline',
          description: enabled
            ? 'Your location is being shared with passengers'
            : 'Your location sharing has been stopped',
        });
      } catch (error) {
        console.error('[Driver] Failed to update location sharing status:', error);
        toast({
          title: 'Update failed',
          description: 'Failed to update location sharing status. Please try again.',
          variant: 'destructive',
        });
        // Revert state on error
        setLocationEnabled(!enabled);
        setIsOnline(!enabled);
      }
    }
  };

  const handleAddOfflinePassenger = async () => {
    if (!selectedBus) return;
    try {
      await addOfflinePassenger(selectedBus.id);
    } catch (error) {
      console.error('Error adding offline passenger:', error);
      toast({
        title: 'Failed to add offline passenger',
        description:
          error instanceof Error ? error.message : 'Please try again or check your connection.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveOfflinePassenger = async () => {
    if (!selectedBus) return;
    try {
      await removeOfflinePassenger(selectedBus.id);
    } catch (error) {
      console.error('Error removing offline passenger:', error);
    }
  };

  const handlePassengerPickup = (passengerId: string) => {
    setPassengers(prev =>
      prev.map(passenger =>
        passenger.id === passengerId
          ? { ...passenger, status: 'picked' }
          : passenger
      )
    );
  };

  const handlePassengerDropoff = async (passengerId: string) => {
    // 1. Update UI state immediately (optimistic update)
    setPassengers(prev =>
      prev.map(passenger =>
        passenger.id === passengerId
          ? { ...passenger, status: 'dropped' }
          : passenger
      )
    );

    // 2. Fetch Passenger Data & Trigger Minting
    try {
      if (!selectedBus || !userData) return;

      toast({
        title: 'Minting Receipt...',
        description: 'Generating Soulbound Trip Ticket for passenger.',
      });

      const { getDatabase, ref, get } = await import('firebase/database');
      const { getFirebaseApp } = await import('@/lib/firebase');
      const db = getDatabase(getFirebaseApp());

      // The `passengerId` argument here is the booking ID coming from PassengerList.
      const bookingId = passengerId;
      const bookingSnap = await get(ref(db, `bookings/${bookingId}`));
      if (!bookingSnap.exists()) {
        toast({
          title: 'Receipt skipped',
          description: 'Booking record missing. Unable to mint receipt.',
          variant: 'destructive',
        });
        return;
      }

      const bookingData = bookingSnap.val() as DriverBookingLookup;
      const truePassengerId = bookingData.passengerId ?? null;
      const actualFare = bookingData.fare || 75;
      const bookingRoute = bookingData.route || selectedBus.route || 'Local Trip';

      if (!truePassengerId) {
        toast({
          title: 'Receipt skipped',
          description: 'Passenger record missing from booking.',
          variant: 'destructive',
        });
        return;
      }

      // Firebase lookup for passenger's Solana wallet
      const passengerRef = ref(db, `users/${truePassengerId}`);
      const passengerSnap = await get(passengerRef);

      if (!passengerSnap.exists()) {
        toast({
          title: 'Receipt skipped',
          description: 'Passenger profile not found.',
          variant: 'destructive',
        });
        return;
      }

      const passengerData = passengerSnap.val();
      const passengerWallet = passengerData.solanaWallet;

      if (!passengerWallet) {
        toast({
          title: 'No passenger wallet',
          description: 'Passenger has not linked a Solana wallet yet.',
        });
        return;
      }

      const payload = {
        passengerId: truePassengerId,
        bookingId,
        fare: actualFare,
        route: bookingRoute,
        driverName: selectedBus.driverName || 'Yatra Driver',
      };

      // Call internal Next.js API route to perform the minting securely
      const mintRes = await fetch('/api/solana/mint-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const mintData = await mintRes.json();
      if (mintData?.success) {
        toast({
          title: 'Trip Ticket Minted! 🎉',
          description: `Sent to ${passengerWallet.slice(0, 4)}...${passengerWallet.slice(-4)}`,
        });
      } else if (mintData?.reason === 'no_wallet') {
        toast({
          title: 'Receipt not minted',
          description: 'Passenger has no verified wallet linked.',
        });
      } else {
        toast({
          title: 'Receipt mint failed',
          description: mintData?.error || 'Unable to mint trip receipt.',
          variant: 'destructive',
        });
      }

      if (bookingData.paymentMethod === 'digital' && bookingData.escrowStatus === 'locked') {
        try {
          const releaseRes = await fetch('/api/solana/escrow/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tripId: bookingId }),
          });
          const releaseData = await releaseRes.json();
          if (!releaseRes.ok || !releaseData?.success) {
            throw new Error(releaseData?.error || 'Escrow release failed');
          }
          toast({ title: 'Payment Released', description: 'Escrow released to driver wallet.' });
        } catch (releaseErr: any) {
          toast({
            title: 'Escrow release failed',
            description: releaseErr?.message || 'Funds remain locked. Retry from support flow.',
            variant: 'destructive',
          });
        }
      }

    } catch (error) {
      console.error('[Trip Ticket] Unexpected error during dropoff flow:', error);
    }
  };

  const handleReportEmergency = async (type: 'accident' | 'breakdown') => {
    if (!selectedBus || !userLocation) {
      toast({
        title: 'Error',
        description: 'Cannot report emergency without active bus and location.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const res = await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: selectedBus.id,
          busNumber: selectedBus.busNumber,
          driverName: selectedBus.driverName,
          type,
          location: {
            lat: userLocation.lat,
            lng: userLocation.lng
          }
        })
      });

      if (!res.ok) {
        throw new Error('Failed to report emergency');
      }

      toast({
        title: 'Emergency Reported',
        description: 'Admin team has been notified. Help is on the way.',
        variant: 'destructive',
        duration: 10000,
      });
    } catch (error) {
      console.error('Failed to report emergency:', error);
      toast({
        title: 'Report Failed',
        description: 'Please try again or call emergency services directly.',
        variant: 'destructive',
      });
    }
  };

  // Auth guard
  useEffect(() => {
    // Only execute if Firebase auth has finished checking state
    if (!loading) {
      if (!currentUser) {
        router.replace('/auth?redirect=/driver');
        return;
      }

      if (role && role !== 'driver') {
        router.replace('/passenger');
        return;
      }

      // If `loading` is false and `userData` is strictly null, the user has NO profile in DB.
      if (userData === null) {
        router.replace('/auth/profile');
        return;
      }

      // If userData exists, check completeness
      const isComplete = userData?.role ? checkProfileCompletion(userData) : false;

      if (!isComplete && userData) {
        router.replace('/auth/profile');
        return;
      }

    }
  }, [currentUser, role, loading, router, userData]);

  if (loading || !currentUser || (role && role !== 'driver')) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F8FAFC' }}>
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: '#00D4AA22' }} />
            <div className="relative rounded-2xl w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #00D4AA, #009E7F)' }}>
              <BusIcon className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>
          <p className="text-lg font-semibold" style={{ color: '#64748B' }}>Initializing Dashboard...</p>
        </div>
      </div>
    );
  }

  const completedTrips = passengers.filter((p: any) => p?.status === 'dropped').length;
  const activeTripsCount = passengers.filter((p: any) => p?.status === 'waiting' || p?.status === 'onBoard').length;
  const estimatedEarnings = passengers.reduce((sum: number, p: any) => {
    const fare = typeof p?.fare === 'number' ? p.fare : 0;
    return sum + fare;
  }, 0);

  const C = '#00D4AA';
  const CD = '#009E7F';
  const CL = '#E6FBF5';
  const INK = '#0F172A';
  const MUTED = '#64748B';
  const BORDER = '#E2E8F0';
  const SURF = '#F8FAFC';

  return (
    <div className="min-h-screen flex flex-col overflow-y-auto" style={{ background: SURF, WebkitOverflowScrolling: 'touch' }}>

      {/* Passenger Reached full-screen alert */}
      {showPassengerReachedAlert && (
        <div className="fixed inset-0 z-[1400] flex flex-col items-center justify-center px-6 text-center" style={{ background: C }}>
          <div className="w-20 h-20 rounded-full mb-6 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <MapPin className="w-10 h-10 text-white" />
          </div>
          <p className="text-4xl font-black tracking-tight text-white">Passenger Nearby</p>
          <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.85)' }}>You are within 10 metres of the pickup point.</p>
          <button
            className="mt-10 font-black px-10 py-4 rounded-2xl text-base transition-all active:scale-95"
            style={{ background: 'white', color: CD }}
            onClick={async () => {
              setShowPassengerReachedAlert(false);
              if (activeTripRequest?.id) {
                await updateTripStatus(activeTripRequest.id, 'arrived');
                setActiveTripRequest((prev) => prev ? { ...prev, status: 'arrived' } : null);
              }
            }}
          >
            Confirm Arrival
          </button>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50" style={{ background: 'white', borderBottom: `1px solid ${BORDER}` }}>
        <div className="px-4 py-3 flex items-center justify-between">

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${C}, ${CD})` }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L20 6V12C20 17 16.5 21 12 22C7.5 21 4 17 4 12V6L12 2Z" />
                <path d="M9 12L11 14L15 10" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black leading-none" style={{ fontFamily: 'var(--font-mukta), sans-serif', color: INK }}>
                चालक
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'animate-pulse' : ''}`} style={{ background: isOnline ? '#10B981' : '#CBD5E1' }} />
                <span className="text-[10px] font-black tracking-widest" style={{ color: isOnline ? '#059669' : '#94A3B8' }}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLocationToggle(!locationEnabled)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-black transition-all active:scale-95"
              style={{
                background: locationEnabled ? CL : '#F1F5F9',
                border: `1.5px solid ${locationEnabled ? C : '#CBD5E1'}`,
                color: locationEnabled ? CD : '#94A3B8',
              }}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${locationEnabled ? 'animate-pulse' : ''}`} style={{ background: locationEnabled ? '#10B981' : '#CBD5E1' }} />
              {locationEnabled ? 'LIVE' : 'GO LIVE'}
            </button>

            <button
              type="button"
              onClick={() => setShowProfileDialog(true)}
              className="w-10 h-10 rounded-full font-black text-sm flex items-center justify-center transition-all active:scale-95"
              style={{ background: CL, color: CD, border: '1.5px solid #A7F3D0' }}
            >
              {userData?.role === 'driver' ? (userData.name?.charAt(0).toUpperCase() || 'D') : 'D'}
            </button>

            <DriverProfileDrawer open={showProfileDialog} onOpenChange={setShowProfileDialog} />
          </div>
        </div>
      </header>

      {/* Map */}
      <div
        className="relative w-full shrink-0 transition-all duration-500"
        style={{ height: activeTripRequest ? '65vh' : '50vh', borderBottom: `1px solid ${BORDER}`, touchAction: 'pan-y' }}
      >
        <MapWrapper
          role="driver"
          buses={buses}
          passengers={passengers}
          selectedBus={selectedBus}
          onBusSelect={setSelectedBus}
          showRoute={true}
          userLocation={userLocation}
          hailedDriverId={selectedBus?.id || null}
          activeTripId={activeTripRequest?.id || null}
          passengerLocation={passengerLocation}
          activeRoute={driverActiveRoute}
          routePhase={activeTripRequest?.status === 'active' ? 'trip' : activeTripRequest ? 'pickup' : null}
          focusLocation={
            activeTripRequest?.status === 'accepted' || activeTripRequest?.status === 'arrived'
              ? activeTripRequest.pickupLocation ?? null
              : activeTripRequest?.status === 'active'
                ? (passengerLocation ?? activeTripRequest.pickupLocation ?? null)
                : null
          }
        />
      </div>

      {/* Cockpit */}
      <div className="p-4 space-y-3 pb-40">

        {/* Active trip navigation strip */}
        {activeTripRequest && (
          <section className="rounded-2xl overflow-hidden" style={{ background: 'white', border: `1.5px solid ${C}`, boxShadow: `0 4px 20px ${C}18` }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: CL, borderBottom: '1px solid #C8F2E6' }}>
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5" style={{ color: CD }} />
                <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: CD }}>
                  {activeTripRequest.status === 'active' ? 'Trip in Progress' : activeTripRequest.status === 'arrived' ? 'At Pickup' : 'Navigate to Pickup'}
                </span>
              </div>
              {driverEta !== null && (
                <span className="text-xs font-black px-2.5 py-1 rounded-full text-white" style={{ background: C }}>{driverEta} min</span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full font-black text-sm flex items-center justify-center shrink-0" style={{ background: CL, color: CD, border: '1.5px solid #A7F3D0' }}>
                  {activeTripRequest.passengerName?.[0]?.toUpperCase() ?? 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: INK }}>{activeTripRequest.passengerName}</p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {activeTripRequest.status === 'requested' && 'Waiting for response'}
                    {activeTripRequest.status === 'accepted' && 'On the way'}
                    {activeTripRequest.status === 'arrived' && 'At pickup point'}
                    {activeTripRequest.status === 'active' && 'Trip underway'}
                  </p>
                </div>
                {userLocation && activeTripRequest.pickupLocation && (() => {
                  const R = 6371000;
                  const dLat = (activeTripRequest.pickupLocation.lat - userLocation.lat) * Math.PI / 180;
                  const dLng = (activeTripRequest.pickupLocation.lng - userLocation.lng) * Math.PI / 180;
                  const a = Math.sin(dLat / 2) ** 2 + Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(activeTripRequest.pickupLocation.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  return <span className="text-sm font-black shrink-0" style={{ color: CD }}>{dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`}</span>;
                })()}
              </div>
              {activeTripRequest.pickupLocation && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                  <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: '#10B981' }} />
                  <p className="text-xs font-medium truncate" style={{ color: MUTED }}>
                    {activeTripRequest.pickupLocation.address ?? `${activeTripRequest.pickupLocation.lat.toFixed(4)}, ${activeTripRequest.pickupLocation.lng.toFixed(4)}`}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'dashboard' && (
          <>
            {/* Vehicle Status */}
            <section className="rounded-2xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  <BusIcon className="w-4 h-4" style={{ color: MUTED }} />
                  <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: MUTED }}>Vehicle Status</span>
                </div>
                {process.env.NODE_ENV === 'development' && (
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 hover:text-red-500" onClick={triggerManualTest}>Test Crash</Button>
                )}
              </div>
              <div className="p-4">
                {selectedBus ? (
                  <DriverPanel
                    bus={selectedBus}
                    onLocationToggle={handleLocationToggle}
                    locationEnabled={locationEnabled}
                    onAddOfflinePassenger={handleAddOfflinePassenger}
                    onRemoveOfflinePassenger={handleRemoveOfflinePassenger}
                  />
                ) : (
                  <div className="py-10 text-center space-y-2">
                    <BusIcon className="w-8 h-8 mx-auto" style={{ color: '#CBD5E1' }} />
                    <p className="font-bold text-sm" style={{ color: INK }}>No vehicle assigned</p>
                    <p className="text-xs" style={{ color: MUTED }}>Complete your driver profile to link a vehicle.</p>
                  </div>
                )}
              </div>
            </section>

            {/* Passengers */}
            <section className="rounded-2xl overflow-hidden" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: MUTED }} />
                  <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: MUTED }}>Passengers</span>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: SURF, border: `1px solid ${BORDER}`, color: MUTED }}>{passengers.length}</span>
              </div>
              <div className="p-4">
                <PassengerList
                  passengers={passengers}
                  selectedBus={selectedBus}
                  onPassengerPickup={handlePassengerPickup}
                  onPassengerDropoff={handlePassengerDropoff}
                />
              </div>
            </section>
          </>
        )}

        {activeTab === 'trips' && (
          <section className="rounded-2xl p-4 space-y-3" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <p className="text-xs uppercase tracking-widest font-black" style={{ color: MUTED }}>Trip Overview</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: CL, border: '1px solid #A7F3D0' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Active</p>
                <p className="text-2xl font-black" style={{ color: CD }}>{activeTripsCount}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Completed</p>
                <p className="text-2xl font-black" style={{ color: '#15803D' }}>{completedTrips}</p>
              </div>
            </div>
            <PassengerList
              passengers={passengers}
              selectedBus={selectedBus}
              onPassengerPickup={handlePassengerPickup}
              onPassengerDropoff={handlePassengerDropoff}
            />
          </section>
        )}

        {activeTab === 'earnings' && (
          <section className="rounded-2xl p-4 space-y-3" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <p className="text-xs uppercase tracking-widest font-black" style={{ color: MUTED }}>Earnings</p>
            <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg, ${CL}, #C8F2E6)`, border: '1px solid #A7F3D0' }}>
              <p className="text-[11px] uppercase tracking-widest font-bold" style={{ color: MUTED }}>Estimated Today</p>
              <p className="mt-1 text-3xl font-black" style={{ color: INK }}>NPR {estimatedEarnings.toLocaleString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-3" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Trips</p>
                <p className="text-xl font-black" style={{ color: INK }}>{completedTrips}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>Passengers</p>
                <p className="text-xl font-black" style={{ color: INK }}>{passengers.length}</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="rounded-2xl p-4 space-y-3" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <p className="text-xs uppercase tracking-widest font-black" style={{ color: MUTED }}>Driver Profile</p>
            <p className="text-lg font-black" style={{ color: INK }}>{userData?.name || 'Driver'}</p>
            <p className="text-sm" style={{ color: MUTED }}>{userData?.email || currentUser?.email || 'No email on file'}</p>
            <button
              className="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ background: C, color: 'white' }}
              onClick={() => setShowProfileDialog(true)}
            >
              <UserRound className="w-4 h-4" />
              Open Driver Profile
            </button>
          </section>
        )}

        <div className="h-24" />
      </div>

      {/* Trip Request Panel (fixed bottom sheet) */}
      {activeTripRequest && (
        <TripRequestPanel
          request={activeTripRequest}
          driverLocation={userLocation}
          tripStatus={activeTripRequest.status as TripStatus}
          onAccept={handleAcceptTrip}
          onReject={handleRejectTrip}
          onExpire={handleExpireTrip}
          onPassengerBoarded={handlePassengerBoarded}
          onCompleteTrip={handleCompleteTrip}
        />
      )}

      <TripRatingModal
        open={showRatingModal}
        role="driver"
        targetName={ratingPassengerName}
        onSubmit={async (stars, comment) => {
          if (ratingTripId) await submitTripRating(ratingTripId, 'driver', stars, comment);
          setShowRatingModal(false);
          setRatingTripId(null);
        }}
        onSkip={() => { setShowRatingModal(false); setRatingTripId(null); }}
      />

      {/* Accident Alert */}
      <div className="fixed inset-x-0 bottom-14 z-[1100] flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <AccidentAlert isOpen={isAccidentDetected} onConfirm={handleAccidentConfirm} onCancel={handleAccidentCancel} />
        </div>
      </div>

      {/* Floating status bar + SOS */}
      <div className="fixed inset-x-3 bottom-16 z-[1200] px-4 py-2.5 rounded-2xl flex items-center justify-between" style={{ background: 'white', border: `1px solid ${BORDER}`, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'animate-pulse' : ''}`} style={{ background: isOnline ? '#10B981' : '#CBD5E1' }} />
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: isOnline ? '#059669' : '#94A3B8' }}>
            {isOnline ? 'Live tracking active' : 'Offline'}
          </span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <button className="h-10 px-5 rounded-xl font-black text-xs transition-all active:scale-95" style={{ background: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FECACA' }}>
              SOS
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-2xl" style={{ background: 'white', border: `1px solid ${BORDER}` }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" style={{ color: '#DC2626' }}>
                <AlertTriangle className="w-5 h-5" /> Emergency Report
              </DialogTitle>
              <DialogDescription style={{ color: MUTED }}>
                This will immediately alert the admin team. Use only in emergencies.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <Button
                variant="outline"
                className="h-24 min-h-[5.5rem] flex flex-col gap-2 rounded-xl font-bold transition-all hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                style={{ border: `1px solid ${BORDER}` }}
                onClick={() => handleReportEmergency('accident')}
              >
                <Car className="w-8 h-8" /> Accident
              </Button>
              <Button
                variant="outline"
                className="h-24 min-h-[5.5rem] flex flex-col gap-2 rounded-xl font-bold transition-all"
                style={{ border: `1px solid ${BORDER}` }}
                onClick={() => handleReportEmergency('breakdown')}
              >
                <Wrench className="w-8 h-8" /> Breakdown
              </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" style={{ color: MUTED }}>Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom nav */}
      <nav
        aria-label="Driver tabs"
        className="fixed inset-x-0 bottom-0 z-[1300] px-3 py-2"
        style={{ background: 'white', borderTop: `1px solid ${BORDER}` }}
      >
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {([
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'trips', icon: Route, label: 'Trips' },
            { id: 'earnings', icon: CircleDollarSign, label: 'Earnings' },
            { id: 'profile', icon: UserRound, label: 'Profile' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className="min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-xl transition-all active:scale-95"
              style={{
                background: activeTab === id ? CL : 'transparent',
                color: activeTab === id ? CD : MUTED,
              }}
              onClick={() => {
                setActiveTab(id);
                if (id === 'profile') setShowProfileDialog(true);
              }}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-black tracking-wide">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

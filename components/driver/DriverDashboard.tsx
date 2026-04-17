'use client';

import { useState, useEffect, useRef } from 'react';
import DriverPanel from '@/components/driver/DriverPanel';
import PassengerList from '@/components/driver/PassengerList';
import VerificationPanel from '@/components/driver/VerificationPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bus, Passenger, Driver, checkProfileCompletion } from '@/lib/types';
import MapWrapper from '@/components/map/MapWrapper';
import {
  Navigation,
  Users,
  MapPin,
  Settings,
  Bus as BusIcon
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
  createAlert
} from '@/lib/firebaseDb';
import { addOfflinePassenger, removeOfflinePassenger } from '@/lib/seatManagement';
import { useToast } from '@/components/ui/use-toast';
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

export default function DriverDashboard() {
  const router = useRouter();
  const { currentUser, role, loading, signOut, userData } = useAuth();
  const { toast } = useToast();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasGeolocationError, setHasGeolocationError] = useState(false);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);
  const [locationUpdateCount, setLocationUpdateCount] = useState(0);
  const [lastFirebaseUpdate, setLastFirebaseUpdate] = useState<Date | null>(null);
  const [notificationPermissionRequested, setNotificationPermissionRequested] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [activeTripRequest, setActiveTripRequest] = useState<{ id: string; lat: number; lng: number; status: string } | null>(null);
  const [showPassengerReachedAlert, setShowPassengerReachedAlert] = useState(false);
  const [showZKPanel, setShowZKPanel] = useState(false);
  const driverWalletAddress =
    typeof userData?.solanaWallet === 'string' ? userData.solanaWallet.trim() : '';
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
        const token = await getPushTokenFromBrowser();
        if (!token) return;
        await registerPushToken(currentUser.uid, token);
      } catch (error) {
        console.warn('[Driver] Push token registration skipped:', error);
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
        (userData?.role === 'driver' && (userData as any).vehicleNumber
          ? busesData.find((b) => b.busNumber === (userData as any).vehicleNumber)
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
  }, [selectedBus, currentUser, userData]);

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
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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
          } catch (e) {
            // Fallback: use browser beep
            console.log('\u0007'); // ASCII bell character
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
        ['requested', 'accepted', 'arrived', 'pending'].includes(request.status)
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
        setLastFirebaseUpdate(new Date());
        setLocationUpdateCount((prev) => prev + 1);
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
        setLastLocationUpdate(new Date());
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
        // eslint-disable-next-line no-console
        console.log('[Driver] Location sharing', enabled ? 'enabled' : 'disabled');

        toast({
          title: enabled ? 'You are now online' : 'You are now offline',
          description: enabled
            ? 'Your location is being shared with passengers'
            : 'Your location sharing has been stopped',
        });
      } catch (error) {
        // eslint-disable-next-line no-console
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

      // The `passengerId` argument here is actually the booking ID coming from the UI List
      const bookingId = passengerId;

      // We need to find the `bookings/*/bookingId` to get the true passengerId 
      // Actually, since bookings are stored under `bookings/{passengerId}/{bookingId}` or `bookings/{busId}/{bookingId}`,
      // Yatra's `subscribeToBookings` fetches all `bookings` and filters. Let's fetch `bookings` root and find it.
      const bookingsRef = ref(db, 'bookings');
      const bookingsSnap = await get(bookingsRef);

      let truePassengerId: string | null = null;
      let actualFare = 75;

      if (bookingsSnap.exists()) {
        const allBookingsData = bookingsSnap.val();
        // Since Yatra bookings might be stored as flat objects or under child keys, we iterate
        for (const [key, bData] of Object.entries(allBookingsData as Record<string, any>)) {
          if (bData.id === bookingId || key === bookingId) {
            truePassengerId = bData.passengerId;
            actualFare = bData.fare || 75;
            break;
          }
        }
      }

      if (!truePassengerId) {
        console.log(`[Trip Ticket] Could not find original booking for ${bookingId}`);
        // Fallback just in case `passengerId` was correct
        truePassengerId = passengerId;
      }

      // Firebase lookup for passenger's Solana wallet
      const passengerRef = ref(db, `users/${truePassengerId}`);
      const passengerSnap = await get(passengerRef);

      if (!passengerSnap.exists()) {
        console.log(`[Trip Ticket] Passenger ${truePassengerId} does not exist.`);
        return;
      }

      const passengerData = passengerSnap.val();
      const passengerWallet = passengerData.solanaWallet;

      if (!passengerWallet) {
        console.log(`[Trip Ticket] Passenger ${truePassengerId} has no linked Solana Wallet.`);
        return; // Silently exit if no wallet
      }

      const payload = {
        passengerId: truePassengerId,
        passengerWallet,
        bookingId,
        fare: actualFare,
        route: selectedBus.route || 'Local Trip',
        driverName: selectedBus.driverName || 'Yatra Driver',
      };

      // Call internal Next.js API route to perform the minting securely
      fetch('/api/solana/mint-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const data = await res.json();
        if (data.success) {
          toast({
            title: 'Trip Ticket Minted! 🎉',
            description: `Sent to ${passengerWallet.slice(0, 4)}...${passengerWallet.slice(-4)}`,
          });
        } else {
          console.error('[Trip Ticket] Minting API Error:', data.error);
        }
      }).catch(err => {
        console.error('[Trip Ticket] Fetch Error:', err);
      });

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
      await createAlert({
        busId: selectedBus.id,
        busNumber: selectedBus.busNumber,
        driverName: selectedBus.driverName,
        type,
        location: {
          lat: userLocation.lat,
          lng: userLocation.lng,
          timestamp: new Date()
        },
        timestamp: new Date().toISOString(),
        status: 'active'
      });

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
      const isComplete = (userData as any).role ? checkProfileCompletion(userData) : false;

      if (!isComplete && userData) {
        router.replace('/auth/profile');
        return;
      }

      // ZK Identity Redirect check (Phase 1 upgrade)
      if (userData && isComplete && !(userData as any)?.verificationBadge) {
        // Automatically open the ZK onboarding panel inline
        setShowZKPanel(true);
      }
    }
  }, [currentUser, role, loading, router, userData]);

  if (loading || !currentUser || (role && role !== 'driver')) {
    const statusMessage = currentUser
      ? role && role !== 'driver'
        ? 'Role mismatch detected. Redirecting you to the correct portal…'
        : 'Verifying driver access and loading your cockpit…'
      : 'Signing you in and restoring your driver session…';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center px-4 text-center">
        <div className="max-w-sm">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping"></div>
            <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl w-full h-full flex items-center justify-center shadow-2xl shadow-cyan-500/50">
              <BusIcon className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>
          <p className="text-white text-xl font-semibold mb-2">Preparing driver cockpit</p>
          <p className="text-slate-400 text-sm">{statusMessage}</p>
        </div>
      </div>
    );
  }

  // Determine if profile is stable
  const isProfileStable = userData && checkProfileCompletion(userData);

  return (
    <div
      className="min-h-screen flex flex-col overflow-y-auto"
      style={{ background: '#0B0E14', WebkitOverflowScrolling: 'touch' }}
    >
      {showPassengerReachedAlert && (
        <div className="fixed inset-0 z-[1200] bg-blue-700/95 flex flex-col items-center justify-center text-white px-6 text-center">
          <p className="text-4xl font-extrabold tracking-wide">PASSENGER REACHED</p>
          <p className="mt-3 text-sm opacity-90">Pickup point is within 10 meters.</p>
          <Button
            className="mt-8 bg-white text-blue-700 hover:bg-white/90 font-bold"
            onClick={() => setShowPassengerReachedAlert(false)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* ── ZK Identity Verification Panel (auto-shows if badge is missing) ── */}
      {showZKPanel && userData && (
        <div className="fixed inset-0 z-[1100] bg-slate-950/95 flex flex-col items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-lg">
            <div className="mb-4 text-center">
              <h2 className="text-xl font-bold text-white">ZK Identity Required</h2>
              <p className="text-slate-400 text-sm mt-1">Complete your ZK verification to unlock the full Cockpit.</p>
            </div>
            <VerificationPanel
              driver={userData as Driver}
              onVerificationSuccess={() => {
                setShowZKPanel(false);
                toast({ title: '✅ Verified!', description: 'Your ZK badge is minted. Welcome to the Cockpit.' });
              }}
            />
            <button
              onClick={() => setShowZKPanel(false)}
              className="mt-4 w-full text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ── 1. Cockpit Header ── */}
      <div className="sticky top-0 z-50 border-b border-slate-800/60 overflow-hidden"
        style={{ background: 'rgba(11,14,20,0.92)', backdropFilter: 'blur(20px)' }}
      >
        {/* Animated scanning line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70"
            style={{ animation: 'scanline 2.8s linear infinite', width: '60%' }} />
        </div>

        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          {/* चालक Brand */}
          <div className="flex items-center gap-3">
            {/* Shield icon with glow */}
            <div className="relative w-9 h-9 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-cyan-500/10 blur-md" />
              <svg viewBox="0 0 36 36" className="w-9 h-9 relative">
                <path d="M18 3 L33 9 L33 18 C33 26 26 32 18 34 C10 32 3 26 3 18 L3 9 Z"
                  fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.6">
                  <animateTransform attributeName="transform" type="rotate"
                    from="0 18 18" to="360 18 18" dur="8s" repeatCount="indefinite" />
                </path>
                <path d="M18 6 L30 11 L30 18 C30 24.5 25 29.5 18 31.5 C11 29.5 6 24.5 6 18 L6 11 Z"
                  fill="rgba(6,182,212,0.07)" stroke="#22d3ee" strokeWidth="1" />
                <path d="M13 18 L16.5 21.5 L23 15" stroke="#22d3ee" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>

            <div>
              <h1
                className="text-[26px] font-extrabold leading-none"
                style={{
                  fontFamily: 'var(--font-mukta), sans-serif',
                  background: 'linear-gradient(135deg, #67e8f9 0%, #22d3ee 40%, #ffffff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 12px rgba(34,211,238,0.5))',
                }}
              >
                चालक
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-cyan-400' : 'bg-slate-600'}`}
                  style={{
                    boxShadow: isOnline ? '0 0 6px #22d3ee' : 'none',
                    animation: isOnline ? 'pulse 1.5s ease-in-out infinite' : 'none'
                  }} />
                <span className="text-[10px] font-bold tracking-widest"
                  style={{ color: isOnline ? '#67e8f9' : '#64748b' }}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* SOS Button with rhythmic red glow */}
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-10 px-4 font-black tracking-widest text-sm rounded-xl border border-red-500/60"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#f87171',
                    animation: 'sos-pulse 2s ease-in-out infinite',
                    boxShadow: '0 0 0 0 rgba(239,68,68,0.4)',
                  }}
                >
                  SOS
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> Emergency Report
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    This will immediately alert the admin team. Use only in emergencies.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-4">
                  <Button variant="outline" className="h-24 flex flex-col gap-2 border-slate-700 hover:bg-red-950 hover:border-red-500 hover:text-red-400 rounded-xl"
                    onClick={() => handleReportEmergency('accident')}>
                    <Car className="w-8 h-8" /> Accident
                  </Button>
                  <Button variant="outline" className="h-24 flex flex-col gap-2 border-slate-700 hover:bg-orange-950 hover:border-orange-500 hover:text-orange-400 rounded-xl"
                    onClick={() => handleReportEmergency('breakdown')}>
                    <Wrench className="w-8 h-8" /> Breakdown
                  </Button>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost" className="text-slate-400">Cancel</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* GPS Toggle */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur border transition-all ${locationEnabled ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-900/50 border-slate-700/50'}`}>
              <Switch checked={locationEnabled} onCheckedChange={handleLocationToggle}
                className="scale-75 data-[state=checked]:bg-cyan-500" />
              <MapPin className={`w-3 h-3 ${locationEnabled ? 'text-cyan-400' : 'text-slate-400'}`} />
              {locationEnabled && selectedBus && (
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${lastFirebaseUpdate && (Date.now() - lastFirebaseUpdate.getTime()) < 10000 ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-[10px] text-slate-300 font-medium">
                    {lastFirebaseUpdate ? `${Math.floor((Date.now() - lastFirebaseUpdate.getTime()) / 1000)}s` : '...'}
                  </span>
                </div>
              )}
            </div>

            {/* STABLE AVATAR LOGIC (Replaces plain Sign Out Door) */}
            <Button
              variant="outline"
              size="icon"
              className="w-10 h-10 rounded-full bg-slate-900 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
              onClick={() => signOut()} // Logout for now, or open profile
            >
              {isProfileStable ? (
                <span className="text-sm font-black text-cyan-400">
                  {userData?.name ? userData.name[0].toUpperCase() : '?'}
                </span>
              ) : (
                <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="glass-3d floating-chip border border-cyan-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-cyan-300">Live Cadence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{isOnline ? 'ONLINE' : 'OFFLINE'}</div>
              <p className="text-xs text-slate-400">Location sharing {isOnline ? 'active' : 'paused'}</p>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className="text-[11px] uppercase tracking-widest text-slate-500">{isOnline ? 'Live mode' : 'Standby'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-3d floating-chip border border-slate-700/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-slate-400">Sync status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{locationUpdateCount}</div>
              <p className="text-xs text-slate-400">GPS updates sent</p>
              <div className="text-[11px] text-slate-500">{lastFirebaseUpdate ? `Last flush ${Math.floor((Date.now() - lastFirebaseUpdate.getTime()) / 1000)}s ago` : 'Waiting for first update'}</div>
            </CardContent>
          </Card>

          <Card className="glass-3d floating-chip border border-purple-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-purple-300">Passenger manifest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{passengers.length}</div>
              <p className="text-xs text-slate-400">Passengers onboard</p>
              <div className="text-[11px] text-slate-500">{selectedBus?.offlineOccupiedSeats ? `${selectedBus.offlineOccupiedSeats} offline seat${selectedBus.offlineOccupiedSeats === 1 ? '' : 's'} in use` : 'Offline support ready'}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 2. Map Section ── */}
      <div className="relative w-full shrink-0 p-4">
        <Card className="glass-3d overflow-hidden border border-cyan-500/15 shadow-[0_45px_120px_-85px_rgba(0,242,255,0.25)]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_35%)]" />
          <div className="relative h-[55vh] min-h-[340px]">
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
            />
          </div>
        </Card>
      </div>

      {/* ── 3. Scrollable Cockpit Sections ── */}
      <div className="p-4 space-y-4 pb-24 bg-slate-950">

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.95fr]">
          <section className="glass-3d rounded-3xl border border-cyan-500/15 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-slate-950/80">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Cockpit command</p>
                <h2 className="mt-2 text-xl font-bold text-white">Driver dashboard</h2>
              </div>
              <Button variant="ghost" size="sm" className="h-9 text-[10px] text-slate-300 hover:text-red-400 px-3"
                onClick={triggerManualTest}>Test Crash</Button>
            </div>
            <div className="p-5">
              {selectedBus ? (
                <DriverPanel
                  bus={selectedBus}
                  onLocationToggle={handleLocationToggle}
                  locationEnabled={locationEnabled}
                  onAddOfflinePassenger={handleAddOfflinePassenger}
                  onRemoveOfflinePassenger={handleRemoveOfflinePassenger}
                />
              ) : (
                <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6 text-slate-400">
                  Select your bus from the map to unlock the cockpit controls.
                </div>
              )}
            </div>
          </section>

          <div className="space-y-4">
            <section className="glass-3d rounded-3xl border border-purple-500/15 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-slate-950/80">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-purple-300">Passenger manifest</p>
                  <h2 className="mt-2 text-xl font-bold text-white">Onboard list</h2>
                </div>
                <Badge className="text-xs uppercase tracking-[0.24em] bg-purple-500/10 text-purple-200 border border-purple-500/20">
                  {passengers.length}
                </Badge>
              </div>
              <div className="p-5">
                <PassengerList
                  passengers={passengers}
                  selectedBus={selectedBus}
                  onPassengerPickup={handlePassengerPickup}
                  onPassengerDropoff={handlePassengerDropoff}
                />
              </div>
            </section>

            {userData && (
              <section className="glass-3d rounded-3xl border border-blue-500/15 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-slate-950/80">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">Security</p>
                    <h2 className="mt-2 text-xl font-bold text-white">ZK identity review</h2>
                  </div>
                </div>
                <div className="p-5">
                  <VerificationPanel
                    driver={userData as Driver}
                    onVerificationSuccess={() => { }}
                  />
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="h-8" />
      </div>

      {/* Accident Alert Popup */}
      <div className="fixed inset-x-0 bottom-16 z-[1100] flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <AccidentAlert
            isOpen={isAccidentDetected}
            onConfirm={handleAccidentConfirm}
            onCancel={handleAccidentCancel}
          />
        </div>
      </div>

      {/* Fixed bottom safety bar (SOS + quick status) */}
      <div className="fixed inset-x-0 bottom-0 z-[1200] bg-slate-950/95 border-t border-slate-800/70 backdrop-blur-md px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          <span className="text-[11px] font-semibold text-slate-200">
            {isOnline ? 'Live tracking active' : 'You are offline'}
          </span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 px-4 font-black tracking-widest text-xs rounded-xl border border-red-500/60"
              style={{
                background: 'rgba(239,68,68,0.18)',
                color: '#fecaca',
                animation: 'sos-pulse 2s ease-in-out infinite',
                boxShadow: '0 0 0 0 rgba(239,68,68,0.4)',
              }}
            >
              SOS
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Emergency Report
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                This will immediately alert the admin team. Use only in emergencies.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2 border-slate-700 hover:bg-red-950 hover:border-red-500 hover:text-red-400 rounded-xl"
                onClick={() => handleReportEmergency('accident')}
              >
                <Car className="w-8 h-8" /> Accident
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2 border-slate-700 hover:bg-orange-950 hover:border-orange-500 hover:text-orange-400 rounded-xl"
                onClick={() => handleReportEmergency('breakdown')}
              >
                <Wrench className="w-8 h-8" /> Breakdown
              </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" className="text-slate-400">
                  Cancel
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Global cockpit keyframes */}
      <style jsx global>{`
        @keyframes scanline {
          0%   { transform: translateX(-60%); }
          100% { transform: translateX(200%); }
        }
        @keyframes sos-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%       { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        }
        @keyframes shield-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

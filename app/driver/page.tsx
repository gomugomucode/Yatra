'use client';

import { useState, useEffect, useRef } from 'react';
import DriverPanel from '@/components/driver/DriverPanel';
import PassengerList from '@/components/driver/PassengerList';
import VerificationPanel from '@/components/driver/VerificationPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bus, Passenger, Driver } from '@/lib/types';
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

      // Firebase lookup for passenger's Solana wallet
      const { getDatabase, ref, get } = await import('firebase/database');
      const { getFirebaseApp } = await import('@/lib/firebase');
      const db = getDatabase(getFirebaseApp());
      const passengerRef = ref(db, `users/${passengerId}`);
      const passengerSnap = await get(passengerRef);

      if (!passengerSnap.exists()) return;

      const passengerData = passengerSnap.val();
      const passengerWallet = passengerData.solanaWallet;

      if (!passengerWallet) {
        console.log(`[Trip Ticket] Passenger ${passengerId} has no linked Solana Wallet.`);
        return; // Silently exit if no wallet
      }

      // Find the specific booking ID. 
      // In this app, Passenger objects in the state represent active bookings.
      // We pass the raw passenger ID as the booking ID placeholder if we don't have the exact booking ID handy,
      // though typically the bookings listener might give us the true booking ID. 
      // The `passengers` state actually stores the `booking.id` inside `passenger.id` from subscribeToBookings.
      const bookingId = passengerId;

      const payload = {
        passengerId: passengerData.id || passengerId,
        passengerWallet,
        bookingId,
        fare: 75, // Static fare for demo based on PassengerList estimated revenue
        route: selectedBus.route,
        driverName: selectedBus.driverName,
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
    if (!loading) {
      if (!currentUser) {
        router.replace('/auth?redirect=/driver');
        return;
      }
      if (role && role !== 'driver') {
        router.replace('/passenger');
        return;
      }
      // Only check for vehicleNumber if userData is loaded (not null)
      // If userData is null but we have currentUser, it might still be loading
      if (userData !== null && !(userData as any)?.vehicleNumber) {
        // Profile incomplete (missing vehicle details)
        router.replace('/auth/profile');
        return;
      }
    }
  }, [currentUser, role, loading, router, userData]);

  if (loading || !currentUser || (role && role !== 'driver')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping"></div>
            <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl w-full h-full flex items-center justify-center shadow-2xl shadow-cyan-500/50">
              <BusIcon className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>
          <p className="text-slate-400 text-lg font-medium">Initializing Command Center...</p>
        </div>
      </div>
    );
  }

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

            {/* Sign Out */}
            <Button variant="ghost" onClick={signOut} size="icon"
              className="w-9 h-9 rounded-full bg-slate-900/50 border border-slate-700/50 text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <span className="sr-only">Sign Out</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Map Section ── */}
      <div
        className="relative w-full shrink-0 border-b border-slate-800/60"
        style={{ height: '50vh', touchAction: 'pan-y' }}
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
        />
      </div>

      {/* ── 3. Scrollable Cockpit Sections ── */}
      <div className="p-4 space-y-4 pb-24" style={{ background: '#0B0E14' }}>

        {/* Bus Controls Section */}
        {selectedBus && (
          <section className="rounded-2xl border border-cyan-500/20 overflow-hidden"
            style={{ boxShadow: '0 0 0 1px rgba(6,182,212,0.1), inset 0 0 40px rgba(6,182,212,0.03)' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60"
              style={{ background: 'rgba(6,182,212,0.05)' }}>
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold tracking-widest text-cyan-300 uppercase">Vehicle Status</span>
              </div>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-slate-600 hover:text-red-500 px-2"
                onClick={triggerManualTest}>Test Crash</Button>
            </div>
            <div className="p-4">
              <DriverPanel
                bus={selectedBus}
                onLocationToggle={handleLocationToggle}
                locationEnabled={locationEnabled}
                onAddOfflinePassenger={handleAddOfflinePassenger}
                onRemoveOfflinePassenger={handleRemoveOfflinePassenger}
              />
            </div>
          </section>
        )}

        {/* ZK Identity Section */}
        {userData && (
          <section className="rounded-2xl border border-blue-500/20 overflow-hidden"
            style={{ boxShadow: '0 0 0 1px rgba(59,130,246,0.1), inset 0 0 40px rgba(59,130,246,0.03)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 relative z-[1000]"
              style={{ background: 'rgba(59,130,246,0.05)' }}>
              <Settings className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold tracking-widest text-blue-300 uppercase">Security Clearance</span>
            </div>
            <div className="p-4">
              <VerificationPanel
                driver={userData as Driver}
                onVerificationSuccess={() => { }}
              />
            </div>
          </section>
        )}

        {/* Passenger Manifest */}
        <section className="rounded-2xl border border-purple-500/20 overflow-hidden"
          style={{ boxShadow: '0 0 0 1px rgba(168,85,247,0.1), inset 0 0 40px rgba(168,85,247,0.03)' }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60"
            style={{ background: 'rgba(168,85,247,0.05)' }}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold tracking-widest text-purple-300 uppercase">Passenger Manifest</span>
            </div>
            <span className="text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full px-2.5 py-0.5">
              {passengers.length}
            </span>
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

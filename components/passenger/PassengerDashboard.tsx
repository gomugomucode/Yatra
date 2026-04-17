'use client';

import { useState, useEffect, useRef } from 'react';
import BookingPanel from '@/components/passenger/BookingPanel';
import SeatVisualizer from '@/components/passenger/SeatVisualizer';
import WalletSettings from '@/components/passenger/WalletSettings';
import TripHistory from '@/components/passenger/TripHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bus, Booking, VehicleTypeId } from '@/lib/types';
import { VEHICLE_TYPES, DEFAULT_LOCATION } from '@/lib/constants';
import {
  MapPin,
  Ticket,
  Navigation,
  Clock,
  Smartphone,
  Users,
  UserCircle,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import MapWrapper from '@/components/map/MapWrapper';
import { subscribeToBuses, subscribeToBookings, subscribeToBusLocation, subscribeToTrip } from '@/lib/firebaseDb';
import { canAccommodateBooking } from '@/lib/seatManagement';
import { useToast } from '@/components/ui/use-toast';
import { checkProximity, haversineDistance, ProximityLevel } from '@/lib/utils/geofencing';
import { toast as sonnerToast } from 'sonner';
import { NotificationToast } from '@/components/shared/NotificationToast';
import DetailedBookingModal from '@/components/passenger/DetailedBookingModal';
import { YatraProfileDrawer } from '@/components/passenger/YatraProfileDrawer';
import { calculateETA } from '@/lib/utils/etaCalculator';
import LocationSearch from '@/components/map/LocationSearch';
import { Skeleton } from '@/components/ui/skeleton';
import { useProximityHandshake } from '@/hooks/useProximityHandshake';

export default function PassengerDashboard() {
  const router = useRouter();
  const { currentUser, role, loading, signOut, userData } = useAuth();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<Bus | null>(null);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicleFilter, setVehicleFilter] = useState<VehicleTypeId | 'all'>('all');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [pickupProximityLevel, setPickupProximityLevel] = useState<ProximityLevel | null>(null);
  const [lastNotificationByBooking, setLastNotificationByBooking] = useState<
    Record<string, ProximityLevel | null>
  >({});
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('notificationsEnabled');
    return stored ? stored === 'true' : true;
  });
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('vibrationEnabled');
    return stored ? stored === 'true' : true;
  });
  const [hasRequestedNotificationPermission, setHasRequestedNotificationPermission] =
    useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'requesting' | 'on-trip'>('idle');
  const [hailedDriverId, setHailedDriverId] = useState<string | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripPickup, setActiveTripPickup] = useState<{ lat: number; lng: number; status: string } | null>(null);
  const [showRideHereAlert, setShowRideHereAlert] = useState(false);
  const lastTripRequestAtRef = useRef<Record<string, number>>({});
  const [busLocations, setBusLocations] = useState<Record<string, {
    lat: number;
    lng: number;
    timestamp: string;
    heading?: number;
    speed?: number;
  }>>({});
  const [busETAs, setBusETAs] = useState<Record<string, number | null>>({});

  // ── Centralised proximity handshake ──
  const {
    arrived: rideArrived,
    resetArrived,
  } = useProximityHandshake({
    driverId: hailedDriverId,
    pickupLat: activeTripPickup?.lat ?? null,
    pickupLng: activeTripPickup?.lng ?? null,
    enabled: requestStatus === 'requesting' && !!hailedDriverId,
  });

  useEffect(() => {
    if (rideArrived) setShowRideHereAlert(true);
  }, [rideArrived]);

  // Reset when trip changes
  useEffect(() => {
    resetArrived();
    setShowRideHereAlert(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTripId]);

  // Get user's current location
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });

        // Auto-set pickup to current location if not set
        setPickupLocation(prev => prev ? prev : {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: 'Current Location'
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        let errorMessage = "Unknown error acquiring position";
        switch (error.code) {
          case 1: errorMessage = "Location permission denied. Please enable it in settings."; break;
          case 2: errorMessage = "Location unavailable. Check your GPS or network."; break;
          case 3: errorMessage = "Location request timed out."; break;
        }

        // Only show toast once per session or if critical
        if (!userLocation) {
          toast({
            title: "Location Error",
            description: errorMessage + " Using default location.",
            variant: "destructive"
          });
          // Fallback to DEFAULT_LOCATION so map still works
          setUserLocation({ lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Subscribe to real-time bus updates
  useEffect(() => {
    const unsubscribe = subscribeToBuses((busesData) => {
      // Parse Location timestamps properly
      const parsedBuses = busesData.map(bus => {
        if (bus.currentLocation) {
          // Handle both Date objects and ISO strings
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

  // Subscribe to real-time location updates for each active bus
  // We use a stable key for buses to prevent infinite loops when updating bus locations
  const activeBusIds = buses.filter(b => b.isActive).map(b => b.id).join(',');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[PASSENGER] Setting up location listeners for active buses');

    const unsubscribes: (() => void)[] = [];
    const targetBuses = hailedDriverId
      ? buses.filter((bus) => bus.id === hailedDriverId && bus.isActive)
      : buses.filter((bus) => bus.isActive);

    if (hailedDriverId) {
      setBusLocations((prev) => {
        const focused = prev[hailedDriverId];
        return focused ? { [hailedDriverId]: focused } : {};
      });
    }

    targetBuses.forEach(bus => {
      if (bus.isActive) {
        // eslint-disable-next-line no-console
        console.log('[PASSENGER] Subscribing to bus location:', bus.id);

        const unsubscribe = subscribeToBusLocation(bus.id, (location) => {
          if (location) {
            setBusLocations(prev => ({
              ...prev,
              [bus.id]: location,
            }));

            // Calculate ETA only if user location is available AND this is the selected bus
            if (userLocation && selectedBus && selectedBus.id === bus.id) {
              const eta = calculateETA(
                { lat: location.lat, lng: location.lng },
                userLocation,
                location.speed || 30
              );
              setBusETAs(prev => ({
                ...prev,
                [bus.id]: eta,
              }));
            }
          }
        });
        unsubscribes.push(unsubscribe);
      }
    });

    return () => {
      // eslint-disable-next-line no-console
      console.log('[PASSENGER] Cleaning up location listeners');
      unsubscribes.forEach(unsub => unsub());
    };
    // Only re-subscribe if the set of active buses changes, or if userLocation/selectedBus changes (for ETA)
    // We intentionally omit 'buses' to avoid the infinite loop caused by setBuses updating the dependency
  }, [activeBusIds, userLocation, selectedBus?.id, hailedDriverId]);

  // Update bus locations in buses array when real-time updates arrive
  useEffect(() => {
    if (Object.keys(busLocations).length === 0) return;

    setBuses(prevBuses => {
      const updated = prevBuses.map(bus => {
        const locationUpdate = busLocations[bus.id];
        if (locationUpdate) {
          // Only update if location actually changed
          const currentLat = bus.currentLocation?.lat || 0;
          const currentLng = bus.currentLocation?.lng || 0;
          if (Math.abs(currentLat - locationUpdate.lat) > 0.00001 ||
            Math.abs(currentLng - locationUpdate.lng) > 0.00001) {
            return {
              ...bus,
              currentLocation: {
                ...(bus.currentLocation || {}),
                lat: locationUpdate.lat,
                lng: locationUpdate.lng,
                timestamp: new Date(locationUpdate.timestamp),
              } as any, // Cast to avoid strict type issues with optional
            };
          }
        }
        return bus;
      });
      return updated;
    });
  }, [busLocations]);

  useEffect(() => {
    if (!activeTripId) {
      setActiveTripPickup(null);
      return;
    }

    return subscribeToTrip(activeTripId, (trip) => {
      if (!trip) {
        setActiveTripPickup(null);
        return;
      }

      if (['completed', 'cancelled', 'rejected', 'expired'].includes(trip.status)) {
        setRequestStatus('idle');
        setHailedDriverId(null);
        setActiveTripId(null);
        setActiveTripPickup(null);
        return;
      }

      setActiveTripPickup({
        lat: trip.lat,
        lng: trip.lng,
        status: trip.status,
      });
    });
  }, [activeTripId]);

  // Proximity alarm is now handled by useProximityHandshake above.

  // Subscribe to this passenger's bookings in real-time
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToBookings(currentUser.uid, 'passenger', (list) => {
      const mapped = list.map((b) => ({
        ...b,
        timestamp: new Date(b.timestamp),
        pickupLocation: {
          ...b.pickupLocation,
          timestamp: new Date(b.pickupLocation.timestamp),
        },
        dropoffLocation: {
          ...b.dropoffLocation,
          timestamp: new Date(b.dropoffLocation.timestamp),
        },
        reservationExpiresAt: b.reservationExpiresAt
          ? new Date(b.reservationExpiresAt)
          : undefined,
      })) as Booking[];

      setBookings(mapped);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Request browser notification permission once when notifications are enabled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!notificationsEnabled) return;
    if (hasRequestedNotificationPermission) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().finally(() => {
        setHasRequestedNotificationPermission(true);
      });
    } else {
      setHasRequestedNotificationPermission(true);
    }
  }, [notificationsEnabled, hasRequestedNotificationPermission]);

  // Persist notification settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('notificationsEnabled', String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vibrationEnabled', String(vibrationEnabled));
  }, [vibrationEnabled]);

  // Proximity detection every 10 seconds for active bookings
  useEffect(() => {
    if (!notificationsEnabled) return;
    if (bookings.length === 0) return;

    const intervalId = window.setInterval(() => {
      // Focus on bookings that are pending or confirmed
      const activeBookings = bookings.filter((b) =>
        ['pending', 'confirmed'].includes(b.status)
      );
      if (activeBookings.length === 0) return;

      let highestLevel: ProximityLevel | null = null;

      activeBookings.forEach((booking) => {
        const bus = buses.find((b) => b.id === booking.busId && b.isActive);
        if (!bus || !booking.pickupLocation || !bus.currentLocation) return;

        const level = checkProximity(
          bus.currentLocation,
          booking.pickupLocation
        );
        if (!level) return;

        const distanceMeters = haversineDistance(
          bus.currentLocation.lat,
          bus.currentLocation.lng,
          booking.pickupLocation.lat,
          booking.pickupLocation.lng
        );

        // Track highest proximity level for map highlighting
        const levelPriority: Record<ProximityLevel, number> = {
          far: 0,
          approaching: 1,
          nearby: 2,
          arrived: 3,
        };

        if (!highestLevel || levelPriority[level] > levelPriority[highestLevel]) {
          highestLevel = level;
        }

        const lastLevel = lastNotificationByBooking[booking.id] ?? null;
        if (lastLevel === level) {
          return; // avoid duplicate notifications for same level
        }

        // Prepare vibration pattern (guarded)
        const vibrate = (pattern: number | number[]) => {
          if (!vibrationEnabled) return;
          if (typeof window === 'undefined') return;
          if (!('vibrate' in window.navigator)) return;
          try {
            window.navigator.vibrate(pattern);
          } catch {
            // ignore vibration errors
          }
        };

        // Show proximity notification using sonner
        if (level === 'approaching') {
          sonnerToast.custom(
            (id) => (
              <NotificationToast
                title="Bus approaching your area 🚌"
                message="Your bus is getting closer to your pickup point."
                distanceMeters={distanceMeters}
                onViewMap={() => {
                  setSelectedBus(bus);
                  sonnerToast.dismiss(id);
                }}
              />
            ),
            { duration: 5000 }
          );
        } else if (level === 'nearby') {
          vibrate(200);
          sonnerToast.custom(
            (id) => (
              <NotificationToast
                title="Bus is nearby! 🔔"
                message="Get ready to board, your bus is very close."
                distanceMeters={distanceMeters}
                onViewMap={() => {
                  setSelectedBus(bus);
                  sonnerToast.dismiss(id);
                }}
              />
            ),
            { duration: 5000 }
          );
        } else if (level === 'arrived') {
          vibrate([200, 100, 200, 100, 200]);
          sonnerToast.custom(
            (id) => (
              <NotificationToast
                title="Bus arriving NOW! 🎉"
                message="Your bus has reached your pickup location."
                distanceMeters={distanceMeters}
                onViewMap={() => {
                  setSelectedBus(bus);
                  sonnerToast.dismiss(id);
                }}
              />
            ),
            { duration: 5000 }
          );
        }

        setLastNotificationByBooking((prev) => ({
          ...prev,
          [booking.id]: level,
        }));
      });

      setPickupProximityLevel(highestLevel);
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    bookings,
    buses,
    notificationsEnabled,
    vibrationEnabled,
    lastNotificationByBooking,
  ]);

  const sendTripRequest = async (bus: Bus) => {
    const now = Date.now();
    const previous = lastTripRequestAtRef.current[bus.id] || 0;
    if (now - previous < 15000) return;

    const fallbackLocation = pickupLocation || userLocation;
    if (!fallbackLocation) return;

    lastTripRequestAtRef.current[bus.id] = now;

    const response = await fetch('/api/trip-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        busId: bus.id,
        pickupLocation: {
          lat: fallbackLocation.lat,
          lng: fallbackLocation.lng,
          address: pickupLocation?.address || 'Current Location',
        },
        ...(dropoffLocation ? {
          dropoffLocation: {
            lat: dropoffLocation.lat,
            lng: dropoffLocation.lng,
            address: dropoffLocation.address || 'Dropoff',
          },
        } : {}),
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data?.error || 'Failed to send trip request');
    }

    const data = await response.json();
    const trip = data?.tripRequest;
    if (trip?.id) {
      setActiveTripId(trip.id);
      setActiveTripPickup({
        lat: trip.lat,
        lng: trip.lng,
        status: trip.status,
      });
      setHailedDriverId(bus.id);
    }
  };

  const handleBusSelect = (bus: Bus) => {
    setSelectedBus(bus);
    setRequestStatus('requesting');
    setHailedDriverId(bus.id);

    sendTripRequest(bus)
      .then(() => {
        toast({
          title: 'Trip request sent',
          description: `Driver of ${bus.busNumber} has been notified.`,
        });
      })
      .catch((error) => {
        console.warn('[Passenger] Trip request failed:', error);
      });
  };

  const handleBookBus = async (bus: Bus, bookingData?: any) => {
    if (!pickupLocation) {
      toast({
        title: 'Select pickup location first',
        description: 'Please select pickup location on the map or use your current location.',
        variant: 'destructive',
      });
      return;
    }

    // For hailing, use pickup location as dropoff if not set
    const finalDropoffLocation = dropoffLocation || pickupLocation;

    // Check if bus can accommodate the booking
    const numberOfPassengers = bookingData?.numberOfPassengers || 1;
    if (!canAccommodateBooking(bus, numberOfPassengers)) {
      toast({
        title: 'Not enough seats available',
        description: `This bus only has ${bus.availableSeats} seats available. You requested ${numberOfPassengers}.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setBookingLoading(true);

      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingData: {
            busId: bus.id,
            passengerName: bookingData?.passengerName || 'Passenger',
            phoneNumber: bookingData?.phoneNumber || 'N/A',
            email: bookingData?.email || '',
            pickupLocation: {
              ...pickupLocation,
              address: pickupLocation.address || 'Pickup Location',
            },
            dropoffLocation: {
              ...finalDropoffLocation,
              address: finalDropoffLocation.address || (dropoffLocation ? 'Dropoff Location' : 'Same as Pickup'),
            },
            numberOfPassengers,
            notes: bookingData?.notes || '',
            paymentMethod: bookingData?.paymentMethod || 'cash',
            vehicleType: bus.vehicleType,
            status: bookingData?.status || 'pending',
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create booking');
      }

      const created = data.booking as Booking;

      const bookingWithDate: Booking = {
        ...created,
        timestamp: new Date(created.timestamp),
        pickupLocation: {
          ...created.pickupLocation,
          timestamp: new Date(created.pickupLocation.timestamp),
        },
        dropoffLocation: {
          ...created.dropoffLocation,
          timestamp: new Date(created.dropoffLocation.timestamp),
        },
        reservationExpiresAt: created.reservationExpiresAt
          ? new Date(created.reservationExpiresAt)
          : undefined,
      } as Booking;

      setBookings((prev) => [...prev, bookingWithDate]);
      setSelectedBus(null);
      setPickupLocation(null);
      setDropoffLocation(null);
      setRequestStatus('on-trip');

      toast({
        title: 'Booking confirmed',
        description: `You have successfully booked ${bus.busNumber}.`,
      });
    } catch (error) {
      console.error('Booking error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to create booking. Please try again.';
      toast({
        title: 'Booking failed',
        description: message,
        variant: 'destructive',
      });
      setRequestStatus('idle');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleLocationSelect = (location: { lat: number; lng: number }) => {
    // Simple address generation for demo
    const address = `Location (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;

    if (!pickupLocation) {
      setPickupLocation({ ...location, address });
    } else if (!dropoffLocation) {
      setDropoffLocation({ ...location, address });
    } else {
      setPickupLocation({ ...location, address });
      setDropoffLocation(null);
    }
  };

  const handleResetLocations = () => {
    setPickupLocation(null);
    setDropoffLocation(null);
    setRequestStatus('idle');
    setHailedDriverId(null);
    setActiveTripId(null);
    setActiveTripPickup(null);
  };

  const filteredBuses = buses.filter((bus) =>
    vehicleFilter === 'all' ? bus.isActive : (bus.isActive && bus.vehicleType === vehicleFilter)
  );

  // Auth guard
  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        router.replace('/auth?redirect=/passenger');
      } else if (role && role !== 'passenger') {
        router.replace('/driver');
      }
    }
  }, [currentUser, role, loading, router]);

  if (loading || !currentUser || (role && role !== 'passenger')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex flex-col">
        {/* Skeleton Header */}
        <div className="h-16 border-b border-slate-800 bg-slate-950/80 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-16 h-3" />
            </div>
          </div>
          <Skeleton className="w-9 h-9 rounded-full" />
        </div>

        {/* Skeleton Map */}
        <div className="w-full h-[65vh] relative bg-slate-900">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-ping"></div>
                <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl w-full h-full flex items-center justify-center shadow-2xl shadow-cyan-500/50">
                  <Navigation className="w-10 h-10 text-white animate-pulse" />
                </div>
              </div>
              <p className="text-slate-400 text-lg font-medium">Locating nearby buses...</p>
            </div>
          </div>
        </div>

        {/* Skeleton Content */}
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="w-32 h-6" />
          <Skeleton className="w-full h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  // --- UI Render ---
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {showRideHereAlert && (
        <div className="fixed inset-0 z-[1200] bg-emerald-600/95 flex flex-col items-center justify-center text-white px-6 text-center">
          <p className="text-4xl font-extrabold tracking-wide">YOUR RIDE IS HERE</p>
          <p className="mt-3 text-sm opacity-90">Your driver is within 10 meters.</p>
          <Button
            className="mt-8 bg-white text-emerald-700 hover:bg-white/90 font-bold"
            onClick={() => setShowRideHereAlert(false)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* 1. Header (Hero Section) */}
      <div className="relative z-10 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/60 px-4 pt-6 pb-4">
        <div className="mx-auto grid max-w-[1600px] gap-5 lg:grid-cols-[1.55fr_0.95fr] items-start">
          <div className="rounded-[2rem] border border-slate-800/70 bg-slate-900/95 shadow-[0_30px_80px_-50px_rgba(6,182,212,0.35)] p-6 lg:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                  Passenger dashboard
                </span>
                <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                  Find the best ride in minutes
                </h1>
                <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
                  Live route tracking, instant ride requests, and smart pickup matching from your location.
                </p>
              </div>

              <div className="grid gap-3 w-full sm:w-auto sm:grid-cols-1">
                <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-4 shadow-lg shadow-cyan-500/10">
                  <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Active routes</p>
                  <p className="mt-3 text-3xl font-extrabold text-white">{filteredBuses.length}</p>
                  <p className="mt-2 text-sm text-slate-400">Nearby buses available now</p>
                </div>
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Ride readiness</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {requestStatus === 'requesting'
                      ? 'Awaiting driver'
                      : requestStatus === 'on-trip'
                        ? 'Ride in progress'
                        : 'Ready to hail'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current request</p>
                <p className="mt-4 text-2xl font-semibold text-white">
                  {requestStatus === 'requesting'
                    ? 'Awaiting driver'
                    : requestStatus === 'on-trip'
                      ? 'On route'
                      : 'Ready'}
                </p>
                <p className="mt-2 text-sm text-slate-400">{hailedDriverId ? `Driver ${hailedDriverId} notified` : 'Select a route to hail'}</p>
              </div>

              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pickup status</p>
                <p className="mt-4 text-2xl font-semibold text-white">
                  {pickupProximityLevel ? pickupProximityLevel : 'Watching location'}
                </p>
                <p className="mt-2 text-sm text-slate-400">Live geofence updates for your pickup point</p>
              </div>

              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live ETA</p>
                <p className="mt-4 text-2xl font-semibold text-white">
                  {selectedBus && busETAs[selectedBus.id] != null ? `${Math.round(busETAs[selectedBus.id] ?? 0)} min` : 'Select a route'}
                </p>
                <p className="mt-2 text-sm text-slate-400">ETA updates appear after bus selection</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800/70 bg-slate-900/90 p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.8)] lg:max-w-[360px]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
                  {userData?.name ? userData.name[0].toUpperCase() : <div className="h-4 w-4 rounded-full animate-pulse bg-cyan-400" />}
                </div>
                <div>
                  <p className="text-sm text-slate-400">Good day,</p>
                  <p className="text-2xl font-black text-white">{userData?.name ?? 'Passenger'}</p>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="w-12 h-12 rounded-full border border-cyan-500/50 bg-slate-900 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsDrawerOpen(true);
                }}
              >
                {userData?.name ? (
                  <span className="text-sm font-black text-cyan-400">{userData.name[0].toUpperCase()}</span>
                ) : (
                  <div className="h-4 w-4 rounded-full animate-spin border-2 border-cyan-400 border-t-transparent" />
                )}
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ride summary</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {selectedBus ? `Ready to hail ${selectedBus.busNumber}` : 'Choose a route to start'}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-800/60 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Action tips</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-400 list-disc list-inside">
                  <li>Search a pickup point</li>
                  <li>Select a nearby bus</li>
                  <li>Tap HAIL to request your ride</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <DetailedBookingModal />
              <Button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsDrawerOpen(true);
                }}
                className="flex-1"
              >
                Open profile panel
              </Button>
            </div>
          </div>
        </div>

        {/* Search Bar with magnifying glass */}
        <div className="mt-4 px-1 relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <div className="pl-8">
            <LocationSearch
              onLocationSelect={handleLocationSelect}
              placeholder="Search destination or pickup..."
            />
          </div>
        </div>

        {/* Filters Row */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <Button
            size="sm"
            variant={vehicleFilter === 'all' ? 'default' : 'secondary'}
            className={`h-7 rounded-full text-xs border ${vehicleFilter === 'all'
              ? 'bg-slate-800 border-slate-600 text-white'
              : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:bg-slate-800'}`}
            onClick={() => setVehicleFilter('all')}
          >
            All
          </Button>
          {VEHICLE_TYPES.map(type => (
            <Button
              key={type.id}
              size="sm"
              variant={vehicleFilter === type.id ? 'default' : 'secondary'}
              className={`h-7 rounded-full text-xs border flex items-center gap-1.5 ${vehicleFilter === type.id
                ? 'bg-slate-800 border-slate-600 text-white'
                : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:bg-slate-800'}`}
              onClick={() => setVehicleFilter(type.id)}
            >
              <span>{type.icon}</span>
              <span>{type.name}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="glass-3d floating-chip border border-cyan-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-cyan-300">Nearby transit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{filteredBuses.length}</div>
              <p className="text-xs text-slate-400">Active buses near you</p>
              <div className="text-[11px] text-slate-500">Tap a bus to hail its route.</div>
            </CardContent>
          </Card>

          <Card className="glass-3d floating-chip border border-slate-700/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-slate-400">Ride requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{requestStatus === 'requesting' ? 'Awaiting driver' : requestStatus === 'on-trip' ? 'On route' : 'Ready'}</div>
              <p className="text-xs text-slate-400">Current trip status</p>
              <div className="text-[11px] text-slate-500">{hailedDriverId ? `Driver ${hailedDriverId} notified` : 'No driver hailed yet'}</div>
            </CardContent>
          </Card>

          <Card className="glass-3d floating-chip border border-purple-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-[0.24em] text-purple-300">Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold text-white">{showRideHereAlert ? 'Ride arrived' : 'Smooth ride'}</div>
              <p className="text-xs text-slate-400">Pickup proximity</p>
              <div className="text-[11px] text-slate-500">{pickupProximityLevel ? pickupProximityLevel : 'Watching location'}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 2. Map Section (Priority View) */}
      <div className="relative w-full shrink-0 p-4">
        <Card className="glass-3d overflow-hidden border border-cyan-500/15 shadow-[0_45px_120px_-85px_rgba(0,242,255,0.25)]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),transparent_35%)]" />
          <div className="relative h-[65vh] min-h-[360px]">
            <MapWrapper
              role="passenger"
              buses={filteredBuses}
              selectedBus={selectedBus}
              onBusSelect={handleBusSelect}
              onLocationSelect={handleLocationSelect}
              showRoute={!!selectedBus}
              pickupLocation={pickupLocation}
              dropoffLocation={dropoffLocation}
              pickupProximityLevel={pickupProximityLevel}
              userLocation={userLocation}
              busETAs={busETAs}
              busLocations={busLocations}
              requestStatus={requestStatus}
              hailedDriverId={hailedDriverId}
              activeTripId={activeTripId}
            />
          </div>
        </Card>

        {/* Floating Action Button for Hailing (Overlaid on Map) */}
        {selectedBus && !pickupLocation && (
          <div className="absolute bottom-4 left-4 right-4 z-[400] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <Button
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
              onClick={() => {
                if (userLocation) {
                  setPickupLocation({
                    lat: userLocation.lat,
                    lng: userLocation.lng,
                    address: 'Current Location'
                  });
                  setRequestStatus('requesting'); // 🚀 Flip to requesting so driver sees us
                } else {
                  toast({ title: "Waiting for location...", variant: "default" });
                }
              }}
            >
              <Navigation className="w-5 h-5 fill-current" />
              HAIL {selectedBus.busNumber} NOW
            </Button>
          </div>
        )}
      </div>

      {/* 3. Scrollable Content (Below Map) */}
      <div className="flex-1 bg-slate-950 p-4 space-y-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.85fr]">
          <Card className="glass-3d border border-slate-800/60 overflow-hidden">
            <CardHeader className="px-5 py-4 border-b border-slate-800/60">
              <CardTitle className="text-lg font-bold text-white">Wallet & settings</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <WalletSettings />
            </CardContent>
          </Card>

          <Card className="glass-3d border border-slate-800/60 overflow-hidden">
            <CardHeader className="px-5 py-4 border-b border-slate-800/60">
              <CardTitle className="text-lg font-bold text-white">Quick ride summary</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-slate-300">
              <div className="rounded-3xl bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Current request</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {requestStatus === 'requesting'
                    ? 'Awaiting driver acceptance'
                    : requestStatus === 'on-trip'
                      ? 'Ride is in progress'
                      : 'No active request'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Driver status</p>
                <p className="mt-2 text-sm text-white">
                  {hailedDriverId ? `Driver ${hailedDriverId} is on the way` : 'Select a bus to hail'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Nearby bus ETA</p>
                <p className="mt-2 text-sm text-white">
                  {selectedBus && busETAs[selectedBus.id] != null ? `${Math.round(busETAs[selectedBus.id] ?? 0)} min` : 'Waiting for live ETA'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-3d border border-slate-800/60 overflow-hidden">
          <CardHeader className="px-5 py-4 border-b border-slate-800/60">
            <CardTitle className="text-lg font-bold text-white">Ride details</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <BookingPanel
              pickupLocation={pickupLocation}
              dropoffLocation={dropoffLocation}
              selectedBus={selectedBus}
              onBook={handleBookBus}
              onReset={handleResetLocations}
              loading={bookingLoading}
            />
          </CardContent>
        </Card>

        <Card className="glass-3d border border-slate-800/60 overflow-hidden">
          <CardHeader className="px-5 py-4 border-b border-slate-800/60">
            <CardTitle className="text-lg font-bold text-white">Ride history</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <TripHistory />
          </CardContent>
        </Card>

        {!selectedBus && (
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-3d border border-slate-800/50 p-4 rounded-3xl flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-slate-300">1. Tap Bus</span>
            </div>
            <div className="glass-3d border border-slate-800/50 p-4 rounded-3xl flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-slate-300">2. Hail</span>
            </div>
            <div className="glass-3d border border-slate-800/50 p-4 rounded-3xl flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-slate-300">3. Ride</span>
            </div>
          </div>
        )}

        <div className="h-8"></div>
      </div>
      <YatraProfileDrawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen} />
    </div>
  );
}

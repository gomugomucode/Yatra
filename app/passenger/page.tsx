'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import BookingPanel from '@/components/passenger/BookingPanel';
import WalletSettings from '@/components/passenger/WalletSettings';
import TripHistory from '@/components/passenger/TripHistory';
import { Button } from '@/components/ui/button';
import { Bus, Booking, Location, VehicleTypeId, RequestStatus } from '@/lib/types';

const NEARBY_DRIVER_RADIUS_KM = 10;
import { VEHICLE_TYPES, DEFAULT_LOCATION } from '@/lib/constants';
import {
  MapPin,
  Ticket,
  Navigation,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import MapWrapper from '@/components/map/MapWrapper';
import { subscribeToBuses, subscribeToBookings, subscribeToBusLocation, subscribeToTrip, updateTripStatus, publishTripLocation, cleanupTripLocation, submitTripRating } from '@/lib/firebaseDb';
import TripRatingModal from '@/components/shared/TripRatingModal';
import { isWithinRadius } from '@/lib/utils/geofencing';
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

interface PassengerBookingData {
  passengerName?: string;
  phoneNumber?: string;
  email?: string;
  numberOfPassengers?: number;
  notes?: string;
  paymentMethod?: 'cash' | 'digital';
  status?: string;
}

export default function PassengerDashboard() {
  const router = useRouter();
  const { currentUser, role, loading, userData } = useAuth();
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
  const [notificationsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('notificationsEnabled');
    return stored ? stored === 'true' : true;
  });
  const [vibrationEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('vibrationEnabled');
    return stored ? stored === 'true' : true;
  });
  const [hasRequestedNotificationPermission, setHasRequestedNotificationPermission] =
    useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [etaToPickup, setEtaToPickup] = useState<number | null>(null);
  const [etaToDestination, setEtaToDestination] = useState<number | null>(null);
  const [activeRoute, setActiveRoute] = useState<GeoJSON.LineString | null>(null);
  const lastEtaFetchRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationPublishIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hailedDriverId, setHailedDriverId] = useState<string | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeTripPickup, setActiveTripPickup] = useState<{ lat: number; lng: number; status: string } | null>(null);
  const [showRideHereAlert, setShowRideHereAlert] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingTripId, setRatingTripId] = useState<string | null>(null);
  const [ratingDriverName, setRatingDriverName] = useState<string>('');
  const hasLocationErrorRef = useRef(false);
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
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
        userLocationRef.current = loc;
        setUserLocation(loc);

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
        if (!hasLocationErrorRef.current) {
          hasLocationErrorRef.current = true;
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
  }, [toast]);

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
  const targetBuses = useMemo(
    () => hailedDriverId
      ? buses.filter((bus) => bus.id === hailedDriverId && bus.isActive)
      : buses.filter((bus) => bus.isActive),
    [buses, hailedDriverId]
  );
  const selectedBusId = selectedBus?.id ?? null;
  const selectedDriverName = selectedBus?.driverName ?? '';

  useEffect(() => {
    console.log('[PASSENGER] Setting up location listeners for active buses');

    const unsubscribes: (() => void)[] = [];

    if (hailedDriverId) {
      setBusLocations((prev) => {
        const focused = prev[hailedDriverId];
        return focused ? { [hailedDriverId]: focused } : {};
      });
    }

    targetBuses.forEach(bus => {
      if (bus.isActive) {
        console.log('[PASSENGER] Subscribing to bus location:', bus.id);

        const unsubscribe = subscribeToBusLocation(bus.id, (location) => {
          if (location) {
            setBusLocations(prev => ({
              ...prev,
              [bus.id]: location,
            }));

            // Calculate ETA only if user location is available AND this is the selected bus
            if (userLocation && selectedBusId === bus.id) {
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
      console.log('[PASSENGER] Cleaning up location listeners');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [activeBusIds, hailedDriverId, selectedBusId, targetBuses, userLocation]);

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
                lat: locationUpdate.lat,
                lng: locationUpdate.lng,
                address: bus.currentLocation?.address,
                timestamp: new Date(locationUpdate.timestamp),
              } as Location,
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
        cleanupTripLocation(activeTripId).catch(console.warn);
        if (trip.status === 'completed' && selectedDriverName) {
          setRatingTripId(activeTripId);
          setRatingDriverName(selectedDriverName);
          setShowRatingModal(true);
        }
        setRequestStatus('idle');
        setHailedDriverId(null);
        setActiveTripId(null);
        setActiveTripPickup(null);
        return;
      }

      if (trip.status === 'accepted') {
        setRequestStatus('accepted');
        toast({ title: 'Driver accepted!', description: 'Your driver is on the way.' });
      } else if (trip.status === 'active') setRequestStatus('on-trip');

      setActiveTripPickup({
        lat: trip.lat,
        lng: trip.lng,
        status: trip.status,
      });
    });
  }, [activeTripId, selectedDriverName, toast]);

  // Publish passenger location to tripLocations only after driver accepts
  useEffect(() => {
    const status = activeTripPickup?.status;
    const tripId = activeTripId;
    if (!tripId || !['accepted', 'arrived', 'active'].includes(status ?? '')) {
      if (locationPublishIntervalRef.current) {
        clearInterval(locationPublishIntervalRef.current);
        locationPublishIntervalRef.current = null;
      }
      return;
    }
    locationPublishIntervalRef.current = setInterval(() => {
      const loc = userLocationRef.current;
      if (loc) {
        publishTripLocation(tripId, 'passenger', loc.lat, loc.lng)
          .catch((err) => console.warn('[passenger publish location]', err));
      }
    }, 3000);
    return () => {
      if (locationPublishIntervalRef.current) {
        clearInterval(locationPublishIntervalRef.current);
        locationPublishIntervalRef.current = null;
      }
    };
  }, [activeTripPickup?.status, activeTripId]);

  // Cleanup tripLocations when trip ends
  useEffect(() => {
    const status = activeTripPickup?.status;
    if (activeTripId && ['completed', 'cancelled', 'rejected', 'expired'].includes(status ?? '')) {
      cleanupTripLocation(activeTripId).catch(console.warn);
      setEtaToPickup(null);
      setEtaToDestination(null);
      setActiveRoute(null);
      lastEtaFetchRef.current = null;
    }
  }, [activeTripPickup?.status, activeTripId]);

  // 5-minute passenger-side request timeout
  useEffect(() => {
    if (requestStatus === 'requesting' && activeTripId) {
      requestTimeoutRef.current = setTimeout(async () => {
        await updateTripStatus(activeTripId, 'expired');
        cleanupTripLocation(activeTripId).catch(console.warn);
        setRequestStatus('idle');
        setSelectedBus(null);
        setHailedDriverId(null);
        setActiveTripId(null);
        toast({ variant: 'destructive', title: 'Request timed out', description: 'No driver responded.' });
      }, 5 * 60 * 1000);
    } else {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    }
    return () => {
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    };
  }, [requestStatus, activeTripId, toast]);

  // Two-phase ETA: fetch OSRM route from driver position to pickup/destination
  useEffect(() => {
    const trip = activeTripPickup;
    if (!trip || !hailedDriverId) {
      setEtaToPickup(null);
      setEtaToDestination(null);
      setActiveRoute(null);
      return;
    }
    if (!['accepted', 'arrived', 'active'].includes(trip.status)) return;

    const driverPos = busLocations[hailedDriverId];
    if (!driverPos) return;

    const last = lastEtaFetchRef.current;
    if (
      last &&
      Math.abs(last.lat - driverPos.lat) < 0.0001 &&
      Math.abs(last.lng - driverPos.lng) < 0.0001
    ) return;

    lastEtaFetchRef.current = { lat: driverPos.lat, lng: driverPos.lng };

    const fetchEta = async () => {
      try {
        const { getRoute } = await import('@/lib/routing/osrm');
        const isActive = trip.status === 'active';
        const target = isActive ? dropoffLocation : pickupLocation;
        if (!target) return;

        const result = await getRoute(driverPos.lat, driverPos.lng, target.lat, target.lng);

        if (result) {
          if (isActive) {
            setEtaToDestination(Math.ceil(result.duration));
            setEtaToPickup(null);
          } else {
            setEtaToPickup(Math.ceil(result.duration));
            setEtaToDestination(null);
          }
          if (result.geometry) setActiveRoute(result.geometry);
        }
      } catch (err) {
        console.warn('[ETA fetch failed]', err);
      }
    };

    fetchEta();
    const interval = setInterval(fetchEta, 30_000);
    return () => clearInterval(interval);
  }, [activeTripPickup, busLocations, hailedDriverId, pickupLocation, dropoffLocation]);

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

  // HAILING FLOW (on-demand)
  const handleBusSelect = async (bus: Bus) => {
    if (!userLocation) {
      toast({ variant: 'destructive', title: 'Enable location', description: 'Grant location permission to request a ride.' });
      return;
    }
    if (!pickupLocation) {
      setSelectedBus(bus);
      toast({ title: 'Set your pickup point', description: 'Tap the map to set your pickup point, or use your current location.' });
      return;
    }
    setSelectedBus(bus);
    try {
      await sendTripRequest(bus);
      setHailedDriverId(bus.id);
      setRequestStatus('requesting');
      toast({ title: 'Trip request sent', description: `Driver of ${bus.busNumber} has been notified.` });
    } catch (error) {
      console.warn('[Passenger] Trip request failed:', error);
      toast({ variant: 'destructive', title: 'Request failed', description: 'Please try again.' });
      setSelectedBus(null);
    }
  };

  // BOOKING FLOW (seat reservation)
  const handleBookBus = async (bus: Bus, bookingData?: PassengerBookingData) => {
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

  const handleCancelRequest = async () => {
    if (!activeTripId) return;
    await updateTripStatus(activeTripId, 'cancelled');
    cleanupTripLocation(activeTripId).catch(console.warn);
    setRequestStatus('idle');
    setSelectedBus(null);
    setHailedDriverId(null);
    setActiveTripId(null);
    setActiveTripPickup(null);
    toast({ title: 'Request cancelled' });
  };

  const locationPending = !userLocation;

  const filteredBuses = useMemo(() => {
    if (!userLocation) return [];
    return buses.filter((bus) => {
      if (!bus.isActive) return false;
      if (vehicleFilter !== 'all' && bus.vehicleType !== vehicleFilter) return false;
      if (!bus.currentLocation) return false;
      return isWithinRadius(bus.currentLocation, userLocation, NEARBY_DRIVER_RADIUS_KM);
    });
  }, [buses, userLocation, vehicleFilter]);

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

      {/* 1. Header (Sticky Top) */}
      <div className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/60 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Animated Brand */}
          <div className="flex items-center gap-3">
            {/* Animated Bus SVG Logo */}
            <div className="relative w-10 h-10 flex items-center justify-center">
              <svg
                viewBox="0 0 40 40"
                className="w-10 h-10"
                xmlns="http://www.w3.org/2000/svg"
                style={{ overflow: 'visible' }}
              >
                {/* Pulsing glow ring */}
                <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1.5">
                  <animate attributeName="r" values="17;20;17" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0.15;0.6" dur="2.5s" repeatCount="indefinite" />
                </circle>
                {/* Bus body */}
                <g>
                  {/* Animated forward motion */}
                  <animateTransform attributeName="transform" attributeType="XML" type="translate"
                    values="0,0;2,0;0,0" dur="1.8s" repeatCount="indefinite" />
                  {/* Bus body rect */}
                  <rect x="6" y="14" width="26" height="14" rx="3" fill="#0e7490" />
                  {/* Roof accent */}
                  <rect x="8" y="12" width="22" height="4" rx="2" fill="#06b6d4" />
                  {/* Windows */}
                  <rect x="9" y="16" width="5" height="5" rx="1" fill="#e0f9ff" opacity="0.9" />
                  <rect x="16" y="16" width="5" height="5" rx="1" fill="#e0f9ff" opacity="0.9" />
                  <rect x="23" y="16" width="5" height="5" rx="1" fill="#e0f9ff" opacity="0.9" />
                  {/* Front headlight */}
                  <rect x="30" y="18" width="3" height="3" rx="1" fill="#fde68a" opacity="0.9">
                    <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.4s" repeatCount="indefinite" />
                  </rect>
                  {/* Wheels */}
                  <circle cx="13" cy="29" r="3.5" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
                  <circle cx="25" cy="29" r="3.5" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
                  {/* Wheel spin dots */}
                  <circle cx="13" cy="27" r="1" fill="#06b6d4">
                    <animateTransform attributeName="transform" type="rotate" from="0 13 29" to="360 13 29" dur="0.6s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="25" cy="27" r="1" fill="#06b6d4">
                    <animateTransform attributeName="transform" type="rotate" from="0 25 29" to="360 25 29" dur="0.6s" repeatCount="indefinite" />
                  </circle>
                  {/* Road dashes */}
                  <rect x="4" y="33" width="6" height="1.5" rx="0.75" fill="#334155" />
                  <rect x="14" y="33" width="6" height="1.5" rx="0.75" fill="#334155" />
                  <rect x="24" y="33" width="6" height="1.5" rx="0.75" fill="#334155" />
                </g>
              </svg>
            </div>

            {/* App Name + Status */}
            <div>
              <h1
                className="text-[22px] font-extrabold leading-none tracking-wide"
                style={{
                  fontFamily: 'var(--font-mukta), sans-serif',
                  background: 'linear-gradient(135deg, #ffffff 30%, #67e8f9 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.4))',
                }}
              >
                यात्री

              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] text-cyan-300 font-semibold tracking-wide">
                  {buses.filter(b => b.isActive).length} Active
                </span>
              </div>
            </div>
          </div>

          {/* Right section - Actions */}
          <div className="flex items-center gap-3 relative z-[100] pointer-events-auto">
            <DetailedBookingModal />

            {/* STABLE AVATAR LOGIC */}
            <Button
              variant="outline"
              size="icon"
              className="w-10 h-10 rounded-full bg-slate-900 border-2 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
              onClick={() => setIsDrawerOpen(true)}
            >
              {/* Check if userData and the initial exist. 
       If it's still loading, show a loading spinner or the 'Y' anyway 
       instead of jumping to the logout door.
    */}
              {userData?.name ? (
                <span className="text-sm font-black text-cyan-400">
                  {userData.name[0].toUpperCase()}
                </span>
              ) : (
                <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              )}
            </Button>

            <YatraProfileDrawer
              open={isDrawerOpen}
              onOpenChange={setIsDrawerOpen}
            />
          </div>
        </div>

        {/* Search Bar with magnifying glass */}
        <div className="mt-3 px-1 relative">
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

      {/* Visually-hidden live region — announces trip status to screen readers */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {requestStatus === 'requesting' && 'Waiting for driver to accept your request.'}
        {requestStatus === 'accepted' && 'Driver accepted. Your driver is on the way.'}
        {requestStatus === 'on-trip' && 'Trip in progress. Navigating to your destination.'}
        {requestStatus === 'idle' && activeTripPickup === null && ''}
      </div>

      {/* 2. Map Section (Priority View) */}
      <div className="relative w-full h-[65vh] shrink-0 border-b border-slate-800">
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
          activeRoute={activeRoute}
          routePhase={etaToDestination !== null ? 'trip' : etaToPickup !== null ? 'pickup' : null}
        />

        {/* ETA overlay card */}
        {(etaToPickup !== null || etaToDestination !== null) && (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-sm"
            style={{ background: etaToDestination !== null ? '#1d4ed8cc' : '#059669cc' }}
          >
            <span className="text-lg" aria-hidden="true">{etaToDestination !== null ? '🏁' : '🚗'}</span>
            <span className="text-white text-sm font-medium">
              {etaToDestination !== null
                ? `${etaToDestination} min to destination`
                : `${etaToPickup} min to pickup`}
            </span>
          </div>
        )}

        {/* Pickup guide — shown when a driver is selected but no pickup set */}
        {selectedBus && !pickupLocation && requestStatus === 'idle' && (
          <div className="absolute bottom-4 left-4 right-4 z-[400] bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3 text-sm shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
            <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <span className="text-slate-300 flex-1">Tap the map to set your pickup point, or use your current location</span>
            <Button size="sm" variant="outline" className="text-xs shrink-0"
              onClick={() => {
                if (userLocation) {
                  setPickupLocation({ lat: userLocation.lat, lng: userLocation.lng, address: 'Current Location' });
                } else {
                  toast({ title: 'Waiting for location...' });
                }
              }}>
              Use my location
            </Button>
          </div>
        )}

        {/* HAIL button — only shown when driver AND pickup are both set */}
        {selectedBus && pickupLocation && requestStatus === 'idle' && (
          <div className="absolute bottom-4 left-4 right-4 z-[400] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <Button
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
              onClick={() => handleBusSelect(selectedBus)}
            >
              <Navigation className="w-5 h-5 fill-current" />
              HAIL {selectedBus.busNumber} NOW
            </Button>
          </div>
        )}

        {/* Waiting banner — shown while request is pending, with cancel button */}
        {requestStatus === 'requesting' && (
          <div className="absolute bottom-4 left-4 right-4 z-[400] bg-slate-900/95 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-amber-200 text-sm font-medium flex-1">Waiting for driver to accept…</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0 px-2"
              onClick={handleCancelRequest}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <TripRatingModal
        open={showRatingModal}
        role="passenger"
        targetName={ratingDriverName}
        onSubmit={async (stars, comment) => {
          if (ratingTripId) {
            await submitTripRating(ratingTripId, 'passenger', stars, comment);
          }
          setShowRatingModal(false);
          setRatingTripId(null);
        }}
        onSkip={() => {
          setShowRatingModal(false);
          setRatingTripId(null);
        }}
      />

      {/* 3. Scrollable Content (Below Map) */}
      <div className="flex-1 bg-slate-950 p-4 space-y-6">

        {/* Active Trip Card — replaces all other content during an active trip */}
        {requestStatus !== 'idle' ? (
          <div className="space-y-3">
            {/* Status header */}
            <div className={`rounded-2xl border p-4 space-y-3 ${
              requestStatus === 'requesting'
                ? 'bg-amber-500/5 border-amber-500/20'
                : requestStatus === 'accepted'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-blue-500/5 border-blue-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    requestStatus === 'requesting' ? 'bg-amber-400'
                    : requestStatus === 'accepted' ? 'bg-emerald-400'
                    : 'bg-blue-400'
                  }`} />
                  <span className={`text-sm font-bold ${
                    requestStatus === 'requesting' ? 'text-amber-300'
                    : requestStatus === 'accepted' ? 'text-emerald-300'
                    : 'text-blue-300'
                  }`}>
                    {requestStatus === 'requesting' && 'Waiting for driver…'}
                    {requestStatus === 'accepted' && 'Driver on the way'}
                    {requestStatus === 'on-trip' && 'Trip in progress'}
                  </span>
                </div>
                {(etaToPickup !== null || etaToDestination !== null) && (
                  <span className="text-xs font-semibold text-white bg-slate-700/60 px-2.5 py-1 rounded-full">
                    {etaToPickup !== null ? `${etaToPickup} min` : `${etaToDestination} min`}
                  </span>
                )}
              </div>

              {selectedBus && (
                <div className="flex items-center gap-3 pt-1 border-t border-slate-700/40">
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-base">
                    {selectedBus.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{selectedBus.driverName}</p>
                    <p className="text-xs text-slate-400">{selectedBus.busNumber} · {selectedBus.vehicleType}</p>
                  </div>
                  {requestStatus === 'requesting' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                      onClick={handleCancelRequest}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}

              {pickupLocation && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{pickupLocation.address ?? `${pickupLocation.lat.toFixed(4)}, ${pickupLocation.lng.toFixed(4)}`}</span>
                </div>
              )}
              {dropoffLocation && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Navigation className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{dropoffLocation.address ?? `${dropoffLocation.lat.toFixed(4)}, ${dropoffLocation.lng.toFixed(4)}`}</span>
                </div>
              )}
            </div>

            {/* Trip history still accessible during trip */}
            <div id="trip-history">
              <TripHistory />
            </div>
          </div>
        ) : (
          <>
            {/* Location / nearby driver status */}
            {locationPending ? (
              <div className="flex flex-col items-center justify-center h-16 gap-2 text-muted-foreground">
                <MapPin className="w-5 h-5 animate-pulse text-slate-500" />
                <p className="text-xs text-center text-slate-500">Grant location permission to see nearby drivers</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                {filteredBuses.length} driver{filteredBuses.length !== 1 ? 's' : ''} within {NEARBY_DRIVER_RADIUS_KM}km
              </p>
            )}

            {/* Wallet Settings */}
            <WalletSettings />

            {/* Booking Panel */}
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-blue-400" />
                Ride Details
              </h2>
              <BookingPanel
                pickupLocation={pickupLocation}
                dropoffLocation={dropoffLocation}
                selectedBus={selectedBus}
                onBook={handleBookBus}
                onReset={handleResetLocations}
                loading={bookingLoading}
              />
            </div>

            {/* Trip History & NFT Receipts */}
            <div id="trip-history">
              <TripHistory />
            </div>

            {/* Instructions / Tips */}
            {!selectedBus && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex flex-col items-center text-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">1. Tap Bus</span>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex flex-col items-center text-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Navigation className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">2. Hail</span>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex flex-col items-center text-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">3. Ride</span>
                </div>
              </div>
            )}

            {/* Bottom Padding for scrolling */}
            <div className="h-8" />
          </>
        )}
      </div>
    </div>
  );
}

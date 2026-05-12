import { VehicleTypeId } from '@/lib/types';
import { VEHICLE_TYPE_MAP } from '@/lib/constants';

/**
 * Calculate the distance between two points using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Realistic pricing constants for Butwal, Nepal
 */
const BASE_RATE_PER_KM = 22;    // NPR per km
const BOOKING_FEE = 15;         // Fixed service charge

/**
 * Calculate fare based on distance, vehicle type, and passengers
 * Rule: 1 passenger = base fare. 
 * If passengers > 1, base fare is multiplied by passenger count.
 */
export function calculateFare(
  distanceKm: number,
  vehicleType: VehicleTypeId,
  numberOfPassengers: number = 1
): number {
  const vehicle = VEHICLE_TYPE_MAP[vehicleType];
  if (!vehicle) {
    throw new Error(`Invalid vehicle type: ${vehicleType}`);
  }

  // 1. Calculate distance-based base fare for ONE passenger
  const baseDistanceFare = distanceKm * BASE_RATE_PER_KM * vehicle.fareMultiplier;

  // 2. Apply passenger multiplier (New Rule: Multiply base fare by number of passengers)
  let totalFare = baseDistanceFare * Math.max(1, numberOfPassengers);

  // 3. Add base booking fee
  totalFare += BOOKING_FEE;

  // 4. Always round UP to the next 5 (NPR standard)
  totalFare = Math.ceil(totalFare / 5) * 5;

  return totalFare;
}

/**
 * Calculate fare from two locations with optional OSRM distance
 */
export function calculateFareFromLocations(
  pickupLocation: { lat: number; lng: number },
  dropoffLocation: { lat: number; lng: number },
  vehicleType: VehicleTypeId,
  numberOfPassengers: number = 1,
  osrmDistance?: number // Distance in KM
): number {
  // Use OSRM distance if provided, otherwise fallback to Haversine
  const distance = osrmDistance ?? calculateDistance(
    pickupLocation.lat,
    pickupLocation.lng,
    dropoffLocation.lat,
    dropoffLocation.lng
  );

  return calculateFare(distance, vehicleType, numberOfPassengers);
}



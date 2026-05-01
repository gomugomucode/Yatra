import { TripStatus } from '@/lib/types';

export const TRIP_ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  requested: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['arrived', 'cancelled', 'expired'],
  arrived: ['active', 'cancelled', 'expired'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
  expired: [],
};

export function isValidTripTransition(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return true;
  return TRIP_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}


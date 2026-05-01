import { describe, expect, it } from 'vitest';
import { isValidTripTransition, TRIP_ALLOWED_TRANSITIONS } from '@/lib/tripStateMachine';
import type { TripStatus } from '@/lib/types';

describe('trip state machine', () => {
  const statuses = Object.keys(TRIP_ALLOWED_TRANSITIONS) as TripStatus[];

  it('allows every declared transition', () => {
    for (const from of statuses) {
      for (const to of TRIP_ALLOWED_TRANSITIONS[from]) {
        expect(isValidTripTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects invalid transitions in matrix', () => {
    expect(isValidTripTransition('requested', 'active')).toBe(false);
    expect(isValidTripTransition('accepted', 'completed')).toBe(false);
    expect(isValidTripTransition('completed', 'active')).toBe(false);
    expect(isValidTripTransition('rejected', 'accepted')).toBe(false);
  });

  it('permits idempotent transitions for same status', () => {
    for (const status of statuses) {
      expect(isValidTripTransition(status, status)).toBe(true);
    }
  });
});


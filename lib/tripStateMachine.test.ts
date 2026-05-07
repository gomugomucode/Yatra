import { describe, it, expect } from 'vitest';
import { isValidTripTransition } from './tripStateMachine';
import { TripStatus } from './types';

describe('isValidTripTransition', () => {
    it('allows transition to itself', () => {
        expect(isValidTripTransition('requested', 'requested')).toBe(true);
        expect(isValidTripTransition('active', 'active')).toBe(true);
    });

    it('allows valid forward transitions', () => {
        expect(isValidTripTransition('requested', 'accepted')).toBe(true);
        expect(isValidTripTransition('accepted', 'arrived')).toBe(true);
        expect(isValidTripTransition('arrived', 'active')).toBe(true);
        expect(isValidTripTransition('active', 'completed')).toBe(true);
    });

    it('allows cancellations from active states', () => {
        expect(isValidTripTransition('requested', 'cancelled')).toBe(true);
        expect(isValidTripTransition('accepted', 'cancelled')).toBe(true);
        expect(isValidTripTransition('arrived', 'cancelled')).toBe(true);
        expect(isValidTripTransition('active', 'cancelled')).toBe(true);
    });

    it('prevents invalid backward transitions', () => {
        expect(isValidTripTransition('completed', 'active')).toBe(false);
        expect(isValidTripTransition('active', 'arrived')).toBe(false);
        expect(isValidTripTransition('arrived', 'accepted')).toBe(false);
        expect(isValidTripTransition('accepted', 'requested')).toBe(false);
    });

    it('prevents transitions from terminal states', () => {
        expect(isValidTripTransition('completed', 'cancelled')).toBe(false);
        expect(isValidTripTransition('cancelled', 'requested')).toBe(false);
        expect(isValidTripTransition('rejected', 'accepted')).toBe(false);
        expect(isValidTripTransition('expired', 'active')).toBe(false);
    });
});

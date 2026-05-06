import { describe, it, expect } from 'vitest';
import { checkProfileCompletion } from './types';

describe('checkProfileCompletion', () => {
    it('returns false for null or undefined data', () => {
        expect(checkProfileCompletion(null)).toBe(false);
        expect(checkProfileCompletion(undefined)).toBe(false);
    });

    it('returns false if no role is provided', () => {
        expect(checkProfileCompletion({ name: 'John Doe' })).toBe(false);
    });

    it('returns false if name is missing or empty', () => {
        expect(checkProfileCompletion({ role: 'passenger' })).toBe(false);
        expect(checkProfileCompletion({ role: 'passenger', name: '' })).toBe(false);
        expect(checkProfileCompletion({ role: 'passenger', name: '   ' })).toBe(false);
    });

    it('returns true if role and valid name are provided', () => {
        expect(checkProfileCompletion({ role: 'passenger', name: 'John Doe' })).toBe(true);
        expect(checkProfileCompletion({ role: 'driver', name: 'Jane Doe' })).toBe(true);
    });

    it('uses explicitRole if data.role is missing', () => {
        expect(checkProfileCompletion({ name: 'John Doe' }, 'passenger')).toBe(true);
    });
});

import { describe, it, expect } from 'vitest';
import { getLoyaltyTier, LOYALTY_TIERS } from '@/lib/loyalty';

describe('Loyalty Logic', () => {
    it('returns "none" tier for 0 trips', () => {
        const tier = getLoyaltyTier(0);
        expect(tier.id).toBe('none');
        expect(tier).toEqual(LOYALTY_TIERS.none);
    });

    it('returns "none" tier for 4 trips', () => {
        const tier = getLoyaltyTier(4);
        expect(tier.id).toBe('none');
    });

    it('returns "bronze" tier for 5 trips', () => {
        const tier = getLoyaltyTier(5);
        expect(tier.id).toBe('bronze');
        expect(tier).toEqual(LOYALTY_TIERS.bronze);
    });

    it('returns "bronze" tier for 9 trips', () => {
        const tier = getLoyaltyTier(9);
        expect(tier.id).toBe('bronze');
    });

    it('returns "silver" tier for 10 trips', () => {
        const tier = getLoyaltyTier(10);
        expect(tier.id).toBe('silver');
        expect(tier).toEqual(LOYALTY_TIERS.silver);
    });

    it('returns "silver" tier for 24 trips', () => {
        const tier = getLoyaltyTier(24);
        expect(tier.id).toBe('silver');
    });

    it('returns "gold" tier for 25 trips', () => {
        const tier = getLoyaltyTier(25);
        expect(tier.id).toBe('gold');
        expect(tier).toEqual(LOYALTY_TIERS.gold);
    });

    it('returns "gold" tier for 100 trips', () => {
        const tier = getLoyaltyTier(100);
        expect(tier.id).toBe('gold');
    });
});

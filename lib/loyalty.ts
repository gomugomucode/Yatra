export type LoyaltyTierId = 'none' | 'bronze' | 'silver' | 'gold';

export interface LoyaltyTier {
    id: LoyaltyTierId;
    name: string;
    minTrips: number;
    color: string;
    bgColor: string;
    description: string;
}

export const LOYALTY_TIERS: Record<LoyaltyTierId, LoyaltyTier> = {
    none: {
        id: 'none',
        name: 'New Rider',
        minTrips: 0,
        color: 'text-slate-600',
        bgColor: 'bg-slate-100',
        description: 'Take 5 trips to unlock Bronze status.',
    },
    bronze: {
        id: 'bronze',
        name: 'Bronze',
        minTrips: 5,
        color: 'text-amber-700',
        bgColor: 'bg-amber-100',
        description: 'Bronze Rider. 5 more trips to Silver.',
    },
    silver: {
        id: 'silver',
        name: 'Silver',
        minTrips: 10,
        color: 'text-slate-500',
        bgColor: 'bg-slate-200',
        description: 'Silver Rider. 15 more trips to Gold.',
    },
    gold: {
        id: 'gold',
        name: 'Gold',
        minTrips: 25,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        description: 'Gold Rider. You are a top passenger!',
    }
};

export function getLoyaltyTier(completedTrips: number): LoyaltyTier {
    if (completedTrips >= LOYALTY_TIERS.gold.minTrips) {
        return LOYALTY_TIERS.gold;
    }
    if (completedTrips >= LOYALTY_TIERS.silver.minTrips) {
        return LOYALTY_TIERS.silver;
    }
    if (completedTrips >= LOYALTY_TIERS.bronze.minTrips) {
        return LOYALTY_TIERS.bronze;
    }
    return LOYALTY_TIERS.none;
}

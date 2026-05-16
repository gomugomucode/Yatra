use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DriverReputationProfile {
    pub driver: Pubkey,                // 32
    pub trust_score: u16,              // 2
    pub total_trips: u32,              // 4
    pub completed_trips: u32,          // 4
    pub path_fidelity_x100: u16,       // 2 (e.g. 9850 = 98.50%)
    pub avg_arrival_delta_s: i16,      // 2 (negative = early, positive = late)
    pub hard_brake_events: u8,         // 1
    pub route_deviation_events: u8,    // 1
    pub sos_triggered: u8,             // 1
    pub zk_verified: bool,             // 1
    pub bump: u8,                      // 1
}

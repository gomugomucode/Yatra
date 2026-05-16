use anchor_lang::prelude::*;
use crate::state::DriverReputationProfile;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TripTelemetry {
    pub is_completed: bool,
    pub fidelity_x100: u16,
    pub arrival_delta_s: i16,
    pub hard_brakes: u8,
    pub deviations: u8,
    pub sos_triggered: u8,
}

#[derive(Accounts)]
pub struct UpdateRep<'info> {
    #[account(
        mut,
        seeds = [b"driver_rep", driver.key().as_ref()],
        bump = driver_rep.bump
    )]
    pub driver_rep: Account<'info, DriverReputationProfile>,
    
    /// CHECK: The authority allowed to write reputation (server wallet)
    pub authority: Signer<'info>,
    
    /// CHECK: The driver being rated
    pub driver: UncheckedAccount<'info>,
}

pub fn update_rep_handler(ctx: Context<UpdateRep>, telemetry: TripTelemetry) -> Result<()> {
    let rep = &mut ctx.accounts.driver_rep;
    
    // Update raw counters
    rep.total_trips = rep.total_trips.saturating_add(1);
    if telemetry.is_completed {
        rep.completed_trips = rep.completed_trips.saturating_add(1);
    }
    
    // EMA for path fidelity: new = (9 * old + 1 * new) / 10
    // If it's the first trip, just set it to the new fidelity
    if rep.total_trips == 1 {
        rep.path_fidelity_x100 = telemetry.fidelity_x100;
        rep.avg_arrival_delta_s = telemetry.arrival_delta_s;
    } else {
        rep.path_fidelity_x100 = ((rep.path_fidelity_x100 as u32 * 9 + telemetry.fidelity_x100 as u32) / 10) as u16;
        let prev_total = (rep.total_trips - 1) as i32;
        rep.avg_arrival_delta_s = ((rep.avg_arrival_delta_s as i32 * prev_total + telemetry.arrival_delta_s as i32) / rep.total_trips as i32) as i16;
    }
    
    rep.hard_brake_events = rep.hard_brake_events.saturating_add(telemetry.hard_brakes);
    rep.route_deviation_events = rep.route_deviation_events.saturating_add(telemetry.deviations);
    rep.sos_triggered = rep.sos_triggered.saturating_add(telemetry.sos_triggered);
    
    // Recalculate composite trust_score based on the hybrid blueprint
    let total = rep.total_trips.max(1) as u64;
    let completed = rep.completed_trips as u64;
    
    // OPERATIONAL LAYER (max 350 pts without escrow metrics yet)
    let completion_rate = (completed * 250) / total;
    let zk_verified_bonus = if rep.zk_verified { 100 } else { 0 };
    let sos_penalty = (rep.sos_triggered as u64 * 30).min(100);
    
    // ANALYTICAL LAYER (max 200 pts)
    let path_fidelity = (rep.path_fidelity_x100 as u64 * 100) / 10000;
    
    let abs_delta = rep.avg_arrival_delta_s.abs() as u64;
    let punctuality = if abs_delta >= 300 { 0 } else { ((300 - abs_delta) * 100) / 300 };
    
    let anomaly_penalty = ((rep.hard_brake_events as u64 + rep.route_deviation_events as u64) * 10).min(50);
    
    let raw_score = completion_rate + zk_verified_bonus + path_fidelity + punctuality;
    let deductions = sos_penalty + anomaly_penalty;
    
    rep.trust_score = raw_score.saturating_sub(deductions).min(1000) as u16;
    
    Ok(())
}

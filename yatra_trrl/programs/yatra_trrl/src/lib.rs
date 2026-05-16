use anchor_lang::prelude::*;

pub mod state;
pub mod update;

use state::*;
use update::*;

declare_id!("B8Y64wzmTott2wp5rgP1UyDgAofohU3hfTnmxkMAPFDV");

#[program]
pub mod yatra_trrl {
    use super::*;

    pub fn initialize_rep(ctx: Context<InitializeRep>) -> Result<()> {
        let rep = &mut ctx.accounts.driver_rep;
        rep.driver = ctx.accounts.driver.key();
        rep.trust_score = 500; // Base starting score
        rep.total_trips = 0;
        rep.completed_trips = 0;
        rep.path_fidelity_x100 = 10000; // 100%
        rep.avg_arrival_delta_s = 0;
        rep.hard_brake_events = 0;
        rep.route_deviation_events = 0;
        rep.sos_triggered = 0;
        rep.zk_verified = false;
        rep.bump = ctx.bumps.driver_rep;
        Ok(())
    }

    pub fn update_rep(ctx: Context<UpdateRep>, telemetry: TripTelemetry) -> Result<()> {
        update::update_rep_handler(ctx, telemetry)
    }
}

#[derive(Accounts)]
pub struct InitializeRep<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DriverReputationProfile::INIT_SPACE,
        seeds = [b"driver_rep", driver.key().as_ref()],
        bump
    )]
    pub driver_rep: Account<'info, DriverReputationProfile>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Driver pubkey
    pub driver: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

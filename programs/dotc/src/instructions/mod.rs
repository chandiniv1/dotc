pub mod create_deal;
pub mod submit_bid;
pub mod conclude_deal;

pub use create_deal::*;
pub use submit_bid::*;
pub use conclude_deal::*;

use anchor_lang::prelude::*;

pub fn initialize_deal_counter(ctx: Context<InitializeDealCounter>) -> Result<()> {
    ctx.accounts.deal_counter.current_id = 1;
    Ok(())
}

pub fn initialize_bid_counter(ctx: Context<InitializeBidCounter>) -> Result<()> {
    ctx.accounts.bid_counter.current_id = 1;
    Ok(())
}
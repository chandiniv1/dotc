use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod error;
pub mod constants;

use instructions::*;

declare_id!("4qoo54cDUhCeiAFyxTWBsMb9CjEuPbNAnLhZ4v8bCF63");

#[program]
pub mod dotc {
    use super::*;

    pub fn initialize_deal_counter(ctx: Context<InitializeDealCounter>) -> Result<()> {
        instructions::initialize_deal_counter(ctx)
    }

    pub fn initialize_bid_counter(ctx: Context<InitializeBidCounter>) -> Result<()> {
        instructions::initialize_bid_counter(ctx)
    }

    pub fn create_deal(
        ctx: Context<CreateDeal>,
        sale_token_symbol: String,
        sale_token_decimals: u8,
        output_token_symbol: String,
        output_token_decimals: u8,
        quantity: u64,
        min_price: u64,
        expiration: u64,
        conclusion_time: u64,
    ) -> Result<()> {
        instructions::create_deal(
            ctx,
            sale_token_symbol,
            sale_token_decimals,
            output_token_symbol,
            output_token_decimals,
            quantity,
            min_price,
            expiration,
            conclusion_time,
        )
    }

    pub fn submit_bid(
        ctx: Context<SubmitBid>,
        bid_price_per_unit: u64,
        quantity: u64,
    ) -> Result<()> {
        instructions::submit_bid(ctx, bid_price_per_unit, quantity)
    }

    pub fn conclude_deal<'info>(
        ctx: Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
    ) -> Result<()> {
        instructions::conclude_deal(ctx)
    }
}
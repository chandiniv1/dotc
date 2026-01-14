use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub bid_id: u64,
    pub buyer: Pubkey,
    pub deal_id: u64,
    pub bid_price_per_unit: u64,
    pub quantity: u64,
    pub usdc_deposit: u64,
    pub timestamp: u64,
}

#[account]
#[derive(InitSpace)]
pub struct BidCounter {
    pub current_id: u64,
}
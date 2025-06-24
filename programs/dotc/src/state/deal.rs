use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Active,
    Fulfilled,
    Expired,
}

impl Default for DealStatus {
    fn default() -> Self {
        DealStatus::Active
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct TokenInfo {
    #[max_len(10)]
    pub symbol: String,
    pub address: Pubkey,
    pub decimals: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Deal {
    pub deal_id: u64,
    pub seller: Pubkey,
    pub sale_token: TokenInfo,
    pub output_token: TokenInfo,
    pub quantity: u64,
    pub min_price_per_unit: u64,
    pub expiry_time: u64,
    pub conclusion_time: u64,
    pub fulfilled_quantity: u64,
    pub status: DealStatus,
    #[max_len(100)]
    pub bids: Vec<u64>,
    #[max_len(100)]
    pub selected_bids: Vec<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct DealCounter {
    pub current_id: u64,
}
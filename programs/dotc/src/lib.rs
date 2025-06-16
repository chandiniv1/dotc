use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked},
};

declare_id!("4qoo54cDUhCeiAFyxTWBsMb9CjEuPbNAnLhZ4v8bCF63");

pub const ANCHOR_DESCRIMINATOR_SIZE: usize = 8;

#[program]
pub mod dotc {
    use super::*;

    pub fn initialize_deal_counter(ctx: Context<InitializeDealCounter>) -> Result<()> {
        ctx.accounts.deal_counter.current_id = 1;
        Ok(())
    }

    pub fn initialize_bid_counter(ctx: Context<InitializeBidCounter>) -> Result<()> {
        ctx.accounts.bid_counter.current_id = 1;
        Ok(())
    }

    pub fn conclude_deal(
        ctx: Context<ConcludeDeal>,
        selected_bid_id: u64,
    ) -> Result<()> {
        // let deal = &mut ctx.accounts.deal_account;
        // let selected_bid = &mut ctx.accounts.selected_bid;
        // let clock = Clock::get()?;

        // require!(deal.status == DealStatus::Active, ErrorCode::DealNotActive);
        // require!(clock.unix_timestamp as u64 >= deal.conclusion_time, ErrorCode::ConclusionNotReady);
        // require!(selected_bid.bid_id == selected_bid_id, ErrorCode::InvalidBidSelection);
        // require!(selected_bid.deal_id == deal.deal_id, ErrorCode::InvalidBidSelection);
        // require!(selected_bid.quantity <= deal.quantity, ErrorCode::ExceedsAvailableQuantity);

        // let deal_id_bytes = deal.deal_id.to_le_bytes();
        // let seeds = &[
        //     b"deal".as_ref(),
        //     deal_id_bytes.as_ref(),
        //     &[ctx.bumps.deal_account],
        // ];

        // let signer_seeds = &[&seeds[..]];

        // let transfer_sale_tokens = TransferChecked {
        //     from: ctx.accounts.deal_escrow_account.to_account_info(),
        //     to: ctx.accounts.buyer_sale_token_account.to_account_info(),
        //     mint: ctx.accounts.sale_token_mint.to_account_info(),
        //     authority: ctx.accounts.deal_account.to_account_info(),
        // };

        // let sale_token_cpi = CpiContext::new_with_signer(
        //     ctx.accounts.token_program.to_account_info(),
        //     transfer_sale_tokens,
        //     signer_seeds,
        // );

        // transfer_checked(sale_token_cpi, selected_bid.quantity, deal.sale_token.decimals)?;

        // let transfer_buyer_tokens = TransferChecked {
        //     from: ctx.accounts.buyer_tokens_account.to_account_info(),
        //     to: ctx.accounts.seller_output_token_account.to_account_info(),
        //     mint: ctx.accounts.output_token_mint.to_account_info(),
        //     authority: ctx.accounts.buyer.to_account_info(),
        // };

        // let buyer_token_cpi = CpiContext::new(
        //     ctx.accounts.token_program.to_account_info(),
        //     transfer_buyer_tokens,
        // );

        // transfer_checked(buyer_token_cpi, selected_bid.usdc_deposit, deal.output_token.decimals)?;

        // deal.fulfilled_quantity = selected_bid.quantity;
        // // deal.selected_bid = Some(selected_bid_id);
        // deal.status = DealStatus::Fulfilled;

        // Ok(())

        let clock = Clock::get()?;

        // Validate conditions first (using immutable borrows)
        require!(ctx.accounts.deal_account.status == DealStatus::Active, ErrorCode::DealNotActive);
        require!(clock.unix_timestamp as u64 >= ctx.accounts.deal_account.conclusion_time, ErrorCode::ConclusionNotReady);
        require!(ctx.accounts.selected_bid.bid_id == selected_bid_id, ErrorCode::InvalidBidSelection);
        require!(ctx.accounts.selected_bid.deal_id == ctx.accounts.deal_account.deal_id, ErrorCode::InvalidBidSelection);
        require!(ctx.accounts.selected_bid.quantity <= ctx.accounts.deal_account.quantity, ErrorCode::ExceedsAvailableQuantity);

        // Store values we need for transfers before taking mutable references
        let deal_id_bytes = ctx.accounts.deal_account.deal_id.to_le_bytes();
        let selected_quantity = ctx.accounts.selected_bid.quantity;
        let usdc_deposit = ctx.accounts.selected_bid.usdc_deposit;
        let sale_token_decimals = ctx.accounts.deal_account.sale_token.decimals;
        let output_token_decimals = ctx.accounts.deal_account.output_token.decimals;

        let seeds = &[
            b"deal".as_ref(),
            deal_id_bytes.as_ref(),
            &[ctx.bumps.deal_account],
        ];

        let signer_seeds = &[&seeds[..]];

        // Transfer sale tokens from escrow to buyer
        let transfer_sale_tokens = TransferChecked {
            from: ctx.accounts.deal_escrow_account.to_account_info(),
            to: ctx.accounts.buyer_sale_token_account.to_account_info(),
            mint: ctx.accounts.sale_token_mint.to_account_info(),
            authority: ctx.accounts.deal_account.to_account_info(),
        };

        let sale_token_cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_sale_tokens,
            signer_seeds,
        );

        transfer_checked(sale_token_cpi, selected_quantity, sale_token_decimals)?;

        // Transfer buyer tokens to seller
        let transfer_buyer_tokens = TransferChecked {
            from: ctx.accounts.buyer_tokens_account.to_account_info(),
            to: ctx.accounts.seller_output_token_account.to_account_info(),
            mint: ctx.accounts.output_token_mint.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };

        let buyer_token_cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_buyer_tokens,
        );

        transfer_checked(buyer_token_cpi, usdc_deposit, output_token_decimals)?;

        // Update deal state (now we can take mutable reference)
        let deal = &mut ctx.accounts.deal_account;
        deal.fulfilled_quantity = selected_quantity;
        deal.status = DealStatus::Fulfilled;

        Ok(())

    }

    pub fn submit_bid(
        ctx: Context<SubmitBid>,
        bid_price_per_unit: u64,
        quantity: u64,
    ) -> Result<()> {
        let bid_counter = &mut ctx.accounts.bid_counter;

        let deal = &mut ctx.accounts.deal_account;
        let bid = &mut ctx.accounts.bid_account;
        let clock = Clock::get()?;

        let usdc_deposit = bid_price_per_unit.checked_mul(quantity).ok_or(ErrorCode::CalculationOverflow)?;

        require!(
            ctx.accounts.buyer_tokens_account.amount >= usdc_deposit,
            ErrorCode::InsufficientBalance
        );

        bid.bid_id = bid_counter.current_id;
        bid_counter.current_id += 1;
        
        bid.buyer = ctx.accounts.buyer.key();
        bid.deal_id = deal.deal_id;

        bid.bid_price_per_unit = bid_price_per_unit;
        bid.quantity = quantity;
        bid.usdc_deposit = usdc_deposit;

        bid.timestamp = clock.unix_timestamp as u64;

        deal.bids.push(bid.bid_id);

        Ok(())

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
        let deal_counter = &mut ctx.accounts.deal_counter;
        let deal = &mut ctx.accounts.deal_account;
        let _clock = Clock::get()?;

        deal.deal_id = deal_counter.current_id;
        deal_counter.current_id += 1;

        deal.seller = ctx.accounts.seller.key();
        deal.sale_token = TokenInfo {
            address: ctx.accounts.seller_tokens_mint.key(),
            symbol: sale_token_symbol,
            decimals: sale_token_decimals,
        };

        deal.output_token = TokenInfo {
            symbol: output_token_symbol,
            decimals: output_token_decimals,
            address: ctx.accounts.buyer_tokens_mint.key(),
        };

        deal.quantity = quantity;
        deal.min_price_per_unit = min_price;
        deal.expiry_time = expiration;
        deal.conclusion_time = conclusion_time;
        deal.status = DealStatus::Active;
        deal.fulfilled_quantity = 0;
        deal.bids = Vec::new();

        let transfer_accounts_options = TransferChecked {
            from: ctx.accounts.seller_tokens_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            mint: ctx.accounts.seller_tokens_mint.to_account_info(),
            authority: ctx.accounts.seller.to_account_info(),
        };

        let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts_options);

        transfer_checked(cpi_context, quantity, sale_token_decimals)?;

        Ok(())
    }
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Active,
    Fulfilled,
    Expired,
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
pub struct DealCounter {
    pub current_id: u64,
}

#[account]
#[derive(InitSpace)]
pub struct BidCounter {
    pub current_id: u64,
}

impl Default for DealStatus {
    fn default() -> Self {
        DealStatus::Active
    }
}

#[derive(Accounts)]
#[instruction(
    sale_token_symbol: String,
    sale_token_decimals: u8,
    output_token_symbol: String,
    output_token_decimals: u8,
    quantity: u64
)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"deal_counter"],
        bump
    )]
    pub deal_counter: Account<'info, DealCounter>,

    pub seller_tokens_mint: InterfaceAccount<'info, Mint>,

    pub buyer_tokens_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = seller_tokens_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program
    )]
    pub seller_tokens_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        space = ANCHOR_DESCRIMINATOR_SIZE + Deal::INIT_SPACE,
        seeds = [b"deal", deal_counter.current_id.to_le_bytes().as_ref()],
        bump
    )]
    pub deal_account: Account<'info, Deal>,

    #[account(
        init,
        payer = seller,
        associated_token::mint = seller_tokens_mint,
        associated_token::authority = deal_account,
        associated_token::token_program = token_program
    )]
    pub escrow_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct InitializeDealCounter<'info> {
    #[account(
        init,
        payer = seller,
        space = ANCHOR_DESCRIMINATOR_SIZE + DealCounter::INIT_SPACE,
        seeds = [b"deal_counter"],
        bump
    )]
    pub deal_counter: Account<'info, DealCounter>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct InitializeBidCounter<'info> {
    #[account(
        init,
        payer = bidder,
        space = ANCHOR_DESCRIMINATOR_SIZE + BidCounter::INIT_SPACE,
        seeds = [b"bid_counter"],
        bump
    )]
    pub bid_counter: Account<'info, BidCounter>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

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

#[derive(Accounts)]
#[instruction(bid_price_per_unit: u64, quantity: u64)]
pub struct SubmitBid<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"deal", deal_account.deal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub deal_account: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [b"bid_counter"],
        bump
    )]
    pub bid_counter: Account<'info, BidCounter>,

    pub buyer_tokens_mint: InterfaceAccount<'info, Mint>,

    #[account(
        associated_token::mint = buyer_tokens_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_tokens_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = buyer,
        space = ANCHOR_DESCRIMINATOR_SIZE + Bid::INIT_SPACE,
        seeds = [
            b"bid",
            bid_counter.current_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub bid_account: Account<'info, Bid>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
#[instruction(selected_bid_id: u64)]
pub struct ConcludeDeal<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal_account.deal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub deal_account: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [b"bid", selected_bid.bid_id.to_le_bytes().as_ref()],
        bump
    )]
    pub selected_bid: Account<'info, Bid>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub sale_token_mint: InterfaceAccount<'info, Mint>,

    pub output_token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = sale_token_mint,
        associated_token::authority = deal_account,
        associated_token::token_program = token_program
    )]
    pub deal_escrow_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = output_token_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_tokens_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = sale_token_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_sale_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = output_token_mint,
        associated_token::authority = deal_account.seller,
        associated_token::token_program = token_program
    )]
    pub seller_output_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid expiry time")]
    InvalidExpiryTime,
    #[msg("Invalid conclusion time")]
    InvalidConclusionTime,
    #[msg("Insufficient token balance")]
    InsufficientBalance,
    #[msg("Token transfer failed")]
    TransferFailed,
    #[msg("Invalid sale token")]
    InvalidSaleToken,
    #[msg("Calculation overflow")]
    CalculationOverflow,
    #[msg("Deal is not active")]
    DealNotActive,
    #[msg("Conclusion time not reached")]
    ConclusionNotReady,
    #[msg("Invalid bid selection")]
    InvalidBidSelection,
    #[msg("Deal is not expired")]
    DealNotExpired,
    #[msg("Exceeds available quantity")]
    ExceedsAvailableQuantity,
}

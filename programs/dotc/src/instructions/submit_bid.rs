use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use crate::state::*;
use crate::error::ErrorCode;

pub const ANCHOR_DESCRIMINATOR_SIZE: usize = 8;

pub fn submit_bid(
    ctx: Context<SubmitBid>,
    bid_price_per_unit: u64,
    quantity: u64,
) -> Result<()> {
    let bid_counter = &mut ctx.accounts.bid_counter;
    let deal = &mut ctx.accounts.deal_account;
    let bid_account = &mut ctx.accounts.bid_account;
    let clock = Clock::get()?;

    let usdc_deposit = bid_price_per_unit
        .checked_mul(quantity)
        .ok_or(ErrorCode::CalculationOverflow)?;

    require!(
        ctx.accounts.buyer_tokens_account.amount >= usdc_deposit,
        ErrorCode::InsufficientBalance
    );

    require!(quantity > 0, ErrorCode::ZeroQuantity);

    bid_account.bid_id = bid_counter.current_id;
    bid_counter.current_id += 1;

    bid_account.buyer = ctx.accounts.buyer.key();
    bid_account.deal_id = deal.deal_id;
    bid_account.bid_price_per_unit = bid_price_per_unit;
    bid_account.quantity = quantity;
    bid_account.usdc_deposit = usdc_deposit;
    bid_account.timestamp = clock.unix_timestamp as u64;

    deal.bids.push(bid_account.bid_id);

    // Transfer USDC from buyer to bid escrow
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.buyer_tokens_account.to_account_info(),
                to: ctx.accounts.bid_escrow_account.to_account_info(),
                mint: ctx.accounts.output_tokens_mint.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        usdc_deposit,
        ctx.accounts.output_tokens_mint.decimals,
    )?;

    msg!(
        "Bid submitted: {} tokens escrowed for bid {}",
        usdc_deposit,
        bid_account.bid_id
    );

    Ok(())
}

#[derive(Accounts)]
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

    pub output_tokens_mint: InterfaceAccount<'info, Mint>,

    pub sale_tokens_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = output_tokens_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_tokens_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = sale_tokens_mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program
    )]
    pub buyer_sale_token_account: InterfaceAccount<'info, TokenAccount>,

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

    #[account(
        init,
        payer = buyer,
        associated_token::mint = output_tokens_mint,
        associated_token::authority = bid_account,
        associated_token::token_program = token_program,
    )]
    pub bid_escrow_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,

    pub associated_token_program: Program<'info, AssociatedToken>,
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
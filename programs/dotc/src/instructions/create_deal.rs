use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use crate::{constants::ANCHOR_DESCRIMINATOR_SIZE, state::*};

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
    deal.selected_bids = Vec::new();

    let transfer_accounts_options = TransferChecked {
        from: ctx.accounts.seller_tokens_account.to_account_info(),
        to: ctx.accounts.escrow_account.to_account_info(),
        mint: ctx.accounts.seller_tokens_mint.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };

    let cpi_context = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts_options,
    );

    transfer_checked(cpi_context, quantity, sale_token_decimals)?;

    Ok(())
}

#[derive(Accounts)]
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
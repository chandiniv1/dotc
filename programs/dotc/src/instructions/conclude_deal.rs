use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use crate::state::*;
use crate::error::ErrorCode;

pub fn conclude_deal<'info>(
    ctx: Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
) -> Result<()> {
    execute_deal_conclusion(ctx)
}

fn execute_deal_conclusion<'info>(
    ctx: Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
) -> Result<()> {
    require!(
        ctx.accounts.deal_account.status == DealStatus::Active,
        ErrorCode::DealAlreadyFulfilled
    );

    let deal_id = ctx.accounts.deal_account.deal_id;
    let deal_quantity = ctx.accounts.deal_account.quantity;

    // Deal pda signer seeds
    let deal_id_bytes = deal_id.to_le_bytes();
    let deal_seeds = &[
        b"deal".as_ref(),
        deal_id_bytes.as_ref(),
        &[ctx.bumps.deal_account],
    ];
    let deal_signer_seeds = &[&deal_seeds[..]];

    // [(bid_account_info, buyer_sale_account_info, bid_escrow_account_info, buyer_output_account_info)]
    let num_bids_with_accounts = ctx.remaining_accounts.len() / 4;
    require!(num_bids_with_accounts > 0, ErrorCode::NoBidsAvailable);

    let mut bid_data = Vec::with_capacity(num_bids_with_accounts);

    // Collect and validate bid data
    for i in 0..num_bids_with_accounts {
        let base_index = i * 4;

        let bid_account_info = &ctx.remaining_accounts[base_index];
        let buyer_sale_account_info = &ctx.remaining_accounts[base_index + 1];
        let bid_escrow_account_info = &ctx.remaining_accounts[base_index + 2];
        let buyer_output_account_info = &ctx.remaining_accounts[base_index + 3];

        let bid_data_raw = bid_account_info
            .try_borrow_data()
            .map_err(|_| ErrorCode::BidAccountNotFound)?;

        let bid = Bid::try_deserialize(&mut &bid_data_raw[..])
            .map_err(|_| ErrorCode::BidAccountNotFound)?;

        require!(bid.deal_id == deal_id, ErrorCode::InvalidBidForDeal);

        // bid PDA and bump
        let bid_id_bytes = bid.bid_id.to_le_bytes();
        let (_, bid_bump) =
            Pubkey::find_program_address(&[b"bid", bid_id_bytes.as_ref()], &ctx.program_id);

        bid_data.push((
            bid,
            buyer_sale_account_info,
            bid_escrow_account_info,
            buyer_output_account_info,
            bid_account_info,
            bid_bump,
            bid_id_bytes,
        ));
    }

    // bid selection
    let bids_for_optimization: Vec<Bid> = bid_data
        .iter()
        .map(|(bid, _, _, _, _, _, _)| bid.clone())
        .collect();
    let selection_result = optimize_bid_selection(&bids_for_optimization, deal_quantity)?;

    ctx.accounts.deal_account.selected_bids =
        selection_result.iter().map(|(bid, _)| bid.bid_id).collect();
        
    for (
        bid,
        buyer_sale_account_info,
        bid_escrow_account_info,
        buyer_output_account_info,
        bid_account_info,
        bid_bump,
        bid_id_bytes,
    ) in bid_data.iter()
    {
        let allocated_quantity = selection_result
            .iter()
            .find(|(selected_bid, _)| selected_bid.bid_id == bid.bid_id)
            .map(|(_, qty)| *qty)
            .unwrap_or(0);

        // Execute transfers for selected bids
        if allocated_quantity > 0 {
            execute_bid_transfer(
                &ctx,
                bid,
                buyer_sale_account_info,
                bid_escrow_account_info,
                bid_account_info,
                allocated_quantity,
                deal_signer_seeds,
                &[b"bid".as_ref(), bid_id_bytes.as_ref(), &[*bid_bump]],
            )?;
        }

        // refunds for unselected or partially selected bids
        let refund_quantity = bid.quantity.saturating_sub(allocated_quantity);
        if refund_quantity > 0 {
            execute_bid_refund(
                &ctx,
                bid,
                bid_escrow_account_info,
                buyer_output_account_info,
                bid_account_info,
                refund_quantity,
                &[b"bid".as_ref(), bid_id_bytes.as_ref(), &[*bid_bump]],
            )?;
        }
    }

    ctx.accounts.deal_account.status = DealStatus::Fulfilled;
    Ok(())
}

// Executes transfers
fn execute_bid_transfer<'info>(
    ctx: &Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
    bid: &Bid,
    buyer_sale_account_info: &AccountInfo<'info>,
    bid_escrow_account_info: &AccountInfo<'info>,
    bid_account_info: &AccountInfo<'info>,
    allocated_quantity: u64,
    deal_signer_seeds: &[&[&[u8]]],
    bid_signer_seeds: &[&[u8]],
) -> Result<()> {
    let sale_token_decimals = ctx.accounts.deal_account.sale_token.decimals;
    let output_token_decimals = ctx.accounts.deal_account.output_token.decimals;

    // Transfer sale tokens from deal escrow to buyer
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.deal_escrow_account.to_account_info(),
                to: buyer_sale_account_info.to_account_info(),
                mint: ctx.accounts.sale_tokens_mint.to_account_info(),
                authority: ctx.accounts.deal_account.to_account_info(),
            },
            deal_signer_seeds,
        ),
        allocated_quantity,
        sale_token_decimals,
    )?;

    // Calculate and transfer payment from bid_escrow to seller
    let payment_amount = allocated_quantity
        .checked_mul(bid.bid_price_per_unit)
        .ok_or(ErrorCode::CalculationOverflow)?;

    let bid_signer_seeds = &[&bid_signer_seeds[..]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: bid_escrow_account_info.to_account_info(),
                to: ctx.accounts.seller_output_token_account.to_account_info(),
                mint: ctx.accounts.output_token_mint.to_account_info(),
                authority: bid_account_info.to_account_info(),
            },
            bid_signer_seeds,
        ),
        payment_amount,
        output_token_decimals,
    )?;

    msg!(
        "Executed bid {}: {} tokens for {} payment",
        bid.bid_id,
        allocated_quantity,
        payment_amount
    );

    Ok(())
}

// refund of unallocated tokens back to the bidder
fn execute_bid_refund<'info>(
    ctx: &Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
    bid: &Bid,
    bid_escrow_account_info: &AccountInfo<'info>,
    buyer_output_account_info: &AccountInfo<'info>,
    bid_account_info: &AccountInfo<'info>,
    refund_quantity: u64,
    bid_signer_seeds: &[&[u8]],
) -> Result<()> {
    let output_token_decimals = ctx.accounts.deal_account.output_token.decimals;

    let refund_amount = refund_quantity
        .checked_mul(bid.bid_price_per_unit)
        .ok_or(ErrorCode::CalculationOverflow)?;

    let bid_signer_seeds_slice = &[&bid_signer_seeds[..]];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: bid_escrow_account_info.to_account_info(),
                to: buyer_output_account_info.to_account_info(),
                mint: ctx.accounts.output_token_mint.to_account_info(),
                authority: bid_account_info.to_account_info(),
            },
            bid_signer_seeds_slice,
        ),
        refund_amount,
        output_token_decimals,
    )?;

    msg!(
        "Refunded {} tokens for {} unallocated from bid {}",
        refund_amount,
        refund_quantity,
        bid.bid_id
    );

    Ok(())
}

pub fn optimize_bid_selection(bids: &[Bid], total_tokens: u64) -> Result<Vec<(Bid, u64)>> {
    let mut sorted_bids = bids.to_vec();

    sorted_bids.sort_unstable_by(|a, b| b.bid_price_per_unit.cmp(&a.bid_price_per_unit));

    let mut selected_bids = Vec::new();
    let mut remaining_tokens = total_tokens;

    for bid in sorted_bids {
        if remaining_tokens == 0 {
            break;
        }

        let tokens_to_allocate = remaining_tokens.min(bid.quantity);
        if tokens_to_allocate > 0 {
            selected_bids.push((bid, tokens_to_allocate));
            remaining_tokens -= tokens_to_allocate;
        }
    }

    Ok(selected_bids)
}

#[derive(Accounts)]
pub struct ConcludeDeal<'info> {
    #[account(
        mut,
        seeds = [b"deal", deal_account.deal_id.to_le_bytes().as_ref()],
        bump,
        constraint = deal_account.seller == seller.key() @ ErrorCode::UnauthorizedSeller
    )]
    pub deal_account: Account<'info, Deal>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub output_token_mint: InterfaceAccount<'info, Mint>,

    pub sale_tokens_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = sale_tokens_mint,
        associated_token::authority = deal_account,
        associated_token::token_program = token_program
    )]
    pub deal_escrow_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = output_token_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program
    )]
    pub seller_output_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,
}

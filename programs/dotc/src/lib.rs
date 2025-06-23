use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
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

    pub fn conclude_deal<'info>(
        ctx: Context<'_, '_, '_, 'info, ConcludeDeal<'info>>,
    ) -> Result<()> {
        execute_deal_conclusion(ctx)
    }
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
    let sale_token_decimals = ctx.accounts.deal_account.sale_token.decimals;
    let output_token_decimals = ctx.accounts.deal_account.output_token.decimals;

    // Deal signer seeds
    let deal_id_bytes = deal_id.to_le_bytes();
    let deal_seeds = &[
        b"deal".as_ref(),
        deal_id_bytes.as_ref(),
        &[ctx.bumps.deal_account],
    ];
    let deal_signer_seeds = &[&deal_seeds[..]];

    let num_bids_with_accounts = ctx.remaining_accounts.len() / 4;
    require!(num_bids_with_accounts > 0, ErrorCode::NoBidsAvailable);

    let mut bid_data = Vec::with_capacity(num_bids_with_accounts);

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

        // bid PDA and bump to avoid recomputation
        let bid_id_bytes = bid.bid_id.to_le_bytes();
        let (bid_pda, bid_bump) =
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
        let bid_seeds = &[b"bid".as_ref(), bid_id_bytes.as_ref(), &[*bid_bump]];
        let bid_signer_seeds = &[&bid_seeds[..]];

        let allocated_quantity = selection_result
            .iter()
            .find(|(selected_bid, _)| selected_bid.bid_id == bid.bid_id)
            .map(|(_, qty)| *qty)
            .unwrap_or(0);

        if allocated_quantity > 0 {
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
        }

        // Handle refunds for unselected or partially selected bids
        let refund_quantity = bid.quantity.saturating_sub(allocated_quantity);
        if refund_quantity > 0 {
            let refund_amount = refund_quantity
                .checked_mul(bid.bid_price_per_unit)
                .ok_or(ErrorCode::CalculationOverflow)?;

            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: bid_escrow_account_info.to_account_info(),
                        to: buyer_output_account_info.to_account_info(),
                        mint: ctx.accounts.output_token_mint.to_account_info(),
                        authority: bid_account_info.to_account_info(),
                    },
                    bid_signer_seeds,
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
        }
    }

    ctx.accounts.deal_account.status = DealStatus::Fulfilled;
    Ok(())
}

pub fn optimize_bid_selection(bids: &[Bid], total_tokens: u64) -> Result<Vec<(Bid, u64)>> {
    let mut sorted_bids = bids.to_vec();

    // Sort by price descending (highest first)
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
    #[max_len(100)]
    pub selected_bids: Vec<u64>,
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

impl Default for DealStatus {
    fn default() -> Self {
        DealStatus::Active
    }
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
    #[msg("No bids available")]
    NoBidsAvailable,
    #[msg("token account not found")]
    BuyerTokenAccountNotFound,
    #[msg("bid account not found")]
    BidAccountNotFound,
    #[msg("invalid bid for the deal")]
    InvalidBidForDeal,
    #[msg("bid escrow account not found")]
    BidEscrowAccountNotFound,
    #[msg("deal is still active")]
    DealStillActive,
    #[msg("bid was selected and cannot be refunded")]
    BidWasSelected,
    #[msg("Should not allow zero quantity bids")]
    ZeroQuantity,
    #[msg("Deal already fulfilled")]
    DealAlreadyFulfilled,
    #[msg("Deal expired")]
    DealExpired,
    #[msg("unauthorized seller")]
    UnauthorizedSeller,
}

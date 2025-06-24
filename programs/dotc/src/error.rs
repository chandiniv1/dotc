use anchor_lang::prelude::*;

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
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const chai_1 = require("chai");
const anchor_2 = require("@coral-xyz/anchor");
describe('dotc', () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Dotc;
    const connection = provider.connection;
    let seller;
    let buyer;
    let buyer2;
    let buyer3;
    let buyer4;
    let saleTokenMint;
    let outputTokenMint;
    let dealCounter;
    let bidCounter;
    let dealPda;
    // Store bid PDAs for later use
    let bidPdas = [];
    let createdBids = [];
    const saleTokenAmount = new anchor_1.BN(1000000);
    before(() => __awaiter(void 0, void 0, void 0, function* () {
        const tempKeypair = web3_js_1.Keypair.generate();
        yield connection.requestAirdrop(tempKeypair.publicKey, web3_js_1.LAMPORTS_PER_SOL);
        yield new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for airdrop
        [dealCounter] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId);
        [bidCounter] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId);
        try {
            yield program.methods
                .initializeDealCounter()
                .accountsStrict({
                dealCounter: dealCounter,
                seller: tempKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
                .signers([tempKeypair])
                .rpc();
        }
        catch (error) {
            throw error;
        }
        try {
            yield program.methods
                .initializeBidCounter()
                .accountsStrict({
                bidCounter: bidCounter,
                bidder: tempKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
                .signers([tempKeypair])
                .rpc();
        }
        catch (error) {
            throw error;
        }
    }));
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        seller = web3_js_1.Keypair.generate();
        buyer = web3_js_1.Keypair.generate();
        buyer2 = web3_js_1.Keypair.generate();
        buyer3 = web3_js_1.Keypair.generate();
        buyer4 = web3_js_1.Keypair.generate();
        bidPdas = [];
        createdBids = [];
        // Airdrop SOL
        const airdrops = [
            connection.requestAirdrop(seller.publicKey, web3_js_1.LAMPORTS_PER_SOL),
            connection.requestAirdrop(buyer.publicKey, web3_js_1.LAMPORTS_PER_SOL),
            connection.requestAirdrop(buyer2.publicKey, web3_js_1.LAMPORTS_PER_SOL),
            connection.requestAirdrop(buyer3.publicKey, web3_js_1.LAMPORTS_PER_SOL),
            connection.requestAirdrop(buyer4.publicKey, web3_js_1.LAMPORTS_PER_SOL),
        ];
        const signatures = yield Promise.all(airdrops);
        yield Promise.all(signatures.map((sig) => connection.confirmTransaction(sig, 'confirmed')));
        // Create mints
        saleTokenMint = yield (0, spl_token_1.createMint)(connection, seller, seller.publicKey, null, 6, undefined, undefined, spl_token_1.TOKEN_PROGRAM_ID);
        outputTokenMint = yield (0, spl_token_1.createMint)(connection, seller, seller.publicKey, null, 6, undefined, undefined, spl_token_1.TOKEN_PROGRAM_ID);
    }));
    function createDeal(dealId_1) {
        return __awaiter(this, arguments, void 0, function* (dealId, quantity = saleTokenAmount) {
            const sellerTokenAccount = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(connection, seller, saleTokenMint, seller.publicKey, false, undefined, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.mintTo)(connection, seller, saleTokenMint, sellerTokenAccount.address, seller, quantity.toNumber());
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const expiration = currentTimestamp + 3600;
            const conclusionTime = expiration + 600;
            const [dealPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal'), new anchor_1.BN(dealId).toArrayLike(Buffer, 'le', 8)], program.programId);
            const escrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield program.methods
                    .createDeal('TEST', 6, 'USDC', 6, quantity, new anchor_1.BN(1), new anchor_1.BN(expiration), new anchor_1.BN(conclusionTime))
                    .accountsStrict({
                    seller: seller.publicKey,
                    dealCounter: dealCounter,
                    sellerTokensMint: saleTokenMint,
                    buyerTokensMint: outputTokenMint,
                    sellerTokensAccount: sellerTokenAccount.address,
                    dealAccount: dealPda,
                    escrowAccount: escrowPda,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                    .signers([seller])
                    .rpc();
            }
            catch (error) {
                console.log('error creating deal:', error);
                throw error;
            }
            return dealPda;
        });
    }
    function submitBid(bidder, dealPda, bidId, price, quantity) {
        return __awaiter(this, void 0, void 0, function* () {
            const buyerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, bidder.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const buyerSaleTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, bidder.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            // Create accounts if they don't exist
            try {
                yield (0, spl_token_1.getAccount)(connection, buyerOutputTokenAccount);
            }
            catch (error) {
                yield (0, spl_token_1.createAssociatedTokenAccount)(connection, bidder, outputTokenMint, bidder.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            }
            try {
                yield (0, spl_token_1.getAccount)(connection, buyerSaleTokenAccount);
            }
            catch (error) {
                yield (0, spl_token_1.createAssociatedTokenAccount)(connection, bidder, saleTokenMint, bidder.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            }
            const requiredAmount = price.mul(quantity);
            yield (0, spl_token_1.mintTo)(connection, seller, outputTokenMint, buyerOutputTokenAccount, seller, requiredAmount.toNumber());
            const [bidPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid'), new anchor_1.BN(bidId).toArrayLike(Buffer, 'le', 8)], program.programId);
            const bidEscrowAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, bidPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            yield program.methods
                .submitBid(price, quantity)
                .accountsStrict({
                buyer: bidder.publicKey,
                dealAccount: dealPda,
                bidCounter: bidCounter,
                outputTokensMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                buyerTokensAccount: buyerOutputTokenAccount,
                buyerSaleTokenAccount: buyerSaleTokenAccount,
                bidAccount: bidPda,
                bidEscrowAccount: bidEscrowAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .signers([bidder])
                .rpc();
            return { bidPda, escrowAccount: bidEscrowAccount, buyerSaleTokenAccount };
        });
    }
    describe('createDeal', () => {
        it('should successfully create a new deal and escrow tokens', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const currentDealId = dealCounterAccount.currentId;
            dealPda = yield createDeal(Number(currentDealId), saleTokenAmount);
            const dealAccount = yield program.account.deal.fetch(dealPda);
            chai_1.assert.ok(dealAccount.dealId.eq(currentDealId), `Deal ID should be ${currentDealId.toString()}`);
            chai_1.assert.isTrue(dealAccount.seller.equals(seller.publicKey), 'Seller should match');
            chai_1.assert.equal(dealAccount.quantity.toString(), saleTokenAmount.toString(), 'Quantity should match');
            chai_1.assert.deepEqual(dealAccount.status, { active: {} }, 'Deal should be active');
            console.log('✅ Deal created successfully');
        }));
    });
    describe('submitBid', () => {
        beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const currentDealId = dealCounterAccount.currentId;
            dealPda = yield createDeal(Number(currentDealId), saleTokenAmount);
        }));
        it('should successfully submit first bid', () => __awaiter(void 0, void 0, void 0, function* () {
            const bidQuantity = new anchor_1.BN(500000);
            const bidPrice = new anchor_1.BN(2);
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const currentBidId = bidCounterAccount.currentId;
            const bid = yield submitBid(buyer, dealPda, Number(currentBidId), bidPrice, bidQuantity);
            createdBids.push({
                pda: bid.bidPda,
                buyer: buyer.publicKey,
                bidId: currentBidId,
                price: bidPrice,
                quantity: bidQuantity,
                escrowAccount: bid.escrowAccount,
                buyerSaleTokenAccount: bid.buyerSaleTokenAccount,
            });
            const bidAccount = yield program.account.bid.fetch(bid.bidPda);
            chai_1.assert.ok(bidAccount.bidId.eq(currentBidId), 'Bid ID should match');
            chai_1.assert.ok(bidAccount.bidPricePerUnit.eq(bidPrice), 'Bid price should match');
            chai_1.assert.ok(bidAccount.quantity.eq(bidQuantity), 'Bid quantity should match');
            console.log('✅ First bid submitted successfully');
        }));
        it('should successfully submit second bid', () => __awaiter(void 0, void 0, void 0, function* () {
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            let bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const firstBidId = bidCounterAccount.currentId;
            yield submitBid(buyer, dealPda, Number(firstBidId), new anchor_1.BN(2), new anchor_1.BN(500000));
            bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const secondBidId = bidCounterAccount.currentId;
            const bid2Quantity = new anchor_1.BN(300000);
            const bid2Price = new anchor_1.BN(3);
            const bid2 = yield submitBid(buyer2, dealPda, Number(secondBidId), bid2Price, bid2Quantity);
            createdBids.push({
                pda: bid2.bidPda,
                buyer: buyer2.publicKey,
                bidId: secondBidId,
                price: bid2Price,
                quantity: bid2Quantity,
                escrowAccount: bid2.escrowAccount,
                buyerSaleTokenAccount: bid2.buyerSaleTokenAccount,
            });
            const bidAccount = yield program.account.bid.fetch(bid2.bidPda);
            chai_1.assert.ok(bidAccount.bidId.eq(secondBidId), 'Second bid ID should match');
            chai_1.assert.ok(bidAccount.bidPricePerUnit.eq(bid2Price), 'Second bid price should match');
            chai_1.assert.ok(bidAccount.quantity.eq(bid2Quantity), 'Second bid quantity should match');
            console.log('✅ Second bid submitted successfully');
        }));
    });
    describe('concludeDeal', () => {
        beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const currentDealId = dealCounterAccount.currentId;
            dealPda = yield createDeal(Number(currentDealId), saleTokenAmount);
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const currentBidId = bidCounterAccount.currentId;
            const bidQuantity = new anchor_1.BN(500000);
            const bidPrice = new anchor_1.BN(2);
            const bid = yield submitBid(buyer, dealPda, Number(currentBidId), bidPrice, bidQuantity);
            createdBids.push({
                pda: bid.bidPda,
                buyer: buyer.publicKey,
                bidId: currentBidId,
                price: bidPrice,
                quantity: bidQuantity,
                escrowAccount: bid.escrowAccount,
                buyerSaleTokenAccount: bid.buyerSaleTokenAccount,
            });
        }));
        it('should successfully conclude a deal with selected bids', () => __awaiter(void 0, void 0, void 0, function* () {
            const selectedBid = createdBids[0];
            if (!selectedBid) {
                throw new Error('No bids available for deal conclusion');
            }
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield (0, spl_token_1.getAccount)(connection, sellerOutputTokenAccount);
            }
            catch (error) {
                yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            }
            const buyerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, selectedBid.buyer, false, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield (0, spl_token_1.getAccount)(connection, buyerOutputTokenAccount);
            }
            catch (error) {
                yield (0, spl_token_1.createAssociatedTokenAccount)(connection, buyer, // Use the buyer keypair here
                outputTokenMint, selectedBid.buyer, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            }
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            yield program.methods
                .concludeDeal()
                .accountsStrict({
                dealAccount: dealPda,
                seller: seller.publicKey,
                outputTokenMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                dealEscrowAccount: dealEscrowPda,
                sellerOutputTokenAccount: sellerOutputTokenAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .remainingAccounts([
                { pubkey: selectedBid.pda, isWritable: false, isSigner: false },
                {
                    pubkey: selectedBid.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: selectedBid.escrowAccount,
                    isWritable: true,
                    isSigner: false,
                },
                {
                    pubkey: buyerOutputTokenAccount, // This was missing/incomplete
                    isWritable: true,
                    isSigner: false,
                },
            ])
                .signers([seller])
                .rpc();
            const dealAccountAfter = yield program.account.deal.fetch(dealPda);
            chai_1.assert.deepEqual(dealAccountAfter.status, { fulfilled: {} }, 'Deal should be fulfilled');
            chai_1.assert.equal(dealAccountAfter.selectedBids.length, 1, 'Should have 1 selected bid');
            // token balances
            const buyerSaleBalance = yield connection.getTokenAccountBalance(selectedBid.buyerSaleTokenAccount);
            const sellerOutputBalance = yield connection.getTokenAccountBalance(sellerOutputTokenAccount);
            const expectedTokensReceived = selectedBid.quantity;
            const expectedUsdcReceived = selectedBid.price.mul(selectedBid.quantity);
            chai_1.assert.equal(buyerSaleBalance.value.amount, expectedTokensReceived.toString(), 'Buyer should receive the correct amount of sale tokens');
            chai_1.assert.equal(sellerOutputBalance.value.amount, expectedUsdcReceived.toString(), 'Seller should receive the correct USDC payment');
            console.log('✅ Deal conclusion successful!');
        }));
    });
    describe('Submitting Multiple Bids', () => {
        it('should select highest price bids first', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID), new anchor_1.BN(1000000));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            let bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            let bidID = bidCounterAccount.currentId;
            // Price: 1, Qty: 300k
            const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(1), new anchor_1.BN(300000));
            // Price: 3, Qty: 400k
            bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            bidID = bidCounterAccount.currentId;
            const bid2 = yield submitBid(buyer2, dealPda, Number(bidID), new anchor_1.BN(3), new anchor_1.BN(400000));
            // Price: 2, Qty: 500k
            bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            bidID = bidCounterAccount.currentId;
            const bid3 = yield submitBid(buyer3, dealPda, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(500000));
            // Price: 0.5, Qty: 200k (should NOT be selected - will be auto-refunded)
            bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            bidID = bidCounterAccount.currentId;
            const bid4 = yield submitBid(buyer4, dealPda, Number(bidID), new anchor_1.BN(1), new anchor_1.BN(100000));
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            const buyer1OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const buyer2OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer2.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const buyer3OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer3.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const buyer4OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer4.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            const initialBuyer4OutputBalance = yield connection.getTokenAccountBalance(buyer4OutputAccount);
            yield program.methods
                .concludeDeal()
                .accountsStrict({
                dealAccount: dealPda,
                seller: seller.publicKey,
                outputTokenMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                dealEscrowAccount: dealEscrowPda,
                sellerOutputTokenAccount: sellerOutputTokenAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .remainingAccounts([
                // Bid 1
                { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid1.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer1OutputAccount, isWritable: true, isSigner: false },
                // Bid 2
                { pubkey: bid2.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid2.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid2.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer2OutputAccount, isWritable: true, isSigner: false },
                // Bid 3
                { pubkey: bid3.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid3.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid3.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer3OutputAccount, isWritable: true, isSigner: false },
                // Bid 4
                { pubkey: bid4.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid4.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid4.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer4OutputAccount, isWritable: true, isSigner: false },
            ])
                .signers([seller])
                .rpc();
            const dealAccount = yield program.account.deal.fetch(dealPda);
            chai_1.assert.deepEqual(dealAccount.status, { fulfilled: {} });
            chai_1.assert.equal(dealAccount.selectedBids.length, 3);
            const buyer2Balance = yield connection.getTokenAccountBalance(bid2.buyerSaleTokenAccount);
            const buyer3Balance = yield connection.getTokenAccountBalance(bid3.buyerSaleTokenAccount);
            const buyer1Balance = yield connection.getTokenAccountBalance(bid1.buyerSaleTokenAccount);
            chai_1.assert.equal(buyer2Balance.value.amount, '400000');
            chai_1.assert.equal(buyer3Balance.value.amount, '500000');
            chai_1.assert.equal(buyer1Balance.value.amount, '100000');
            const finalBuyer4OutputBalance = yield connection.getTokenAccountBalance(buyer4OutputAccount);
            const expectedRefund = 1 * 100000;
            const actualRefund = parseInt(finalBuyer4OutputBalance.value.amount) -
                parseInt(initialBuyer4OutputBalance.value.amount);
            chai_1.assert.equal(actualRefund, expectedRefund);
            const bid4EscrowBalance = yield connection.getTokenAccountBalance(bid4.escrowAccount);
            chai_1.assert.equal(bid4EscrowBalance.value.amount, '0');
            console.log('✅ Multiple bids optimization test passed');
        }));
        it('should handle partial bid fulfillment correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID), new anchor_1.BN(500000));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(800000));
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            const buyerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield (0, spl_token_1.getAccount)(connection, buyerOutputTokenAccount);
            }
            catch (error) {
                yield (0, spl_token_1.createAssociatedTokenAccount)(connection, buyer, outputTokenMint, buyer.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            }
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            yield program.methods
                .concludeDeal()
                .accountsStrict({
                dealAccount: dealPda,
                seller: seller.publicKey,
                outputTokenMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                dealEscrowAccount: dealEscrowPda,
                sellerOutputTokenAccount: sellerOutputTokenAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .remainingAccounts([
                { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid1.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                {
                    pubkey: buyerOutputTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
            ])
                .signers([seller])
                .rpc();
            const buyerBalance = yield connection.getTokenAccountBalance(bid1.buyerSaleTokenAccount);
            chai_1.assert.equal(buyerBalance.value.amount, '500000');
            const sellerBalance = yield connection.getTokenAccountBalance(sellerOutputTokenAccount);
            chai_1.assert.equal(sellerBalance.value.amount, '1000000');
            const buyerRefundBalance = yield connection.getTokenAccountBalance(buyerOutputTokenAccount);
            // Refund should be: (800k - 500k) * 2 = 300k * 2 = 600k
            chai_1.assert.equal(buyerRefundBalance.value.amount, '600000');
            console.log('✅ Partial bid fulfillment test passed');
        }));
    });
    describe('Error Cases', () => {
        it('should fail when bid does not belong to deal', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount1 = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID1 = dealCounterAccount1.currentId;
            const dealPda1 = yield createDeal(Number(DealID1));
            const dealCounterAccount2 = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID2 = dealCounterAccount2.currentId;
            const dealPda2 = yield createDeal(Number(DealID2));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            const bid1 = yield submitBid(buyer, dealPda2, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(100000));
            const bidCounterAccount2 = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID2 = bidCounterAccount2.currentId;
            const buyerOutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const bid2 = yield submitBid(buyer, dealPda1, Number(bidID2), new anchor_1.BN(2), new anchor_1.BN(100000));
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda1, true, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield program.methods
                    .concludeDeal()
                    .accountsStrict({
                    dealAccount: dealPda1, // Deal 1
                    seller: seller.publicKey,
                    outputTokenMint: outputTokenMint,
                    saleTokensMint: saleTokenMint,
                    dealEscrowAccount: dealEscrowPda,
                    sellerOutputTokenAccount: sellerOutputTokenAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                })
                    .remainingAccounts([
                    { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                    {
                        pubkey: bid1.buyerSaleTokenAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                    { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                    { pubkey: buyerOutputAccount, isWritable: true, isSigner: false },
                ])
                    .signers([seller])
                    .rpc();
                chai_1.assert.fail('Should have failed with invalid bid for deal');
            }
            catch (error) {
                const errorStr = error instanceof Error
                    ? error.toString().toLowerCase()
                    : String(error).toLowerCase();
                const errorMsg = error instanceof Error ? ((_a = error.message) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '' : '';
                const errorCode = error instanceof anchor_2.AnchorError ? (_c = (_b = error.error) === null || _b === void 0 ? void 0 : _b.errorCode) === null || _c === void 0 ? void 0 : _c.code : '';
                if (errorStr.includes('invalidbidfordeal') ||
                    errorMsg.includes('invalidbidfordeal') ||
                    errorStr.includes('invalid bid') ||
                    errorMsg.includes('invalid bid') ||
                    errorCode === 'InvalidBidForDeal') {
                    console.log('✅ Invalid bid for deal error case passed');
                }
                else {
                    console.log('Expected InvalidBidForDeal error, but got:', errorCode);
                    console.log('Full error:', error);
                    chai_1.assert.fail(`Expected InvalidBidForDeal error, but got: ${errorCode}`);
                }
            }
        }));
        it('should fail when non-seller tries to conclude deal', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(100000));
            const buyerOutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey);
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            try {
                yield program.methods
                    .concludeDeal()
                    .accountsStrict({
                    dealAccount: dealPda,
                    seller: buyer.publicKey, // Wrong seller!
                    outputTokenMint: outputTokenMint,
                    saleTokensMint: saleTokenMint,
                    dealEscrowAccount: dealEscrowPda,
                    sellerOutputTokenAccount: sellerOutputTokenAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                })
                    .remainingAccounts([
                    { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                    {
                        pubkey: bid1.buyerSaleTokenAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                    { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                    { pubkey: buyerOutputAccount, isWritable: true, isSigner: false },
                ])
                    .signers([buyer])
                    .rpc();
                chai_1.assert.fail('Should have failed with unauthorized seller');
            }
            catch (error) {
                console.log('✅ Unauthorized seller error case passed');
            }
        }));
    });
    describe('Deal Status and State Changes', () => {
        it('should not allow concluding an already concluded deal', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(100000));
            const buyerOutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            yield program.methods
                .concludeDeal()
                .accountsStrict({
                dealAccount: dealPda,
                seller: seller.publicKey,
                outputTokenMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                dealEscrowAccount: dealEscrowPda,
                sellerOutputTokenAccount: sellerOutputTokenAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .remainingAccounts([
                { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid1.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyerOutputAccount, isWritable: true, isSigner: false },
            ])
                .signers([seller])
                .rpc();
            try {
                yield program.methods
                    .concludeDeal()
                    .accountsStrict({
                    dealAccount: dealPda,
                    seller: seller.publicKey,
                    outputTokenMint: outputTokenMint,
                    saleTokensMint: saleTokenMint,
                    dealEscrowAccount: dealEscrowPda,
                    sellerOutputTokenAccount: sellerOutputTokenAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                })
                    .remainingAccounts([
                    { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                    {
                        pubkey: bid1.buyerSaleTokenAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                    { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                    { pubkey: buyerOutputAccount, isWritable: true, isSigner: false },
                ])
                    .signers([seller])
                    .rpc();
                chai_1.assert.fail('Should have failed on second conclusion');
            }
            catch (error) {
                console.log('✅ Double conclusion prevention test passed');
            }
        }));
        it('should correctly update selected_bids array', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(3), new anchor_1.BN(300000));
            const buyerOutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const bidCounterAccount2 = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID2 = bidCounterAccount2.currentId;
            const bid2 = yield submitBid(buyer2, dealPda, Number(bidID2), new anchor_1.BN(2), new anchor_1.BN(400000));
            const buyer2OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer2.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const bidCounterAccount3 = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID3 = bidCounterAccount3.currentId;
            const bid3 = yield submitBid(buyer3, dealPda, Number(bidID3), new anchor_1.BN(1), new anchor_1.BN(500000));
            const buyer3OutputAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, buyer3.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            const sellerOutputTokenAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(outputTokenMint, seller.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID);
            yield (0, spl_token_1.createAssociatedTokenAccount)(connection, seller, outputTokenMint, seller.publicKey, undefined, spl_token_1.TOKEN_PROGRAM_ID);
            const dealEscrowPda = (0, spl_token_1.getAssociatedTokenAddressSync)(saleTokenMint, dealPda, true, spl_token_1.TOKEN_PROGRAM_ID);
            yield program.methods
                .concludeDeal()
                .accountsStrict({
                dealAccount: dealPda,
                seller: seller.publicKey,
                outputTokenMint: outputTokenMint,
                saleTokensMint: saleTokenMint,
                dealEscrowAccount: dealEscrowPda,
                sellerOutputTokenAccount: sellerOutputTokenAccount,
                tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            })
                .remainingAccounts([
                // first account
                { pubkey: bid3.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid3.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid3.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer3OutputAccount, isWritable: true, isSigner: false },
                // second account
                { pubkey: bid1.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid1.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid1.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyerOutputAccount, isWritable: true, isSigner: false },
                // third account
                { pubkey: bid2.bidPda, isWritable: false, isSigner: false },
                {
                    pubkey: bid2.buyerSaleTokenAccount,
                    isWritable: true,
                    isSigner: false,
                },
                { pubkey: bid2.escrowAccount, isWritable: true, isSigner: false },
                { pubkey: buyer2OutputAccount, isWritable: true, isSigner: false },
            ])
                .signers([seller])
                .rpc();
            const dealAccount = yield program.account.deal.fetch(dealPda);
            chai_1.assert.equal(dealAccount.selectedBids.length, 3);
            console.log('✅ Selected bids array update test passed');
        }));
    });
    describe('handle zero quantity bid cases', () => {
        it('should handle zero quantity bids gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            const dealCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], program.programId)[0];
            const dealCounterAccount = yield program.account.dealCounter.fetch(dealCounterPda);
            const DealID = dealCounterAccount.currentId;
            const dealPda = yield createDeal(Number(DealID));
            const bidCounterPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], program.programId)[0];
            const bidCounterAccount = yield program.account.bidCounter.fetch(bidCounterPda);
            const bidID = bidCounterAccount.currentId;
            try {
                const bid1 = yield submitBid(buyer, dealPda, Number(bidID), new anchor_1.BN(2), new anchor_1.BN(0));
                chai_1.assert.fail('Should not allow zero quantity bids');
            }
            catch (error) {
                console.log('✅ Zero quantity bid properly rejected');
            }
        }));
    });
});

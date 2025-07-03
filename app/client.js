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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DotcClient = void 0;
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const fs_1 = require("fs");
const path_1 = require("path");
const dotc_json_1 = __importDefault(require("../target/idl/dotc.json"));
const RPC_URL = 'http://127.0.0.1:8899';
const PROGRAM_ID = new web3_js_1.PublicKey('4qoo54cDUhCeiAFyxTWBsMb9CjEuPbNAnLhZ4v8bCF63');
const WALLET_PATH = (0, path_1.resolve)('/home/chandini/.config/solana/id.json');
function loadKeypair() {
    const secret = JSON.parse((0, fs_1.readFileSync)(WALLET_PATH, 'utf8'));
    return web3_js_1.Keypair.fromSecretKey(Uint8Array.from(secret));
}
class DotcClient {
    constructor(connection, provider, program, wallet) {
        this.sellerTokens = null;
        this.bidderTokens = [];
        this.connection = connection;
        this.program = program;
        this.provider = provider;
        this.wallet = wallet;
        this.sellerKeypair = web3_js_1.Keypair.generate();
        this.bidderKeypairs = [
            web3_js_1.Keypair.generate(),
            web3_js_1.Keypair.generate(),
            web3_js_1.Keypair.generate(),
        ];
        [this.dealCounter] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal_counter')], this.program.programId);
        [this.bidCounter] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid_counter')], this.program.programId);
    }
    static init() {
        return __awaiter(this, void 0, void 0, function* () {
            const keypair = loadKeypair();
            const connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
            const wallet = new anchor.Wallet(keypair);
            const provider = new anchor.AnchorProvider(connection, wallet, {
                commitment: 'confirmed',
            });
            anchor.setProvider(provider);
            const idl = dotc_json_1.default;
            const program = new anchor.Program(idl, provider);
            const client = new DotcClient(connection, provider, program, wallet);
            yield client.fundKeypairs();
            return client;
        });
    }
    fundKeypairs() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('💰 Funding keypairs...');
            // Fund seller
            const sellerTx = yield this.connection.requestAirdrop(this.sellerKeypair.publicKey, 2 * web3_js_1.LAMPORTS_PER_SOL);
            yield this.connection.confirmTransaction(sellerTx);
            console.log(`✅ Funded seller: ${this.sellerKeypair.publicKey.toString()}`);
            // Fund bidders
            for (let i = 0; i < this.bidderKeypairs.length; i++) {
                const bidderTx = yield this.connection.requestAirdrop(this.bidderKeypairs[i].publicKey, 2 * web3_js_1.LAMPORTS_PER_SOL);
                yield this.connection.confirmTransaction(bidderTx);
                console.log(`✅ Funded bidder ${i + 1}: ${this.bidderKeypairs[i].publicKey.toString()}`);
            }
        });
    }
    createTestTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('===============================================================');
            console.log('🪙 Creating separate tokens account for each participant...');
            const sellerSaleTokenMint = yield (0, spl_token_1.createMint)(this.connection, this.wallet.payer, this.wallet.publicKey, null, 6);
            console.log('🪙 Created seller-token-mint...', sellerSaleTokenMint.toBase58());
            const sellerOutputTokenMint = yield (0, spl_token_1.createMint)(this.connection, this.wallet.payer, this.wallet.publicKey, null, 6);
            console.log('🪙 Created seller-output-token-mint...', sellerOutputTokenMint.toBase58());
            const sellerSaleTokenAccount = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this.connection, this.wallet.payer, sellerSaleTokenMint, this.sellerKeypair.publicKey);
            console.log('🪙 Created seller-sale-token-account...', sellerSaleTokenAccount.address.toBase58());
            const sellerOutputTokenAccount = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this.connection, this.wallet.payer, sellerOutputTokenMint, this.sellerKeypair.publicKey);
            console.log('🪙 Created seller-output-token-account...', sellerOutputTokenAccount.address.toBase58());
            // Mint tokens to seller
            yield (0, spl_token_1.mintTo)(this.connection, this.wallet.payer, sellerSaleTokenMint, sellerSaleTokenAccount.address, this.wallet.payer, 1000000);
            this.sellerTokens = {
                saleTokenMint: sellerSaleTokenMint,
                outputTokenMint: sellerOutputTokenMint,
                saleTokenAccount: sellerSaleTokenAccount.address,
                outputTokenAccount: sellerOutputTokenAccount.address,
            };
            // Create tokens for each bidder
            for (let i = 0; i < this.bidderKeypairs.length; i++) {
                const bidder = this.bidderKeypairs[i];
                const bidderSaleTokenMint = sellerSaleTokenMint;
                const bidderOutputTokenMint = sellerOutputTokenMint;
                const bidderSaleTokenAccount = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this.connection, this.wallet.payer, bidderSaleTokenMint, bidder.publicKey);
                const bidderOutputTokenAccount = yield (0, spl_token_1.getOrCreateAssociatedTokenAccount)(this.connection, this.wallet.payer, bidderOutputTokenMint, bidder.publicKey);
                yield (0, spl_token_1.mintTo)(this.connection, this.wallet.payer, bidderOutputTokenMint, bidderOutputTokenAccount.address, this.wallet.payer, 2000000);
                this.bidderTokens.push({
                    saleTokenMint: bidderSaleTokenMint,
                    outputTokenMint: bidderOutputTokenMint,
                    saleTokenAccount: bidderSaleTokenAccount.address,
                    outputTokenAccount: bidderOutputTokenAccount.address,
                });
            }
            console.log('===============================================================');
            console.log('\n');
        });
    }
    initializeDealCounter() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tx = yield this.program.methods
                    .initializeDealCounter()
                    .accountsStrict({
                    dealCounter: this.dealCounter,
                    seller: this.sellerKeypair.publicKey,
                    systemProgram: web3_js_1.SystemProgram.programId,
                })
                    .signers([this.sellerKeypair])
                    .rpc();
                console.log('✅ Deal counter initialized:', tx);
                return tx;
            }
            catch (error) {
                console.error('❌ Error initializing deal counter:', error);
                throw error;
            }
        });
    }
    initializeBidCounter() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const tx = yield this.program.methods
                    .initializeBidCounter()
                    .accountsStrict({
                    bidCounter: this.bidCounter,
                    bidder: this.bidderKeypairs[0].publicKey,
                    systemProgram: web3_js_1.SystemProgram.programId,
                })
                    .signers([this.bidderKeypairs[0]])
                    .rpc();
                console.log('✅ Bid counter initialized:', tx);
                return tx;
            }
            catch (error) {
                console.error('❌ Error initializing bid counter:', error);
                throw error;
            }
        });
    }
    getDealCounter() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dealCounterAccount = yield this.program.account.dealCounter.fetch(this.dealCounter);
                const formatted = {
                    currentId: dealCounterAccount.currentId.toString(),
                };
                console.log(JSON.stringify({ dealCounter: formatted }, null, 1));
                return dealCounterAccount;
            }
            catch (error) {
                console.error('❌ Error fetching deal counter:', error);
                throw error;
            }
        });
    }
    createDeal(saleTokenMint, outputTokenMint, dealInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.sellerTokens) {
                    throw new Error('Seller tokens not initialized. Call createTestTokens() first.');
                }
                // Get current deal counter
                const dealCounterAccount = yield this.program.account.dealCounter.fetch(this.dealCounter);
                const dealId = dealCounterAccount.currentId.toNumber();
                // Generate deal PDA
                const [dealPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal'), new anchor_1.BN(dealId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                // Generate escrow account PDA
                const escrowAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(this.sellerTokens.saleTokenMint, dealPda, true);
                const tx = yield this.program.methods
                    .createDeal(dealInfo.saleTokenSymbol, dealInfo.saleTokenDecimals, dealInfo.outputTokenSymbol, dealInfo.outputTokenDecimals, new anchor_1.BN(dealInfo.quantity), new anchor_1.BN(dealInfo.minPrice), new anchor_1.BN(dealInfo.expiration), new anchor_1.BN(dealInfo.conclusionTime))
                    .accountsStrict({
                    seller: this.sellerKeypair.publicKey,
                    dealCounter: this.dealCounter,
                    sellerTokensMint: this.sellerTokens.saleTokenMint,
                    buyerTokensMint: this.sellerTokens.outputTokenMint,
                    sellerTokensAccount: this.sellerTokens.saleTokenAccount,
                    dealAccount: dealPda,
                    escrowAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    systemProgram: web3_js_1.SystemProgram.programId,
                    associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                    .signers([this.sellerKeypair])
                    .rpc();
                console.log(`✅ Deal created with ID ${dealId}:`, tx);
                console.log("\n");
                console.log('=========================================================');
                return { dealId, dealPda };
            }
            catch (error) {
                console.error('❌ Error creating deal:', error);
                throw error;
            }
        });
    }
    getDeal(dealId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [dealPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal'), new anchor_1.BN(dealId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                const dealAccount = yield this.program.account.deal.fetch(dealPda);
                console.log(JSON.stringify({
                    deal: {
                        dealId: dealAccount.dealId.toString(),
                        seller: dealAccount.seller.toString(),
                        saleToken: {
                            symbol: dealAccount.saleToken.symbol,
                            address: dealAccount.saleToken.address.toString(),
                            decimals: dealAccount.saleToken.decimals,
                        },
                        outputToken: {
                            symbol: dealAccount.outputToken.symbol,
                            address: dealAccount.outputToken.address.toString(),
                            decimals: dealAccount.outputToken.decimals,
                        },
                        quantity: dealAccount.quantity.toString(),
                        minPricePerUnit: dealAccount.minPricePerUnit.toString(),
                        expiryTime: dealAccount.expiryTime.toString(),
                        conclusionTime: dealAccount.conclusionTime.toString(),
                        fulfilledQuantity: dealAccount.fulfilledQuantity.toString(),
                        status: Object.keys(dealAccount.status)[0],
                        bids: dealAccount.bids.map((bid) => bid.toString()),
                        selectedBids: dealAccount.selectedBids.map((bid) => bid.toString()),
                    },
                }, null, 2));
                return dealAccount;
            }
            catch (error) {
                console.error('❌ Error fetching deal:', error);
                throw error;
            }
        });
    }
    submitBid(dealPda, bidderIndex, bidInfo) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const bidder = this.bidderKeypairs[bidderIndex];
                const bidderTokenInfo = this.bidderTokens[bidderIndex];
                // Get current bid counter
                const bidCounterAccount = yield this.program.account.bidCounter.fetch(this.bidCounter);
                const bidId = bidCounterAccount.currentId.toNumber();
                // Generate bid PDA
                const [bidPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid'), new anchor_1.BN(bidId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                const buyerTokensAccount = bidderTokenInfo.outputTokenAccount;
                const buyerSaleTokenAccount = bidderTokenInfo.saleTokenAccount;
                // Generate bid escrow account
                const bidEscrowAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(bidderTokenInfo.outputTokenMint, bidPda, true);
                const tx = yield this.program.methods
                    .submitBid(new anchor_1.BN(bidInfo.bidPricePerUnit), new anchor_1.BN(bidInfo.quantity))
                    .accountsStrict({
                    buyer: bidder.publicKey,
                    dealAccount: dealPda,
                    bidCounter: this.bidCounter,
                    outputTokensMint: bidderTokenInfo.outputTokenMint,
                    saleTokensMint: bidderTokenInfo.saleTokenMint,
                    buyerTokensAccount,
                    buyerSaleTokenAccount,
                    bidAccount: bidPda,
                    bidEscrowAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    systemProgram: web3_js_1.SystemProgram.programId,
                    associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                    .signers([bidder])
                    .rpc();
                console.log(`✅ Bid ${bidId} submitted by bidder ${bidderIndex + 1}:`, tx);
                return { bidId, bidPda };
            }
            catch (error) {
                console.error(`❌ Error submitting bid for bidder ${bidderIndex + 1}:`, error);
                throw error;
            }
        });
    }
    getBid(bidId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const [bidPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid'), new anchor_1.BN(bidId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                const bidAccount = yield this.program.account.bid.fetch(bidPda);
                console.log(JSON.stringify({
                    bid: {
                        bidId: bidAccount.bidId.toString(),
                        buyer: bidAccount.buyer.toString(),
                        dealId: bidAccount.dealId.toString(),
                        bidPricePerUnit: bidAccount.bidPricePerUnit.toString(),
                        quantity: bidAccount.quantity.toString(),
                        usdcDeposit: bidAccount.usdcDeposit.toString(),
                        timestamp: bidAccount.timestamp.toString(),
                    },
                }, null, 2));
                return bidAccount;
            }
            catch (error) {
                console.error('❌ Error fetching bid:', error);
                throw error;
            }
        });
    }
    concludeDeal(dealId, bidIds) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.sellerTokens) {
                    throw new Error('Seller tokens not initialized');
                }
                // Generate deal PDA
                const [dealPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('deal'), new anchor_1.BN(dealId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                // Get deal escrow account
                const dealEscrowAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(this.sellerTokens.saleTokenMint, dealPda, true);
                // Get seller's output token account
                const sellerOutputTokenAccount = this.sellerTokens.outputTokenAccount;
                // Prepare remaining accounts for each bid
                const remainingAccounts = [];
                for (const bidId of bidIds) {
                    // Generate bid PDA
                    const [bidPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bid'), new anchor_1.BN(bidId).toArrayLike(Buffer, 'le', 8)], this.program.programId);
                    // Get bid account to find the buyer
                    const bidAccount = yield this.program.account.bid.fetch(bidPda);
                    const buyerPublicKey = bidAccount.buyer;
                    // Find which bidder this corresponds to
                    const bidderIndex = this.bidderKeypairs.findIndex((keypair) => keypair.publicKey.equals(buyerPublicKey));
                    if (bidderIndex === -1) {
                        throw new Error(`Unknown buyer for bid ${bidId}: ${buyerPublicKey.toString()}`);
                    }
                    const bidderTokenInfo = this.bidderTokens[bidderIndex];
                    // Get buyer's sale token account (where they'll receive the sale tokens)
                    const buyerSaleTokenAccount = bidderTokenInfo.saleTokenAccount;
                    // Get bid escrow account (where their payment is held)
                    const bidEscrowAccount = (0, spl_token_1.getAssociatedTokenAddressSync)(bidderTokenInfo.outputTokenMint, bidPda, true);
                    // Get buyer's output token account (for refunds)
                    const buyerOutputTokenAccount = bidderTokenInfo.outputTokenAccount;
                    // Add the 4 accounts per bid as expected by the program
                    remainingAccounts.push(
                    // bid_account_info
                    {
                        pubkey: bidPda,
                        isWritable: true,
                        isSigner: false,
                    }, 
                    // buyer_sale_account_info
                    {
                        pubkey: buyerSaleTokenAccount,
                        isWritable: true,
                        isSigner: false,
                    }, 
                    // bid_escrow_account_info
                    {
                        pubkey: bidEscrowAccount,
                        isWritable: true,
                        isSigner: false,
                    }, 
                    // buyer_output_account_info
                    {
                        pubkey: buyerOutputTokenAccount,
                        isWritable: true,
                        isSigner: false,
                    });
                }
                console.log("======================================================");
                console.log("\n");
                console.log(`🔄 Concluding deal ${dealId} with ${bidIds.length} bids...`);
                const tx = yield this.program.methods
                    .concludeDeal()
                    .accountsStrict({
                    dealAccount: dealPda,
                    seller: this.sellerKeypair.publicKey,
                    outputTokenMint: this.sellerTokens.outputTokenMint,
                    saleTokensMint: this.sellerTokens.saleTokenMint,
                    dealEscrowAccount,
                    sellerOutputTokenAccount,
                    tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
                    associatedTokenProgram: spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                    .remainingAccounts(remainingAccounts)
                    .signers([this.sellerKeypair])
                    .rpc();
                console.log(`✅ Deal ${dealId} concluded successfully:`, tx);
                console.log("\n");
                console.log("======================================================");
                return tx;
            }
            catch (error) {
                console.error(`❌ Error concluding deal ${dealId}:`, error);
                throw error;
            }
        });
    }
    logBalances(title) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`\n📊 ${title}`);
            console.log('='.repeat(50));
            const snapshots = [];
            try {
                // Log seller balances
                if (this.sellerTokens) {
                    const sellerSaleBalance = yield this.connection.getTokenAccountBalance(this.sellerTokens.saleTokenAccount);
                    const sellerOutputBalance = yield this.connection.getTokenAccountBalance(this.sellerTokens.outputTokenAccount);
                    const sellerSnapshot = {
                        participant: `Seller (${this.sellerKeypair.publicKey
                            .toString()
                            .slice(0, 8)}...)`,
                        saleTokenBalance: sellerSaleBalance.value.amount,
                        outputTokenBalance: sellerOutputBalance.value.amount,
                    };
                    console.log(`🏪 ${sellerSnapshot.participant}:`);
                    console.log(`   Sale Tokens (USDT):   ${sellerSnapshot.saleTokenBalance}`);
                    console.log(`   Output Tokens (USDC): ${sellerSnapshot.outputTokenBalance}`);
                    snapshots.push(sellerSnapshot);
                }
                // Log bidder balances
                for (let i = 0; i < this.bidderKeypairs.length; i++) {
                    if (this.bidderTokens[i]) {
                        const bidderSaleBalance = yield this.connection.getTokenAccountBalance(this.bidderTokens[i].saleTokenAccount);
                        const bidderOutputBalance = yield this.connection.getTokenAccountBalance(this.bidderTokens[i].outputTokenAccount);
                        const bidderSnapshot = {
                            participant: `Bidder ${i + 1} (${this.bidderKeypairs[i].publicKey
                                .toString()
                                .slice(0, 8)}...)`,
                            saleTokenBalance: bidderSaleBalance.value.amount,
                            outputTokenBalance: bidderOutputBalance.value.amount,
                        };
                        console.log(`🛒 ${bidderSnapshot.participant}:`);
                        console.log(`   Sale Tokens (USDT):   ${bidderSnapshot.saleTokenBalance}`);
                        console.log(`   Output Tokens (USDC): ${bidderSnapshot.outputTokenBalance}`);
                        snapshots.push(bidderSnapshot);
                    }
                }
            }
            catch (error) {
                console.error('❌ Error fetching balances:', error);
            }
            console.log('='.repeat(50));
            return snapshots;
        });
    }
}
exports.DotcClient = DotcClient;
function trade() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield DotcClient.init();
        const dealCounterExists = yield client.connection.getAccountInfo(client.dealCounter);
        if (!dealCounterExists) {
            yield client.initializeDealCounter();
        }
        const bidCounterExists = yield client.connection.getAccountInfo(client.bidCounter);
        if (!bidCounterExists) {
            yield client.initializeBidCounter();
        }
        yield client.createTestTokens();
        const saleTokenMint = client.sellerTokens.saleTokenMint;
        const outputTokenMint = client.sellerTokens.outputTokenMint;
        const { dealId, dealPda } = yield client.createDeal(saleTokenMint, outputTokenMint, {
            saleTokenSymbol: 'USDT',
            saleTokenDecimals: 6,
            outputTokenSymbol: 'USDC',
            outputTokenDecimals: 6,
            quantity: 1000000,
            minPrice: 1, // 1 USDC per USDT
            expiration: Math.floor(Date.now() / 1000) + 3600,
            conclusionTime: Math.floor(Date.now() / 1000) + 1800,
        });
        console.log('🪙 fetch deal before deal conclusion');
        yield client.getDeal(dealId);
        const bidIds = [];
        // Bidder 1
        const { bidId: bid1Id } = yield client.submitBid(dealPda, 0, {
            bidPricePerUnit: 1, // 1 USDT per 1 USDC
            quantity: 200000,
        });
        bidIds.push(bid1Id);
        // Bidder 2
        const { bidId: bid2Id } = yield client.submitBid(dealPda, 1, {
            bidPricePerUnit: 2, // 1 USDT per 2 USDC
            quantity: 1000000,
        });
        bidIds.push(bid2Id);
        // // Bidder 3
        // const { bidId: bid3Id } = await client.submitBid(dealPda, 2, {
        //   bidPricePerUnit: 1, // 1 USDt per USDc
        //   quantity: 400000, 
        // });
        // bidIds.push(bid3Id);
        console.log('🪙 fetch all bids');
        for (const bidId of bidIds) {
            yield client.getBid(bidId);
        }
        const balancesBefore = yield client.logBalances('BALANCES BEFORE DEAL CONCLUSION');
        yield client.concludeDeal(dealId, bidIds);
        console.log('✅ deal after conclusion');
        yield client.getDeal(dealId);
        // ✨ LOG BALANCES AFTER CONCLUDING DEAL
        const balancesAfter = yield client.logBalances('BALANCES AFTER DEAL CONCLUSION');
    });
}
trade().catch(console.error);

// import * as anchor from "@coral-xyz/anchor";
// import { BN } from "@coral-xyz/anchor";
// import {
//   TOKEN_PROGRAM_ID,
//   createMint,
//   getAssociatedTokenAddressSync,
//   mintTo,
//   createAssociatedTokenAccount,
// } from "@solana/spl-token";
// import {
//   Keypair,
//   PublicKey,
//   LAMPORTS_PER_SOL,
// } from "@solana/web3.js";
// import { assert } from "chai";
// import type { Dotc } from "../target/types/dotc";

// describe("dotc", () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);
//   const program = anchor.workspace.Dotc as anchor.Program<Dotc>;
//   const connection = provider.connection;

//   let seller: Keypair;
//   let buyer: Keypair;
//   let saleTokenMint: PublicKey;
//   let outputTokenMint: PublicKey;
//   let dealCounter: PublicKey;
//   let bidCounter: PublicKey;
//   let dealPda: PublicKey;
  
//   const saleTokenAmount = new BN(1_000_000);

//   before(async () => {
//     // 1. Create and fund the seller and buyer
//     seller = Keypair.generate();
//     buyer = Keypair.generate();

//     const sellerAirdrop = await connection.requestAirdrop(seller.publicKey, LAMPORTS_PER_SOL);
//     const buyerAirdrop = await connection.requestAirdrop(buyer.publicKey, LAMPORTS_PER_SOL);
    
//     await connection.confirmTransaction(sellerAirdrop, "confirmed");
//     await connection.confirmTransaction(buyerAirdrop, "confirmed");

//     // 2. Create token mints
//     saleTokenMint = await createMint(
//       connection,
//       seller,
//       seller.publicKey,
//       null,
//       6,
//       undefined,
//       undefined,
//       TOKEN_PROGRAM_ID
//     );

//     outputTokenMint = await createMint(
//       connection,
//       buyer,
//       buyer.publicKey,
//       null,
//       6,
//       undefined,
//       undefined,
//       TOKEN_PROGRAM_ID
//     );

//     // 3. Initialize deal counter PDA
//     [dealCounter] = PublicKey.findProgramAddressSync(
//       [Buffer.from("deal_counter")],
//       program.programId
//     );

//     await program.methods.initializeDealCounter()
//       .accountsStrict({
//         dealCounter: dealCounter,
//         seller: seller.publicKey,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([seller])
//       .rpc();

//     // 4. Initialize bid counter PDA
//     [bidCounter] = PublicKey.findProgramAddressSync(
//       [Buffer.from("bid_counter")],
//       program.programId
//     );

//     await program.methods.initializeBidCounter()
//       .accountsStrict({
//         bidCounter: bidCounter,
//         bidder: buyer.publicKey,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([buyer])
//       .rpc();
//   });

//   describe("createDeal", () => {
//     it("should successfully create a new deal and escrow tokens", async () => {
//       console.log("Expected seller token mint:", saleTokenMint.toBase58());

//       // 1. Create seller's token account
//       const sellerTokenAccount = await createAssociatedTokenAccount(
//         connection,
//         seller,
//         saleTokenMint,
//         seller.publicKey,
//         undefined,
//         TOKEN_PROGRAM_ID
//       );

//       // 2. Mint tokens to seller's token account
//       await mintTo(
//         connection,
//         seller,
//         saleTokenMint,
//         sellerTokenAccount,
//         seller,
//         saleTokenAmount.toNumber()
//       );

//       // 3. Set deal parameters
//       const currentTimestamp = Math.floor(Date.now() / 1000);
//       const expiration = currentTimestamp + 3600; // 1 hour from now
//       const conclusionTime = expiration + 600;    // 10 minutes after expiration

//       // 4. Derive deal PDA (deal_id = 1 after init)
//       [dealPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("deal"), new BN(1).toArrayLike(Buffer, "le", 8)],
//         program.programId
//       );

//       // 5. Get escrow PDA (ATA of deal PDA)
//       const escrowPda = getAssociatedTokenAddressSync(
//         saleTokenMint,
//         dealPda,
//         true, // allowOwnerOffCurve for PDAs
//         TOKEN_PROGRAM_ID
//       );

//       // 6. Call createDeal
//       await program.methods.createDeal(
//         "TEST",                   
//         6,                       
//         "USDC",                   
//         6,                        
//         saleTokenAmount,          
//         new BN(1),                // min_price = 1 USDC per token
//         new BN(expiration),       
//         new BN(conclusionTime)    
//       )
//       .accountsStrict({
//         seller: seller.publicKey,
//         dealCounter: dealCounter,
//         sellerTokensMint: saleTokenMint,
//         buyerTokensMint: outputTokenMint,
//         sellerTokensAccount: sellerTokenAccount,
//         dealAccount: dealPda,
//         escrowAccount: escrowPda,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([seller])
//       .rpc();

//       // 7. Validate deal account
//       const dealAccount = await program.account.deal.fetch(dealPda);
//       assert.ok(dealAccount.dealId.eq(new BN(1)), "Deal ID should be 1");
//       assert.isTrue(dealAccount.seller.equals(seller.publicKey), "Seller should match");
//       assert.equal(dealAccount.quantity.toString(), saleTokenAmount.toString(), "Quantity should match");
//       assert.deepEqual(dealAccount.status, { active: {} }, "Deal should be active");
//       assert.equal(dealAccount.saleToken.symbol, "TEST", "Sale token symbol mismatch");
//       assert.isTrue(dealAccount.saleToken.address.equals(saleTokenMint), "Sale token mint mismatch");

//       // 8. Validate escrow token balance
//       const escrowBalance = await connection.getTokenAccountBalance(escrowPda);
//       assert.equal(escrowBalance.value.amount, saleTokenAmount.toString(), "Escrow should hold sale tokens");

//       console.log("✅ Deal created successfully:");
//       console.log("  - Deal ID:", dealAccount.dealId.toString());
//       console.log("  - Seller:", dealAccount.seller.toBase58());
//       console.log("  - Sale Token:", dealAccount.saleToken.symbol);
//       console.log("  - Quantity:", dealAccount.quantity.toString());
//       console.log("  - Min Price:", dealAccount.minPricePerUnit.toString());
//     });
//   });

//   describe("submitBid", () => {
//     const bidQuantity = new BN(500_000);
//     const bidPrice = new BN(2); // 2 USDC per token

//     it("should successfully submit a bid", async () => {
//       // 1. Create buyer's USDC token account and mint tokens
//       const buyerTokenAccount = await createAssociatedTokenAccount(
//         connection,
//         buyer,
//         outputTokenMint,
//         buyer.publicKey,
//         undefined,
//         TOKEN_PROGRAM_ID
//       );

//       const requiredUsdcAmount = bidPrice.mul(bidQuantity); // 2 * 500_000 = 1_000_000
//       await mintTo(
//         connection,
//         buyer, // buyer is mint authority for outputTokenMint
//         outputTokenMint,
//         buyerTokenAccount,
//         buyer,
//         requiredUsdcAmount.toNumber()
//       );

//       // 2. Derive bid PDA (bid_id = 1 after init)
//       const [bidPda] = PublicKey.findProgramAddressSync(
//         [Buffer.from("bid"), new BN(1).toArrayLike(Buffer, "le", 8)],
//         program.programId
//       );

//       console.log("Bid PDA:", bidPda.toBase58());
//       console.log("Deal PDA:", dealPda.toBase58());
//       console.log("Buyer:", buyer.publicKey.toBase58());
//       console.log("Buyer Token Account:", buyerTokenAccount.toBase58());

//       // 3. Submit bid
//       await program.methods.submitBid(
//         bidPrice,      // bid_price_per_unit
//         bidQuantity    // quantity
//       )
//       .accountsStrict({
//         buyer: buyer.publicKey,
//         dealAccount: dealPda,
//         bidCounter: bidCounter,
//         buyerTokensMint: outputTokenMint,
//         buyerTokensAccount: buyerTokenAccount,
//         bidAccount: bidPda,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([buyer])
//       .rpc();

//       // 4. Validate bid account
//       const bidAccount = await program.account.bid.fetch(bidPda);
//       assert.ok(bidAccount.bidId.eq(new BN(1)), "Bid ID should be 1");
//       assert.isTrue(bidAccount.buyer.equals(buyer.publicKey), "Buyer should match");
//       assert.ok(bidAccount.dealId.eq(new BN(1)), "Deal ID should be 1");
//       assert.ok(bidAccount.bidPricePerUnit.eq(bidPrice), "Bid price should match");
//       assert.ok(bidAccount.quantity.eq(bidQuantity), "Quantity should match");
//       assert.ok(bidAccount.usdcDeposit.eq(requiredUsdcAmount), "USDC deposit should match");
//       assert.isAbove(bidAccount.timestamp.toNumber(), 0, "Timestamp should be set");

//       console.log("✅ Bid submitted successfully:");
//       console.log("  - Bid ID:", bidAccount.bidId.toString());
//       console.log("  - Buyer:", bidAccount.buyer.toBase58());
//       console.log("  - Deal ID:", bidAccount.dealId.toString());
//       console.log("  - Price per unit:", bidAccount.bidPricePerUnit.toString());
//       console.log("  - Quantity:", bidAccount.quantity.toString());
//       console.log("  - USDC deposit:", bidAccount.usdcDeposit.toString());
//       console.log("  - Timestamp:", bidAccount.timestamp.toString());

//       // 5. Validate that deal account was updated with bid ID
//       const dealAccount = await program.account.deal.fetch(dealPda);
//       assert.equal(dealAccount.bids.length, 1, "Deal should have 1 bid");
//       assert.ok(dealAccount.bids[0].eq(new BN(1)), "Deal should contain bid ID 1");

//       console.log("✅ Deal updated with bid:");
//       console.log("  - Total bids:", dealAccount.bids.length);
//       console.log("  - Bid IDs:", dealAccount.bids.map(bid => bid.toString()));

//       // 6. Validate bid counter was incremented
//       const bidCounterAccount = await program.account.bidCounter.fetch(bidCounter);
//       assert.ok(bidCounterAccount.currentId.eq(new BN(2)), "Bid counter should be incremented to 2");

//       console.log("✅ Bid counter incremented to:", bidCounterAccount.currentId.toString());
//     });

//     it("should fail when buyer has insufficient balance", async () => {
//       // Create a new buyer with insufficient funds
//       const poorBuyer = Keypair.generate();
//       const airdrop = await connection.requestAirdrop(poorBuyer.publicKey, LAMPORTS_PER_SOL);
//       await connection.confirmTransaction(airdrop, "confirmed");

//       // Create token account with insufficient balance
//       const poorBuyerTokenAccount = await createAssociatedTokenAccount(
//         connection,
//         poorBuyer,
//         outputTokenMint,
//         poorBuyer.publicKey,
//         undefined,
//         TOKEN_PROGRAM_ID
//       );

//       // Mint only 100 tokens (insufficient for bid of 500_000 * 2 = 1_000_000)
//       await mintTo(
//         connection,
//         buyer, // buyer is mint authority
//         outputTokenMint,
//         poorBuyerTokenAccount,
//         buyer,
//         100
//       );

//       const [bidPda2] = PublicKey.findProgramAddressSync(
//         [Buffer.from("bid"), new BN(2).toArrayLike(Buffer, "le", 8)],
//         program.programId
//       );

//       try {
//         await program.methods.submitBid(
//           bidPrice,
//           bidQuantity
//         )
//         .accountsStrict({
//           buyer: poorBuyer.publicKey,
//           dealAccount: dealPda,
//           bidCounter: bidCounter,
//           buyerTokensMint: outputTokenMint,
//           buyerTokensAccount: poorBuyerTokenAccount,
//           bidAccount: bidPda2,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: anchor.web3.SystemProgram.programId,
//         })
//         .signers([poorBuyer])
//         .rpc();

//         // Should not reach here
//         assert.fail("Expected transaction to fail due to insufficient balance");
//       } catch (error) {
//         assert.include(error.toString(), "InsufficientBalance", "Should fail with InsufficientBalance error");
//         console.log("✅ Correctly failed with insufficient balance");
//       }
//     });

//     it("should allow multiple bids on the same deal", async () => {
//       // Create another buyer
//       const buyer2 = Keypair.generate();
//       const airdrop2 = await connection.requestAirdrop(buyer2.publicKey, LAMPORTS_PER_SOL);
//       await connection.confirmTransaction(airdrop2, "confirmed");

//       // Create token account and mint tokens for buyer2
//       const buyer2TokenAccount = await createAssociatedTokenAccount(
//         connection,
//         buyer2,
//         outputTokenMint,
//         buyer2.publicKey,
//         undefined,
//         TOKEN_PROGRAM_ID
//       );

//       const bid2Quantity = new BN(300_000);
//       const bid2Price = new BN(3); // 3 USDC per token
//       const requiredUsdc2 = bid2Price.mul(bid2Quantity);

//       await mintTo(
//         connection,
//         buyer, // buyer is mint authority
//         outputTokenMint,
//         buyer2TokenAccount,
//         buyer,
//         requiredUsdc2.toNumber()
//       );

//       // Derive bid PDA for second bid (bid_id = 2)
//       const [bidPda2] = PublicKey.findProgramAddressSync(
//         [Buffer.from("bid"), new BN(2).toArrayLike(Buffer, "le", 8)],
//         program.programId
//       );

//       // Submit second bid
//       await program.methods.submitBid(
//         bid2Price,
//         bid2Quantity
//       )
//       .accountsStrict({
//         buyer: buyer2.publicKey,
//         dealAccount: dealPda,
//         bidCounter: bidCounter,
//         buyerTokensMint: outputTokenMint,
//         buyerTokensAccount: buyer2TokenAccount,
//         bidAccount: bidPda2,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         systemProgram: anchor.web3.SystemProgram.programId,
//       })
//       .signers([buyer2])
//       .rpc();

//       // Validate second bid
//       const bid2Account = await program.account.bid.fetch(bidPda2);
//       assert.ok(bid2Account.bidId.eq(new BN(2)), "Second bid ID should be 2");
//       assert.isTrue(bid2Account.buyer.equals(buyer2.publicKey), "Second buyer should match");
//       assert.ok(bid2Account.bidPricePerUnit.eq(bid2Price), "Second bid price should match");

//       // Validate deal now has 2 bids
//       const dealAccount = await program.account.deal.fetch(dealPda);
//       assert.equal(dealAccount.bids.length, 2, "Deal should have 2 bids");
//       assert.ok(dealAccount.bids[1].eq(new BN(2)), "Deal should contain bid ID 2");

//       console.log("✅ Second bid submitted successfully:");
//       console.log("  - Deal now has", dealAccount.bids.length, "bids");
//       console.log("  - Bid IDs:", dealAccount.bids.map(bid => bid.toString()));
//     });
//   });
// });





import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
import type { Dotc } from "../target/types/dotc";

describe("dotc", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Dotc as anchor.Program<Dotc>;
  const connection = provider.connection;

  let seller: Keypair;
  let buyer: Keypair;
  let saleTokenMint: PublicKey;
  let outputTokenMint: PublicKey;
  let dealCounter: PublicKey;
  let bidCounter: PublicKey;
  let dealPda: PublicKey;
  
  const saleTokenAmount = new BN(1_000_000);

  before(async () => {
    seller = Keypair.generate();
    buyer = Keypair.generate();

    const sellerAirdrop = await connection.requestAirdrop(seller.publicKey, LAMPORTS_PER_SOL);
    const buyerAirdrop = await connection.requestAirdrop(buyer.publicKey, LAMPORTS_PER_SOL);
    
    await connection.confirmTransaction(sellerAirdrop, "confirmed");
    await connection.confirmTransaction(buyerAirdrop, "confirmed");

    saleTokenMint = await createMint(
      connection,
      seller,
      seller.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    outputTokenMint = await createMint(
      connection,
      buyer,
      buyer.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    [dealCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from("deal_counter")],
      program.programId
    );

    await program.methods.initializeDealCounter()
      .accountsStrict({
        dealCounter: dealCounter,
        seller: seller.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    [bidCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from("bid_counter")],
      program.programId
    );

    await program.methods.initializeBidCounter()
      .accountsStrict({
        bidCounter: bidCounter,
        bidder: buyer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  });

  describe("createDeal", () => {
    it("should successfully create a new deal and escrow tokens", async () => {
      console.log("Expected seller token mint:", saleTokenMint.toBase58());

      const sellerTokenAccount = await createAssociatedTokenAccount(
        connection,
        seller,
        saleTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        connection,
        seller,
        saleTokenMint,
        sellerTokenAccount,
        seller,
        saleTokenAmount.toNumber()
      );

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expiration = currentTimestamp + 3600; 
      const conclusionTime = expiration + 600;

      [dealPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("deal"), new BN(1).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods.createDeal(
        "TEST",                   
        6,                       
        "USDC",                   
        6,                        
        saleTokenAmount,          
        new BN(1),               
        new BN(expiration),       
        new BN(conclusionTime)    
      )
      .accountsStrict({
        seller: seller.publicKey,
        dealCounter: dealCounter,
        sellerTokensMint: saleTokenMint,
        buyerTokensMint: outputTokenMint,
        sellerTokensAccount: sellerTokenAccount,
        dealAccount: dealPda,
        escrowAccount: escrowPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.ok(dealAccount.dealId.eq(new BN(1)), "Deal ID should be 1");
      assert.isTrue(dealAccount.seller.equals(seller.publicKey), "Seller should match");
      assert.equal(dealAccount.quantity.toString(), saleTokenAmount.toString(), "Quantity should match");
      assert.deepEqual(dealAccount.status, { active: {} }, "Deal should be active");
      assert.equal(dealAccount.saleToken.symbol, "TEST", "Sale token symbol mismatch");
      assert.isTrue(dealAccount.saleToken.address.equals(saleTokenMint), "Sale token mint mismatch");

      const escrowBalance = await connection.getTokenAccountBalance(escrowPda);
      assert.equal(escrowBalance.value.amount, saleTokenAmount.toString(), "Escrow should hold sale tokens");

      console.log("✅ Deal created successfully:");
      console.log("  - Deal ID:", dealAccount.dealId.toString());
      console.log("  - Seller:", dealAccount.seller.toBase58());
      console.log("  - Sale Token:", dealAccount.saleToken.symbol);
      console.log("  - Quantity:", dealAccount.quantity.toString());
      console.log("  - Min Price:", dealAccount.minPricePerUnit.toString());
    });
  });

  describe("submitBid", () => {
    const bidQuantity = new BN(500_000);
    const bidPrice = new BN(2); // 2 USDC per token

    it("should successfully submit a bid", async () => {
      const buyerTokenAccount = await createAssociatedTokenAccount(
        connection,
        buyer,
        outputTokenMint,
        buyer.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const requiredUsdcAmount = bidPrice.mul(bidQuantity); // 2 * 500_000 = 1_000_000
      await mintTo(
        connection,
        buyer,
        outputTokenMint,
        buyerTokenAccount,
        buyer,
        requiredUsdcAmount.toNumber()
      );

      const [bidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), new BN(1).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      console.log("Bid PDA:", bidPda.toBase58());
      console.log("Deal PDA:", dealPda.toBase58());
      console.log("Buyer:", buyer.publicKey.toBase58());
      console.log("Buyer Token Account:", buyerTokenAccount.toBase58());

      await program.methods.submitBid(
        bidPrice,      
        bidQuantity 
      )
      .accountsStrict({
        buyer: buyer.publicKey,
        dealAccount: dealPda,
        bidCounter: bidCounter,
        buyerTokensMint: outputTokenMint,
        buyerTokensAccount: buyerTokenAccount,
        bidAccount: bidPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

      const bidAccount = await program.account.bid.fetch(bidPda);
      assert.ok(bidAccount.bidId.eq(new BN(1)), "Bid ID should be 1");
      assert.isTrue(bidAccount.buyer.equals(buyer.publicKey), "Buyer should match");
      assert.ok(bidAccount.dealId.eq(new BN(1)), "Deal ID should be 1");
      assert.ok(bidAccount.bidPricePerUnit.eq(bidPrice), "Bid price should match");
      assert.ok(bidAccount.quantity.eq(bidQuantity), "Quantity should match");
      assert.ok(bidAccount.usdcDeposit.eq(requiredUsdcAmount), "USDC deposit should match");
      assert.isAbove(bidAccount.timestamp.toNumber(), 0, "Timestamp should be set");

      console.log("✅ Bid submitted successfully:");
      console.log("  - Bid ID:", bidAccount.bidId.toString());
      console.log("  - Buyer:", bidAccount.buyer.toBase58());
      console.log("  - Deal ID:", bidAccount.dealId.toString());
      console.log("  - Price per unit:", bidAccount.bidPricePerUnit.toString());
      console.log("  - Quantity:", bidAccount.quantity.toString());
      console.log("  - USDC deposit:", bidAccount.usdcDeposit.toString());
      console.log("  - Timestamp:", bidAccount.timestamp.toString());

      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.equal(dealAccount.bids.length, 1, "Deal should have 1 bid");
      assert.ok(dealAccount.bids[0].eq(new BN(1)), "Deal should contain bid ID 1");

      console.log("✅ Deal updated with bid:");
      console.log("  - Total bids:", dealAccount.bids.length);
      console.log("  - Bid IDs:", dealAccount.bids.map(bid => bid.toString()));

      const bidCounterAccount = await program.account.bidCounter.fetch(bidCounter);
      assert.ok(bidCounterAccount.currentId.eq(new BN(2)), "Bid counter should be incremented to 2");

      console.log("✅ Bid counter incremented to:", bidCounterAccount.currentId.toString());
    });

    it("should fail when buyer has insufficient balance", async () => {
      // Create a new buyer with insufficient funds
      const poorBuyer = Keypair.generate();
      const airdrop = await connection.requestAirdrop(poorBuyer.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdrop, "confirmed");

      const poorBuyerTokenAccount = await createAssociatedTokenAccount(
        connection,
        poorBuyer,
        outputTokenMint,
        poorBuyer.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Mint only 100 tokens (insufficient for bid of 500_000 * 2 = 1_000_000)
      await mintTo(
        connection,
        buyer,
        outputTokenMint,
        poorBuyerTokenAccount,
        buyer,
        100
      );

      const [bidPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), new BN(2).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods.submitBid(
          bidPrice,
          bidQuantity
        )
        .accountsStrict({
          buyer: poorBuyer.publicKey,
          dealAccount: dealPda,
          bidCounter: bidCounter,
          buyerTokensMint: outputTokenMint,
          buyerTokensAccount: poorBuyerTokenAccount,
          bidAccount: bidPda2,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([poorBuyer])
        .rpc();

        assert.fail("Expected transaction to fail due to insufficient balance");
      } catch (error) {
        assert.include(error.toString(), "InsufficientBalance", "Should fail with InsufficientBalance error");
        console.log("✅ Correctly failed with insufficient balance");
      }
    });

    it("should allow multiple bids on the same deal", async () => {
      // Create another buyer
      const buyer2 = Keypair.generate();
      const airdrop2 = await connection.requestAirdrop(buyer2.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdrop2, "confirmed");

      // Create token account and mint tokens for buyer2
      const buyer2TokenAccount = await createAssociatedTokenAccount(
        connection,
        buyer2,
        outputTokenMint,
        buyer2.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const bid2Quantity = new BN(300_000);
      const bid2Price = new BN(3); // 3 USDC per token
      const requiredUsdc2 = bid2Price.mul(bid2Quantity);

      await mintTo(
        connection,
        buyer,
        outputTokenMint,
        buyer2TokenAccount,
        buyer,
        requiredUsdc2.toNumber()
      );

      const [bidPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), new BN(2).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods.submitBid(
        bid2Price,
        bid2Quantity
      )
      .accountsStrict({
        buyer: buyer2.publicKey,
        dealAccount: dealPda,
        bidCounter: bidCounter,
        buyerTokensMint: outputTokenMint,
        buyerTokensAccount: buyer2TokenAccount,
        bidAccount: bidPda2,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer2])
      .rpc();

      const bid2Account = await program.account.bid.fetch(bidPda2);
      assert.ok(bid2Account.bidId.eq(new BN(2)), "Second bid ID should be 2");
      assert.isTrue(bid2Account.buyer.equals(buyer2.publicKey), "Second buyer should match");
      assert.ok(bid2Account.bidPricePerUnit.eq(bid2Price), "Second bid price should match");

      // Validate deal now has 2 bids
      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.equal(dealAccount.bids.length, 2, "Deal should have 2 bids");
      assert.ok(dealAccount.bids[1].eq(new BN(2)), "Deal should contain bid ID 2");

      console.log("✅ Second bid submitted successfully:");
      console.log("  - Deal now has", dealAccount.bids.length, "bids");
      console.log("  - Bid IDs:", dealAccount.bids.map(bid => bid.toString()));
    });
  });

  describe("concludeDeal", () => {
    let buyer2: Keypair;
    let buyer2TokenAccount: PublicKey;
    let sellerOutputTokenAccount: PublicKey;
    let buyerSaleTokenAccount: PublicKey;
    let buyer2SaleTokenAccount: PublicKey;

    before(async () => {
      buyer2 = Keypair.generate();
      const airdrop = await connection.requestAirdrop(buyer2.publicKey, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdrop, "confirmed");

      sellerOutputTokenAccount = await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Buyer needs sale token account to receive TEST tokens
      buyerSaleTokenAccount = await createAssociatedTokenAccount(
        connection,
        buyer,
        saleTokenMint,
        buyer.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Buyer2 needs sale token account as well for alternative scenarios
      buyer2SaleTokenAccount = await createAssociatedTokenAccount(
        connection,
        buyer2,
        saleTokenMint,
        buyer2.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      // Create buyer2 output token account and fund it
      buyer2TokenAccount = await createAssociatedTokenAccount(
        connection,
        buyer2,
        outputTokenMint,
        buyer2.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );
    });

    it("should fail when conclusion time has not been reached", async () => {
      const escrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const [bidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), new BN(1).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods.concludeDeal(
          new BN(1)
        )
        .accountsStrict({
          dealAccount: dealPda,
          selectedBid: bidPda,
          buyer: buyer.publicKey,
          saleTokenMint: saleTokenMint,
          outputTokenMint: outputTokenMint,
          dealEscrowAccount: escrowPda,
          buyerTokensAccount: buyerTokenAccount,
          buyerSaleTokenAccount: buyerSaleTokenAccount,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc();

        assert.fail("Expected transaction to fail due to conclusion time not reached");
      } catch (error) {
        assert.include(error.toString(), "ConclusionNotReady", "Should fail with ConclusionNotReady error");
        console.log("✅ Correctly failed when conclusion time not reached");
      }
    });

    it("should successfully conclude deal after conclusion time", async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const shortExpiration = currentTimestamp + 1;
      const shortConclusionTime = currentTimestamp + 2;

      // Create a new seller's token account for new deal
      const sellerTokenAccount2 = getAssociatedTokenAddressSync(
        saleTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await mintTo(
        connection,
        seller,
        saleTokenMint,
        sellerTokenAccount2,
        seller,
        saleTokenAmount.toNumber()
      );

      const [dealPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("deal"), new BN(2).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowPda2 = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda2,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods.createDeal(
        "TEST2",
        6,
        "USDC",
        6,
        saleTokenAmount,
        new BN(1),
        new BN(shortExpiration),
        new BN(shortConclusionTime)
      )
      .accountsStrict({
        seller: seller.publicKey,
        dealCounter: dealCounter,
        sellerTokensMint: saleTokenMint,
        buyerTokensMint: outputTokenMint,
        sellerTokensAccount: sellerTokenAccount2,
        dealAccount: dealPda2,
        escrowAccount: escrowPda2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

      const bidQuantity2 = new BN(400_000);
      const bidPrice2 = new BN(2);
      const requiredUsdc2 = bidPrice2.mul(bidQuantity2);

      await mintTo(
        connection,
        buyer,
        outputTokenMint,
        buyer2TokenAccount,
        buyer,
        requiredUsdc2.toNumber()
      );

      const [bidPda3] = PublicKey.findProgramAddressSync(
        [Buffer.from("bid"), new BN(3).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods.submitBid(
        bidPrice2,
        bidQuantity2
      )
      .accountsStrict({
        buyer: buyer2.publicKey,
        dealAccount: dealPda2,
        bidCounter: bidCounter,
        buyerTokensMint: outputTokenMint,
        buyerTokensAccount: buyer2TokenAccount,
        bidAccount: bidPda3,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer2])
      .rpc();

      console.log("Waiting for conclusion time to pass...");
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get initial balances
      const initialBuyerSaleBalance = await connection.getTokenAccountBalance(buyer2SaleTokenAccount);
      const initialSellerOutputBalance = await connection.getTokenAccountBalance(sellerOutputTokenAccount);
      const initialEscrowBalance = await connection.getTokenAccountBalance(escrowPda2);

      console.log("Initial balances:");
      console.log("  - Buyer sale token balance:", initialBuyerSaleBalance.value.amount);
      console.log("  - Seller output token balance:", initialSellerOutputBalance.value.amount);
      console.log("  - Escrow balance:", initialEscrowBalance.value.amount);

      await program.methods.concludeDeal(
        new BN(3)
      )
      .accountsStrict({
        dealAccount: dealPda2,
        selectedBid: bidPda3,
        buyer: buyer2.publicKey,
        saleTokenMint: saleTokenMint,
        outputTokenMint: outputTokenMint,
        dealEscrowAccount: escrowPda2,
        buyerTokensAccount: buyer2TokenAccount,
        buyerSaleTokenAccount: buyer2SaleTokenAccount,
        sellerOutputTokenAccount: sellerOutputTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer2])
      .rpc();

      const dealAccount = await program.account.deal.fetch(dealPda2);
      assert.deepEqual(dealAccount.status, { fulfilled: {} }, "Deal should be fulfilled");
      assert.ok(dealAccount.fulfilledQuantity.eq(bidQuantity2), "Fulfilled quantity should match bid quantity");

      const finalBuyerSaleBalance = await connection.getTokenAccountBalance(buyer2SaleTokenAccount);
      const finalSellerOutputBalance = await connection.getTokenAccountBalance(sellerOutputTokenAccount);
      const finalEscrowBalance = await connection.getTokenAccountBalance(escrowPda2);

      console.log("Final balances:");
      console.log("  - Buyer sale token balance:", finalBuyerSaleBalance.value.amount);
      console.log("  - Seller output token balance:", finalSellerOutputBalance.value.amount);
      console.log("  - Escrow balance:", finalEscrowBalance.value.amount);

      // Buyer should have received sale tokens
      assert.equal(
        finalBuyerSaleBalance.value.amount,
        bidQuantity2.toString(),
        "Buyer should receive sale tokens"
      );

      // Seller should have received USDC
      assert.equal(
        finalSellerOutputBalance.value.amount,
        requiredUsdc2.toString(),
        "Seller should receive USDC payment"
      );

      assert.equal(
        finalEscrowBalance.value.amount,
        saleTokenAmount.sub(bidQuantity2).toString(),
        "Escrow should have remaining tokens"
      );

      console.log("✅ Deal concluded successfully:");
      console.log("  - Deal status: Fulfilled");
      console.log("  - Fulfilled quantity:", dealAccount.fulfilledQuantity.toString());
      console.log("  - Buyer received:", bidQuantity2.toString(), "sale tokens");
      console.log("  - Seller received:", requiredUsdc2.toString(), "USDC");
    });
  });
});
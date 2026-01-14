import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
  createAssociatedTokenAccount,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { assert } from 'chai';
import type { Dotc } from '../target/types/dotc';
import { AnchorError } from '@coral-xyz/anchor';

describe('dotc', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Dotc as anchor.Program<Dotc>;
  const connection = provider.connection;

  let seller: Keypair;
  let buyer: Keypair;
  let buyer2: Keypair;
  let buyer3: Keypair;
  let buyer4: Keypair;
  let saleTokenMint: PublicKey;
  let outputTokenMint: PublicKey;
  let dealCounter: PublicKey;
  let bidCounter: PublicKey;
  let dealPda: PublicKey;
  // Store bid PDAs for later use
  let bidPdas: PublicKey[] = [];
  let createdBids: any[] = [];

  const saleTokenAmount = new BN(1_000_000);

  before(async () => {
    const tempKeypair = Keypair.generate();
    await connection.requestAirdrop(tempKeypair.publicKey, LAMPORTS_PER_SOL);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for airdrop

    [dealCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from('deal_counter')],
      program.programId
    );

    [bidCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from('bid_counter')],
      program.programId
    );

    try {
      await program.methods
        .initializeDealCounter()
        .accountsStrict({
          dealCounter: dealCounter,
          seller: tempKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tempKeypair])
        .rpc();
    } catch (error) {
      throw error;
    }

    try {
      await program.methods
        .initializeBidCounter()
        .accountsStrict({
          bidCounter: bidCounter,
          bidder: tempKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tempKeypair])
        .rpc();
    } catch (error) {
      throw error;
    }
  });

  beforeEach(async () => {
    seller = Keypair.generate();
    buyer = Keypair.generate();
    buyer2 = Keypair.generate();
    buyer3 = Keypair.generate();
    buyer4 = Keypair.generate();

    bidPdas = [];
    createdBids = [];

    // Airdrop SOL
    const airdrops = [
      connection.requestAirdrop(seller.publicKey, LAMPORTS_PER_SOL),
      connection.requestAirdrop(buyer.publicKey, LAMPORTS_PER_SOL),
      connection.requestAirdrop(buyer2.publicKey, LAMPORTS_PER_SOL),
      connection.requestAirdrop(buyer3.publicKey, LAMPORTS_PER_SOL),
      connection.requestAirdrop(buyer4.publicKey, LAMPORTS_PER_SOL),
    ];

    const signatures = await Promise.all(airdrops);
    await Promise.all(
      signatures.map((sig) => connection.confirmTransaction(sig, 'confirmed'))
    );

    // Create mints
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
      seller,
      seller.publicKey,
      null,
      6,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
  });

  async function createDeal(
    dealId: number,
    quantity: BN = saleTokenAmount
  ): Promise<PublicKey> {
    const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      seller,
      saleTokenMint,
      seller.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    await mintTo(
      connection,
      seller,
      saleTokenMint,
      sellerTokenAccount.address,
      seller,
      quantity.toNumber()
    );

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const expiration = currentTimestamp + 3600;
    const conclusionTime = expiration + 600;

    const [dealPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('deal'), new BN(dealId).toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    const escrowPda = getAssociatedTokenAddressSync(
      saleTokenMint,
      dealPda,
      true,
      TOKEN_PROGRAM_ID
    );

    try {
      await program.methods
        .createDeal(
          'TEST',
          6,
          'USDC',
          6,
          quantity,
          new BN(1),
          new BN(expiration),
          new BN(conclusionTime)
        )
        .accountsStrict({
          seller: seller.publicKey,
          dealCounter: dealCounter,
          sellerTokensMint: saleTokenMint,
          buyerTokensMint: outputTokenMint,
          sellerTokensAccount: sellerTokenAccount.address,
          dealAccount: dealPda,
          escrowAccount: escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
    } catch (error) {
      console.log('error creating deal:', error);
      throw error;
    }

    return dealPda;
  }

  async function submitBid(
    bidder: Keypair,
    dealPda: PublicKey,
    bidId: number,
    price: BN,
    quantity: BN
  ): Promise<{
    bidPda: PublicKey;
    escrowAccount: PublicKey;
    buyerSaleTokenAccount: PublicKey;
  }> {
    const buyerOutputTokenAccount = getAssociatedTokenAddressSync(
      outputTokenMint,
      bidder.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const buyerSaleTokenAccount = getAssociatedTokenAddressSync(
      saleTokenMint,
      bidder.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    // Create accounts if they don't exist
    try {
      await getAccount(connection, buyerOutputTokenAccount);
    } catch (error) {
      await createAssociatedTokenAccount(
        connection,
        bidder,
        outputTokenMint,
        bidder.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );
    }

    try {
      await getAccount(connection, buyerSaleTokenAccount);
    } catch (error) {
      await createAssociatedTokenAccount(
        connection,
        bidder,
        saleTokenMint,
        bidder.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );
    }

    const requiredAmount = price.mul(quantity);
    await mintTo(
      connection,
      seller,
      outputTokenMint,
      buyerOutputTokenAccount,
      seller,
      requiredAmount.toNumber()
    );

    const [bidPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bid'), new BN(bidId).toArrayLike(Buffer, 'le', 8)],
      program.programId
    );

    const bidEscrowAccount = getAssociatedTokenAddressSync(
      outputTokenMint,
      bidPda,
      true,
      TOKEN_PROGRAM_ID
    );

    await program.methods
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
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([bidder])
      .rpc();

    return { bidPda, escrowAccount: bidEscrowAccount, buyerSaleTokenAccount };
  }

  describe('createDeal', () => {
    it('should successfully create a new deal and escrow tokens', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );
      const currentDealId = dealCounterAccount.currentId;

      dealPda = await createDeal(Number(currentDealId), saleTokenAmount);

      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.ok(
        dealAccount.dealId.eq(currentDealId),
        `Deal ID should be ${currentDealId.toString()}`
      );
      assert.isTrue(
        dealAccount.seller.equals(seller.publicKey),
        'Seller should match'
      );
      assert.equal(
        dealAccount.quantity.toString(),
        saleTokenAmount.toString(),
        'Quantity should match'
      );
      assert.deepEqual(
        dealAccount.status,
        { active: {} },
        'Deal should be active'
      );
      console.log('✅ Deal created successfully');
    });
  });

  describe('submitBid', () => {
    beforeEach(async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];
      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );
      const currentDealId = dealCounterAccount.currentId;
      dealPda = await createDeal(Number(currentDealId), saleTokenAmount);
    });

    it('should successfully submit first bid', async () => {
      const bidQuantity = new BN(500_000);
      const bidPrice = new BN(2);

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];
      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const currentBidId = bidCounterAccount.currentId;

      const bid = await submitBid(
        buyer,
        dealPda,
        Number(currentBidId),
        bidPrice,
        bidQuantity
      );

      createdBids.push({
        pda: bid.bidPda,
        buyer: buyer.publicKey,
        bidId: currentBidId,
        price: bidPrice,
        quantity: bidQuantity,
        escrowAccount: bid.escrowAccount,
        buyerSaleTokenAccount: bid.buyerSaleTokenAccount,
      });

      const bidAccount = await program.account.bid.fetch(bid.bidPda);
      assert.ok(bidAccount.bidId.eq(currentBidId), 'Bid ID should match');
      assert.ok(
        bidAccount.bidPricePerUnit.eq(bidPrice),
        'Bid price should match'
      );
      assert.ok(
        bidAccount.quantity.eq(bidQuantity),
        'Bid quantity should match'
      );

      console.log('✅ First bid submitted successfully');
    });

    it('should successfully submit second bid', async () => {
      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      let bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );

      const firstBidId = bidCounterAccount.currentId;

      await submitBid(
        buyer,
        dealPda,
        Number(firstBidId),
        new BN(2),
        new BN(500_000)
      );

      bidCounterAccount = await program.account.bidCounter.fetch(bidCounterPda);
      const secondBidId = bidCounterAccount.currentId;

      const bid2Quantity = new BN(300_000);
      const bid2Price = new BN(3);

      const bid2 = await submitBid(
        buyer2,
        dealPda,
        Number(secondBidId),
        bid2Price,
        bid2Quantity
      );

      createdBids.push({
        pda: bid2.bidPda,
        buyer: buyer2.publicKey,
        bidId: secondBidId,
        price: bid2Price,
        quantity: bid2Quantity,
        escrowAccount: bid2.escrowAccount,
        buyerSaleTokenAccount: bid2.buyerSaleTokenAccount,
      });

      const bidAccount = await program.account.bid.fetch(bid2.bidPda);
      assert.ok(bidAccount.bidId.eq(secondBidId), 'Second bid ID should match');
      assert.ok(
        bidAccount.bidPricePerUnit.eq(bid2Price),
        'Second bid price should match'
      );
      assert.ok(
        bidAccount.quantity.eq(bid2Quantity),
        'Second bid quantity should match'
      );

      console.log('✅ Second bid submitted successfully');
    });
  });

  describe('concludeDeal', () => {
    beforeEach(async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const currentDealId = dealCounterAccount.currentId;
      dealPda = await createDeal(Number(currentDealId), saleTokenAmount);

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const currentBidId = bidCounterAccount.currentId;

      const bidQuantity = new BN(500_000);
      const bidPrice = new BN(2);
      const bid = await submitBid(
        buyer,
        dealPda,
        Number(currentBidId),
        bidPrice,
        bidQuantity
      );

      createdBids.push({
        pda: bid.bidPda,
        buyer: buyer.publicKey,
        bidId: currentBidId,
        price: bidPrice,
        quantity: bidQuantity,
        escrowAccount: bid.escrowAccount,
        buyerSaleTokenAccount: bid.buyerSaleTokenAccount,
      });
    });

    it('should successfully conclude a deal with selected bids', async () => {
      const selectedBid = createdBids[0];
      if (!selectedBid) {
        throw new Error('No bids available for deal conclusion');
      }

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await getAccount(connection, sellerOutputTokenAccount);
      } catch (error) {
        await createAssociatedTokenAccount(
          connection,
          seller,
          outputTokenMint,
          seller.publicKey,
          undefined,
          TOKEN_PROGRAM_ID
        );
      }

      const buyerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        selectedBid.buyer,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await getAccount(connection, buyerOutputTokenAccount);
      } catch (error) {
        await createAssociatedTokenAccount(
          connection,
          buyer, // Use the buyer keypair here
          outputTokenMint,
          selectedBid.buyer,
          undefined,
          TOKEN_PROGRAM_ID
        );
      }

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: seller.publicKey,
          outputTokenMint: outputTokenMint,
          saleTokensMint: saleTokenMint,
          dealEscrowAccount: dealEscrowPda,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
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

      const dealAccountAfter = await program.account.deal.fetch(dealPda);
      assert.deepEqual(
        dealAccountAfter.status,
        { fulfilled: {} },
        'Deal should be fulfilled'
      );
      assert.equal(
        dealAccountAfter.selectedBids.length,
        1,
        'Should have 1 selected bid'
      );

      // token balances
      const buyerSaleBalance = await connection.getTokenAccountBalance(
        selectedBid.buyerSaleTokenAccount
      );

      const sellerOutputBalance = await connection.getTokenAccountBalance(
        sellerOutputTokenAccount
      );

      const expectedTokensReceived = selectedBid.quantity;
      const expectedUsdcReceived = selectedBid.price.mul(selectedBid.quantity);

      assert.equal(
        buyerSaleBalance.value.amount,
        expectedTokensReceived.toString(),
        'Buyer should receive the correct amount of sale tokens'
      );
      assert.equal(
        sellerOutputBalance.value.amount,
        expectedUsdcReceived.toString(),
        'Seller should receive the correct USDC payment'
      );

      console.log('✅ Deal conclusion successful!');
    });
  });

  describe('Submitting Multiple Bids', () => {
    it('should select highest price bids first', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const DealID = dealCounterAccount.currentId;
      const dealPda = await createDeal(Number(DealID), new BN(1_000_000));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      let bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );

      let bidID = bidCounterAccount.currentId;

      // Price: 1, Qty: 300k
      const bid1 = await submitBid(
        buyer,
        dealPda,
        Number(bidID),
        new BN(1),
        new BN(300_000)
      );

      // Price: 3, Qty: 400k
      bidCounterAccount = await program.account.bidCounter.fetch(bidCounterPda);
      bidID = bidCounterAccount.currentId;
      const bid2 = await submitBid(
        buyer2,
        dealPda,
        Number(bidID),
        new BN(3),
        new BN(400_000)
      );

      // Price: 2, Qty: 500k
      bidCounterAccount = await program.account.bidCounter.fetch(bidCounterPda);
      bidID = bidCounterAccount.currentId;
      const bid3 = await submitBid(
        buyer3,
        dealPda,
        Number(bidID),
        new BN(2),
        new BN(500_000)
      );

      // Price: 0.5, Qty: 200k (should NOT be selected - will be auto-refunded)
      bidCounterAccount = await program.account.bidCounter.fetch(bidCounterPda);
      bidID = bidCounterAccount.currentId;
      const bid4 = await submitBid(
        buyer4,
        dealPda,
        Number(bidID),
        new BN(1),
        new BN(100_000)
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const buyer1OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const buyer2OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer2.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const buyer3OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer3.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const buyer4OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer4.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      const initialBuyer4OutputBalance =
        await connection.getTokenAccountBalance(buyer4OutputAccount);

      await program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: seller.publicKey,
          outputTokenMint: outputTokenMint,
          saleTokensMint: saleTokenMint,
          dealEscrowAccount: dealEscrowPda,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
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

      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.deepEqual(dealAccount.status, { fulfilled: {} });

      assert.equal(dealAccount.selectedBids.length, 3);

      const buyer2Balance = await connection.getTokenAccountBalance(
        bid2.buyerSaleTokenAccount
      );
      const buyer3Balance = await connection.getTokenAccountBalance(
        bid3.buyerSaleTokenAccount
      );
      const buyer1Balance = await connection.getTokenAccountBalance(
        bid1.buyerSaleTokenAccount
      );

      assert.equal(buyer2Balance.value.amount, '400000');
      assert.equal(buyer3Balance.value.amount, '500000');
      assert.equal(buyer1Balance.value.amount, '100000');

      const finalBuyer4OutputBalance = await connection.getTokenAccountBalance(
        buyer4OutputAccount
      );

      const expectedRefund = 1 * 100_000;
      const actualRefund =
        parseInt(finalBuyer4OutputBalance.value.amount) -
        parseInt(initialBuyer4OutputBalance.value.amount);

      assert.equal(actualRefund, expectedRefund);

      const bid4EscrowBalance = await connection.getTokenAccountBalance(
        bid4.escrowAccount
      );
      assert.equal(bid4EscrowBalance.value.amount, '0');

      console.log('✅ Multiple bids optimization test passed');
    });

    it('should handle partial bid fulfillment correctly', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const DealID = dealCounterAccount.currentId;
      const dealPda = await createDeal(Number(DealID), new BN(500_000));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      const bid1 = await submitBid(
        buyer,
        dealPda,
        Number(bidID),
        new BN(2),
        new BN(800_000)
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const buyerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      try {
        await getAccount(connection, buyerOutputTokenAccount);
      } catch (error) {
        await createAssociatedTokenAccount(
          connection,
          buyer,
          outputTokenMint,
          buyer.publicKey,
          undefined,
          TOKEN_PROGRAM_ID
        );
      }

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: seller.publicKey,
          outputTokenMint: outputTokenMint,
          saleTokensMint: saleTokenMint,
          dealEscrowAccount: dealEscrowPda,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
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

      const buyerBalance = await connection.getTokenAccountBalance(
        bid1.buyerSaleTokenAccount
      );
      assert.equal(buyerBalance.value.amount, '500000');
      const sellerBalance = await connection.getTokenAccountBalance(
        sellerOutputTokenAccount
      );
      assert.equal(sellerBalance.value.amount, '1000000');

      const buyerRefundBalance = await connection.getTokenAccountBalance(
        buyerOutputTokenAccount
      );
      // Refund should be: (800k - 500k) * 2 = 300k * 2 = 600k
      assert.equal(buyerRefundBalance.value.amount, '600000');

      console.log('✅ Partial bid fulfillment test passed');
    });
  });

  describe('Error Cases', () => {
    it('should fail when bid does not belong to deal', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount1 = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const DealID1 = dealCounterAccount1.currentId;

      const dealPda1 = await createDeal(Number(DealID1));

      const dealCounterAccount2 = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const DealID2 = dealCounterAccount2.currentId;

      const dealPda2 = await createDeal(Number(DealID2));
      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      const bid1 = await submitBid(
        buyer,
        dealPda2,
        Number(bidID),
        new BN(2),
        new BN(100_000)
      );

      const bidCounterAccount2 = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID2 = bidCounterAccount2.currentId;

      const buyerOutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const bid2 = await submitBid(
        buyer,
        dealPda1,
        Number(bidID2),
        new BN(2),
        new BN(100_000)
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda1,
        true,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .concludeDeal()
          .accountsStrict({
            dealAccount: dealPda1, // Deal 1
            seller: seller.publicKey,
            outputTokenMint: outputTokenMint,
            saleTokensMint: saleTokenMint,
            dealEscrowAccount: dealEscrowPda,
            sellerOutputTokenAccount: sellerOutputTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
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

        assert.fail('Should have failed with invalid bid for deal');
      } catch (error: unknown) {
        const errorStr =
          error instanceof Error
            ? error.toString().toLowerCase()
            : String(error).toLowerCase();
        const errorMsg =
          error instanceof Error ? error.message?.toLowerCase() || '' : '';

        const errorCode =
          error instanceof AnchorError ? error.error?.errorCode?.code : '';

        if (
          errorStr.includes('invalidbidfordeal') ||
          errorMsg.includes('invalidbidfordeal') ||
          errorStr.includes('invalid bid') ||
          errorMsg.includes('invalid bid') ||
          errorCode === 'InvalidBidForDeal'
        ) {
          console.log('✅ Invalid bid for deal error case passed');
        } else {
          console.log('Expected InvalidBidForDeal error, but got:', errorCode);
          console.log('Full error:', error);
          assert.fail(
            `Expected InvalidBidForDeal error, but got: ${errorCode}`
          );
        }
      }
    });

    it('should fail when non-seller tries to conclude deal', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );
      const DealID = dealCounterAccount.currentId;

      const dealPda = await createDeal(Number(DealID));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      const bid1 = await submitBid(
        buyer,
        dealPda,
        Number(bidID),
        new BN(2),
        new BN(100_000)
      );

      const buyerOutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey
      );

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      try {
        await program.methods
          .concludeDeal()
          .accountsStrict({
            dealAccount: dealPda,
            seller: buyer.publicKey, // Wrong seller!
            outputTokenMint: outputTokenMint,
            saleTokensMint: saleTokenMint,
            dealEscrowAccount: dealEscrowPda,
            sellerOutputTokenAccount: sellerOutputTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
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

        assert.fail('Should have failed with unauthorized seller');
      } catch (error) {
        console.log('✅ Unauthorized seller error case passed');
      }
    });
  });

  describe('Deal Status and State Changes', () => {
    it('should not allow concluding an already concluded deal', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );

      const DealID = dealCounterAccount.currentId;

      const dealPda = await createDeal(Number(DealID));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      const bid1 = await submitBid(
        buyer,
        dealPda,
        Number(bidID),
        new BN(2),
        new BN(100_000)
      );

      const buyerOutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: seller.publicKey,
          outputTokenMint: outputTokenMint,
          saleTokensMint: saleTokenMint,
          dealEscrowAccount: dealEscrowPda,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
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
        await program.methods
          .concludeDeal()
          .accountsStrict({
            dealAccount: dealPda,
            seller: seller.publicKey,
            outputTokenMint: outputTokenMint,
            saleTokensMint: saleTokenMint,
            dealEscrowAccount: dealEscrowPda,
            sellerOutputTokenAccount: sellerOutputTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
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

        assert.fail('Should have failed on second conclusion');
      } catch (error) {
        console.log('✅ Double conclusion prevention test passed');
      }
    });

    it('should correctly update selected_bids array', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );
      const DealID = dealCounterAccount.currentId;

      const dealPda = await createDeal(Number(DealID));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      const bid1 = await submitBid(
        buyer,
        dealPda,
        Number(bidID),
        new BN(3),
        new BN(300_000)
      );

      const buyerOutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const bidCounterAccount2 = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID2 = bidCounterAccount2.currentId;

      const bid2 = await submitBid(
        buyer2,
        dealPda,
        Number(bidID2),
        new BN(2),
        new BN(400_000)
      );

      const buyer2OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer2.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const bidCounterAccount3 = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID3 = bidCounterAccount3.currentId;

      const bid3 = await submitBid(
        buyer3,
        dealPda,
        Number(bidID3),
        new BN(1),
        new BN(500_000)
      );

      const buyer3OutputAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        buyer3.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      const sellerOutputTokenAccount = getAssociatedTokenAddressSync(
        outputTokenMint,
        seller.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      await createAssociatedTokenAccount(
        connection,
        seller,
        outputTokenMint,
        seller.publicKey,
        undefined,
        TOKEN_PROGRAM_ID
      );

      const dealEscrowPda = getAssociatedTokenAddressSync(
        saleTokenMint,
        dealPda,
        true,
        TOKEN_PROGRAM_ID
      );

      await program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: seller.publicKey,
          outputTokenMint: outputTokenMint,
          saleTokensMint: saleTokenMint,
          dealEscrowAccount: dealEscrowPda,
          sellerOutputTokenAccount: sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
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

      const dealAccount = await program.account.deal.fetch(dealPda);
      assert.equal(dealAccount.selectedBids.length, 3);
      console.log('✅ Selected bids array update test passed');
    });
  });

  describe('handle zero quantity bid cases', () => {
    it('should handle zero quantity bids gracefully', async () => {
      const dealCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('deal_counter')],
        program.programId
      )[0];

      const dealCounterAccount = await program.account.dealCounter.fetch(
        dealCounterPda
      );
      const DealID = dealCounterAccount.currentId;

      const dealPda = await createDeal(Number(DealID));

      const bidCounterPda = PublicKey.findProgramAddressSync(
        [Buffer.from('bid_counter')],
        program.programId
      )[0];

      const bidCounterAccount = await program.account.bidCounter.fetch(
        bidCounterPda
      );
      const bidID = bidCounterAccount.currentId;

      try {
        const bid1 = await submitBid(
          buyer,
          dealPda,
          Number(bidID),
          new BN(2),
          new BN(0)
        );
        assert.fail('Should not allow zero quantity bids');
      } catch (error) {
        console.log('✅ Zero quantity bid properly rejected');
      }
    });
  });
});

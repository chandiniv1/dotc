import * as anchor from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createMint,
} from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  Connection,
  SystemProgram,
  LAMPORTS_PER_SOL,
  AccountMeta,
} from '@solana/web3.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import idlJson from '../target/idl/dotc.json';
import type { Dotc } from '../target/types/dotc';

const RPC_URL = 'http://127.0.0.1:8899';

const PROGRAM_ID = new PublicKey(
  '4qoo54cDUhCeiAFyxTWBsMb9CjEuPbNAnLhZ4v8bCF63'
);

const WALLET_PATH = resolve('/home/chandini/.config/solana/id.json');

function loadKeypair(): Keypair {
  const secret = JSON.parse(readFileSync(WALLET_PATH, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

interface ParticipantTokens {
  saleTokenMint: PublicKey;
  outputTokenMint: PublicKey;
  saleTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
}

interface BalanceSnapshot {
  participant: string;
  saleTokenBalance: string | number;
  outputTokenBalance: string | number;
}

export class DotcClient {
  public connection: Connection;
  private program: anchor.Program<Dotc>;
  private provider: anchor.AnchorProvider;
  public dealCounter: PublicKey;
  public bidCounter: PublicKey;
  public wallet: anchor.Wallet;

  public sellerKeypair: Keypair;
  public bidderKeypairs: Keypair[];

  public sellerTokens: ParticipantTokens | null = null;
  public bidderTokens: ParticipantTokens[] = [];

  private constructor(
    connection: Connection,
    provider: anchor.AnchorProvider,
    program: anchor.Program<Dotc>,
    wallet: anchor.Wallet
  ) {
    this.connection = connection;
    this.program = program;
    this.provider = provider;
    this.wallet = wallet;

    this.sellerKeypair = Keypair.generate();
    this.bidderKeypairs = [
      Keypair.generate(),
      Keypair.generate(),
      Keypair.generate(),
    ];

    [this.dealCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from('deal_counter')],
      this.program.programId
    );

    [this.bidCounter] = PublicKey.findProgramAddressSync(
      [Buffer.from('bid_counter')],
      this.program.programId
    );
  }

  static async init(): Promise<DotcClient> {
    const keypair = loadKeypair();
    const connection = new Connection(RPC_URL, 'confirmed');
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });

    anchor.setProvider(provider);

    const idl = idlJson as anchor.Idl;
    const program = new anchor.Program<Dotc>(idl, provider);

    const client = new DotcClient(connection, provider, program, wallet);

    await client.fundKeypairs();

    return client;
  }

  private async fundKeypairs(): Promise<void> {
    console.log('💰 Funding keypairs...');

    // Fund seller
    const sellerTx = await this.connection.requestAirdrop(
      this.sellerKeypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await this.connection.confirmTransaction(sellerTx);
    console.log(`✅ Funded seller: ${this.sellerKeypair.publicKey.toString()}`);

    // Fund bidders
    for (let i = 0; i < this.bidderKeypairs.length; i++) {
      const bidderTx = await this.connection.requestAirdrop(
        this.bidderKeypairs[i].publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await this.connection.confirmTransaction(bidderTx);
      console.log(
        `✅ Funded bidder ${i + 1}: ${this.bidderKeypairs[
          i
        ].publicKey.toString()}`
      );
    }
  }

  async createTestTokens(): Promise<void> {
    console.log('===============================================================');
    console.log('🪙 Creating separate tokens account for each participant...');

    const sellerSaleTokenMint = await createMint(
      this.connection,
      this.wallet.payer,
      this.wallet.publicKey,
      null,
      6
    );
    console.log('🪙 Created seller-token-mint...', sellerSaleTokenMint.toBase58());

    const sellerOutputTokenMint = await createMint(
      this.connection,
      this.wallet.payer,
      this.wallet.publicKey,
      null,
      6
    );
    console.log(
      '🪙 Created seller-output-token-mint...',
      sellerOutputTokenMint.toBase58()
    );

    const sellerSaleTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      sellerSaleTokenMint,
      this.sellerKeypair.publicKey
    );
    console.log(
      '🪙 Created seller-sale-token-account...',
      sellerSaleTokenAccount.address.toBase58()
    );

    const sellerOutputTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet.payer,
      sellerOutputTokenMint,
      this.sellerKeypair.publicKey
    );
    console.log(
      '🪙 Created seller-output-token-account...',
      sellerOutputTokenAccount.address.toBase58()
    );

    // Mint tokens to seller
    await mintTo(
      this.connection,
      this.wallet.payer,
      sellerSaleTokenMint,
      sellerSaleTokenAccount.address,
      this.wallet.payer,
      1000000
    );

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

      const bidderSaleTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        bidderSaleTokenMint,
        bidder.publicKey
      );

      const bidderOutputTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet.payer,
        bidderOutputTokenMint,
        bidder.publicKey
      );

      await mintTo(
        this.connection,
        this.wallet.payer,
        bidderOutputTokenMint,
        bidderOutputTokenAccount.address,
        this.wallet.payer,
        2000000 
      );

      this.bidderTokens.push({
        saleTokenMint: bidderSaleTokenMint,
        outputTokenMint: bidderOutputTokenMint,
        saleTokenAccount: bidderSaleTokenAccount.address,
        outputTokenAccount: bidderOutputTokenAccount.address,
      });
    }

    console.log('===============================================================');
    console.log('\n')
  }

  async initializeDealCounter(): Promise<string> {
    try {
      const tx = await this.program.methods
        .initializeDealCounter()
        .accountsStrict({
          dealCounter: this.dealCounter,
          seller: this.sellerKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.sellerKeypair])
        .rpc();

      console.log('✅ Deal counter initialized:', tx);
      return tx;
    } catch (error) {
      console.error('❌ Error initializing deal counter:', error);
      throw error;
    }
  }

  async initializeBidCounter(): Promise<string> {
    try {
      const tx = await this.program.methods
        .initializeBidCounter()
        .accountsStrict({
          bidCounter: this.bidCounter,
          bidder: this.bidderKeypairs[0].publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([this.bidderKeypairs[0]])
        .rpc();

      console.log('✅ Bid counter initialized:', tx);
      return tx;
    } catch (error) {
      console.error('❌ Error initializing bid counter:', error);
      throw error;
    }
  }

  async getDealCounter() {
    try {
      const dealCounterAccount = await this.program.account.dealCounter.fetch(
        this.dealCounter
      );
      const formatted = {
        currentId: dealCounterAccount.currentId.toString(),
      };
      console.log(JSON.stringify({ dealCounter: formatted }, null, 1));
      return dealCounterAccount;
    } catch (error) {
      console.error('❌ Error fetching deal counter:', error);
      throw error;
    }
  }

  async createDeal(
    saleTokenMint: PublicKey,
    outputTokenMint: PublicKey,
    dealInfo: {
      saleTokenSymbol: string;
      saleTokenDecimals: number;
      outputTokenSymbol: string;
      outputTokenDecimals: number;
      quantity: number;
      minPrice: number;
      expiration: number;
      conclusionTime: number;
    }
  ): Promise<{ dealId: number; dealPda: PublicKey }> {
    try {
      if (!this.sellerTokens) {
        throw new Error(
          'Seller tokens not initialized. Call createTestTokens() first.'
        );
      }

      // Get current deal counter
      const dealCounterAccount = await this.program.account.dealCounter.fetch(
        this.dealCounter
      );
      const dealId = dealCounterAccount.currentId.toNumber();

      // Generate deal PDA
      const [dealPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('deal'), new BN(dealId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId
      );

      // Generate escrow account PDA
      const escrowAccount = getAssociatedTokenAddressSync(
        this.sellerTokens.saleTokenMint,
        dealPda,
        true
      );

      const tx = await this.program.methods
        .createDeal(
          dealInfo.saleTokenSymbol,
          dealInfo.saleTokenDecimals,
          dealInfo.outputTokenSymbol,
          dealInfo.outputTokenDecimals,
          new BN(dealInfo.quantity),
          new BN(dealInfo.minPrice),
          new BN(dealInfo.expiration),
          new BN(dealInfo.conclusionTime)
        )
        .accountsStrict({
          seller: this.sellerKeypair.publicKey,
          dealCounter: this.dealCounter,
          sellerTokensMint: this.sellerTokens.saleTokenMint,
          buyerTokensMint: this.sellerTokens.outputTokenMint,
          sellerTokensAccount: this.sellerTokens.saleTokenAccount,
          dealAccount: dealPda,
          escrowAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([this.sellerKeypair])
        .rpc();

      console.log(`✅ Deal created with ID ${dealId}:`, tx);
      console.log("\n")
      console.log('=========================================================')
      return { dealId, dealPda };
    } catch (error) {
      console.error('❌ Error creating deal:', error);
      throw error;
    }
  }

  async getDeal(dealId: number) {
    try {
      const [dealPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('deal'), new BN(dealId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId
      );

      const dealAccount = await this.program.account.deal.fetch(dealPda);
      console.log(
        JSON.stringify(
          {
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
              selectedBids: dealAccount.selectedBids.map((bid) =>
                bid.toString()
              ),
            },
          },
          null,
          2
        )
      );
      return dealAccount;
    } catch (error) {
      console.error('❌ Error fetching deal:', error);
      throw error;
    }
  }

  async submitBid(
    dealPda: PublicKey,
    bidderIndex: number,
    bidInfo: {
      bidPricePerUnit: number;
      quantity: number;
    }
  ): Promise<{ bidId: number; bidPda: PublicKey }> {
    try {
      const bidder = this.bidderKeypairs[bidderIndex];
      const bidderTokenInfo = this.bidderTokens[bidderIndex];

      // Get current bid counter
      const bidCounterAccount = await this.program.account.bidCounter.fetch(
        this.bidCounter
      );
      const bidId = bidCounterAccount.currentId.toNumber();

      // Generate bid PDA
      const [bidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bid'), new BN(bidId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId
      );

      const buyerTokensAccount = bidderTokenInfo.outputTokenAccount;
      const buyerSaleTokenAccount = bidderTokenInfo.saleTokenAccount;

      // Generate bid escrow account
      const bidEscrowAccount = getAssociatedTokenAddressSync(
        bidderTokenInfo.outputTokenMint,
        bidPda,
        true
      );

      const tx = await this.program.methods
        .submitBid(new BN(bidInfo.bidPricePerUnit), new BN(bidInfo.quantity))
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
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([bidder])
        .rpc();

      console.log(
        `✅ Bid ${bidId} submitted by bidder ${bidderIndex + 1}:`,
        tx
      );
      return { bidId, bidPda };
    } catch (error) {
      console.error(
        `❌ Error submitting bid for bidder ${bidderIndex + 1}:`,
        error
      );
      throw error;
    }
  }

  async getBid(bidId: number) {
    try {
      const [bidPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bid'), new BN(bidId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId
      );

      const bidAccount = await this.program.account.bid.fetch(bidPda);
      console.log(
        JSON.stringify(
          {
            bid: {
              bidId: bidAccount.bidId.toString(),
              buyer: bidAccount.buyer.toString(),
              dealId: bidAccount.dealId.toString(),
              bidPricePerUnit: bidAccount.bidPricePerUnit.toString(),
              quantity: bidAccount.quantity.toString(),
              usdcDeposit: bidAccount.usdcDeposit.toString(),
              timestamp: bidAccount.timestamp.toString(),
            },
          },
          null,
          2
        )
      );
      return bidAccount;
    } catch (error) {
      console.error('❌ Error fetching bid:', error);
      throw error;
    }
  }

  async concludeDeal(dealId: number, bidIds: number[]): Promise<string> {
    try {
      if (!this.sellerTokens) {
        throw new Error('Seller tokens not initialized');
      }

      // Generate deal PDA
      const [dealPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('deal'), new BN(dealId).toArrayLike(Buffer, 'le', 8)],
        this.program.programId
      );

      // Get deal escrow account
      const dealEscrowAccount = getAssociatedTokenAddressSync(
        this.sellerTokens.saleTokenMint,
        dealPda,
        true
      );

      // Get seller's output token account
      const sellerOutputTokenAccount = this.sellerTokens.outputTokenAccount;

      // Prepare remaining accounts for each bid
      const remainingAccounts: AccountMeta[] = [];

      for (const bidId of bidIds) {
        // Generate bid PDA
        const [bidPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('bid'), new BN(bidId).toArrayLike(Buffer, 'le', 8)],
          this.program.programId
        );

        // Get bid account to find the buyer
        const bidAccount = await this.program.account.bid.fetch(bidPda);
        const buyerPublicKey = bidAccount.buyer;

        // Find which bidder this corresponds to
        const bidderIndex = this.bidderKeypairs.findIndex((keypair) =>
          keypair.publicKey.equals(buyerPublicKey)
        );

        if (bidderIndex === -1) {
          throw new Error(
            `Unknown buyer for bid ${bidId}: ${buyerPublicKey.toString()}`
          );
        }

        const bidderTokenInfo = this.bidderTokens[bidderIndex];

        // Get buyer's sale token account (where they'll receive the sale tokens)
        const buyerSaleTokenAccount = bidderTokenInfo.saleTokenAccount;

        // Get bid escrow account (where their payment is held)
        const bidEscrowAccount = getAssociatedTokenAddressSync(
          bidderTokenInfo.outputTokenMint,
          bidPda,
          true
        );

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
          }
        );
      }

      console.log("======================================================")
      console.log("\n")
      console.log(`🔄 Concluding deal ${dealId} with ${bidIds.length} bids...`);
     

      const tx = await this.program.methods
        .concludeDeal()
        .accountsStrict({
          dealAccount: dealPda,
          seller: this.sellerKeypair.publicKey,
          outputTokenMint: this.sellerTokens.outputTokenMint,
          saleTokensMint: this.sellerTokens.saleTokenMint,
          dealEscrowAccount,
          sellerOutputTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .signers([this.sellerKeypair])
        .rpc();

      console.log(`✅ Deal ${dealId} concluded successfully:`, tx);
      console.log("\n")
      console.log("======================================================")
      return tx;
    } catch (error) {
      console.error(`❌ Error concluding deal ${dealId}:`, error);
      throw error;
    }
  }

  async logBalances(title: string): Promise<BalanceSnapshot[]> {
    console.log(`\n📊 ${title}`);
    console.log('='.repeat(50));

    const snapshots: BalanceSnapshot[] = [];

    try {
      // Log seller balances
      if (this.sellerTokens) {
        const sellerSaleBalance = await this.connection.getTokenAccountBalance(
          this.sellerTokens.saleTokenAccount
        );
        const sellerOutputBalance =
          await this.connection.getTokenAccountBalance(
            this.sellerTokens.outputTokenAccount
          );

        const sellerSnapshot: BalanceSnapshot = {
          participant: `Seller (${this.sellerKeypair.publicKey
            .toString()
            .slice(0, 8)}...)`,
          saleTokenBalance: sellerSaleBalance.value.amount,
          outputTokenBalance: sellerOutputBalance.value.amount,
        };

        console.log(`🏪 ${sellerSnapshot.participant}:`);
        console.log(
          `   Sale Tokens (USDT):   ${sellerSnapshot.saleTokenBalance}`
        );
        console.log(
          `   Output Tokens (USDC): ${sellerSnapshot.outputTokenBalance}`
        );

        snapshots.push(sellerSnapshot);
      }

      // Log bidder balances
      for (let i = 0; i < this.bidderKeypairs.length; i++) {
        if (this.bidderTokens[i]) {
          const bidderSaleBalance =
            await this.connection.getTokenAccountBalance(
              this.bidderTokens[i].saleTokenAccount
            );
          const bidderOutputBalance =
            await this.connection.getTokenAccountBalance(
              this.bidderTokens[i].outputTokenAccount
            );

          const bidderSnapshot: BalanceSnapshot = {
            participant: `Bidder ${i + 1} (${this.bidderKeypairs[i].publicKey
              .toString()
              .slice(0, 8)}...)`,
            saleTokenBalance: bidderSaleBalance.value.amount,
            outputTokenBalance: bidderOutputBalance.value.amount,
          };

          console.log(`🛒 ${bidderSnapshot.participant}:`);
          console.log(
            `   Sale Tokens (USDT):   ${bidderSnapshot.saleTokenBalance}`
          );
          console.log(
            `   Output Tokens (USDC): ${bidderSnapshot.outputTokenBalance}`
          );

          snapshots.push(bidderSnapshot);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching balances:', error);
    }

    console.log('='.repeat(50));
    return snapshots;
  }
}

async function trade() {
  const client = await DotcClient.init();

  const dealCounterExists = await client.connection.getAccountInfo(
    client.dealCounter
  );
  if (!dealCounterExists) {
    await client.initializeDealCounter();
  }

  const bidCounterExists = await client.connection.getAccountInfo(
    client.bidCounter
  );
  if (!bidCounterExists) {
    await client.initializeBidCounter();
  }

  await client.createTestTokens();

  const saleTokenMint = client.sellerTokens!.saleTokenMint;
  const outputTokenMint = client.sellerTokens!.outputTokenMint;

  const { dealId, dealPda } = await client.createDeal(
    saleTokenMint,
    outputTokenMint,
    {
      saleTokenSymbol: 'USDT',
      saleTokenDecimals: 6,
      outputTokenSymbol: 'USDC',
      outputTokenDecimals: 6,
      quantity: 1000000,
      minPrice: 1, // 1 USDC per USDT
      expiration: Math.floor(Date.now() / 1000) + 3600,
      conclusionTime: Math.floor(Date.now() / 1000) + 1800,
    }
  );

  console.log('🪙 fetch deal before deal conclusion');
  await client.getDeal(dealId);

  const bidIds = [];

  // Bidder 1
  const { bidId: bid1Id } = await client.submitBid(dealPda, 0, {
    bidPricePerUnit: 1, // 1 USDT per 1 USDC
    quantity: 200000, 
  });
  bidIds.push(bid1Id);

  // Bidder 2
  const { bidId: bid2Id } = await client.submitBid(dealPda, 1, {
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
    await client.getBid(bidId);
  }

  const balancesBefore = await client.logBalances(
    'BALANCES BEFORE DEAL CONCLUSION'
  );
 
  await client.concludeDeal(dealId, bidIds);

  console.log('✅ deal after conclusion');
  await client.getDeal(dealId);

  // ✨ LOG BALANCES AFTER CONCLUDING DEAL
  const balancesAfter = await client.logBalances(
    'BALANCES AFTER DEAL CONCLUSION'
  );
}

trade().catch(console.error);

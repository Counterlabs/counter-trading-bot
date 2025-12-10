import { Connection, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { storage } from '../storage';

// Trading wallet for auto-trading (loaded from environment)
function getTradingWallet(): Keypair | null {
  const privateKeyStr = process.env.TRADING_WALLET_PRIVATE_KEY;
  if (!privateKeyStr) {
    return null;
  }
  
  try {
    // Try base58 first (most common format from Phantom)
    const privateKeyBytes = bs58.decode(privateKeyStr);
    return Keypair.fromSecretKey(privateKeyBytes);
  } catch {
    try {
      // Try JSON array format
      const privateKeyArray = JSON.parse(privateKeyStr);
      return Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    } catch {
      console.error('[Trading] Invalid private key format');
      return null;
    }
  }
}

const tradingWallet = getTradingWallet();
if (tradingWallet) {
  console.log(`[Trading] Trading wallet loaded: ${tradingWallet.publicKey.toBase58().slice(0, 8)}...`);
} else {
  console.log('[Trading] No trading wallet configured - auto-trading will require manual signing');
}

const HELIUS_RPC = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const JUPITER_QUOTE_API = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag/swap/v1';
const PUMPPORTAL_API = 'https://pumpportal.fun/api';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const JITO_ENDPOINTS = [
  'https://mainnet.block-engine.jito.wtf',
  'https://ny.mainnet.block-engine.jito.wtf',
  'https://amsterdam.mainnet.block-engine.jito.wtf',
  'https://frankfurt.mainnet.block-engine.jito.wtf',
  'https://tokyo.mainnet.block-engine.jito.wtf',
  'https://slc.mainnet.block-engine.jito.wtf',
];

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: any[];
  otherAmountThreshold?: string;
  swapMode?: string;
}

interface TradeParams {
  walletAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  type: 'buy' | 'sell';
  amountSol?: number;
  amountTokens?: number;
  sellPercent?: number;
  tokenDecimals?: number;
  slippageBps?: number;
  useMevProtection?: boolean;
  priorityFee?: number;
}

interface TradeResult {
  success: boolean;
  orderId: string;
  txSignature?: string;
  error?: string;
  quote?: SwapQuote;
  swapTransaction?: string;
  requiresSignature?: boolean;
  venue?: 'jupiter' | 'pumpfun';
}

interface PumpfunTradeParams {
  walletAddress: string;
  tokenMint: string;
  type: 'buy' | 'sell';
  amountSol?: number;
  amountTokens?: number;
  slippageBps: number;
}

export class TradingService {
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(HELIUS_RPC, 'confirmed');
  }

  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
    swapMode?: 'ExactIn' | 'ExactOut';
    decimals?: number;
  }): Promise<SwapQuote | null> {
    try {
      const decimals = params.decimals ?? 9;
      const rawAmount = Math.floor(params.amount * Math.pow(10, decimals));
      
      const queryParams = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: rawAmount.toString(),
        slippageBps: params.slippageBps.toString(),
        swapMode: params.swapMode || 'ExactIn',
      });
      
      const response = await fetch(`${JUPITER_QUOTE_API}/quote?${queryParams}`);
      
      if (!response.ok) {
        console.error('Jupiter quote failed:', await response.text());
        return null;
      }
      
      const quote = await response.json();
      
      return {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: parseFloat(quote.priceImpactPct || '0'),
        slippageBps: params.slippageBps,
        routePlan: quote.routePlan || [],
        otherAmountThreshold: quote.otherAmountThreshold,
        swapMode: quote.swapMode || params.swapMode || 'ExactIn',
      };
    } catch (error) {
      console.error('Failed to get quote:', error);
      return null;
    }
  }

  async getSwapTransaction(quoteResponse: any, userPublicKey: string, useMevProtection: boolean = false): Promise<{ transaction: string; lastValidBlockHeight: number } | null> {
    try {
      const swapConfig: any = {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      };
      
      if (useMevProtection) {
        swapConfig.computeUnitPriceMicroLamports = 500000; // 500k microLamports for faster confirmation
      } else {
        swapConfig.prioritizationFeeLamports = 500000; // 500k lamports priority fee
      }
      
      const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapConfig),
      });
      
      if (!response.ok) {
        console.error('Jupiter swap failed:', await response.text());
        return null;
      }
      
      const result = await response.json();
      return {
        transaction: result.swapTransaction,
        lastValidBlockHeight: result.lastValidBlockHeight,
      };
    } catch (error) {
      console.error('Failed to get swap transaction:', error);
      return null;
    }
  }

  async submitTransaction(signedTx: string): Promise<string | null> {
    try {
      const txBuffer = Buffer.from(signedTx, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);
      
      const signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      
      return signature;
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      return null;
    }
  }

  async submitWithJitoMevProtection(signedTxBase64: string): Promise<string | null> {
    const maxRetries = 2;
    const retryDelay = 1000;
    
    console.log(`[Jito] Submitting transaction with MEV protection`);
    
    // Extract signature from transaction for potential on-chain verification
    let txSignature: string | null = null;
    try {
      const txBuffer = Buffer.from(signedTxBase64, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);
      txSignature = bs58.encode(tx.signatures[0]);
    } catch (e) {
      console.log('[Jito] Could not extract signature from transaction');
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const endpoint of JITO_ENDPOINTS) {
        try {
          const response = await fetch(`${endpoint}/api/v1/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sendTransaction',
              params: [
                signedTxBase64,
                { encoding: 'base64' }
              ],
            }),
          });
          
          const responseText = await response.text();
          
          if (!response.ok) {
            // Check if "already processed" - this means transaction succeeded!
            if (responseText.includes('already processed')) {
              console.log('[Jito] Transaction already processed on-chain');
              if (txSignature) {
                // Verify on-chain
                const confirmed = await this.checkTransactionOnChain(txSignature);
                if (confirmed) {
                  console.log(`[Jito] Confirmed on-chain: ${txSignature}`);
                  return txSignature;
                }
              }
            }
            continue;
          }
          
          const result = JSON.parse(responseText);
          
          if (result.error) {
            // Handle "already processed" in RPC error
            if (result.error.message?.includes('already processed')) {
              console.log('[Jito] Transaction already processed');
              if (txSignature) {
                const confirmed = await this.checkTransactionOnChain(txSignature);
                if (confirmed) {
                  return txSignature;
                }
              }
            }
            // Rate limit - try next endpoint
            if (result.error.code === -32097 || result.error.message?.includes('rate limit')) {
              continue;
            }
            continue;
          }
          
          if (result.result) {
            console.log(`[Jito] Jito accepted: ${result.result}`);
            
            // Wait a moment and check if it actually landed
            await new Promise(resolve => setTimeout(resolve, 3000));
            const landed = await this.checkTransactionOnChain(result.result);
            
            if (landed) {
              console.log(`[Jito] Confirmed on-chain: ${result.result}`);
              return result.result;
            }
            
            // Jito accepted but not confirmed - try regular RPC immediately
            console.log(`[Jito] Not confirmed after 3s, trying regular RPC...`);
            try {
              const rpcSignature = await this.submitTransaction(signedTxBase64);
              if (rpcSignature) {
                console.log(`[RPC] Submitted as fallback: ${rpcSignature}`);
                return rpcSignature;
              }
            } catch (e) {
              console.log('[RPC] Fallback failed, returning Jito signature');
            }
            
            // Return Jito signature anyway, let confirmation handle it
            return result.result;
          }
        } catch (error) {
          continue;
        }
      }
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // All Jito endpoints failed - try regular RPC as fallback
    console.log('[Jito] Jito failed, trying regular RPC...');
    try {
      const signature = await this.submitTransaction(signedTxBase64);
      if (signature) {
        console.log(`[RPC] Submitted via regular RPC: ${signature}`);
        return signature;
      }
    } catch (e) {
      console.error('[RPC] Regular RPC also failed');
    }
    
    // Last resort - check if transaction is already on-chain
    if (txSignature) {
      const confirmed = await this.checkTransactionOnChain(txSignature);
      if (confirmed) {
        console.log(`[Jito] Found on-chain after retries: ${txSignature}`);
        return txSignature;
      }
    }
    
    console.error('[Jito] All submission methods failed');
    return null;
  }

  private async checkTransactionOnChain(signature: string): Promise<boolean> {
    try {
      const status = await this.connection.getSignatureStatus(signature);
      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized' ||
          status?.value?.confirmationStatus === 'processed') {
        return !status.value.err;
      }
      return false;
    } catch {
      return false;
    }
  }

  async confirmTransaction(signature: string, lastValidBlockHeight?: number): Promise<boolean> {
    try {
      const latestBlockhash = await this.connection.getLatestBlockhash();
      
      // Give the transaction more time to process (up to 30 seconds)
      const timeout = 30000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        try {
          const status = await this.connection.getSignatureStatus(signature);
          
          if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
            if (status.value.err) {
              console.error(`[Trading] Transaction confirmed but FAILED on-chain:`, JSON.stringify(status.value.err));
              return false;
            }
            console.log(`[Trading] Transaction confirmed: ${signature}`);
            return true;
          }
          
          if (status?.value?.err) {
            console.error(`[Trading] Transaction execution error:`, JSON.stringify(status.value.err));
            return false;
          }
          
          // Wait 1 second before checking again
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          // If we can't get status, wait and try again
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Timeout reached, check one final time
      const finalStatus = await this.connection.getSignatureStatus(signature);
      if (finalStatus?.value?.confirmationStatus === 'confirmed' || finalStatus?.value?.confirmationStatus === 'finalized') {
        if (finalStatus.value.err) {
          console.error(`[Trading] Transaction confirmed but FAILED:`, JSON.stringify(finalStatus.value.err));
          return false;
        }
        console.log(`[Trading] Transaction confirmed after timeout: ${signature}`);
        return true;
      }
      
      console.error(`[Trading] Transaction confirmation timeout: ${signature}`);
      return false;
    } catch (error) {
      console.error('Failed to confirm transaction:', error);
      return false;
    }
  }

  async getPumpfunSwapTransaction(params: PumpfunTradeParams): Promise<{ transaction: string; estimatedOutput: number } | null> {
    try {
      // Pump.fun bonding curve needs MUCH higher slippage - at least 15% for sells
      const isBuy = params.type === 'buy';
      const minSlippagePercent = isBuy ? 5 : 15; // 5% for buys, 15% for sells
      const requestedSlippagePercent = params.slippageBps / 100;
      const slippagePercent = Math.max(requestedSlippagePercent, minSlippagePercent);
      
      console.log(`[Trading] PumpPortal slippage: requested ${requestedSlippagePercent}%, using ${slippagePercent}% (min: ${minSlippagePercent}%)`);
      
      const requestBody = {
        publicKey: params.walletAddress,
        action: params.type,
        mint: params.tokenMint,
        amount: isBuy ? params.amountSol : (params.amountTokens || params.amountSol),
        denominatedInSol: isBuy ? 'true' : 'false',
        slippage: slippagePercent,
        priorityFee: 0.001, // Increased priority fee
        pool: 'pump',
      };
      
      console.log('[Trading] PumpPortal request:', JSON.stringify(requestBody));
      
      const response = await fetch(`${PUMPPORTAL_API}/trade-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Trading] PumpPortal trade failed:', response.status, errorText);
        return null;
      }
      
      const txData = await response.arrayBuffer();
      
      if (txData.byteLength === 0) {
        console.error('[Trading] PumpPortal returned empty response');
        return null;
      }
      
      const txBytes = new Uint8Array(txData);
      const txBase64 = Buffer.from(txBytes).toString('base64');
      
      console.log('[Trading] PumpPortal transaction received, size:', txBytes.length);
      
      return {
        transaction: txBase64,
        estimatedOutput: Math.floor((params.amountSol || params.amountTokens || 0) * 1e9),
      };
    } catch (error) {
      console.error('[Trading] Failed to get PumpPortal swap transaction:', error);
      return null;
    }
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    const isBuy = params.type === 'buy';
    // Use higher default slippage for sells (5%) since low-liquidity tokens need it
    const defaultSlippage = isBuy ? 100 : 500;
    const slippageBps = params.slippageBps || defaultSlippage;
    const useMevProtection = params.useMevProtection ?? true;
    
    const tradeAmount = isBuy ? (params.amountSol || 0) : (params.amountTokens || 0);
    console.log(`[Trading] Executing ${params.type}: ${tradeAmount} ${isBuy ? 'SOL' : 'tokens'}, slippage: ${slippageBps}bps`);
    
    const order = await storage.createOrder({
      walletAddress: params.walletAddress,
      tokenMint: params.tokenMint,
      tokenSymbol: params.tokenSymbol,
      type: params.type,
      amount: tradeAmount,
      price: 0,
      status: 'pending',
      slippage: slippageBps / 100,
      mevProtection: useMevProtection,
      createdAt: Date.now(),
    });

    try {
      const inputMint = isBuy ? SOL_MINT : params.tokenMint;
      const outputMint = isBuy ? params.tokenMint : SOL_MINT;
      
      const inputDecimals = isBuy ? 9 : (params.tokenDecimals ?? 6);
      const quoteAmount = isBuy ? (params.amountSol || 0) : (params.amountTokens || 0);
      
      console.log(`[Trading] Getting quote: ${inputMint.slice(0,8)}... → ${outputMint.slice(0,8)}..., amount: ${quoteAmount}`);
      const quote = await this.getQuote({
        inputMint,
        outputMint,
        amount: quoteAmount,
        slippageBps,
        decimals: inputDecimals,
      });

      if (!quote) {
        console.log('[Trading] Jupiter route not found, trying pump.fun bonding curve for', params.type);
        const pumpfunResult = await this.getPumpfunSwapTransaction({
          walletAddress: params.walletAddress,
          tokenMint: params.tokenMint,
          type: params.type,
          amountSol: params.amountSol,
          amountTokens: params.amountTokens,
          slippageBps,
        });
        
        if (!pumpfunResult) {
          await storage.updateOrder(order.id, { status: 'failed' });
          return {
            success: false,
            orderId: order.id,
            error: 'No route available via Jupiter or pump.fun',
          };
        }
        
        console.log('[Trading] Using pump.fun bonding curve for trade');
        return {
          success: true,
          orderId: order.id,
          swapTransaction: pumpfunResult.transaction,
          requiresSignature: true,
          venue: 'pumpfun',
        };
      }

      console.log(`[Trading] Jupiter quote found: out=${quote.outAmount}, route=${quote.routePlan?.length || 0} hops`);
      
      const tokenPrice = isBuy
        ? ((params.amountSol || 0) * 1e9) / parseInt(quote.outAmount)
        : parseInt(quote.outAmount) / ((params.amountTokens || 1) * Math.pow(10, params.tokenDecimals || 6));
      
      await storage.updateOrder(order.id, { price: tokenPrice });

      const swapResult = await this.getSwapTransaction(quote, params.walletAddress, useMevProtection);
      
      if (!swapResult) {
        console.log('[Trading] Jupiter swap tx failed, trying pump.fun bonding curve...');
        const pumpfunResult = await this.getPumpfunSwapTransaction({
          walletAddress: params.walletAddress,
          tokenMint: params.tokenMint,
          type: params.type,
          amountSol: params.amountSol,
          amountTokens: params.amountTokens,
          slippageBps,
        });
        
        if (!pumpfunResult) {
          await storage.updateOrder(order.id, { status: 'failed' });
          return {
            success: false,
            orderId: order.id,
            error: 'Failed to build swap transaction via Jupiter or pump.fun',
            quote,
          };
        }
        
        console.log('[Trading] Using pump.fun bonding curve for trade');
        return {
          success: true,
          orderId: order.id,
          quote,
          swapTransaction: pumpfunResult.transaction,
          requiresSignature: true,
          venue: 'pumpfun',
        };
      }

      console.log(`[Trading] Jupiter transaction built, venue: jupiter`);
      return {
        success: true,
        orderId: order.id,
        quote,
        swapTransaction: swapResult.transaction,
        requiresSignature: true,
        venue: 'jupiter',
      };

    } catch (error) {
      console.error('Trade execution failed:', error);
      await storage.updateOrder(order.id, { status: 'failed' });
      return {
        success: false,
        orderId: order.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async submitSignedTrade(
    orderId: string, 
    signedTransaction: string, 
    useMevProtection: boolean = true,
    walletAddress?: string
  ): Promise<TradeResult> {
    try {
      let signature: string | null;
      
      if (useMevProtection) {
        signature = await this.submitWithJitoMevProtection(signedTransaction);
      } else {
        signature = await this.submitTransaction(signedTransaction);
      }
      
      if (!signature) {
        await storage.updateOrder(orderId, { status: 'failed' });
        return {
          success: false,
          orderId,
          error: useMevProtection 
            ? 'Failed to submit via Jito bundle' 
            : 'Failed to submit transaction',
        };
      }

      const confirmed = await this.confirmTransaction(signature);
      
      await storage.updateOrder(orderId, {
        status: confirmed ? 'confirmed' : 'failed',
        txSignature: signature,
      });

      if (confirmed && walletAddress) {
        this.invalidateTokenCache(walletAddress);
        console.log(`[Trading] Invalidated token cache for ${walletAddress}`);
      }

      return {
        success: confirmed,
        orderId,
        txSignature: signature,
        error: confirmed ? undefined : 'Transaction failed to confirm',
      };
    } catch (error) {
      console.error('Signed trade submission failed:', error);
      await storage.updateOrder(orderId, { status: 'failed' });
      return {
        success: false,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Check if the trading wallet matches the given address
  canAutoSign(walletAddress: string): boolean {
    if (!tradingWallet) return false;
    return tradingWallet.publicKey.toBase58() === walletAddress;
  }

  // Get trading wallet address
  getTradingWalletAddress(): string | null {
    return tradingWallet?.publicKey.toBase58() || null;
  }

  // Sign transaction server-side and execute immediately
  async signAndExecuteTrade(
    swapTransaction: string,
    orderId: string,
    useMevProtection: boolean = true,
    walletAddress?: string
  ): Promise<TradeResult> {
    if (!tradingWallet) {
      return {
        success: false,
        orderId,
        error: 'No trading wallet configured for auto-signing',
      };
    }

    try {
      // Deserialize the transaction
      const txBuffer = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);
      
      // Sign with our trading wallet
      transaction.sign([tradingWallet]);
      
      // Serialize signed transaction
      const signedTxBytes = transaction.serialize();
      const signedTxBase64 = Buffer.from(signedTxBytes).toString('base64');
      
      console.log(`[Trading] Auto-signed transaction for order ${orderId}`);
      
      // Submit the signed transaction
      return await this.submitSignedTrade(orderId, signedTxBase64, useMevProtection, walletAddress);
    } catch (error) {
      console.error('[Trading] Auto-sign failed:', error);
      await storage.updateOrder(orderId, { status: 'failed' });
      return {
        success: false,
        orderId,
        error: error instanceof Error ? error.message : 'Failed to auto-sign transaction',
      };
    }
  }

  // Execute a trade with auto-signing (no wallet prompt needed)
  async executeAutoTrade(params: TradeParams): Promise<TradeResult> {
    // First check if we can auto-sign for this wallet
    if (!this.canAutoSign(params.walletAddress)) {
      return {
        success: false,
        orderId: '',
        error: `Cannot auto-trade: wallet ${params.walletAddress.slice(0, 8)}... is not the configured trading wallet`,
      };
    }

    // Execute the trade (this creates the order and gets the unsigned transaction)
    const tradeResult = await this.executeTrade(params);
    
    if (!tradeResult.success || !tradeResult.swapTransaction) {
      return tradeResult;
    }

    // Auto-sign and submit
    console.log(`[Trading] Auto-executing ${params.type} for ${params.tokenSymbol}...`);
    return await this.signAndExecuteTrade(
      tradeResult.swapTransaction,
      tradeResult.orderId,
      params.useMevProtection ?? true,
      params.walletAddress
    );
  }

  async getPriorityFeeEstimate(): Promise<number> {
    try {
      const response = await fetch(HELIUS_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getPriorityFeeEstimate',
          params: [{ accountKeys: [], options: { priorityLevel: 'High' } }],
        }),
      });
      
      if (!response.ok) return 50000;
      
      const result = await response.json();
      return result.result?.priorityFeeEstimate || 50000;
    } catch {
      return 50000;
    }
  }

  async getTokenBalance(walletAddress: string, tokenMint: string): Promise<number> {
    try {
      const wallet = new PublicKey(walletAddress);
      const mint = new PublicKey(tokenMint);
      
      const response = await this.connection.getParsedTokenAccountsByOwner(wallet, { mint });
      
      if (response.value.length === 0) return 0;
      
      return response.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    } catch {
      return 0;
    }
  }

  async getSolBalance(walletAddress: string): Promise<number> {
    try {
      const wallet = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(wallet);
      return balance / 1e9;
    } catch {
      return 0;
    }
  }

  async getTokenMetadata(tokenMint: string): Promise<{ decimals: number; name?: string; symbol?: string } | null> {
    try {
      const mint = new PublicKey(tokenMint);
      const info = await this.connection.getParsedAccountInfo(mint);
      
      if (info.value && 'parsed' in info.value.data) {
        const parsed = info.value.data.parsed;
        return {
          decimals: parsed.info.decimals,
          name: parsed.info.name,
          symbol: parsed.info.symbol,
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private tokenCache: Map<string, { tokens: { mint: string; balance: number; decimals: number }[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 900000; // 15 minutes cache to reduce RPC calls
  
  // Request coalescing - multiple callers share one in-flight RPC request
  private inFlightRequests: Map<string, Promise<{ mint: string; balance: number; decimals: number }[]>> = new Map();

  async getWalletTokens(walletAddress: string): Promise<{ mint: string; balance: number; decimals: number }[]> {
    // Check cache first
    const cached = this.tokenCache.get(walletAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[Trading] Using cached wallet tokens (${cached.tokens.length} tokens)`);
      return cached.tokens;
    }

    // Request coalescing - if a fetch is already in progress, wait for it
    const existingRequest = this.inFlightRequests.get(walletAddress);
    if (existingRequest) {
      console.log(`[Trading] Waiting for in-flight token fetch...`);
      return existingRequest;
    }

    // Start new fetch and store the promise
    const fetchPromise = this.fetchWalletTokensInternal(walletAddress, cached);
    this.inFlightRequests.set(walletAddress, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.inFlightRequests.delete(walletAddress);
    }
  }

  private async fetchWalletTokensInternal(
    walletAddress: string, 
    cached: { tokens: { mint: string; balance: number; decimals: number }[]; timestamp: number } | undefined
  ): Promise<{ mint: string; balance: number; decimals: number }[]> {
    const maxRetries = 2;
    
    const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 3000; // Longer delays (3s, 6s)
          console.log(`[Trading] Retry ${attempt + 1}/${maxRetries}, waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const wallet = new PublicKey(walletAddress);
        
        const splResponse = await this.connection.getParsedTokenAccountsByOwner(wallet, {
          programId: new PublicKey(TOKEN_PROGRAM_ID)
        });
        
        let token2022Response: { value: any[] } = { value: [] };
        try {
          token2022Response = await this.connection.getParsedTokenAccountsByOwner(wallet, {
            programId: new PublicKey(TOKEN_2022_PROGRAM_ID)
          });
        } catch (e) {
          // Silent fail for Token-2022
        }
        
        const allAccounts = [...splResponse.value, ...token2022Response.value];
        
        const tokens = allAccounts
          .map(account => {
            const info = account.account.data.parsed.info;
            const balance = info.tokenAmount.uiAmount || 0;
            return {
              mint: info.mint,
              balance: balance,
              decimals: info.tokenAmount.decimals,
            };
          })
          .filter(t => t.balance > 0);

        // Cache the result
        this.tokenCache.set(walletAddress, { tokens, timestamp: Date.now() });
        console.log(`[Trading] Fetched ${tokens.length} tokens with balance (from ${allAccounts.length} accounts)`);
        return tokens;
        
      } catch (error) {
        const errorMsg = (error as Error).message || '';
        console.error(`[Trading] Attempt ${attempt + 1} failed:`, errorMsg.slice(0, 80));
        
        const isRateLimited = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
        if (!isRateLimited) break;
      }
    }
    
    // Return stale cache if available
    if (cached) {
      console.log(`[Trading] Using stale cache (${cached.tokens.length} tokens)`);
      return cached.tokens;
    }
    
    return [];
  }

  invalidateTokenCache(walletAddress: string): void {
    this.tokenCache.delete(walletAddress);
  }
}

export const tradingService = new TradingService();

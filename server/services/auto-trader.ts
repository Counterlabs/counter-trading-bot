import { storage } from '../storage';
import { tradingService } from './trading';
import { tokenScanner } from './token-scanner';
import type { Token, TradingSettings, TokenFilter, AutoTradePosition, AutoTradeEvent } from '@shared/schema';

interface AutoTradeStatus {
  enabled: boolean;
  activePositions: number;
  pendingBuys: number;
  totalBuys: number;
  totalSells: number;
  lastActivity?: string;
}

interface PendingTrade {
  token: Token;
  walletAddress: string;
  amountSol: number;
  targetMcap: number;
  stopLossMcap: number;
  createdAt: number;
}

class AutoTraderService {
  private isRunning: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private processedTokens: Set<string> = new Set();
  private pendingTrades: Map<string, PendingTrade> = new Map();
  private wsClients: Map<string, Set<(data: any) => void>> = new Map();
  
  // Trade queue for rate limiting
  private tradeQueue: Array<{
    token: Token;
    walletAddress: string;
    settings: TradingSettings;
    entryMcap: number;
    targetMcap: number;
    stopLossMcap: number;
  }> = [];
  private isProcessingQueue: boolean = false;
  private lastTradeTime: number = 0;
  
  private readonly MONITOR_INTERVAL = 30000; // Check positions every 30s (reduced frequency)
  private readonly COOLDOWN_PERIOD = 30000; // Don't re-buy same token within 30 seconds (TEST MODE)
  private readonly MIN_TRADE_INTERVAL = 30000; // Minimum 30 seconds between trades (TEST MODE)
  
  constructor() {
    console.log('[AutoTrader] Service initialized');
  }

  registerClient(walletAddress: string, callback: (data: any) => void): void {
    if (!this.wsClients.has(walletAddress)) {
      this.wsClients.set(walletAddress, new Set());
    }
    this.wsClients.get(walletAddress)!.add(callback);
  }

  unregisterClient(walletAddress: string, callback: (data: any) => void): void {
    const clients = this.wsClients.get(walletAddress);
    if (clients) {
      clients.delete(callback);
      if (clients.size === 0) {
        this.wsClients.delete(walletAddress);
      }
    }
  }

  private notifyClient(walletAddress: string, data: any): void {
    const clients = this.wsClients.get(walletAddress);
    if (clients) {
      clients.forEach(callback => callback(data));
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[AutoTrader] Starting auto-trade monitoring...');
    
    // Load any wallets with auto-trade enabled from storage
    const savedWallets = await storage.getAutoTradeEnabledWallets();
    for (const wallet of savedWallets) {
      this.enabledWallets.add(wallet);
      console.log(`[AutoTrader] Restored tracking for wallet: ${wallet.slice(0, 8)}...`);
    }
    
    // Start position monitoring loop
    this.startMonitoringLoop();
    
    // Subscribe to token scanner for new tokens
    this.subscribeToTokenScanner();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    console.log('[AutoTrader] Stopped auto-trade monitoring');
  }

  private subscribeToTokenScanner(): void {
    // Hook into token scanner's new token events (from PumpPortal WebSocket)
    tokenScanner.onNewToken(async (token: Token) => {
      await this.processToken(token, true);
    });
    
    // Also hook into token updates (from Moralis API updates)
    // This catches tokens that have grown in market cap
    tokenScanner.onTokenUpdate(async (token: Token) => {
      await this.processToken(token, false);
    });
  }

  private async processToken(token: Token, isNew: boolean): Promise<void> {
    if (!this.isRunning) return;
    
    // Get all wallets with auto-trade enabled
    const enabledWallets = await this.getEnabledWallets();
    
    for (const walletAddress of enabledWallets) {
      try {
        await this.evaluateTokenForWallet(token, walletAddress, isNew);
      } catch (error) {
        console.error(`[AutoTrader] Error evaluating token for ${walletAddress}:`, error);
      }
    }
  }

  private async processNewToken(token: Token): Promise<void> {
    await this.processToken(token, true);
  }

  private enabledWallets: Set<string> = new Set();

  // Track wallets with auto-trade enabled
  async trackWallet(walletAddress: string): Promise<void> {
    const settings = await storage.getTradingSettings(walletAddress);
    if (settings.autoTradeEnabled) {
      this.enabledWallets.add(walletAddress);
      console.log(`[AutoTrader] Tracking wallet: ${walletAddress.slice(0, 8)}...`);
    } else {
      this.enabledWallets.delete(walletAddress);
    }
  }

  private async getEnabledWallets(): Promise<string[]> {
    // Return all wallets we're tracking that have auto-trade enabled
    const wallets: string[] = [];
    const walletList = Array.from(this.enabledWallets);
    for (const walletAddress of walletList) {
      const settings = await storage.getTradingSettings(walletAddress);
      if (settings.autoTradeEnabled) {
        wallets.push(walletAddress);
      } else {
        this.enabledWallets.delete(walletAddress);
      }
    }
    return wallets;
  }

  private async evaluateTokenForWallet(token: Token, walletAddress: string, isNew: boolean = true): Promise<void> {
    // Check if scanner is in cooldown (pause after each buy)
    const cooldownStatus = tokenScanner.getCooldownStatus();
    if (cooldownStatus.isInCooldown) {
      return;
    }

    // PERMANENT BLACKLIST CHECK - never buy a token that was already bought
    const isBlacklisted = await storage.isTokenBlacklisted(walletAddress, token.mint);
    if (isBlacklisted) {
      return; // Skip silently - already bought this token before
    }

    // Check if already in processing cooldown
    const tokenKey = `${walletAddress}:${token.mint}`;
    if (this.processedTokens.has(tokenKey)) {
      return;
    }

    // Check settings
    const settings = await storage.getTradingSettings(walletAddress);
    if (!settings.autoTradeEnabled) return;

    // Check filter - if enabled, apply it; if disabled, use basic defaults
    const filter = await storage.getTokenFilters(walletAddress);
    if (filter.enabled) {
      const passesFilter = tokenScanner.applyFilter(token, filter);
      
      // Only log tokens that PASS the filter (reduces spam)
      if (!passesFilter) {
        return;
      }
      console.log(`[AutoTrader] PASS: ${token.symbol} mcap=$${(token.marketCap || 0).toLocaleString()}`);
    } else {
      // Filters disabled - apply basic defaults (20k-500k mcap, has liquidity)
      const mcap = token.marketCap || 0;
      if (mcap < 20000 || mcap > 500000) return;
      if ((token.liquidity || 0) < 1000) return;
      console.log(`[AutoTrader] PASS (no filter): ${token.symbol} mcap=$${mcap.toLocaleString()}`);
    }

    // Check position limits
    const activePositions = await storage.getAutoTradePositions(walletAddress, 'active');
    if (activePositions.length >= settings.maxConcurrentPositions) {
      console.log(`[AutoTrader] Max positions reached for ${walletAddress.slice(0, 8)}...`);
      return;
    }

    // Check if we already have a position in this token
    const hasPosition = await storage.hasActiveAutoTradePosition(walletAddress, token.mint);
    if (hasPosition) return;

    // Check if token already exists in wallet (prevents buying same token twice)
    const walletTokens = await tradingService.getWalletTokens(walletAddress);
    const tokenInWallet = walletTokens.find(t => t.mint === token.mint);
    if (tokenInWallet && tokenInWallet.balance > 0) {
      console.log(`[AutoTrader] SKIP: ${token.symbol} already in wallet (${tokenInWallet.balance} tokens)`);
      return;
    }

    // Calculate target and stop loss
    const entryMcap = token.marketCap || 0;
    let targetMcap: number;
    
    if (settings.sellTargetMode === 'mcap' && settings.sellTargetMcap) {
      targetMcap = settings.sellTargetMcap;
    } else {
      targetMcap = entryMcap * settings.sellTargetMultiplier;
    }
    
    const stopLossMcap = entryMcap * (1 - settings.autoSellStopLossPercent / 100);

    // Mark as processed (with cooldown) - use longer cooldown to prevent duplicates
    this.processedTokens.add(tokenKey);
    setTimeout(() => this.processedTokens.delete(tokenKey), this.COOLDOWN_PERIOD);

    console.log(`[AutoTrader] Token matched for ${walletAddress.slice(0, 8)}...: ${token.symbol} @ $${entryMcap.toLocaleString()} mcap`);

    // Check if we can auto-sign for this wallet
    const canAutoSign = tradingService.canAutoSign(walletAddress);
    
    if (canAutoSign) {
      // Add to trade queue instead of executing immediately
      const existingInQueue = this.tradeQueue.find(t => t.token.mint === token.mint && t.walletAddress === walletAddress);
      if (existingInQueue) {
        console.log(`[AutoTrader] ${token.symbol} already in queue, skipping`);
        return;
      }
      
      this.tradeQueue.push({
        token,
        walletAddress,
        settings,
        entryMcap,
        targetMcap,
        stopLossMcap,
      });
      
      console.log(`[AutoTrader] Added ${token.symbol} to trade queue (queue size: ${this.tradeQueue.length})`);
      
      // Start queue processing if not already running
      this.processTradeQueue();
    } else {
      // Queue trade for manual approval (legacy flow)
      const pendingTrade: PendingTrade = {
        token,
        walletAddress,
        amountSol: settings.autoBuyAmountSol,
        targetMcap,
        stopLossMcap,
        createdAt: Date.now(),
      };
      this.pendingTrades.set(tokenKey, pendingTrade);
      
      // Log event
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'buy_attempt',
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        message: `Queued ${token.symbol} for manual approval (${settings.autoBuyAmountSol} SOL)`,
        details: {
          marketCap: entryMcap,
          targetMcap,
          stopLossMcap,
          amountSol: settings.autoBuyAmountSol,
        },
        createdAt: Date.now(),
      });
      
      // Notify client to approve
      this.notifyClient(walletAddress, {
        type: 'pending_trade',
        token,
        amountSol: settings.autoBuyAmountSol,
        targetMcap,
        stopLossMcap,
      });
    }
  }

  // Clear the trade queue (called when cooldown starts)
  clearTradeQueue(): void {
    const queueSize = this.tradeQueue.length;
    if (queueSize > 0) {
      console.log(`[AutoTrader] Clearing trade queue (${queueSize} pending trades) due to cooldown`);
      this.tradeQueue = [];
    }
  }

  private async processTradeQueue(): Promise<void> {
    if (this.isProcessingQueue || this.tradeQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.tradeQueue.length > 0) {
      // CHECK COOLDOWN - if in cooldown, clear queue and stop processing
      const cooldownStatus = tokenScanner.getCooldownStatus();
      if (cooldownStatus.isInCooldown) {
        console.log(`[AutoTrader] In 10-minute cooldown - clearing queue and stopping buys`);
        this.tradeQueue = [];
        break;
      }

      const trade = this.tradeQueue.shift();
      if (!trade) break;
      
      const { token, walletAddress, settings, entryMcap, targetMcap, stopLossMcap } = trade;
      
      // Double-check position limits before executing
      const activePositions = await storage.getAutoTradePositions(walletAddress, 'active');
      if (activePositions.length >= settings.maxConcurrentPositions) {
        console.log(`[AutoTrader] Max positions reached, skipping ${token.symbol}`);
        continue;
      }
      
      // Check if already have position in this token
      const hasPosition = await storage.hasActiveAutoTradePosition(walletAddress, token.mint);
      if (hasPosition) {
        console.log(`[AutoTrader] Already have position in ${token.symbol}, skipping`);
        continue;
      }
      
      // Log buy attempt
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'buy_attempt',
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        message: `Executing buy for ${token.symbol} (${settings.autoBuyAmountSol} SOL)`,
        details: {
          marketCap: entryMcap,
          targetMcap,
          stopLossMcap,
          amountSol: settings.autoBuyAmountSol,
        },
        createdAt: Date.now(),
      });
      
      console.log(`[AutoTrader] Executing buy for ${token.symbol} (queue remaining: ${this.tradeQueue.length})`);
      this.lastTradeTime = Date.now();
      
      try {
        const buyResult = await tradingService.executeAutoTrade({
          walletAddress,
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          type: 'buy',
          amountSol: settings.autoBuyAmountSol,
          slippageBps: settings.defaultSlippage * 100,
          useMevProtection: settings.mevProtection,
        });
        
        if (buyResult.success && buyResult.txSignature) {
          console.log(`[AutoTrader] Buy successful for ${token.symbol}: ${buyResult.txSignature}`);
          
          // Create position record
          const position = await storage.createAutoTradePosition({
            walletAddress,
            tokenMint: token.mint,
            tokenSymbol: token.symbol,
            tokenName: token.name,
            entryPrice: token.price,
            entryMarketCap: entryMcap,
            targetMarketCap: targetMcap,
            stopLossMarketCap: stopLossMcap,
            amountSol: settings.autoBuyAmountSol,
            tokenAmount: 0,
            status: 'active',
            buyTxSignature: buyResult.txSignature,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          
          await storage.createAutoTradeEvent({
            walletAddress,
            type: 'buy_success',
            tokenMint: token.mint,
            tokenSymbol: token.symbol,
            message: `Bought ${token.symbol} for ${settings.autoBuyAmountSol} SOL`,
            details: {
              txSignature: buyResult.txSignature,
              entryMcap,
              targetMcap,
              positionId: position.id,
            },
            createdAt: Date.now(),
          });
          
          // PERMANENT BLACKLIST - never buy this token again
          await storage.blacklistToken(walletAddress, token.mint);
          
          // Start cooldown - pauses scanner and prevents new buys
          tokenScanner.startCooldown();
          console.log(`[AutoTrader] Cooldown started after buying ${token.symbol}`);
          
          // Notify client
          this.notifyClient(walletAddress, {
            type: 'auto_trade_executed',
            token,
            success: true,
            txSignature: buyResult.txSignature,
            positionId: position.id,
          });
        } else {
          console.log(`[AutoTrader] Buy failed for ${token.symbol}: ${buyResult.error}`);
          await storage.createAutoTradeEvent({
            walletAddress,
            type: 'buy_failed',
            tokenMint: token.mint,
            tokenSymbol: token.symbol,
            message: `Buy failed: ${buyResult.error}`,
            createdAt: Date.now(),
          });
        }
      } catch (error) {
        console.error(`[AutoTrader] Error executing buy for ${token.symbol}:`, error);
        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'error',
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          createdAt: Date.now(),
        });
      }
    }
    
    this.isProcessingQueue = false;
  }

  async executeBuy(
    walletAddress: string, 
    tokenMint: string,
    signedTransaction?: string
  ): Promise<{ success: boolean; positionId?: string; error?: string; requiresSignature?: boolean; swapTransaction?: string; orderId?: string }> {
    const tokenKey = `${walletAddress}:${tokenMint}`;
    const pendingTrade = this.pendingTrades.get(tokenKey);
    
    if (!pendingTrade) {
      // If no pending trade, get settings and token info
      const settings = await storage.getTradingSettings(walletAddress);
      const token = await storage.getToken(tokenMint);
      
      if (!token) {
        return { success: false, error: 'Token not found' };
      }

      const entryMcap = token.marketCap || 0;
      let targetMcap: number;
      
      if (settings.sellTargetMode === 'mcap' && settings.sellTargetMcap) {
        targetMcap = settings.sellTargetMcap;
      } else {
        targetMcap = entryMcap * settings.sellTargetMultiplier;
      }
      
      const stopLossMcap = entryMcap * (1 - settings.autoSellStopLossPercent / 100);

      // Create the trade
      const tradeResult = await tradingService.executeTrade({
        walletAddress,
        tokenMint,
        tokenSymbol: token.symbol,
        type: 'buy',
        amountSol: settings.autoBuyAmountSol,
        slippageBps: settings.defaultSlippage * 100,
        useMevProtection: settings.mevProtection,
      });

      if (!tradeResult.success) {
        return { success: false, error: tradeResult.error };
      }

      if (tradeResult.requiresSignature) {
        return {
          success: true,
          requiresSignature: true,
          swapTransaction: tradeResult.swapTransaction,
          orderId: tradeResult.orderId,
        };
      }

      return { success: true };
    }

    const { token, amountSol, targetMcap, stopLossMcap } = pendingTrade;
    const settings = await storage.getTradingSettings(walletAddress);

    // If we have a signed transaction, submit it
    if (signedTransaction) {
      const result = await tradingService.submitSignedTrade(
        pendingTrade.token.mint,
        signedTransaction,
        settings.mevProtection,
        walletAddress
      );

      if (result.success) {
        // Create position record
        const position = await storage.createAutoTradePosition({
          walletAddress,
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          entryPrice: token.price,
          entryMarketCap: token.marketCap || 0,
          targetMarketCap: targetMcap,
          stopLossMarketCap: stopLossMcap,
          amountSol,
          tokenAmount: 0, // Will be updated after checking balance
          status: 'active',
          buyTxSignature: result.txSignature,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'buy_success',
          tokenMint: token.mint,
          tokenSymbol: token.symbol,
          message: `Bought ${token.symbol} for ${amountSol} SOL`,
          details: {
            txSignature: result.txSignature,
            entryMcap: token.marketCap,
            targetMcap,
          },
          createdAt: Date.now(),
        });

        // PERMANENT BLACKLIST - never buy this token again
        await storage.blacklistToken(walletAddress, token.mint);

        this.pendingTrades.delete(tokenKey);

        return { success: true, positionId: position.id };
      }

      return { success: false, error: result.error };
    }

    // Execute the trade (get transaction to sign)
    const tradeResult = await tradingService.executeTrade({
      walletAddress,
      tokenMint: token.mint,
      tokenSymbol: token.symbol,
      type: 'buy',
      amountSol,
      slippageBps: settings.defaultSlippage * 100,
      useMevProtection: settings.mevProtection,
    });

    if (!tradeResult.success) {
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'buy_failed',
        tokenMint: token.mint,
        tokenSymbol: token.symbol,
        message: `Failed to buy ${token.symbol}: ${tradeResult.error}`,
        createdAt: Date.now(),
      });

      this.pendingTrades.delete(tokenKey);
      return { success: false, error: tradeResult.error };
    }

    if (tradeResult.requiresSignature) {
      return {
        success: true,
        requiresSignature: true,
        swapTransaction: tradeResult.swapTransaction,
        orderId: tradeResult.orderId,
      };
    }

    return { success: true };
  }

  async confirmBuy(
    walletAddress: string,
    orderId: string,
    tokenMint: string,
    signedTransaction: string
  ): Promise<{ success: boolean; positionId?: string; error?: string }> {
    const settings = await storage.getTradingSettings(walletAddress);
    const token = await storage.getToken(tokenMint);
    
    const result = await tradingService.submitSignedTrade(
      orderId,
      signedTransaction,
      settings.mevProtection,
      walletAddress
    );

    if (!result.success) {
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'buy_failed',
        tokenMint,
        tokenSymbol: token?.symbol,
        message: `Buy transaction failed: ${result.error}`,
        createdAt: Date.now(),
      });

      return { success: false, error: result.error };
    }

    // Calculate targets
    const entryMcap = token?.marketCap || 0;
    let targetMcap: number;
    
    if (settings.sellTargetMode === 'mcap' && settings.sellTargetMcap) {
      targetMcap = settings.sellTargetMcap;
    } else {
      targetMcap = entryMcap * settings.sellTargetMultiplier;
    }
    
    const stopLossMcap = entryMcap * (1 - settings.autoSellStopLossPercent / 100);

    // Create position record
    const position = await storage.createAutoTradePosition({
      walletAddress,
      tokenMint,
      tokenSymbol: token?.symbol || 'UNKNOWN',
      tokenName: token?.name || 'Unknown',
      entryPrice: token?.price || 0,
      entryMarketCap: entryMcap,
      targetMarketCap: targetMcap,
      stopLossMarketCap: stopLossMcap,
      amountSol: settings.autoBuyAmountSol,
      tokenAmount: 0,
      status: 'active',
      buyTxSignature: result.txSignature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'buy_success',
      tokenMint,
      tokenSymbol: token?.symbol,
      message: `Bought ${token?.symbol} for ${settings.autoBuyAmountSol} SOL`,
      details: {
        txSignature: result.txSignature,
        entryMcap,
        targetMcap,
      },
      createdAt: Date.now(),
    });

    // PERMANENT BLACKLIST - never buy this token again
    await storage.blacklistToken(walletAddress, tokenMint);

    // Clean up pending trade
    const tokenKey = `${walletAddress}:${tokenMint}`;
    this.pendingTrades.delete(tokenKey);

    return { success: true, positionId: position.id };
  }

  private startMonitoringLoop(): void {
    this.monitorInterval = setInterval(async () => {
      await this.checkPositionsForSell();
    }, this.MONITOR_INTERVAL);
  }

  private async checkPositionsForSell(): Promise<void> {
    if (!this.isRunning) return;

    // Get ALL wallets with auto-trade enabled (not just WS connected ones)
    const enabledWallets = await this.getEnabledWallets();
    
    for (const walletAddress of enabledWallets) {
      try {
        const settings = await storage.getTradingSettings(walletAddress);
        if (!settings.autoTradeEnabled) continue;

        const positions = await storage.getAutoTradePositions(walletAddress, 'active');
        
        if (positions.length > 0) {
          console.log(`[AutoTrader] Checking ${positions.length} positions for ${walletAddress.slice(0, 8)}...`);
        }
        
        for (const position of positions) {
          await this.evaluatePositionForSell(position, walletAddress, settings);
        }
      } catch (error) {
        console.error(`[AutoTrader] Error checking positions for ${walletAddress}:`, error);
      }
    }
  }

  private async evaluatePositionForSell(position: AutoTradePosition, walletAddress: string, settings: TradingSettings): Promise<void> {
    // First check if we still have tokens - if balance is 0, close the position
    try {
      const tokenBalance = await tradingService.getTokenBalance(walletAddress, position.tokenMint);
      if (tokenBalance <= 0) {
        console.log(`[AutoTrader] ${position.tokenSymbol} has 0 balance - removing from monitoring`);
        await storage.updateAutoTradePosition(position.id, { status: 'sold' });
        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'sell_success',
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          message: `${position.tokenSymbol} removed (0 balance)`,
          createdAt: Date.now(),
        });
        return;
      }
    } catch (error) {
      // Continue with evaluation if balance check fails
    }

    // Fetch FRESH price from pump.fun API with multiple fallbacks
    let currentMcap = 0;
    let dataSource = 'none';
    
    // Try pump.fun API first
    try {
      const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${position.tokenMint}`, {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (pumpResponse.ok) {
        const pumpData = await pumpResponse.json();
        currentMcap = pumpData.usd_market_cap || 0;
        if (currentMcap > 0) dataSource = 'pump.fun';
      }
    } catch (error) {
      // Silent fail, will try fallback
    }
    
    // Fallback to stored token data from Moralis scanner
    if (currentMcap === 0) {
      const token = await storage.getToken(position.tokenMint);
      if (token?.marketCap && token.marketCap > 0) {
        currentMcap = token.marketCap;
        dataSource = 'moralis-cache';
      }
    }

    // If still no mcap, log and skip (but don't fail silently)
    if (currentMcap === 0) {
      console.log(`[AutoTrader] WARNING: No mcap data for ${position.tokenSymbol} - skipping evaluation`);
      return;
    }
    
    const changePercent = ((currentMcap / position.entryMarketCap) - 1) * 100;
    console.log(`[AutoTrader] ${position.tokenSymbol} [${dataSource}]: mcap=$${currentMcap.toLocaleString()} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%) target=$${position.targetMarketCap.toLocaleString()} stop=$${position.stopLossMarketCap.toLocaleString()}`);
    
    // Check if target hit
    if (currentMcap >= position.targetMarketCap) {
      console.log(`[AutoTrader] TARGET HIT for ${position.tokenSymbol}! Auto-selling...`);
      
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'sell_attempt',
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        message: `Target hit! Auto-selling ${position.tokenSymbol} at +${changePercent.toFixed(1)}%`,
        details: { currentMcap, targetMcap: position.targetMarketCap, entryMcap: position.entryMarketCap, gainPercent: changePercent },
        createdAt: Date.now(),
      });

      // AUTO-EXECUTE SELL
      await this.autoExecuteSell(position, walletAddress, settings, 'target_hit', currentMcap);
    }
    
    // Check if stop loss hit
    else if (currentMcap <= position.stopLossMarketCap) {
      console.log(`[AutoTrader] STOP LOSS HIT for ${position.tokenSymbol}! Auto-selling...`);
      
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'stop_loss',
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        message: `Stop loss triggered! Auto-selling ${position.tokenSymbol} at ${changePercent.toFixed(1)}%`,
        details: { currentMcap, stopLossMcap: position.stopLossMarketCap, entryMcap: position.entryMarketCap, lossPercent: changePercent },
        createdAt: Date.now(),
      });

      // AUTO-EXECUTE SELL
      await this.autoExecuteSell(position, walletAddress, settings, 'stop_loss', currentMcap);
    }
  }

  private async autoExecuteSell(
    position: AutoTradePosition,
    walletAddress: string,
    settings: TradingSettings,
    reason: 'target_hit' | 'stop_loss',
    currentMcap: number
  ): Promise<void> {
    try {
      // Check if trading wallet can auto-sign
      if (!tradingService.canAutoSign(walletAddress)) {
        console.log(`[AutoTrader] Cannot auto-sign for ${walletAddress.slice(0, 8)}... - notifying client`);
        this.notifyClient(walletAddress, {
          type: 'auto_trade_sell_signal',
          position,
          reason,
          currentMcap,
        });
        return;
      }

      // Get token balance
      const tokenBalance = await tradingService.getTokenBalance(walletAddress, position.tokenMint);
      if (tokenBalance <= 0) {
        console.log(`[AutoTrader] No balance for ${position.tokenSymbol}, marking as sold`);
        await storage.updateAutoTradePosition(position.id, { status: 'sold' });
        return;
      }

      // Get token metadata
      const metadata = await tradingService.getTokenMetadata(position.tokenMint);
      const decimals = metadata?.decimals ?? 6;

      // Execute auto-trade sell
      const result = await tradingService.executeAutoTrade({
        walletAddress,
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        type: 'sell',
        amountTokens: tokenBalance,
        tokenDecimals: decimals,
        slippageBps: Math.max(settings.defaultSlippage * 100, 300), // Min 3% for auto-sells
        useMevProtection: settings.mevProtection,
      });

      if (result.success) {
        console.log(`[AutoTrader] Auto-sell SUCCESS for ${position.tokenSymbol}: ${result.txSignature}`);
        await storage.updateAutoTradePosition(position.id, {
          status: 'sold',
          sellTxSignature: result.txSignature,
        });
        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'sell_success',
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          message: `Auto-sold ${position.tokenSymbol} (${reason === 'stop_loss' ? 'stop loss' : 'target hit'})`,
          details: { txSignature: result.txSignature, currentMcap, reason },
          createdAt: Date.now(),
        });
      } else {
        console.error(`[AutoTrader] Auto-sell FAILED for ${position.tokenSymbol}: ${result.error}`);
        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'error',
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          message: `Auto-sell failed: ${result.error}`,
          details: { error: result.error, reason },
          createdAt: Date.now(),
        });
      }
    } catch (error) {
      console.error(`[AutoTrader] Auto-sell error for ${position.tokenSymbol}:`, error);
    }
  }

  async executeSell(
    walletAddress: string,
    positionId: string,
    sellPercent: number = 100
  ): Promise<{ success: boolean; error?: string; requiresSignature?: boolean; swapTransaction?: string; orderId?: string }> {
    const position = await storage.getAutoTradePosition(positionId);
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    if (position.walletAddress !== walletAddress) {
      return { success: false, error: 'Position does not belong to this wallet' };
    }

    const settings = await storage.getTradingSettings(walletAddress);
    
    // Get token balance
    const tokenBalance = await tradingService.getTokenBalance(walletAddress, position.tokenMint);
    if (tokenBalance <= 0) {
      await storage.updateAutoTradePosition(positionId, { status: 'sold' });
      return { success: false, error: 'No token balance' };
    }

    const sellAmount = tokenBalance * (sellPercent / 100);

    // Get token metadata for decimals
    const metadata = await tradingService.getTokenMetadata(position.tokenMint);
    const decimals = metadata?.decimals ?? 6;

    // Execute sell trade
    const tradeResult = await tradingService.executeTrade({
      walletAddress,
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      type: 'sell',
      amountTokens: sellAmount,
      tokenDecimals: decimals,
      slippageBps: settings.defaultSlippage * 100,
      useMevProtection: settings.mevProtection,
    });

    if (!tradeResult.success) {
      return { success: false, error: tradeResult.error };
    }

    if (tradeResult.requiresSignature) {
      return {
        success: true,
        requiresSignature: true,
        swapTransaction: tradeResult.swapTransaction,
        orderId: tradeResult.orderId,
      };
    }

    return { success: true };
  }

  async confirmSell(
    walletAddress: string,
    positionId: string,
    orderId: string,
    signedTransaction: string
  ): Promise<{ success: boolean; error?: string }> {
    const position = await storage.getAutoTradePosition(positionId);
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    const settings = await storage.getTradingSettings(walletAddress);
    
    const result = await tradingService.submitSignedTrade(
      orderId,
      signedTransaction,
      settings.mevProtection,
      walletAddress
    );

    if (!result.success) {
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'sell_failed',
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        message: `Sell transaction failed: ${result.error}`,
        createdAt: Date.now(),
      });

      return { success: false, error: result.error };
    }

    // Calculate PnL (simplified)
    const token = await storage.getToken(position.tokenMint);
    const exitPrice = token?.price || 0;
    const pnl = ((exitPrice / position.entryPrice) - 1) * 100;

    // Update position status
    await storage.updateAutoTradePosition(positionId, {
      status: 'sold',
      sellTxSignature: result.txSignature,
      pnl,
    });

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'sell_success',
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      message: `Sold ${position.tokenSymbol} with ${pnl.toFixed(2)}% PnL`,
      details: {
        txSignature: result.txSignature,
        pnl,
        entryPrice: position.entryPrice,
        exitPrice,
      },
      createdAt: Date.now(),
    });

    return { success: true };
  }

  // Instant sell with high slippage for emergency situations (token crashed, rug, etc.)
  async executeInstantSell(
    positionId: string,
    slippageBps: number = 6000 // Default 60% slippage for emergency sells
  ): Promise<{ success: boolean; error?: string; txSignature?: string }> {
    const position = await storage.getAutoTradePosition(positionId);
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    if (position.status !== 'active') {
      return { success: false, error: 'Position is not active' };
    }

    const walletAddress = position.walletAddress;
    
    // Check if we can auto-sign (trading wallet)
    if (!tradingService.canAutoSign(walletAddress)) {
      return { success: false, error: 'Cannot auto-sign for this wallet' };
    }

    // Cap slippage at 80% maximum
    const cappedSlippage = Math.min(slippageBps, 8000);
    
    console.log(`[AutoTrader] INSTANT SELL: ${position.tokenSymbol} with ${cappedSlippage/100}% slippage`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'sell_attempt',
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      message: `Instant sell initiated for ${position.tokenSymbol} (${cappedSlippage/100}% slippage)`,
      createdAt: Date.now(),
    });

    // Get token balance
    const tokenBalance = await tradingService.getTokenBalance(walletAddress, position.tokenMint);
    if (tokenBalance <= 0) {
      await storage.updateAutoTradePosition(positionId, { status: 'sold' });
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'error',
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        message: `No token balance for ${position.tokenSymbol}`,
        createdAt: Date.now(),
      });
      return { success: false, error: 'No token balance' };
    }

    console.log(`[AutoTrader] Token balance: ${tokenBalance} ${position.tokenSymbol}`);

    // Get token metadata for decimals
    const metadata = await tradingService.getTokenMetadata(position.tokenMint);
    const decimals = metadata?.decimals ?? 6;

    // Execute sell with auto-sign (high slippage for emergency)
    try {
      const sellResult = await tradingService.executeAutoTrade({
        walletAddress,
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol || 'UNKNOWN',
        type: 'sell',
        amountTokens: tokenBalance,
        tokenDecimals: decimals,
        slippageBps: cappedSlippage,
        useMevProtection: true, // Always use MEV protection for sells
      });

      if (sellResult.success && sellResult.txSignature) {
        console.log(`[AutoTrader] INSTANT SELL SUCCESS: ${position.tokenSymbol} - ${sellResult.txSignature}`);
        
        // Calculate approximate PnL
        const token = await storage.getToken(position.tokenMint);
        const exitPrice = token?.price || 0;
        const pnl = position.entryPrice > 0 ? ((exitPrice / position.entryPrice) - 1) * 100 : -100;

        // Update position
        await storage.updateAutoTradePosition(positionId, {
          status: 'sold',
          sellTxSignature: sellResult.txSignature,
          pnl,
          updatedAt: Date.now(),
        });

        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'sell_success',
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          message: `Instant sold ${position.tokenSymbol} (${pnl.toFixed(1)}% PnL)`,
          details: {
            txSignature: sellResult.txSignature,
            pnl,
            slippage: cappedSlippage / 100,
          },
          createdAt: Date.now(),
        });

        return { success: true, txSignature: sellResult.txSignature };
      } else {
        console.log(`[AutoTrader] INSTANT SELL FAILED: ${position.tokenSymbol} - ${sellResult.error}`);
        
        await storage.createAutoTradeEvent({
          walletAddress,
          type: 'sell_failed',
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          message: `Instant sell failed: ${sellResult.error}`,
          createdAt: Date.now(),
        });

        return { success: false, error: sellResult.error };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AutoTrader] INSTANT SELL ERROR: ${position.tokenSymbol}`, error);
      
      await storage.createAutoTradeEvent({
        walletAddress,
        type: 'error',
        tokenMint: position.tokenMint,
        tokenSymbol: position.tokenSymbol,
        message: `Instant sell error: ${errorMsg}`,
        createdAt: Date.now(),
      });

      return { success: false, error: errorMsg };
    }
  }

  async forceStopAll(walletAddress: string): Promise<void> {
    const positions = await storage.getAutoTradePositions(walletAddress, 'active');
    
    for (const position of positions) {
      await storage.updateAutoTradePosition(position.id, { status: 'stopped' });
    }

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'error',
      message: 'Force stopped all auto-trade positions',
      createdAt: Date.now(),
    });

    // Clear pending trades for this wallet
    const keys = Array.from(this.pendingTrades.keys());
    for (const key of keys) {
      if (key.startsWith(walletAddress)) {
        this.pendingTrades.delete(key);
      }
    }
  }

  // Sell all active positions at once with high slippage
  async sellAllPositions(
    walletAddress: string,
    slippageBps: number = 6000 // Default 60% slippage
  ): Promise<{ success: boolean; sold: number; failed: number; results: Array<{ symbol: string; success: boolean; error?: string }> }> {
    const positions = await storage.getAutoTradePositions(walletAddress, 'active');
    
    if (positions.length === 0) {
      return { success: true, sold: 0, failed: 0, results: [] };
    }

    console.log(`[AutoTrader] SELL ALL: Selling ${positions.length} positions for ${walletAddress.slice(0, 8)}...`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'sell_attempt',
      message: `Selling all ${positions.length} positions at once`,
      createdAt: Date.now(),
    });

    const results: Array<{ symbol: string; success: boolean; error?: string }> = [];
    let sold = 0;
    let failed = 0;

    // Execute sells one by one to avoid rate limiting
    for (const position of positions) {
      console.log(`[AutoTrader] Selling position: ${position.tokenSymbol}`);
      
      try {
        const result = await this.executeInstantSell(position.id, slippageBps);
        
        if (result.success) {
          sold++;
          results.push({ symbol: position.tokenSymbol, success: true });
        } else {
          failed++;
          results.push({ symbol: position.tokenSymbol, success: false, error: result.error });
        }

        // Small delay between sells to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ symbol: position.tokenSymbol, success: false, error: errorMsg });
      }
    }

    console.log(`[AutoTrader] SELL ALL COMPLETE: ${sold} sold, ${failed} failed`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: sold > 0 ? 'sell_success' : 'error',
      message: `Sold ${sold}/${positions.length} positions (${failed} failed)`,
      createdAt: Date.now(),
    });

    return { success: failed === 0, sold, failed, results };
  }

  // Batch sell - processes positions in parallel batches for faster execution
  async batchSellPositions(
    walletAddress: string,
    batchSize: number = 3,
    slippageBps: number = 6000,
    delayBetweenBatches: number = 2000,
    onProgress?: (current: number, total: number, sold: number, failed: number) => void
  ): Promise<{ 
    success: boolean; 
    sold: number; 
    failed: number; 
    total: number;
    results: Array<{ symbol: string; success: boolean; error?: string }> 
  }> {
    const positions = await storage.getAutoTradePositions(walletAddress, 'active');
    
    if (positions.length === 0) {
      return { success: true, sold: 0, failed: 0, total: 0, results: [] };
    }

    const total = positions.length;
    console.log(`[AutoTrader] BATCH SELL: Selling ${total} positions in batches of ${batchSize}`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'sell_attempt',
      message: `Starting batch sell of ${total} positions (batch size: ${batchSize}, slippage: ${slippageBps/100}%)`,
      createdAt: Date.now(),
    });

    const results: Array<{ symbol: string; success: boolean; error?: string }> = [];
    let sold = 0;
    let failed = 0;
    let processed = 0;

    // Split positions into batches
    const batches: typeof positions[] = [];
    for (let i = 0; i < positions.length; i += batchSize) {
      batches.push(positions.slice(i, i + batchSize));
    }

    console.log(`[AutoTrader] Processing ${batches.length} batches...`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[AutoTrader] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} positions)`);

      // Execute sells in parallel within the batch
      const batchPromises = batch.map(async (position) => {
        try {
          const result = await this.executeInstantSell(position.id, slippageBps);
          return {
            symbol: position.tokenSymbol,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          return {
            symbol: position.tokenSymbol,
            success: false,
            error: errorMsg,
          };
        }
      });

      // Wait for all sells in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        processed++;
        results.push(result);
        if (result.success) {
          sold++;
        } else {
          failed++;
        }
      }

      // Report progress
      if (onProgress) {
        onProgress(processed, total, sold, failed);
      }

      console.log(`[AutoTrader] Batch ${batchIndex + 1} complete: ${sold} sold, ${failed} failed (${processed}/${total})`);

      // Delay between batches to avoid rate limiting (except for last batch)
      if (batchIndex < batches.length - 1) {
        console.log(`[AutoTrader] Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    console.log(`[AutoTrader] BATCH SELL COMPLETE: ${sold}/${total} sold, ${failed} failed`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: sold > 0 ? 'sell_success' : 'error',
      message: `Batch sell complete: ${sold}/${total} positions sold (${failed} failed)`,
      createdAt: Date.now(),
    });

    return { success: failed === 0, sold, failed, total, results };
  }

  // Batch sell WALLET positions (actual tokens in wallet, not auto-trade positions)
  async batchSellWalletPositions(
    walletAddress: string,
    batchSize: number = 3,
    slippageBps: number = 6000,
    delayBetweenBatches: number = 2000
  ): Promise<{ 
    success: boolean; 
    sold: number; 
    failed: number; 
    total: number;
    results: Array<{ symbol: string; mint: string; success: boolean; error?: string }> 
  }> {
    // Get actual wallet positions from blockchain (not auto-trade positions)
    const walletTokens = await tradingService.getWalletTokens(walletAddress);
    
    // Filter out SOL and tokens with 0 balance
    const sellableTokens = walletTokens.filter(t => 
      t.mint !== 'So11111111111111111111111111111111111111112' && 
      t.balance > 0
    );
    
    if (sellableTokens.length === 0) {
      console.log('[AutoTrader] No wallet positions to sell');
      return { success: true, sold: 0, failed: 0, total: 0, results: [] };
    }

    const total = sellableTokens.length;
    console.log(`[AutoTrader] BATCH SELL WALLET: Selling ${total} wallet tokens in batches of ${batchSize}`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: 'sell_attempt',
      message: `Starting batch sell of ${total} WALLET positions (batch size: ${batchSize}, slippage: ${slippageBps/100}%)`,
      createdAt: Date.now(),
    });

    const results: Array<{ symbol: string; mint: string; success: boolean; error?: string }> = [];
    let sold = 0;
    let failed = 0;

    // Split tokens into batches
    const batches: typeof sellableTokens[] = [];
    for (let i = 0; i < sellableTokens.length; i += batchSize) {
      batches.push(sellableTokens.slice(i, i + batchSize));
    }

    console.log(`[AutoTrader] Processing ${batches.length} batches...`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[AutoTrader] Processing wallet batch ${batchIndex + 1}/${batches.length} (${batch.length} tokens)`);

      // Execute sells in parallel within the batch
      const batchPromises = batch.map(async (token) => {
        const symbol = token.mint.slice(0, 8);
        try {
          console.log(`[AutoTrader] Selling wallet token ${symbol}... - ${token.balance} tokens (${token.decimals} decimals)`);
          
          // Execute sell using trading service with auto-sign (trading wallet)
          const result = await tradingService.executeAutoTrade({
            walletAddress,
            tokenMint: token.mint,
            tokenSymbol: symbol,
            type: 'sell',
            amountTokens: token.balance,
            tokenDecimals: token.decimals,
            slippageBps,
            useMevProtection: true,
          });
          
          return {
            symbol,
            mint: token.mint,
            success: result.success,
            error: result.error,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[AutoTrader] Failed to sell ${symbol}: ${errorMsg}`);
          return {
            symbol,
            mint: token.mint,
            success: false,
            error: errorMsg,
          };
        }
      });

      // Wait for all sells in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          sold++;
          console.log(`[AutoTrader] Successfully sold ${result.symbol}`);
        } else {
          failed++;
          console.log(`[AutoTrader] Failed to sell ${result.symbol}: ${result.error}`);
        }
      }

      console.log(`[AutoTrader] Wallet batch ${batchIndex + 1} complete: ${sold} sold, ${failed} failed`);

      // Delay between batches to avoid rate limiting (except for last batch)
      if (batchIndex < batches.length - 1) {
        console.log(`[AutoTrader] Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    console.log(`[AutoTrader] BATCH SELL WALLET COMPLETE: ${sold}/${total} sold, ${failed} failed`);

    await storage.createAutoTradeEvent({
      walletAddress,
      type: sold > 0 ? 'sell_success' : 'error',
      message: `Batch sell wallet complete: ${sold}/${total} positions sold (${failed} failed)`,
      createdAt: Date.now(),
    });

    return { success: failed === 0, sold, failed, total, results };
  }

  async getStatus(walletAddress: string): Promise<AutoTradeStatus> {
    const settings = await storage.getTradingSettings(walletAddress);
    const activePositions = await storage.getAutoTradePositions(walletAddress, 'active');
    const events = await storage.getAutoTradeEvents(walletAddress, 10);
    
    let pendingBuys = 0;
    const pendingKeys = Array.from(this.pendingTrades.keys());
    for (const key of pendingKeys) {
      if (key.startsWith(walletAddress)) {
        pendingBuys++;
      }
    }

    const buyEvents = events.filter(e => e.type === 'buy_success').length;
    const sellEvents = events.filter(e => e.type === 'sell_success').length;
    const lastEvent = events[0];

    return {
      enabled: settings.autoTradeEnabled,
      activePositions: activePositions.length,
      pendingBuys,
      totalBuys: buyEvents,
      totalSells: sellEvents,
      lastActivity: lastEvent?.message,
    };
  }

  async getEvents(walletAddress: string, limit: number = 50): Promise<AutoTradeEvent[]> {
    return storage.getAutoTradeEvents(walletAddress, limit);
  }

  async getActivePositions(walletAddress: string): Promise<AutoTradePosition[]> {
    return storage.getAutoTradePositions(walletAddress, 'active');
  }
}

export const autoTraderService = new AutoTraderService();

// Start the service
autoTraderService.start();

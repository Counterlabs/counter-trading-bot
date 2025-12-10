import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { tokenSchema, orderSchema, tradingSettingsSchema, tokenFilterSchema, defaultTokenFilter, type Token, type TokenFilter } from "@shared/schema";
import { z } from "zod";
import { tradingService } from "./services/trading";
import { tokenScanner } from "./services/token-scanner";
import { autoTraderService } from "./services/auto-trader";

const wsClients = new Set<WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {

  tokenScanner.onTokenUpdate((token) => {
    wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "newToken", data: token }));
      }
    });
  });

  app.get("/api/tokens", async (req, res) => {
    try {
      const tokens = await storage.getTokens();
      const source = req.query.source as string;
      const isNew = req.query.isNew === 'true';
      const walletAddress = req.query.wallet as string;

      let filtered = tokens;
      
      if (walletAddress) {
        const userFilters = await storage.getTokenFilters(walletAddress);
        filtered = filtered.filter(t => tokenScanner.tokenPassesFilter(t, userFilters));
      }
      
      if (source && source !== 'all') {
        filtered = filtered.filter(t => t.source === source);
      }
      if (req.query.isNew) {
        filtered = filtered.filter(t => t.isNew === isNew);
      }

      res.json(filtered);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  app.get("/api/tokens/:mint", async (req, res) => {
    try {
      const token = await storage.getToken(req.params.mint);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const orderInput = z.object({
        walletAddress: z.string().optional(),
        tokenMint: z.string(),
        tokenSymbol: z.string(),
        type: z.enum(['buy', 'sell']),
        amount: z.number().positive(),
        price: z.number().positive(),
        slippage: z.number().optional(),
        mevProtection: z.boolean().optional(),
      }).parse(req.body);

      const order = await storage.createOrder({
        ...orderInput,
        status: 'pending',
        createdAt: Date.now(),
      });

      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid order data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.get("/api/orders", async (req, res) => {
    try {
      const walletAddress = req.query.wallet as string;
      const orders = await storage.getOrders(walletAddress);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  const KNOWN_TOKENS: Record<string, { symbol: string; name: string }> = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD' },
    'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL' },
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' },
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter' },
  };

  app.get("/api/positions/:wallet", async (req, res) => {
    try {
      const walletAddress = req.params.wallet;

      const walletTokens = await tradingService.getWalletTokens(walletAddress);
      const tokens = await storage.getTokens();
      const orders = await storage.getOrders(walletAddress);

      const positions = await Promise.all(walletTokens.map(async (wt) => {
        const tokenInfo = tokens.find(t => t.mint === wt.mint);
        const tokenOrders = orders.filter(o => o.tokenMint === wt.mint && o.status === 'confirmed');
        const knownToken = KNOWN_TOKENS[wt.mint];

        let symbol = tokenInfo?.symbol || knownToken?.symbol;
        let name = tokenInfo?.name || knownToken?.name;

        if (!symbol && tokenOrders.length > 0) {
          symbol = tokenOrders[0].tokenSymbol;
          name = tokenOrders[0].tokenSymbol;
        }

        if (!symbol && wt.mint.endsWith('pump')) {
          try {
            const pumpDetails = await tokenScanner.getTokenDetails(wt.mint);
            if (pumpDetails) {
              symbol = pumpDetails.symbol;
              name = pumpDetails.name;
            }
          } catch (e) {
            console.log('[Positions] Failed to fetch pump.fun details for', wt.mint);
          }
        }

        if (!symbol) {
          const metadata = await tradingService.getTokenMetadata(wt.mint);
          symbol = metadata?.symbol || wt.mint.slice(0, 8) + '...';
          name = metadata?.name || 'Unknown Token';
        }

        // Calculate total spent on this token from buy orders
        let totalSpentSol = 0;
        const buyOrders = tokenOrders.filter(o => o.type === 'buy');
        buyOrders.forEach(order => {
          totalSpentSol += order.amount;
        });

        // Calculate average buy price (cost basis per token)
        const avgBuyPrice = wt.balance > 0 && totalSpentSol > 0 
          ? totalSpentSol / wt.balance 
          : 0;

        // Get current price from token info or use 0 if not available
        const currentPrice = tokenInfo?.price || 0;

        // Calculate current value in SOL (what the position is worth now)
        const value = wt.balance * currentPrice;

        // Calculate PnL (current value - what was spent)
        const pnl = value - totalSpentSol;
        const pnlPercent = totalSpentSol > 0 ? (pnl / totalSpentSol) * 100 : 0;

        const pumpfunUrl = tokenInfo?.pumpfunUrl || 
          (wt.mint.endsWith('pump') ? `https://pump.fun/coin/${wt.mint}` : undefined);

        return {
          tokenMint: wt.mint,
          tokenSymbol: symbol || 'UNKNOWN',
          tokenName: name || 'Unknown Token',
          balance: wt.balance,
          avgBuyPrice: avgBuyPrice,
          currentPrice: currentPrice,
          pnl: pnl,
          pnlPercent: pnlPercent,
          value: value,
          pumpfunUrl,
        };
      }));

      res.json(positions.filter(p => p.balance > 0));
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  app.post("/api/positions/:wallet/refresh", async (req, res) => {
    try {
      const walletAddress = req.params.wallet;
      tradingService.invalidateTokenCache(walletAddress);
      console.log(`[Routes] Cache invalidated for ${walletAddress}`);

      const walletTokens = await tradingService.getWalletTokens(walletAddress);
      const tokens = await storage.getTokens();
      const orders = await storage.getOrders(walletAddress);

      const positions = await Promise.all(walletTokens.map(async (wt) => {
        const tokenInfo = tokens.find(t => t.mint === wt.mint);
        const tokenOrders = orders.filter(o => o.tokenMint === wt.mint && o.status === 'confirmed');
        const knownToken = KNOWN_TOKENS[wt.mint];

        let symbol = tokenInfo?.symbol || knownToken?.symbol;
        let name = tokenInfo?.name || knownToken?.name;

        if (!symbol && tokenOrders.length > 0) {
          symbol = tokenOrders[0].tokenSymbol;
          name = tokenOrders[0].tokenSymbol;
        }

        if (!symbol && wt.mint.endsWith('pump')) {
          try {
            const pumpDetails = await tokenScanner.getTokenDetails(wt.mint);
            if (pumpDetails) {
              symbol = pumpDetails.symbol;
              name = pumpDetails.name;
            }
          } catch (e) {
            console.log('[Positions] Failed to fetch pump.fun details for', wt.mint);
          }
        }

        if (!symbol) {
          const metadata = await tradingService.getTokenMetadata(wt.mint);
          symbol = metadata?.symbol || wt.mint.slice(0, 8) + '...';
          name = metadata?.name || 'Unknown Token';
        }

        // Calculate total spent on this token from buy orders
        let totalSpentSol = 0;
        const buyOrders = tokenOrders.filter(o => o.type === 'buy');
        buyOrders.forEach(order => {
          totalSpentSol += order.amount;
        });

        // Calculate average buy price (cost basis per token)
        const avgBuyPrice = wt.balance > 0 && totalSpentSol > 0 
          ? totalSpentSol / wt.balance 
          : 0;

        // Get current price from token info or use 0 if not available
        const currentPrice = tokenInfo?.price || 0;

        // Calculate current value in SOL (what the position is worth now)
        const value = wt.balance * currentPrice;

        // Calculate PnL (current value - what was spent)
        const pnl = value - totalSpentSol;
        const pnlPercent = totalSpentSol > 0 ? (pnl / totalSpentSol) * 100 : 0;

        const pumpfunUrl = tokenInfo?.pumpfunUrl || 
          (wt.mint.endsWith('pump') ? `https://pump.fun/coin/${wt.mint}` : undefined);

        return {
          tokenMint: wt.mint,
          tokenSymbol: symbol || 'UNKNOWN',
          tokenName: name || 'Unknown Token',
          balance: wt.balance,
          avgBuyPrice: avgBuyPrice,
          currentPrice: currentPrice,
          pnl: pnl,
          pnlPercent: pnlPercent,
          value: value,
          pumpfunUrl,
        };
      }));

      res.json(positions.filter(p => p.balance > 0));
    } catch (error) {
      console.error('Failed to refresh positions:', error);
      res.status(500).json({ error: "Failed to refresh positions" });
    }
  });

  app.get("/api/settings/:wallet", async (req, res) => {
    try {
      const settings = await storage.getTradingSettings(req.params.wallet);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings/:wallet", async (req, res) => {
    try {
      const settingsUpdate = tradingSettingsSchema.partial().parse(req.body);
      const settings = await storage.setTradingSettings(req.params.wallet, settingsUpdate);
      
      // Track wallet for auto-trading if autoTradeEnabled is being set
      if (settingsUpdate.autoTradeEnabled !== undefined) {
        await autoTraderService.trackWallet(req.params.wallet);
      }
      
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Token Filter Endpoints
  app.get("/api/filters/:wallet", async (req, res) => {
    try {
      const filters = await storage.getTokenFilters(req.params.wallet);
      res.json(filters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  });

  app.patch("/api/filters/:wallet", async (req, res) => {
    try {
      const filterUpdate = tokenFilterSchema.partial().parse(req.body);
      const filters = await storage.setTokenFilters(req.params.wallet, filterUpdate);
      res.json(filters);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid filter data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update filters" });
    }
  });

  // Reset filters to default (completely replaces, doesn't merge)
  app.post("/api/filters/:wallet/reset", async (req, res) => {
    try {
      const filters = await storage.resetTokenFilters(req.params.wallet);
      res.json(filters);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset filters" });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const tokens = await storage.getTokens();
      const orders = await storage.getOrders();

      const stats = {
        tokensScanned: tokens.length,
        activePositions: 0,
        totalVolume24h: tokens.reduce((acc, t) => acc + (t.volume24h || 0), 0),
        networkStatus: 'mainnet',
        ordersToday: orders.filter(o => o.createdAt > Date.now() - 86400000).length,
        scannerConnected: tokenScanner.isReady(),
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/quote", async (req, res) => {
    try {
      const quoteInput = z.object({
        inputMint: z.string(),
        outputMint: z.string(),
        amount: z.number().positive(),
        slippageBps: z.number().min(0).max(5000).default(100),
      }).parse(req.body);

      const quote = await tradingService.getQuote(quoteInput);

      if (!quote) {
        return res.status(400).json({ error: "Failed to get quote - no route available" });
      }

      res.json(quote);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid quote request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to get quote" });
    }
  });

  app.post("/api/trade", async (req, res) => {
    try {
      console.log('[Trade] Request body:', JSON.stringify(req.body));

      const tradeInput = z.object({
        walletAddress: z.string(),
        tokenMint: z.string(),
        tokenSymbol: z.string(),
        type: z.enum(['buy', 'sell']),
        amountSol: z.number().positive().optional(),
        amountTokens: z.number().positive().optional(),
        sellPercent: z.number().min(1).max(100).optional(),
        slippageBps: z.number().min(0).max(5000).optional(),
        useMevProtection: z.boolean().optional(),
        priorityFee: z.number().optional(),
      }).refine((data) => {
        if (data.type === 'buy') return data.amountSol !== undefined;
        if (data.type === 'sell') return data.amountTokens !== undefined || data.sellPercent !== undefined;
        return false;
      }, { message: "Buy requires amountSol, Sell requires amountTokens or sellPercent" }).parse(req.body);

      const result = await tradingService.executeTrade(tradeInput);

      if (!result.success) {
        return res.status(400).json({ error: result.error, orderId: result.orderId });
      }

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log('[Trade] Validation error:', JSON.stringify(error.errors));
        return res.status(400).json({ error: "Invalid trade request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute trade" });
    }
  });

  app.get("/api/wallet/:address/balance", async (req, res) => {
    try {
      const solBalance = await tradingService.getSolBalance(req.params.address);
      res.json({ sol: solBalance, lamports: Math.floor(solBalance * 1e9) });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  app.get("/api/wallet/:address/tokens/:mint/balance", async (req, res) => {
    try {
      const balance = await tradingService.getTokenBalance(req.params.address, req.params.mint);
      res.json({ balance });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token balance" });
    }
  });

  app.get("/api/wallet/:address/tokens", async (req, res) => {
    try {
      const tokens = await tradingService.getWalletTokens(req.params.address);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet tokens" });
    }
  });

  app.get("/api/priority-fee", async (req, res) => {
    try {
      const fee = await tradingService.getPriorityFeeEstimate();
      res.json({ fee, feeInSol: fee / 1e9 });
    } catch (error) {
      res.status(500).json({ error: "Failed to estimate priority fee" });
    }
  });

  app.post("/api/trade/submit", async (req, res) => {
    try {
      const submitInput = z.object({
        orderId: z.string(),
        signedTransaction: z.string(),
        useMevProtection: z.boolean().optional(),
      }).parse(req.body);

      const order = await storage.getOrder(submitInput.orderId);
      const walletAddress = order?.walletAddress;

      const result = await tradingService.submitSignedTrade(
        submitInput.orderId,
        submitInput.signedTransaction,
        submitInput.useMevProtection ?? true,
        walletAddress
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error, orderId: result.orderId });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid submit request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to submit trade" });
    }
  });

  app.get("/api/tokens/:mint/metadata", async (req, res) => {
    try {
      const metadata = await tradingService.getTokenMetadata(req.params.mint);
      if (!metadata) {
        return res.status(404).json({ error: "Token metadata not found" });
      }
      res.json(metadata);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token metadata" });
    }
  });

  // Scanner control endpoints
  app.get("/api/scanner/status", async (req, res) => {
    try {
      const cooldownStatus = tokenScanner.getCooldownStatus();
      res.json({
        enabled: tokenScanner.isEnabled(),
        connected: tokenScanner.isReady(),
        activelyScanning: tokenScanner.isActivelyScanning(),
        cooldown: cooldownStatus,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get scanner status" });
    }
  });

  app.post("/api/scanner/toggle", async (req, res) => {
    try {
      const isEnabled = tokenScanner.toggle();
      console.log(`[API] Scanner toggled: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
      res.json({
        enabled: isEnabled,
        message: isEnabled ? 'Scanner enabled' : 'Scanner disabled',
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle scanner" });
    }
  });

  app.post("/api/scanner/enable", async (req, res) => {
    try {
      await tokenScanner.enable();
      res.json({
        enabled: true,
        message: 'Scanner enabled',
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to enable scanner" });
    }
  });

  app.post("/api/scanner/disable", async (req, res) => {
    try {
      tokenScanner.disable();
      res.json({
        enabled: false,
        message: 'Scanner disabled',
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to disable scanner" });
    }
  });

  app.get("/api/trading/status", async (req, res) => {
    try {
      res.json({
        mode: 'live',
        mevProtection: true,
        jupiterApiAvailable: true,
        jitoAvailable: true,
        network: 'mainnet-beta',
        scannerConnected: tokenScanner.isReady(),
        scannerEnabled: tokenScanner.isEnabled(),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get trading status" });
    }
  });

  // Auto-Trade Endpoints
  app.get("/api/autotrade/status/:wallet", async (req, res) => {
    try {
      const status = await autoTraderService.getStatus(req.params.wallet);
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get auto-trade status" });
    }
  });

  app.get("/api/autotrade/events/:wallet", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await autoTraderService.getEvents(req.params.wallet, limit);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to get auto-trade events" });
    }
  });

  app.get("/api/autotrade/positions/:wallet", async (req, res) => {
    try {
      const positions = await autoTraderService.getActivePositions(req.params.wallet);
      res.json(positions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get auto-trade positions" });
    }
  });

  app.post("/api/autotrade/buy", async (req, res) => {
    try {
      const buyInput = z.object({
        walletAddress: z.string(),
        tokenMint: z.string(),
      }).parse(req.body);

      const result = await autoTraderService.executeBuy(
        buyInput.walletAddress,
        buyInput.tokenMint
      );

      if (!result.success && !result.requiresSignature) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute auto-trade buy" });
    }
  });

  app.post("/api/autotrade/buy/confirm", async (req, res) => {
    try {
      const confirmInput = z.object({
        walletAddress: z.string(),
        orderId: z.string(),
        tokenMint: z.string(),
        signedTransaction: z.string(),
      }).parse(req.body);

      const result = await autoTraderService.confirmBuy(
        confirmInput.walletAddress,
        confirmInput.orderId,
        confirmInput.tokenMint,
        confirmInput.signedTransaction
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to confirm auto-trade buy" });
    }
  });

  app.post("/api/autotrade/sell", async (req, res) => {
    try {
      const sellInput = z.object({
        walletAddress: z.string(),
        positionId: z.string(),
        sellPercent: z.number().min(1).max(100).optional(),
      }).parse(req.body);

      const result = await autoTraderService.executeSell(
        sellInput.walletAddress,
        sellInput.positionId,
        sellInput.sellPercent
      );

      if (!result.success && !result.requiresSignature) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute auto-trade sell" });
    }
  });

  app.post("/api/autotrade/sell/confirm", async (req, res) => {
    try {
      const confirmInput = z.object({
        walletAddress: z.string(),
        positionId: z.string(),
        orderId: z.string(),
        signedTransaction: z.string(),
      }).parse(req.body);

      const result = await autoTraderService.confirmSell(
        confirmInput.walletAddress,
        confirmInput.positionId,
        confirmInput.orderId,
        confirmInput.signedTransaction
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to confirm auto-trade sell" });
    }
  });

  // Instant sell endpoint - uses high slippage for emergency sells
  app.post("/api/autotrade/instant-sell", async (req, res) => {
    try {
      const input = z.object({
        positionId: z.string(),
        slippageBps: z.number().min(1000).max(8000).optional(), // 10% to 80%, default 60%
      }).parse(req.body);

      const result = await autoTraderService.executeInstantSell(
        input.positionId,
        input.slippageBps ?? 6000
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error('[API] Instant sell error:', error);
      res.status(500).json({ error: "Failed to execute instant sell" });
    }
  });

  app.post("/api/autotrade/force-stop", async (req, res) => {
    try {
      const stopInput = z.object({
        walletAddress: z.string(),
      }).parse(req.body);

      await autoTraderService.forceStopAll(stopInput.walletAddress);

      res.json({ success: true, message: "All auto-trade positions stopped" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ error: "Failed to force stop auto-trade" });
    }
  });

  // Sell all active positions at once
  app.post("/api/autotrade/sell-all", async (req, res) => {
    try {
      const input = z.object({
        walletAddress: z.string(),
        slippageBps: z.number().min(1000).max(8000).optional(), // 10% to 80%, default 60%
      }).parse(req.body);

      const result = await autoTraderService.sellAllPositions(
        input.walletAddress,
        input.slippageBps ?? 6000
      );

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error('[API] Sell all error:', error);
      res.status(500).json({ error: "Failed to sell all positions" });
    }
  });

  // Batch sell - processes WALLET positions in parallel batches for faster execution
  // This sells actual tokens in wallet, not auto-trade tracked positions
  app.post("/api/autotrade/batch-sell", async (req, res) => {
    try {
      const input = z.object({
        walletAddress: z.string(),
        batchSize: z.number().min(1).max(10).optional(), // 1-10 positions per batch, default 3
        slippageBps: z.number().min(1000).max(8000).optional(), // 10% to 80%, default 60%
        delayMs: z.number().min(500).max(10000).optional(), // 0.5s to 10s between batches, default 2s
      }).parse(req.body);

      console.log(`[API] Batch sell WALLET request: wallet=${input.walletAddress.slice(0, 8)}..., batchSize=${input.batchSize ?? 3}, slippage=${(input.slippageBps ?? 6000)/100}%`);

      // Use batchSellWalletPositions to sell actual wallet tokens (not auto-trade positions)
      const result = await autoTraderService.batchSellWalletPositions(
        input.walletAddress,
        input.batchSize ?? 3,
        input.slippageBps ?? 6000,
        input.delayMs ?? 2000
      );

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      console.error('[API] Batch sell error:', error);
      res.status(500).json({ error: "Failed to batch sell positions" });
    }
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    console.log("WebSocket client connected");

    ws.send(JSON.stringify({ type: "connected", message: "Connected to trading bot - LIVE MODE" }));

    ws.on("close", () => {
      wsClients.delete(ws);
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      wsClients.delete(ws);
    });
  });

  return httpServer;
}

export function broadcastOrderUpdate(orderId: string, status: string, txSignature?: string) {
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'orderUpdate',
        data: { orderId, status, txSignature }
      }));
    }
  });
}
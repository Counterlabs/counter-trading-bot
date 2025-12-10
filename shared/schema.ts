import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Trading Types (in-memory, not DB tables)
export const tokenSchema = z.object({
  mint: z.string(),
  name: z.string(),
  symbol: z.string(),
  imageUrl: z.string().optional(),
  price: z.number(),
  priceChange24h: z.number().optional(),
  marketCap: z.number().optional(),
  volume24h: z.number().optional(),
  liquidity: z.number().optional(),
  holders: z.number().optional(),
  source: z.enum(['pumpfun', 'pumpswap', 'raydium']),
  createdAt: z.number(),
  bondingCurveProgress: z.number().optional(),
  isNew: z.boolean().optional(),
  pumpfunUrl: z.string().optional(),
});

export type Token = z.infer<typeof tokenSchema>;

export const orderSchema = z.object({
  id: z.string(),
  walletAddress: z.string().optional(),
  tokenMint: z.string(),
  tokenSymbol: z.string(),
  type: z.enum(['buy', 'sell']),
  amount: z.number(),
  price: z.number(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  txSignature: z.string().optional(),
  createdAt: z.number(),
  slippage: z.number().optional(),
  mevProtection: z.boolean().optional(),
});

export type Order = z.infer<typeof orderSchema>;

export const positionSchema = z.object({
  tokenMint: z.string(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  imageUrl: z.string().optional(),
  balance: z.number(),
  avgBuyPrice: z.number(),
  currentPrice: z.number(),
  pnl: z.number(),
  pnlPercent: z.number(),
  value: z.number(),
  pumpfunUrl: z.string().optional(),
});

export type Position = z.infer<typeof positionSchema>;

export const tradingSettingsSchema = z.object({
  defaultSlippage: z.number().default(1),
  mevProtection: z.boolean().default(true),
  autoBuy: z.boolean().default(false),
  autoBuyAmount: z.number().default(0.1),
  autoSell: z.boolean().default(false),
  autoSellPercent: z.number().default(100),
  takeProfitPercent: z.number().optional(),
  stopLossPercent: z.number().optional(),
  priorityFee: z.number().default(0.0001),
  
  // Auto-trade settings
  autoTradeEnabled: z.boolean().default(false),
  autoBuyAmountSol: z.number().default(0.01), // SOL per auto-buy
  sellTargetMode: z.enum(['mcap', 'multiplier']).default('multiplier'),
  sellTargetMcap: z.number().optional(), // Absolute market cap target (USD)
  sellTargetMultiplier: z.number().default(3), // Sell at 3x entry mcap
  autoSellStopLossPercent: z.number().default(50), // Stop loss at -50%
  maxConcurrentPositions: z.number().default(5), // Max open auto-trade positions
});

export type TradingSettings = z.infer<typeof tradingSettingsSchema>;

// Auto-trade position tracking
export const autoTradePositionSchema = z.object({
  id: z.string(),
  walletAddress: z.string(),
  tokenMint: z.string(),
  tokenSymbol: z.string(),
  tokenName: z.string(),
  entryPrice: z.number(),
  entryMarketCap: z.number(),
  targetMarketCap: z.number(),
  stopLossMarketCap: z.number(),
  amountSol: z.number(),
  tokenAmount: z.number(),
  status: z.enum(['active', 'sold', 'stopped', 'failed']),
  buyTxSignature: z.string().optional(),
  sellTxSignature: z.string().optional(),
  pnl: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type AutoTradePosition = z.infer<typeof autoTradePositionSchema>;

// Auto-trade event for logging
export const autoTradeEventSchema = z.object({
  id: z.string(),
  walletAddress: z.string(),
  type: z.enum(['buy_attempt', 'buy_success', 'buy_failed', 'sell_attempt', 'sell_success', 'sell_failed', 'stop_loss', 'error']),
  tokenMint: z.string().optional(),
  tokenSymbol: z.string().optional(),
  message: z.string(),
  details: z.any().optional(),
  createdAt: z.number(),
});

export type AutoTradeEvent = z.infer<typeof autoTradeEventSchema>;

export const walletInfoSchema = z.object({
  address: z.string(),
  balance: z.number(),
  connected: z.boolean(),
});

export type WalletInfo = z.infer<typeof walletInfoSchema>;

// Token Filter Schema for pump.fun token screening
export const tokenFilterSchema = z.object({
  enabled: z.boolean().default(true),
  
  // Market Cap filters (in USD)
  minMarketCap: z.number().optional(),
  maxMarketCap: z.number().optional(),
  
  // Liquidity filter (in SOL)
  minLiquidity: z.number().optional(),
  
  // Bonding curve progress (0-100%)
  minBondingCurve: z.number().optional(),
  maxBondingCurve: z.number().optional(),
  
  // Token age filters (in minutes)
  minAge: z.number().optional(),
  maxAge: z.number().optional(),
  
  // Holder filters
  minHolders: z.number().optional(),
  maxTopHolderPercent: z.number().optional(), // Max % held by top 10 wallets
  
  // Volume filter (in SOL, 24h)
  minVolume24h: z.number().optional(),
  
  // Social requirements
  requireTwitter: z.boolean().default(false),
  requireTelegram: z.boolean().default(false),
  requireWebsite: z.boolean().default(false),
  
  // Dev activity
  excludeDevSold: z.boolean().default(false), // Filter out if dev has sold
  
  // Blacklist/Whitelist
  creatorBlacklist: z.array(z.string()).default([]),
  creatorWhitelist: z.array(z.string()).default([]), // If set, only show from these creators
  
  // Name/Symbol filters
  nameContains: z.string().optional(),
  symbolContains: z.string().optional(),
  excludeNames: z.array(z.string()).default([]), // Tokens with these in name are excluded
});

export type TokenFilter = z.infer<typeof tokenFilterSchema>;

// Default filter - shows all tokens (no restrictions)
export const defaultTokenFilter: TokenFilter = {
  enabled: false, // Filters disabled by default - show everything
  minLiquidity: 0,
  minBondingCurve: 0,
  maxBondingCurve: 100,
  minAge: 0,
  requireTwitter: false,
  requireTelegram: false,
  requireWebsite: false,
  excludeDevSold: false,
  creatorBlacklist: [],
  creatorWhitelist: [],
  excludeNames: [],
};

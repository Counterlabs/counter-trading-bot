import { type User, type InsertUser, type Token, type Order, type Position, type TradingSettings, type TokenFilter, type AutoTradePosition, type AutoTradeEvent, defaultTokenFilter } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getTokens(): Promise<Token[]>;
  getToken(mint: string): Promise<Token | undefined>;
  upsertToken(token: Token): Promise<Token>;
  deleteToken(mint: string): Promise<void>;
  
  getOrders(walletAddress?: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  createOrder(order: Omit<Order, 'id'>): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  
  getPositions(walletAddress: string): Promise<Position[]>;
  getPosition(walletAddress: string, tokenMint: string): Promise<Position | undefined>;
  upsertPosition(walletAddress: string, position: Position): Promise<Position>;
  deletePosition(walletAddress: string, tokenMint: string): Promise<void>;
  
  getTradingSettings(walletAddress: string): Promise<TradingSettings>;
  setTradingSettings(walletAddress: string, settings: Partial<TradingSettings>): Promise<TradingSettings>;
  
  getTokenFilters(walletAddress: string): Promise<TokenFilter>;
  setTokenFilters(walletAddress: string, filters: Partial<TokenFilter>): Promise<TokenFilter>;
  resetTokenFilters(walletAddress: string): Promise<TokenFilter>;
  
  // Auto-trade position tracking
  getAutoTradePositions(walletAddress: string, status?: AutoTradePosition['status']): Promise<AutoTradePosition[]>;
  getAutoTradePosition(id: string): Promise<AutoTradePosition | undefined>;
  createAutoTradePosition(position: Omit<AutoTradePosition, 'id'>): Promise<AutoTradePosition>;
  updateAutoTradePosition(id: string, updates: Partial<AutoTradePosition>): Promise<AutoTradePosition | undefined>;
  
  // Auto-trade event logging
  getAutoTradeEvents(walletAddress: string, limit?: number): Promise<AutoTradeEvent[]>;
  createAutoTradeEvent(event: Omit<AutoTradeEvent, 'id'>): Promise<AutoTradeEvent>;
  
  // Check if token is already being traded
  hasActiveAutoTradePosition(walletAddress: string, tokenMint: string): Promise<boolean>;
  
  // Permanent blacklist - tokens that were bought should never be bought again
  isTokenBlacklisted(walletAddress: string, tokenMint: string): Promise<boolean>;
  blacklistToken(walletAddress: string, tokenMint: string): Promise<void>;
  getBlacklistedTokens(walletAddress: string): Promise<string[]>;
}

const defaultTradingSettings: TradingSettings = {
  defaultSlippage: 1,
  mevProtection: true,
  autoBuy: false,
  autoBuyAmount: 0.1,
  autoSell: false,
  autoSellPercent: 100,
  priorityFee: 0.0001,
  // Auto-trade defaults
  autoTradeEnabled: false,
  autoBuyAmountSol: 0.01,
  sellTargetMode: 'multiplier',
  sellTargetMultiplier: 3,
  autoSellStopLossPercent: 50,
  maxConcurrentPositions: 5,
};

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private tokens: Map<string, Token>;
  private orders: Map<string, Order>;
  private positions: Map<string, Map<string, Position>>;
  private tradingSettings: Map<string, TradingSettings>;
  private tokenFilters: Map<string, TokenFilter>;
  private autoTradePositions: Map<string, AutoTradePosition>;
  private autoTradeEvents: Map<string, AutoTradeEvent>;
  private tokenBlacklist: Map<string, Set<string>>; // wallet -> Set<tokenMint>

  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.orders = new Map();
    this.positions = new Map();
    this.tradingSettings = new Map();
    this.tokenFilters = new Map();
    this.autoTradePositions = new Map();
    this.autoTradeEvents = new Map();
    this.tokenBlacklist = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getToken(mint: string): Promise<Token | undefined> {
    return this.tokens.get(mint);
  }

  async upsertToken(token: Token): Promise<Token> {
    this.tokens.set(token.mint, token);
    return token;
  }

  async deleteToken(mint: string): Promise<void> {
    this.tokens.delete(mint);
  }

  async getOrders(walletAddress?: string): Promise<Order[]> {
    let orders = Array.from(this.orders.values());
    if (walletAddress) {
      orders = orders.filter(o => (o as any).walletAddress === walletAddress);
    }
    return orders.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  async createOrder(order: Omit<Order, 'id'>): Promise<Order> {
    const id = randomUUID();
    const newOrder: Order = { ...order, id };
    this.orders.set(id, newOrder);
    return newOrder;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    const updatedOrder = { ...order, ...updates };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  async getPositions(walletAddress: string): Promise<Position[]> {
    const walletPositions = this.positions.get(walletAddress);
    if (!walletPositions) return [];
    return Array.from(walletPositions.values());
  }

  async getPosition(walletAddress: string, tokenMint: string): Promise<Position | undefined> {
    const walletPositions = this.positions.get(walletAddress);
    if (!walletPositions) return undefined;
    return walletPositions.get(tokenMint);
  }

  async upsertPosition(walletAddress: string, position: Position): Promise<Position> {
    if (!this.positions.has(walletAddress)) {
      this.positions.set(walletAddress, new Map());
    }
    this.positions.get(walletAddress)!.set(position.tokenMint, position);
    return position;
  }

  async deletePosition(walletAddress: string, tokenMint: string): Promise<void> {
    const walletPositions = this.positions.get(walletAddress);
    if (walletPositions) {
      walletPositions.delete(tokenMint);
    }
  }

  async getTradingSettings(walletAddress: string): Promise<TradingSettings> {
    return this.tradingSettings.get(walletAddress) || { ...defaultTradingSettings };
  }

  async setTradingSettings(walletAddress: string, settings: Partial<TradingSettings>): Promise<TradingSettings> {
    const current = await this.getTradingSettings(walletAddress);
    const updated = { ...current, ...settings };
    this.tradingSettings.set(walletAddress, updated);
    return updated;
  }

  async getAutoTradeEnabledWallets(): Promise<string[]> {
    const wallets: string[] = [];
    this.tradingSettings.forEach((settings, wallet) => {
      if (settings.autoTradeEnabled) {
        wallets.push(wallet);
      }
    });
    return wallets;
  }

  async getTokenFilters(walletAddress: string): Promise<TokenFilter> {
    return this.tokenFilters.get(walletAddress) || { ...defaultTokenFilter };
  }

  async setTokenFilters(walletAddress: string, filters: Partial<TokenFilter>): Promise<TokenFilter> {
    const current = await this.getTokenFilters(walletAddress);
    const updated = { ...current, ...filters };
    this.tokenFilters.set(walletAddress, updated);
    return updated;
  }

  async resetTokenFilters(walletAddress: string): Promise<TokenFilter> {
    const resetFilters = { ...defaultTokenFilter };
    this.tokenFilters.set(walletAddress, resetFilters);
    return resetFilters;
  }

  // Auto-trade position methods
  async getAutoTradePositions(walletAddress: string, status?: AutoTradePosition['status']): Promise<AutoTradePosition[]> {
    const positions = Array.from(this.autoTradePositions.values())
      .filter(p => p.walletAddress === walletAddress);
    if (status) {
      return positions.filter(p => p.status === status);
    }
    return positions.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getAutoTradePosition(id: string): Promise<AutoTradePosition | undefined> {
    return this.autoTradePositions.get(id);
  }

  async createAutoTradePosition(position: Omit<AutoTradePosition, 'id'>): Promise<AutoTradePosition> {
    const id = randomUUID();
    const newPosition: AutoTradePosition = { ...position, id };
    this.autoTradePositions.set(id, newPosition);
    return newPosition;
  }

  async updateAutoTradePosition(id: string, updates: Partial<AutoTradePosition>): Promise<AutoTradePosition | undefined> {
    const position = this.autoTradePositions.get(id);
    if (!position) return undefined;
    const updatedPosition = { ...position, ...updates, updatedAt: Date.now() };
    this.autoTradePositions.set(id, updatedPosition);
    return updatedPosition;
  }

  // Auto-trade event methods
  async getAutoTradeEvents(walletAddress: string, limit: number = 50): Promise<AutoTradeEvent[]> {
    const events = Array.from(this.autoTradeEvents.values())
      .filter(e => e.walletAddress === walletAddress)
      .sort((a, b) => b.createdAt - a.createdAt);
    return events.slice(0, limit);
  }

  async createAutoTradeEvent(event: Omit<AutoTradeEvent, 'id'>): Promise<AutoTradeEvent> {
    const id = randomUUID();
    const newEvent: AutoTradeEvent = { ...event, id };
    this.autoTradeEvents.set(id, newEvent);
    return newEvent;
  }

  async hasActiveAutoTradePosition(walletAddress: string, tokenMint: string): Promise<boolean> {
    const positions = Array.from(this.autoTradePositions.values());
    return positions.some(p => 
      p.walletAddress === walletAddress && 
      p.tokenMint === tokenMint && 
      p.status === 'active'
    );
  }

  // Permanent blacklist methods - once a token is bought, it should never be bought again
  async isTokenBlacklisted(walletAddress: string, tokenMint: string): Promise<boolean> {
    const walletBlacklist = this.tokenBlacklist.get(walletAddress);
    return walletBlacklist?.has(tokenMint) ?? false;
  }

  async blacklistToken(walletAddress: string, tokenMint: string): Promise<void> {
    if (!this.tokenBlacklist.has(walletAddress)) {
      this.tokenBlacklist.set(walletAddress, new Set());
    }
    this.tokenBlacklist.get(walletAddress)!.add(tokenMint);
    console.log(`[Storage] Token ${tokenMint.slice(0, 8)}... permanently blacklisted for ${walletAddress.slice(0, 8)}...`);
  }

  async getBlacklistedTokens(walletAddress: string): Promise<string[]> {
    const walletBlacklist = this.tokenBlacklist.get(walletAddress);
    return walletBlacklist ? Array.from(walletBlacklist) : [];
  }
}

export const storage = new MemStorage();

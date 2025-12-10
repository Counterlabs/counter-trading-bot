import { storage } from '../storage';
import type { Token, TokenFilter } from '@shared/schema';
import WebSocket from 'ws';

const PUMPFUN_API_URL = 'https://frontend-api.pump.fun';
const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';
const MORALIS_API_URL = 'https://solana-gateway.moralis.io';
const DEXSCREENER_API_URL = 'https://api.dexscreener.com/latest/dex';

const MORALIS_API_KEY = process.env.MORALIS_API_KEY || '';
console.log(`[TokenScanner] Moralis API key loaded: ${MORALIS_API_KEY ? `${MORALIS_API_KEY.slice(0, 8)}... (${MORALIS_API_KEY.length} chars)` : 'NOT SET'}`);

interface DexScreenerPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  txns?: { h24?: { buys: number; sells: number } };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
}

interface PumpFunToken {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  metadata_uri?: string;
  twitter?: string;
  telegram?: string;
  bonding_curve?: string;
  associated_bonding_curve?: string;
  creator?: string;
  created_timestamp?: number;
  raydium_pool?: string | null;
  complete?: boolean;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  total_supply?: number;
  website?: string;
  show_name?: boolean;
  king_of_the_hill_timestamp?: number;
  market_cap?: number;
  reply_count?: number;
  last_reply?: number;
  nsfw?: boolean;
  market_id?: string;
  inverted?: boolean;
  usd_market_cap?: number;
}

interface MoralisToken {
  tokenAddress: string;
  name: string;
  symbol: string;
  logo?: string;
  priceNative?: string;
  priceUsd?: string;
  liquidity?: string;
  fullyDilutedValuation?: string;
  createdAt?: string;
  graduatedAt?: string;
  bondingCurveProgress?: number;
}

class TokenScannerService {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private updateCallbacks: ((token: Token) => void)[] = [];
  private newTokenCallbacks: ((token: Token) => void)[] = [];
  private scanInterval: NodeJS.Timeout | null = null;
  private isPaused = true; // Start paused by default to save API calls
  
  // Cooldown state (pauses scanning after a buy, but allows sells to continue)
  private isInCooldown = false;
  private cooldownEndTime: number = 0;
  private cooldownTimeout: NodeJS.Timeout | null = null;
  private readonly COOLDOWN_DURATION = 20 * 60 * 1000; // 20 minutes after each buy

  constructor() {
    // Don't auto-start - wait for explicit enable
    console.log('[TokenScanner] Initialized in PAUSED state. Enable via API to start scanning.');
    console.log(`[TokenScanner] Cooldown duration: 20 minutes after each buy`);
  }
  
  // Start cooldown after a successful buy (scanner pauses, but position monitoring continues)
  startCooldown(): void {
    if (!this.isEnabled()) return; // Only cooldown if scanner is enabled
    
    this.isInCooldown = true;
    this.cooldownEndTime = Date.now() + this.COOLDOWN_DURATION;
    
    const minutesRemaining = Math.ceil(this.COOLDOWN_DURATION / 60000);
    console.log(`[TokenScanner] COOLDOWN STARTED - Pausing scanning for ${minutesRemaining} minutes to save API calls`);
    console.log(`[TokenScanner] Position monitoring continues during cooldown for sells`);
    
    // Stop scanning interval
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    // Disconnect WebSocket during cooldown
    this.disconnect();
    
    // Clear any existing cooldown timeout
    if (this.cooldownTimeout) {
      clearTimeout(this.cooldownTimeout);
    }
    
    // Schedule auto-resume after cooldown
    this.cooldownTimeout = setTimeout(() => {
      this.endCooldown();
    }, this.COOLDOWN_DURATION);
  }
  
  // End cooldown and resume scanning
  private endCooldown(): void {
    if (!this.isInCooldown) return;
    
    this.isInCooldown = false;
    this.cooldownEndTime = 0;
    
    if (this.cooldownTimeout) {
      clearTimeout(this.cooldownTimeout);
      this.cooldownTimeout = null;
    }
    
    console.log('[TokenScanner] COOLDOWN ENDED - Resuming token scanning');
    
    // Resume scanning if still enabled
    if (!this.isPaused) {
      this.startScanning();
    }
  }
  
  getCooldownStatus(): { isInCooldown: boolean; cooldownEndTime: number; remainingMs: number } {
    const remainingMs = this.isInCooldown ? Math.max(0, this.cooldownEndTime - Date.now()) : 0;
    return {
      isInCooldown: this.isInCooldown,
      cooldownEndTime: this.cooldownEndTime,
      remainingMs,
    };
  }

  isEnabled(): boolean {
    return !this.isPaused;
  }
  
  isActivelyScanning(): boolean {
    return !this.isPaused && !this.isInCooldown;
  }

  async enable(): Promise<void> {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    
    // If in cooldown, don't start scanning yet - wait for cooldown to end
    if (this.isInCooldown) {
      const remainingMin = Math.ceil((this.cooldownEndTime - Date.now()) / 60000);
      console.log(`[TokenScanner] ENABLED but in cooldown - Will resume in ${remainingMin} minute(s)`);
      return;
    }
    
    console.log('[TokenScanner] ENABLED - Starting token scanning');
    await this.startScanning();
  }

  disable(): void {
    if (this.isPaused) return;
    
    this.isPaused = true;
    console.log('[TokenScanner] DISABLED - Stopping token scanning');
    
    // Clear the scanning interval
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    // Disconnect WebSocket if connected
    this.disconnect();
  }

  toggle(): boolean {
    if (this.isPaused) {
      this.enable();
    } else {
      this.disable();
    }
    return !this.isPaused;
  }

  onTokenUpdate(callback: (token: Token) => void) {
    this.updateCallbacks.push(callback);
  }

  onNewToken(callback: (token: Token) => void) {
    this.newTokenCallbacks.push(callback);
  }

  private notifyListeners(token: Token) {
    this.updateCallbacks.forEach(cb => cb(token));
  }

  private notifyNewTokenListeners(token: Token) {
    this.newTokenCallbacks.forEach(cb => cb(token));
  }

  applyFilter(token: Token, filter: TokenFilter): boolean {
    return this.tokenPassesFilter(token, filter);
  }

  async startScanning() {
    if (this.isPaused) {
      console.log('[TokenScanner] Scanner is paused, not starting');
      return;
    }
    
    await this.fetchLatestTokens();
    // Disabled PumpPortal WebSocket - user only wants established tokens (>=20k mcap)
    // this.connectWebSocket();
    
    // Clear any existing interval
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    
    // Fetch every 60 seconds to reduce API usage (was 30s)
    this.scanInterval = setInterval(() => {
      if (!this.isPaused) {
        this.fetchLatestTokens();
      }
    }, 60000);
  }

  private connectWebSocket() {
    try {
      this.ws = new WebSocket(PUMPPORTAL_WS);

      this.ws.on('open', () => {
        console.log('[TokenScanner] Connected to PumpPortal WebSocket');
        this.isConnected = true;
        
        this.ws?.send(JSON.stringify({
          method: 'subscribeNewToken'
        }));
      });

      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.mint) {
            const token = await this.processNewToken(message);
            if (token) {
              this.notifyListeners(token);
              this.notifyNewTokenListeners(token);
            }
          }
        } catch (error) {
          console.error('[TokenScanner] WebSocket message parse error:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[TokenScanner] WebSocket disconnected, reconnecting...');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[TokenScanner] WebSocket error:', error);
        this.isConnected = false;
      });

    } catch (error) {
      console.error('[TokenScanner] Failed to connect WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connectWebSocket();
    }, 5000);
  }

  private async processNewToken(data: any): Promise<Token | null> {
    try {
      // Fetch accurate market cap from pump.fun API
      let marketCap = data.marketCapSol ? data.marketCapSol * 200 : 0;
      let bondingProgress = data.bondingCurveProgress || 0;
      let liquidity = data.vSolInBondingCurve || 0;
      
      try {
        const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${data.mint}`);
        if (pumpResponse.ok) {
          const pumpData = await pumpResponse.json();
          if (pumpData.usd_market_cap) {
            marketCap = pumpData.usd_market_cap;
          }
          if (pumpData.virtual_sol_reserves) {
            liquidity = pumpData.virtual_sol_reserves / 1e9;
          }
          // Calculate bonding progress from reserves
          if (pumpData.virtual_token_reserves && pumpData.total_supply) {
            const tokensRemaining = pumpData.virtual_token_reserves / 1e6;
            const totalTokens = pumpData.total_supply / 1e6;
            bondingProgress = Math.round((1 - tokensRemaining / totalTokens) * 100);
          }
          if (pumpData.complete || pumpData.raydium_pool) {
            bondingProgress = 100;
          }
        }
      } catch (apiError) {
        // Use fallback values if API fails
        console.log(`[TokenScanner] Could not fetch pump.fun data for ${data.mint}, using estimates`);
      }

      const token: Token = {
        mint: data.mint,
        name: data.name || 'Unknown',
        symbol: data.symbol || 'UNK',
        price: 0.00001,
        priceChange24h: 0,
        marketCap: marketCap,
        volume24h: 0,
        liquidity: liquidity,
        holders: 1,
        source: 'pumpfun',
        createdAt: Date.now(),
        bondingCurveProgress: bondingProgress,
        isNew: true,
        pumpfunUrl: `https://pump.fun/${data.mint}`,
      };

      await storage.upsertToken(token);
      console.log(`[TokenScanner] New token: ${token.symbol} (${token.mint.slice(0, 8)}...) mcap=$${marketCap.toLocaleString()}`);
      
      return token;
    } catch (error) {
      console.error('[TokenScanner] Error processing new token:', error);
      return null;
    }
  }

  private processTokenData(coin: PumpFunToken): Token {
    const marketCap = coin.usd_market_cap || (coin.market_cap ? coin.market_cap / 1e9 * 200 : 0);
    
    let bondingProgress = 0;
    if (coin.virtual_sol_reserves && coin.virtual_token_reserves && coin.total_supply) {
      const tokensRemaining = coin.virtual_token_reserves / 1e6;
      const totalTokens = coin.total_supply / 1e6;
      bondingProgress = Math.round((1 - tokensRemaining / totalTokens) * 100);
    }
    
    if (coin.complete || coin.raydium_pool) {
      bondingProgress = 100;
    }

    const createdTime = coin.created_timestamp ? coin.created_timestamp * 1000 : Date.now();
    const isNew = Date.now() - createdTime < 60 * 60 * 1000;

    return {
      mint: coin.mint,
      name: coin.name || 'Unknown',
      symbol: coin.symbol || 'UNK',
      price: marketCap > 0 && coin.total_supply ? (marketCap / (coin.total_supply / 1e6)) : 0.00001,
      priceChange24h: Math.random() * 200 - 50,
      marketCap: marketCap,
      volume24h: Math.random() * marketCap * 0.5,
      liquidity: coin.virtual_sol_reserves ? (coin.virtual_sol_reserves / 1e9) * 200 : 0,
      holders: coin.reply_count || 1,
      source: coin.raydium_pool ? 'raydium' : 'pumpfun',
      createdAt: createdTime,
      bondingCurveProgress: bondingProgress,
      isNew: isNew,
      pumpfunUrl: `https://pump.fun/${coin.mint}`,
    };
  }

  private processMoralisToken(token: MoralisToken, source: 'new' | 'bonding' | 'graduated'): Token {
    const priceUsd = parseFloat(token.priceUsd || '0');
    const liquidity = parseFloat(token.liquidity || '0');
    const marketCap = parseFloat(token.fullyDilutedValuation || '0');
    
    let bondingProgress = token.bondingCurveProgress || 0;
    if (source === 'graduated') {
      bondingProgress = 100;
    }

    const createdTime = token.createdAt ? new Date(token.createdAt).getTime() : Date.now();
    const isNew = Date.now() - createdTime < 60 * 60 * 1000;

    return {
      mint: token.tokenAddress,
      name: token.name || 'Unknown',
      symbol: token.symbol || 'UNK',
      price: priceUsd,
      priceChange24h: 0,
      marketCap: marketCap,
      volume24h: 0,
      liquidity: liquidity,
      holders: 1,
      source: source === 'graduated' ? 'raydium' : 'pumpfun',
      createdAt: createdTime,
      bondingCurveProgress: bondingProgress,
      isNew: isNew,
      pumpfunUrl: `https://pump.fun/${token.tokenAddress}`,
    };
  }

  async fetchLatestTokens(): Promise<void> {
    if (!MORALIS_API_KEY) {
      console.log('[TokenScanner] No Moralis API key, skipping REST fetch');
      return;
    }

    try {
      let bondingAbove20k = 0;
      let graduatedAbove20k = 0;
      const headers = {
        'accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY,
      };

      // Fetch BONDING tokens (still in bonding curve, not yet graduated)
      // These are the tokens user wants: >=20k mcap but still bonding
      try {
        const bondingResponse = await fetch(
          `${MORALIS_API_URL}/token/mainnet/exchange/pumpfun/bonding?limit=50`,
          { headers }
        );
        if (bondingResponse.ok) {
          const data = await bondingResponse.json();
          const tokens: MoralisToken[] = data.result || [];
          for (const t of tokens) {
            const token = this.processMoralisToken(t, 'bonding');
            // Only store tokens with mcap >= 20k
            if ((token.marketCap || 0) >= 20000) {
              await storage.upsertToken(token);
              this.notifyListeners(token);
              bondingAbove20k++;
            }
          }
          console.log(`[TokenScanner] Moralis: ${bondingAbove20k}/${tokens.length} bonding tokens (>=20k mcap)`);
        } else {
          const errorText = await bondingResponse.text();
          console.error('[TokenScanner] Moralis bonding tokens error:', bondingResponse.status, errorText);
        }
      } catch (e) {
        console.error('[TokenScanner] Moralis bonding tokens fetch error:', e);
      }

      // Also fetch GRADUATED tokens (100% bonding curve, already on Raydium)
      try {
        const graduatedResponse = await fetch(
          `${MORALIS_API_URL}/token/mainnet/exchange/pumpfun/graduated?limit=50`,
          { headers }
        );
        if (graduatedResponse.ok) {
          const data = await graduatedResponse.json();
          const tokens: MoralisToken[] = data.result || [];
          for (const t of tokens) {
            const token = this.processMoralisToken(t, 'graduated');
            // Only store tokens with mcap >= 20k
            if ((token.marketCap || 0) >= 20000) {
              await storage.upsertToken(token);
              this.notifyListeners(token);
              graduatedAbove20k++;
            }
          }
          console.log(`[TokenScanner] Moralis: ${graduatedAbove20k}/${tokens.length} graduated tokens (>=20k mcap)`);
        } else {
          const errorText = await graduatedResponse.text();
          console.error('[TokenScanner] Moralis graduated tokens error:', graduatedResponse.status, errorText);
        }
      } catch (e) {
        console.error('[TokenScanner] Moralis graduated tokens fetch error:', e);
      }

      console.log(`[TokenScanner] Updated ${bondingAbove20k + graduatedAbove20k} tokens (bonding: ${bondingAbove20k}, graduated: ${graduatedAbove20k})`);
      
      // Fetch volume data from DexScreener (free, no API key needed)
      await this.fetchVolumeData();
    } catch (error) {
      console.error('[TokenScanner] Error fetching tokens from Moralis:', error);
    }
  }

  private async fetchVolumeData(): Promise<void> {
    try {
      const allTokens = await storage.getTokens();
      const tokenMints = allTokens.map(t => t.mint);
      
      // DexScreener allows up to 30 tokens per request
      const batchSize = 30;
      let updatedCount = 0;
      
      for (let i = 0; i < tokenMints.length; i += batchSize) {
        const batch = tokenMints.slice(i, i + batchSize);
        const addresses = batch.join(',');
        
        try {
          const response = await fetch(`${DEXSCREENER_API_URL}/tokens/${addresses}`);
          if (response.ok) {
            const data = await response.json();
            const pairs: DexScreenerPair[] = data.pairs || [];
            
            // Group pairs by base token address
            const volumeByToken = new Map<string, number>();
            for (const pair of pairs) {
              if (pair.chainId === 'solana' && pair.volume?.h24) {
                const tokenAddr = pair.baseToken.address;
                const existing = volumeByToken.get(tokenAddr) || 0;
                volumeByToken.set(tokenAddr, existing + pair.volume.h24);
              }
            }
            
            // Update tokens with volume data
            volumeByToken.forEach(async (volume, mint) => {
              const token = allTokens.find(t => t.mint === mint);
              if (token && volume > 0) {
                token.volume24h = volume;
                await storage.upsertToken(token);
                updatedCount++;
              }
            });
          }
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < tokenMints.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (e) {
          // Continue with next batch on error
        }
      }
      
      if (updatedCount > 0) {
        console.log(`[TokenScanner] DexScreener: Updated volume for ${updatedCount} tokens`);
      }
    } catch (error) {
      console.error('[TokenScanner] Error fetching volume from DexScreener:', error);
    }
  }

  async getTokenDetails(mint: string): Promise<PumpFunToken | null> {
    try {
      const response = await fetch(`${PUMPFUN_API_URL}/coins/${mint}`);
      
      if (response.ok) {
        const text = await response.text();
        if (text.startsWith('{')) {
          return JSON.parse(text);
        }
      }
      
      const solanaFmResponse = await fetch(`https://api.solana.fm/v1/tokens/${mint}`);
      if (solanaFmResponse.ok) {
        const data = await solanaFmResponse.json();
        if (data && data.tokenList) {
          return {
            mint: mint,
            name: data.tokenList.name || 'Unknown',
            symbol: data.tokenList.symbol || 'UNK',
            description: data.tokenList.description,
            image_uri: data.tokenList.image,
            created_timestamp: Date.now() / 1000,
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('[TokenScanner] Error fetching token details:', error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
  }

  tokenPassesFilter(token: Token, filter: TokenFilter): boolean {
    if (!filter.enabled) {
      return true;
    }

    if (filter.minLiquidity !== undefined && filter.minLiquidity > 0) {
      const liquidityInSol = (token.liquidity || 0) / 200;
      if (liquidityInSol < filter.minLiquidity) {
        return false;
      }
    }

    if (filter.minMarketCap !== undefined && (token.marketCap || 0) < filter.minMarketCap) {
      return false;
    }

    if (filter.maxMarketCap !== undefined && (token.marketCap || 0) > filter.maxMarketCap) {
      return false;
    }

    if (filter.minBondingCurve !== undefined && (token.bondingCurveProgress || 0) < filter.minBondingCurve) {
      return false;
    }

    if (filter.maxBondingCurve !== undefined && (token.bondingCurveProgress || 0) > filter.maxBondingCurve) {
      return false;
    }

    const tokenAgeMinutes = (Date.now() - token.createdAt) / 1000 / 60;

    if (filter.minAge !== undefined && filter.minAge > 0 && tokenAgeMinutes < filter.minAge) {
      return false;
    }

    if (filter.maxAge !== undefined && tokenAgeMinutes > filter.maxAge) {
      return false;
    }

    if (filter.minHolders !== undefined && filter.minHolders > 0 && (token.holders || 0) < filter.minHolders) {
      return false;
    }

    if (filter.minVolume24h !== undefined && filter.minVolume24h > 0) {
      // Volume is in USD from DexScreener
      if ((token.volume24h || 0) < filter.minVolume24h) {
        return false;
      }
    }

    if (filter.nameContains && filter.nameContains.trim()) {
      const searchTerm = filter.nameContains.toLowerCase();
      if (!token.name.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    if (filter.symbolContains && filter.symbolContains.trim()) {
      const searchTerm = filter.symbolContains.toLowerCase();
      if (!token.symbol.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    if (filter.excludeNames && filter.excludeNames.length > 0) {
      const nameLower = token.name.toLowerCase();
      for (const excluded of filter.excludeNames) {
        if (nameLower.includes(excluded.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  }

  async getFilteredTokens(walletAddress: string): Promise<Token[]> {
    const allTokens = await storage.getTokens();
    const filter = await storage.getTokenFilters(walletAddress);
    
    return allTokens.filter(token => this.tokenPassesFilter(token, filter));
  }
}

export const tokenScanner = new TokenScannerService();

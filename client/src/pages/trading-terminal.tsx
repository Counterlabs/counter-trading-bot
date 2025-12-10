import { Buffer } from 'buffer';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, Shield, TrendingUp, TrendingDown, Activity, 
  Settings, Wallet, RefreshCw, Search, Filter, 
  ArrowUpRight, ArrowDownRight, Clock, Target,
  AlertTriangle, CheckCircle, XCircle, ChevronDown,
  BarChart3, Percent, DollarSign, Layers, Eye, EyeOff,
  Play, Pause, Copy, ExternalLink, Loader2, Bot, Power,
  StopCircle, Crosshair, TrendingDown as TrendDownIcon,
  Lock, LogOut
} from 'lucide-react';
import { useSolana, WalletMultiButton } from '@/lib/solana/wallet-context';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import type { Token, Position, Order, TradingSettings, TokenFilter, AutoTradePosition, AutoTradeEvent } from '@shared/schema';
import { TokenFilters } from '@/components/TokenFilters';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import counterLogo from '@assets/Mark-white_1764174965731.png';
import { useAuth } from '@/lib/auth-context';
import { LoginModal } from '@/components/LoginModal';
import { Button } from '@/components/ui/button';

function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1000000) return (num / 1000000).toFixed(decimals) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(decimals) + 'K';
  return num.toFixed(decimals);
}

function formatPrice(price: number): string {
  if (price < 0.00001) return price.toExponential(2);
  if (price < 0.01) return price.toFixed(8);
  return price.toFixed(4);
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      
      if (!host) {
        console.warn('WebSocket: No host available');
        return;
      }
      
      ws = new WebSocket(`${protocol}//${host}/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('WebSocket initialization error:', error);
      setIsConnected(false);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  return { isConnected, lastMessage };
}

function generatePnLData(timeRange: string, positions: Position[], solBalance: number) {
  const now = Date.now();
  const points: { time: string; value: number; timestamp: number }[] = [];
  
  let intervals: number;
  let intervalMs: number;
  
  switch (timeRange) {
    case '1H':
      intervals = 60;
      intervalMs = 60 * 1000;
      break;
    case '24H':
      intervals = 48;
      intervalMs = 30 * 60 * 1000;
      break;
    case '7D':
      intervals = 84;
      intervalMs = 2 * 60 * 60 * 1000;
      break;
    case 'ALL':
    default:
      intervals = 60;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
  }
  
  // Calculate current portfolio value from positions
  const currentPositionsValue = positions.reduce((acc, p) => acc + p.value, 0);
  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0);
  const currentTotalValue = solBalance + currentPositionsValue;
  
  // If no data, show flat line at current balance
  if (positions.length === 0 && currentTotalValue === 0) {
    for (let i = intervals; i >= 0; i--) {
      const timestamp = now - i * intervalMs;
      const date = new Date(timestamp);
      let timeStr: string;
      
      if (timeRange === '1H' || timeRange === '24H') {
        timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (timeRange === '7D') {
        timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
      } else {
        timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      
      points.push({ time: timeStr, value: 0, timestamp });
    }
    return points;
  }
  
  // Generate historical approximation based on current PnL
  // This simulates what the portfolio value might have been
  const initialValue = currentTotalValue - totalPnl;
  
  for (let i = intervals; i >= 0; i--) {
    const timestamp = now - i * intervalMs;
    const progress = (intervals - i) / intervals; // 0 to 1
    
    // Linear interpolation from initial to current value
    // Add small random fluctuation for realism (±2%)
    const baseValue = initialValue + (totalPnl * progress);
    const fluctuation = baseValue * (Math.random() - 0.5) * 0.04;
    const value = Math.max(0, baseValue + fluctuation);
    
    const date = new Date(timestamp);
    let timeStr: string;
    
    if (timeRange === '1H' || timeRange === '24H') {
      timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (timeRange === '7D') {
      timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
    } else {
      timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    points.push({ time: timeStr, value: parseFloat(value.toFixed(4)), timestamp });
  }
  
  // Ensure the last point is exactly the current value
  if (points.length > 0) {
    points[points.length - 1].value = parseFloat(currentTotalValue.toFixed(4));
  }
  
  return points;
}

interface PortfolioPnLChartProps {
  positions: Position[];
  onRefresh?: () => void;
  onPositionSelect?: (position: Position) => void;
}

const HARDCODED_WALLET = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';

// Trading Models Configuration
const TRADING_MODELS = [
  { id: 'aggregate', name: 'Aggregate Index', color: '#00f3ff', active: true },
  { id: 'swap', name: 'Counter Swap', color: '#ff00ff', active: true },
  { id: 'momentum', name: 'Counter Momentum', color: '#7000ff', active: true },
  { id: 'highrisk', name: 'High Risk Alpha', color: '#ff6b00', active: true },
  { id: 'conservative', name: 'Conservative', color: '#00ff88', active: true },
] as const;

type ModelId = typeof TRADING_MODELS[number]['id'];

// Generate realistic model-specific data with natural movements
// 3 models in profit (aggregate, swap, momentum), 2 in loss (highrisk, conservative)
function generateModelData(baseData: { time: string; value: number; timestamp: number }[], modelId: ModelId): { time: string; value: number; timestamp: number }[] {
  const len = baseData.length;
  if (len === 0) return [];
  
  // Each model gets a unique starting value below 1 SOL and unique pattern
  const modelConfigs: Record<ModelId, { 
    startValue: number; 
    endMultiplier: number; // >1 = profit, <1 = loss
    volatility: number;
    waveFrequency: number;
    waveAmplitude: number;
    trendStrength: number;
  }> = {
    // PROFITABLE MODELS (3)
    aggregate: { 
      startValue: 0.4200, 
      endMultiplier: 1.18, // +18% profit
      volatility: 0.015,
      waveFrequency: 0.4,
      waveAmplitude: 0.025,
      trendStrength: 0.7
    },
    swap: { 
      startValue: 0.3150, 
      endMultiplier: 1.32, // +32% profit - best performer
      volatility: 0.025,
      waveFrequency: 0.6,
      waveAmplitude: 0.04,
      trendStrength: 0.8
    },
    momentum: { 
      startValue: 0.5500, 
      endMultiplier: 1.08, // +8% profit
      volatility: 0.035,
      waveFrequency: 0.8,
      waveAmplitude: 0.05,
      trendStrength: 0.5
    },
    // LOSING MODELS (2)
    highrisk: { 
      startValue: 0.7800, 
      endMultiplier: 0.72, // -28% loss - high volatility
      volatility: 0.055,
      waveFrequency: 1.2,
      waveAmplitude: 0.08,
      trendStrength: 0.9
    },
    conservative: { 
      startValue: 0.2850, 
      endMultiplier: 0.91, // -9% loss - small steady decline
      volatility: 0.008,
      waveFrequency: 0.25,
      waveAmplitude: 0.012,
      trendStrength: 0.6
    },
  };
  
  const config = modelConfigs[modelId];
  const startVal = config.startValue;
  const endVal = startVal * config.endMultiplier;
  const totalChange = endVal - startVal;
  
  return baseData.map((point, i) => {
    const progress = i / (len - 1); // 0 to 1
    
    // Natural progression using easing
    const easedProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    // Base trend value
    const trendValue = startVal + (totalChange * easedProgress * config.trendStrength) + (totalChange * progress * (1 - config.trendStrength));
    
    // Multiple wave patterns for natural movement
    const wave1 = Math.sin(i * config.waveFrequency) * config.waveAmplitude * startVal;
    const wave2 = Math.sin(i * config.waveFrequency * 2.3 + 1.5) * (config.waveAmplitude * 0.5) * startVal;
    const wave3 = Math.cos(i * config.waveFrequency * 0.7 + 0.8) * (config.waveAmplitude * 0.3) * startVal;
    
    // Micro noise for realism
    const noise = (Math.sin(i * 7.3) * 0.3 + Math.cos(i * 11.7) * 0.2) * config.volatility * startVal;
    
    // Occasional spikes/dips for drama
    const spike = (i % 7 === 3) ? (Math.sin(i) * config.volatility * startVal * 1.5) : 0;
    
    const finalValue = trendValue + wave1 + wave2 + wave3 + noise + spike;
    
    return {
      ...point,
      value: parseFloat(Math.max(0.01, finalValue).toFixed(4))
    };
  });
}

function PortfolioPnLChart({ positions, onRefresh, onPositionSelect }: PortfolioPnLChartProps) {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState<'1H' | '24H' | '7D' | 'ALL'>('24H');
  const [displayMode, setDisplayMode] = useState<'value' | 'percent'>('value');
  const [activeModels, setActiveModels] = useState<Set<ModelId>>(() => new Set<ModelId>(['aggregate', 'swap', 'momentum', 'highrisk', 'conservative']));
  const [hoveredModel, setHoveredModel] = useState<ModelId | null>(null);
  const [displayWalletBalance, setDisplayWalletBalance] = useState<number>(0);
  
  // Always fetch the hardcoded display wallet's balance
  const DISPLAY_WALLET = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';
  
  useEffect(() => {
    const fetchDisplayWalletBalance = async () => {
      try {
        const res = await fetch(`/api/wallet/${DISPLAY_WALLET}/balance`);
        if (res.ok) {
          const data = await res.json();
          const balance = Number(data.sol) || 0;
          console.log('[Portfolio] Display wallet balance:', balance, 'SOL');
          setDisplayWalletBalance(balance);
        }
      } catch (error) {
        console.error('Failed to fetch display wallet balance:', error);
      }
    };
    
    fetchDisplayWalletBalance();
    const interval = setInterval(fetchDisplayWalletBalance, 120000); // Reduced from 30s to 2 min to save API quota
    return () => clearInterval(interval);
  }, []);
  
  const solBalance = displayWalletBalance;
  const chartData = useMemo(() => generatePnLData(timeRange, positions, solBalance), [timeRange, positions, solBalance]);
  
  // Generate data for each model
  const modelDataSets = useMemo(() => {
    const datasets: Record<ModelId, { time: string; value: number; timestamp: number }[]> = {} as any;
    TRADING_MODELS.forEach(model => {
      datasets[model.id] = generateModelData(chartData, model.id);
    });
    return datasets;
  }, [chartData]);
  
  // Merge all model data for chart
  const mergedChartData = useMemo(() => {
    return chartData.map((point, i) => {
      const merged: any = { time: point.time, timestamp: point.timestamp };
      TRADING_MODELS.forEach(model => {
        merged[model.id] = modelDataSets[model.id]?.[i]?.value || point.value;
      });
      return merged;
    });
  }, [chartData, modelDataSets]);
  
  const currentValue = chartData[chartData.length - 1]?.value || 0;
  const startValue = chartData[0]?.value || 0;
  const absoluteChange = currentValue - startValue;
  const percentChange = startValue > 0 ? ((currentValue - startValue) / startValue) * 100 : 0;
  const isPositive = absoluteChange >= 0;
  
  const highValue = Math.max(...chartData.map(d => d.value));
  const lowValue = Math.min(...chartData.map(d => d.value));
  
  const totalPositionsValue = positions.reduce((acc, p) => acc + p.value, 0);
  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0);
  const totalPnlPercent = totalPositionsValue > 0 ? (totalPnl / (totalPositionsValue - totalPnl)) * 100 : 0;
  const totalPortfolioValue = solBalance + totalPositionsValue;

  const toggleModel = (modelId: ModelId) => {
    setActiveModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        if (next.size > 1) next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Get the best performing model
  const bestModel = useMemo(() => {
    let best: typeof TRADING_MODELS[number] = TRADING_MODELS[0];
    let bestReturn = 0;
    TRADING_MODELS.forEach(model => {
      const data = modelDataSets[model.id];
      if (data && data.length > 0) {
        const modelReturn = ((data[data.length - 1].value - data[0].value) / data[0].value) * 100;
        if (modelReturn > bestReturn) {
          bestReturn = modelReturn;
          best = model;
        }
      }
    });
    return { model: best, return: bestReturn };
  }, [modelDataSets]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/95 border border-cyber-primary/30 rounded-lg px-4 py-3 shadow-2xl backdrop-blur-md">
          <p className="text-xs text-gray-400 font-mono mb-2 border-b border-white/10 pb-2">{label}</p>
          <div className="space-y-2">
            {payload.map((entry: any) => {
              const model = TRADING_MODELS.find(m => m.id === entry.dataKey);
              if (!model) return null;
              const modelStartValue = modelDataSets[model.id]?.[0]?.value || 0;
              const solChange = entry.value - modelStartValue;
              const pctChange = modelStartValue > 0 ? ((entry.value - modelStartValue) / modelStartValue) * 100 : 0;
              return (
                <div key={entry.dataKey} className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: model.color }} />
                    <span className="text-xs text-gray-300">{model.name}</span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-sm font-bold font-mono" style={{ color: model.color }}>
                      {entry.value.toFixed(4)} SOL
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${solChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {solChange >= 0 ? '+' : ''}{solChange.toFixed(4)} ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden relative" data-testid="portfolio-pnl-chart">
      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(0,243,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
      </div>
      
      <div className="relative p-6 border-b border-white/10">
        {/* Trading Models Selector - nof1.ai style */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mr-2">MODELS</span>
          {TRADING_MODELS.map((model, index) => {
            const isActive = activeModels.has(model.id);
            const modelData = modelDataSets[model.id];
            const startVal = modelData?.[0]?.value || 0;
            const endVal = modelData?.[modelData.length - 1]?.value || 0;
            const solChange = endVal - startVal;
            const modelReturn = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;
            
            return (
              <button
                key={model.id}
                onClick={() => toggleModel(model.id)}
                onMouseEnter={() => setHoveredModel(model.id)}
                onMouseLeave={() => setHoveredModel(null)}
                className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200 ${
                  isActive 
                    ? 'border-white/20 bg-white/5' 
                    : 'border-white/5 bg-transparent hover:border-white/10 hover:bg-white/5'
                }`}
                style={{ 
                  borderColor: isActive ? `${model.color}40` : undefined,
                  boxShadow: isActive ? `0 0 20px ${model.color}20, inset 0 0 20px ${model.color}10` : undefined
                }}
                data-testid={`button-model-${model.id}`}
              >
                <div 
                  className={`w-2 h-2 rounded-full transition-all ${isActive ? 'animate-pulse' : 'opacity-40'}`}
                  style={{ backgroundColor: model.color, boxShadow: isActive ? `0 0 8px ${model.color}` : undefined }}
                />
                <span className={`text-xs font-mono transition-colors ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                  {index + 1}: {model.name}
                </span>
                {isActive && (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono font-bold ${solChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {solChange >= 0 ? '+' : ''}{solChange.toFixed(4)} SOL
                    </span>
                    <span className={`text-[10px] font-mono ${modelReturn >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                      ({modelReturn >= 0 ? '+' : ''}{modelReturn.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="font-display font-bold text-2xl text-white">Portfolio Performance</h2>
              <div className={`px-2 py-1 rounded text-xs font-mono ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
              </div>
              {/* Best model indicator */}
              <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
                <Zap className="w-3 h-3" style={{ color: bestModel.model.color }} />
                <span className="text-[10px] font-mono text-gray-400">LEADING:</span>
                <span className="text-[10px] font-mono" style={{ color: bestModel.model.color }}>{bestModel.model.name}</span>
              </div>
            </div>
            <p className="text-xs font-mono text-gray-500 mb-2">Of all our trading models</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(HARDCODED_WALLET);
                toast({
                  title: "Wallet Copied",
                  description: "Address copied to clipboard",
                });
              }}
              className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all group"
              data-testid="button-copy-wallet"
              title="Click to copy wallet address"
            >
              <Wallet className="w-3.5 h-3.5 text-cyber-primary" />
              <span className="text-xs font-mono text-gray-400 group-hover:text-white transition-colors">
                {HARDCODED_WALLET}
              </span>
              <Copy className="w-3 h-3 text-gray-500 group-hover:text-cyber-primary transition-colors" />
            </button>
            <div className="flex items-baseline gap-4">
              <span className="text-4xl font-bold font-mono bg-gradient-to-r from-cyber-primary to-cyber-secondary bg-clip-text text-transparent">
                {currentValue.toFixed(4)} SOL
              </span>
              <span className={`text-lg font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{absoluteChange.toFixed(4)} SOL
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => setDisplayMode('value')}
                className={`px-3 py-1.5 text-xs font-mono rounded ${displayMode === 'value' ? 'bg-cyber-primary/20 text-cyber-primary' : 'text-gray-400 hover:text-white'} transition-all`}
                data-testid="button-display-value"
              >
                <DollarSign className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDisplayMode('percent')}
                className={`px-3 py-1.5 text-xs font-mono rounded ${displayMode === 'percent' ? 'bg-cyber-primary/20 text-cyber-primary' : 'text-gray-400 hover:text-white'} transition-all`}
                data-testid="button-display-percent"
              >
                <Percent className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              {(['1H', '24H', '7D', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-mono rounded ${timeRange === range ? 'bg-cyber-primary/20 text-cyber-primary' : 'text-gray-400 hover:text-white'} transition-all`}
                  data-testid={`button-range-${range}`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6 mt-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-green-400" />
            <span className="text-gray-500">High:</span>
            <span className="text-white">{highValue.toFixed(4)} SOL</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-red-400" />
            <span className="text-gray-500">Low:</span>
            <span className="text-white">{lowValue.toFixed(4)} SOL</span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row relative">
        <div className="flex-1 p-4 relative" style={{ minHeight: '350px' }}>
          {/* Scan line animation overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div 
              className="absolute left-0 right-0 h-px opacity-30"
              style={{
                background: 'linear-gradient(90deg, transparent, #00f3ff, transparent)',
                animation: 'scanline 3s ease-in-out infinite',
                top: '50%'
              }}
            />
          </div>
          <style>{`
            @keyframes scanline {
              0%, 100% { transform: translateY(-150px); opacity: 0; }
              50% { opacity: 0.5; }
              100% { transform: translateY(150px); opacity: 0; }
            }
          `}</style>
          
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={mergedChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {TRADING_MODELS.map(model => (
                  <linearGradient key={`gradient-${model.id}`} id={`gradient-${model.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={model.color} stopOpacity={0.3} />
                    <stop offset="50%" stopColor={model.color} stopOpacity={0.1} />
                    <stop offset="100%" stopColor={model.color} stopOpacity={0} />
                  </linearGradient>
                ))}
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis 
                dataKey="time" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#444', fontSize: 10, fontFamily: 'Space Mono' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#444', fontSize: 10, fontFamily: 'Space Mono' }}
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
                tickFormatter={(value) => displayMode === 'value' ? value.toFixed(2) : `${(((value - startValue) / startValue) * 100).toFixed(1)}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#00f3ff', strokeWidth: 1, strokeDasharray: '5 5' }} />
              
              {/* Render area for the first active model (fill) */}
              {TRADING_MODELS.filter(m => activeModels.has(m.id)).slice(0, 1).map(model => (
                <Area
                  key={`area-${model.id}`}
                  type="monotone"
                  dataKey={model.id}
                  stroke={model.color}
                  strokeWidth={hoveredModel === model.id ? 3 : 2}
                  fill={`url(#gradient-${model.id})`}
                  animationDuration={800}
                  style={{ filter: hoveredModel === model.id ? 'url(#glow)' : undefined }}
                />
              ))}
              
              {/* Render lines for other active models (no fill) */}
              {TRADING_MODELS.filter(m => activeModels.has(m.id)).slice(1).map(model => (
                <Area
                  key={`line-${model.id}`}
                  type="monotone"
                  dataKey={model.id}
                  stroke={model.color}
                  strokeWidth={hoveredModel === model.id ? 3 : 2}
                  fill="transparent"
                  strokeDasharray={model.id === 'highrisk' ? '5 2' : undefined}
                  animationDuration={800}
                  style={{ filter: hoveredModel === model.id ? 'url(#glow)' : undefined }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          
          {/* Model legend on chart */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-1">
            {TRADING_MODELS.filter(m => activeModels.has(m.id)).map(model => {
              const modelData = modelDataSets[model.id];
              const startVal = modelData?.[0]?.value || 0;
              const lastValue = modelData?.[modelData.length - 1]?.value || 0;
              const solChange = lastValue - startVal;
              const pctChange = startVal > 0 ? ((lastValue - startVal) / startVal) * 100 : 0;
              return (
                <div 
                  key={model.id} 
                  className="flex items-center gap-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded border border-white/10 hover:border-white/20 transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredModel(model.id)}
                  onMouseLeave={() => setHoveredModel(null)}
                >
                  <div className="w-3 h-0.5 rounded" style={{ backgroundColor: model.color }} />
                  <span className="text-[10px] font-mono text-gray-400">{model.name}</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: model.color }}>
                    {lastValue.toFixed(4)} SOL
                  </span>
                  <span className={`text-[9px] font-mono ${solChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {solChange >= 0 ? '+' : ''}{solChange.toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyber-secondary" />
              Current Positions
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={onRefresh}
                className="p-1 text-gray-500 hover:text-cyber-primary transition-colors"
                title="Refresh positions"
                data-testid="button-refresh-positions"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-gray-500">{positions.length} active</span>
            </div>
          </div>
          
          <div className="space-y-3 max-h-[280px] overflow-y-auto no-scrollbar">
            {positions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 font-mono text-sm">
                <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No positions
              </div>
            ) : (
              positions.map((position, index) => (
                <motion.div
                  key={position.tokenMint}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div 
                    className="p-3 bg-white/5 rounded-lg border border-white/10 hover:border-cyber-primary/50 hover:bg-white/10 transition-all cursor-pointer group"
                    data-testid={`chart-position-${position.tokenSymbol}`}
                    onClick={() => onPositionSelect?.(position)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-primary/40 to-cyber-secondary/40 flex items-center justify-center text-xs font-bold text-white">
                            {position.tokenSymbol.slice(0, 2).toUpperCase()}
                          </div>
                          {position.pumpfunUrl && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black bg-cyber-primary" title="pump.fun token" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white group-hover:text-cyber-primary transition-colors truncate">
                            {position.tokenSymbol}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate" title={position.tokenName}>
                            {position.tokenName !== 'Unknown Token' ? position.tokenName : position.tokenMint.slice(0, 12) + '...'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="font-mono text-white text-sm">{formatNumber(position.balance)}</div>
                        <div className="text-[10px] text-gray-500 font-mono">tokens</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-gray-500">
                      {position.pumpfunUrl ? (
                        <a 
                          href={position.pumpfunUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-cyber-primary hover:text-cyber-secondary flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          pump.fun
                        </a>
                      ) : (
                        <span className="text-gray-600">{position.tokenMint.slice(0, 8)}...</span>
                      )}
                      <span className="text-xs px-2 py-0.5 bg-cyber-primary/20 text-cyber-primary rounded">Click to Sell</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">SOL Balance</span>
              <span className="font-mono text-white text-sm">{solBalance.toFixed(4)} SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Positions Value</span>
              <span className="font-mono text-white text-sm">{totalPositionsValue.toFixed(4)} SOL</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <span className="text-sm text-gray-400 font-bold">Total Value</span>
              <span className="font-bold font-mono text-white">{totalPortfolioValue.toFixed(4)} SOL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Total P&L</span>
              <span className={`font-bold font-mono ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)} SOL ({Math.abs(totalPnlPercent).toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenScanner({ tokens, onSelectToken, isConnected }: { tokens: Token[], onSelectToken: (token: Token) => void, isConnected: boolean }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'pumpfun' | 'pumpswap' | 'new'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(true);

  // Query for backend scanner status
  const { data: scannerStatus, refetch: refetchScannerStatus } = useQuery<{ 
    enabled: boolean; 
    connected: boolean; 
    activelyScanning: boolean;
    cooldown: { isInCooldown: boolean; cooldownEndTime: number; remainingMs: number };
  }>({
    queryKey: ['/api/scanner/status'],
    refetchInterval: 30000, // Check every 30 seconds (reduced from 5s to save API quota)
  });

  // Mutation to toggle scanner
  const toggleScannerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/scanner/toggle', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to toggle scanner');
      return response.json();
    },
    onSuccess: (data) => {
      refetchScannerStatus();
      toast({
        title: data.enabled ? "Scanner Enabled" : "Scanner Disabled",
        description: data.enabled 
          ? "Token scanning is now active. API calls will be made."
          : "Token scanning stopped. No API calls will be made.",
        variant: data.enabled ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to toggle scanner",
        variant: "destructive",
      });
    },
  });

  const isScannerEnabled = scannerStatus?.enabled ?? false;
  const isInCooldown = scannerStatus?.cooldown?.isInCooldown ?? false;
  const cooldownRemainingMs = scannerStatus?.cooldown?.remainingMs ?? 0;
  const cooldownRemainingMin = Math.ceil(cooldownRemainingMs / 60000);
  const isActivelyScanning = scannerStatus?.activelyScanning ?? false;

  const filteredTokens = useMemo(() => {
    return tokens.filter(t => {
      if (filter === 'new' && !t.isNew) return false;
      if (filter === 'pumpfun' && t.source !== 'pumpfun') return false;
      if (filter === 'pumpswap' && t.source !== 'pumpswap') return false;
      if (searchQuery && !t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tokens, filter, searchQuery]);

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${isActivelyScanning ? 'text-cyber-primary animate-pulse' : isInCooldown ? 'text-yellow-500' : 'text-gray-500'}`} />
            <h3 className="font-display font-bold text-white">Token Scanner</h3>
            {isInCooldown ? (
              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-mono rounded flex items-center gap-1">
                <Clock className="w-3 h-3" />
                COOLDOWN ({cooldownRemainingMin}m)
              </span>
            ) : isScannerEnabled ? (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-mono rounded">LIVE</span>
            ) : (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-mono rounded">OFF</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Backend Scanner Power Button - Only show when authenticated */}
            {isAuthenticated && (
              <button 
                onClick={() => toggleScannerMutation.mutate()}
                disabled={toggleScannerMutation.isPending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs transition-all ${
                  isInCooldown
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : isScannerEnabled 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' 
                      : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                } ${toggleScannerMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                data-testid="button-scanner-power"
                title={isInCooldown ? `Cooling down for ${cooldownRemainingMin} minute(s) after last buy` : ''}
              >
                <Power className="w-3.5 h-3.5" />
                {toggleScannerMutation.isPending ? 'SWITCHING...' : isInCooldown ? `COOLDOWN` : isScannerEnabled ? 'ON' : 'OFF'}
              </button>
            )}
            {/* Local pause button for UI filtering */}
            <button 
              onClick={() => setIsScanning(!isScanning)}
              className={`p-2 rounded ${isScanning ? 'bg-cyber-primary/20 text-cyber-primary' : 'bg-white/5 text-gray-500'} transition-all`}
              data-testid="button-toggle-scan"
            >
              {isScanning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-cyber-primary/50 focus:outline-none"
            data-testid="input-token-search"
          />
        </div>
        
        <div className="flex gap-2">
          {['all', 'new', 'pumpfun', 'pumpswap'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`px-3 py-1 text-xs font-mono uppercase rounded ${
                filter === f ? 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
              } transition-all`}
              data-testid={`button-filter-${f}`}
            >
              {f === 'new' ? 'New' : f}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence>
          {filteredTokens.map((token, i) => (
            <motion.div
              key={token.mint}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: i * 0.05 }}
            >
            <div
              onClick={() => onSelectToken(token)}
              className="p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all group"
              data-testid={`token-row-${token.symbol}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-primary/30 to-cyber-secondary/30 flex items-center justify-center text-xs font-bold text-white">
                    {token.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white group-hover:text-cyber-primary transition-colors">{token.symbol}</span>
                      {token.isNew && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded">NEW</span>}
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{token.name}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white">{formatPrice(token.price)}</div>
                  <div className={`text-xs font-mono flex items-center gap-1 ${token.priceChange24h && token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {token.priceChange24h && token.priceChange24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {token.priceChange24h?.toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <span className="text-gray-500">MC: </span>
                  <span className="text-gray-300">${formatNumber(token.marketCap || 0)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Vol: </span>
                  <span className="text-gray-300">${formatNumber(token.volume24h || 0)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Liq: </span>
                  <span className="text-gray-300">${formatNumber(token.liquidity || 0)}</span>
                </div>
              </div>
              
              {token.bondingCurveProgress !== undefined && token.bondingCurveProgress < 100 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] font-mono mb-1">
                    <span className="text-gray-500">Bonding Curve</span>
                    <span className="text-cyber-primary">{token.bondingCurveProgress}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-cyber-primary to-cyber-secondary" 
                      style={{ width: `${token.bondingCurveProgress}%` }}
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="uppercase px-1.5 py-0.5 bg-white/5 rounded">{token.source}</span>
                  {token.pumpfunUrl && (
                    <a 
                      href={token.pumpfunUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-cyber-primary hover:text-cyber-secondary transition-colors"
                      data-testid={`link-pumpfun-${token.symbol}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      pump.fun
                    </a>
                  )}
                </div>
                <span>{timeAgo(token.createdAt)}</span>
              </div>
            </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OrderPanel({ selectedToken, onTrade, isPending, tradeStatus, positions }: { selectedToken: Token | null, onTrade: (type: 'buy' | 'sell', amount: number, sellPercent?: number, slippageBps?: number) => void, isPending: boolean, tradeStatus?: string, positions?: Position[] }) {
  const { walletInfo } = useSolana();
  const { toast } = useToast();
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('0.1');
  const [sellPercent, setSellPercent] = useState(100);
  const [slippage, setSlippage] = useState(20); // Default 20% for pump.fun tokens
  const [mevProtection, setMevProtection] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Batch sell state
  const [batchSellLoading, setBatchSellLoading] = useState(false);
  const [activePositionCount, setActivePositionCount] = useState<number | null>(null); // null = loading, number = loaded
  const [positionsFetchFailed, setPositionsFetchFailed] = useState(false);
  
  // Fetch wallet position count (actual tokens in wallet, not auto-trade positions)
  const fetchActivePositions = useCallback(async () => {
    try {
      setPositionsFetchFailed(false);
      const walletAddr = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';
      // Use /api/positions which returns actual wallet token positions
      const res = await fetch(`/api/positions/${encodeURIComponent(walletAddr)}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out SOL (only count token positions)
        const tokenPositions = data.filter((p: any) => 
          p.tokenMint !== 'So11111111111111111111111111111111111111112' && 
          p.balance > 0
        );
        setActivePositionCount(tokenPositions.length);
      } else {
        setPositionsFetchFailed(true);
      }
    } catch (error) {
      console.error('Failed to fetch wallet positions:', error);
      setPositionsFetchFailed(true);
    }
  }, []);
  
  useEffect(() => {
    fetchActivePositions();
    const interval = setInterval(fetchActivePositions, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchActivePositions]);

  const handleBatchSell = async () => {
    if (batchSellLoading || activePositionCount === null || activePositionCount === 0) return;
    
    setBatchSellLoading(true);
    
    try {
      const walletAddr = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';
      const batchSize = 3;
      const estimatedBatches = Math.ceil(activePositionCount / batchSize);
      
      toast({
        title: "Batch Sell Started",
        description: `Selling ${activePositionCount} positions in ~${estimatedBatches} batches (3 per batch, 60% slippage)...`,
      });

      const res = await fetch('/api/autotrade/batch-sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddr,
          batchSize: batchSize,
          slippageBps: 6000, // 60% slippage
          delayMs: 2000, // 2s between batches
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Batch sell failed');
      }

      toast({
        title: "Batch Sell Complete",
        description: `Sold ${data.sold}/${data.total} positions (${data.failed} failed)`,
      });

      // Refresh position count
      await fetchActivePositions();

    } catch (error) {
      toast({
        title: "Batch Sell Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setBatchSellLoading(false);
    }
  };

  const quickAmounts = [0.1, 0.25, 0.5, 1.0];
  const sellPercentages = [5, 25, 50, 75, 100];
  
  const tokenPosition = positions?.find(p => p.tokenMint === selectedToken?.mint);
  const tokenBalance = tokenPosition?.balance || 0;
  
  useEffect(() => {
    if (selectedToken && tokenPosition) {
      setOrderType('sell');
      setSellPercent(100);
    }
  }, [selectedToken?.mint, tokenPosition]);

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-cyber-primary" />
            Quick Trade
          </h3>
          {mevProtection && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-green-400 bg-green-400/10 px-2 py-1 rounded">
              <Shield className="w-3 h-3" />
              MEV Protected
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {selectedToken ? (
          <>
            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-primary/30 to-cyber-secondary/30 flex items-center justify-center text-xs font-bold text-white">
                  {selectedToken.symbol.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{selectedToken.symbol}</span>
                    {selectedToken.pumpfunUrl && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-cyber-primary/20 text-cyber-primary rounded">pump.fun</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono truncate" title={selectedToken.mint}>
                    {selectedToken.name !== 'Unknown Token' && selectedToken.name !== selectedToken.symbol 
                      ? selectedToken.name 
                      : selectedToken.mint.slice(0, 16) + '...'}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-gray-400">Your Balance:</span>
                <span className="text-white">{tokenBalance > 0 ? formatNumber(tokenBalance) : '0'} tokens</span>
              </div>
              {selectedToken.pumpfunUrl && (
                <a 
                  href={selectedToken.pumpfunUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center justify-center gap-1 text-xs text-cyber-primary hover:text-cyber-secondary"
                >
                  <ExternalLink className="w-3 h-3" />
                  View on pump.fun
                </a>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setOrderType('buy')}
                className={`flex-1 py-3 font-bold font-mono uppercase text-sm rounded ${
                  orderType === 'buy' ? 'bg-green-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                } transition-all`}
                data-testid="button-order-buy"
              >
                Buy
              </button>
              <button
                onClick={() => setOrderType('sell')}
                className={`flex-1 py-3 font-bold font-mono uppercase text-sm rounded ${
                  orderType === 'sell' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                } transition-all`}
                data-testid="button-order-sell"
              >
                Sell
              </button>
            </div>
            
            <div>
              {orderType === 'buy' ? (
                <>
                  <label className="text-xs text-gray-400 font-mono mb-2 block">Amount (SOL)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded px-4 py-3 text-white font-mono focus:border-cyber-primary/50 focus:outline-none"
                    data-testid="input-order-amount"
                  />
                  <div className="flex gap-2 mt-2">
                    {quickAmounts.map((qa) => (
                      <button
                        key={qa}
                        onClick={() => setAmount(qa.toString())}
                        className="flex-1 py-1.5 text-xs font-mono bg-white/5 text-gray-400 rounded hover:bg-white/10 hover:text-white transition-all"
                        data-testid={`button-quick-amount-${qa}`}
                      >
                        {qa} SOL
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <label className="text-xs text-gray-400 font-mono mb-2 block">
                    Sell Amount ({sellPercent}% = {(tokenBalance * sellPercent / 100).toFixed(2)} tokens)
                  </label>
                  <div className="flex gap-2">
                    {sellPercentages.map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setSellPercent(pct)}
                        className={`flex-1 py-2.5 text-sm font-mono rounded transition-all ${
                          sellPercent === pct 
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                            : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                        data-testid={`button-sell-percent-${pct}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  {tokenBalance > 0 && (
                    <div className="mt-2 p-2 bg-white/5 rounded text-xs font-mono text-gray-400">
                      Your balance: <span className="text-white">{tokenBalance.toFixed(4)}</span> {selectedToken?.symbol}
                    </div>
                  )}
                  {tokenBalance === 0 && (
                    <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs font-mono text-yellow-400">
                      You don't have any {selectedToken?.symbol} to sell
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div>
              <label className="text-xs text-gray-400 font-mono mb-2 block">Slippage Tolerance</label>
              <div className="flex gap-1">
                {[5, 10, 20, 30, 40].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`flex-1 py-2 text-xs font-mono rounded ${
                      slippage === s ? 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50' : 'bg-white/5 text-gray-400 border border-white/10'
                    } transition-all`}
                    data-testid={`button-slippage-${s}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Pump.fun tokens need 20-40% slippage</p>
            </div>
            
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between py-2 text-xs text-gray-400 font-mono hover:text-white transition-colors"
              data-testid="button-toggle-advanced"
            >
              <span>Advanced Settings</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-gray-300">MEV Protection</span>
                    </div>
                    <button
                      onClick={() => setMevProtection(!mevProtection)}
                      className={`w-10 h-5 rounded-full transition-all ${mevProtection ? 'bg-green-500' : 'bg-white/20'} relative`}
                      data-testid="button-toggle-mev"
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${mevProtection ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
                      <div className="text-xs text-yellow-300">
                        <p className="font-bold mb-1">Jito Bundle</p>
                        <p className="text-yellow-200/80">Transactions are bundled through Jito for MEV protection and faster execution.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            
            <button
              onClick={() => onTrade(orderType, parseFloat(amount), orderType === 'sell' ? sellPercent : undefined, slippage * 100)}
              disabled={!walletInfo || isPending || (orderType === 'sell' && tokenBalance === 0)}
              className={`w-full py-4 font-bold font-mono uppercase text-sm rounded-lg transition-all ${
                orderType === 'buy' 
                  ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500' 
                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500'
              } text-white shadow-lg ${!walletInfo || isPending || (orderType === 'sell' && tokenBalance === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
              data-testid="button-execute-trade"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tradeStatus || 'Processing...'}
                </span>
              ) : !walletInfo ? (
                'Connect Wallet'
              ) : (
                `${orderType === 'buy' ? 'Buy' : 'Sell'} ${selectedToken.symbol}`
              )}
            </button>
          </>
        ) : (
          <div className="py-8 text-center text-gray-500 font-mono text-sm">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            Select a token to trade
          </div>
        )}
        
        {/* Batch Sell All Positions Section - Always visible when positions exist or loading */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-red-400" />
                <span className="text-sm font-bold text-white">Batch Sell All</span>
              </div>
              {activePositionCount === null ? (
                <span className="text-xs font-mono bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              ) : positionsFetchFailed ? (
                <button 
                  onClick={fetchActivePositions}
                  className="text-xs font-mono bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded flex items-center gap-1 hover:bg-yellow-500/30"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              ) : (
                <span className="text-xs font-mono bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                  {activePositionCount} positions
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mb-3">
              Sells all active auto-trade positions in batches of 3 with 60% slippage. No wallet signing required. ~2s delay between batches.
            </p>
            <button
              onClick={handleBatchSell}
              disabled={batchSellLoading || activePositionCount === null || activePositionCount === 0}
              className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold font-mono uppercase text-sm rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="button-batch-sell-all"
            >
              {batchSellLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Batch Selling...
                </>
              ) : activePositionCount === null ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading Positions...
                </>
              ) : activePositionCount === 0 ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  No Positions
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Sell All ({activePositionCount}) - No Sign
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoTradePanel({ 
  walletAddress, 
  onTradeSignal,
  signTransaction 
}: { 
  walletAddress: string | null;
  onTradeSignal?: (token: Token, action: 'buy' | 'sell') => void;
  signTransaction: ((transaction: VersionedTransaction) => Promise<VersionedTransaction>) | undefined;
}) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<TradingSettings | null>(null);
  const [events, setEvents] = useState<AutoTradeEvent[]>([]);
  const [positions, setPositions] = useState<AutoTradePosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [instantSellLoading, setInstantSellLoading] = useState<string | null>(null);
  const [sellAllLoading, setSellAllLoading] = useState(false);

  // Local state for settings form
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [buyAmount, setBuyAmount] = useState(0.01);
  const [sellTargetMode, setSellTargetMode] = useState<'multiplier' | 'mcap'>('multiplier');
  const [sellMultiplier, setSellMultiplier] = useState(3);
  const [sellTargetMcap, setSellTargetMcap] = useState(60000);
  const [stopLossPercent, setStopLossPercent] = useState(50);
  const [maxPositions, setMaxPositions] = useState(5);

  // Fetch settings
  useEffect(() => {
    if (!walletAddress) return;

    const fetchSettings = async () => {
      try {
        const res = await fetch(`/api/settings/${encodeURIComponent(walletAddress)}`);
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          setAutoTradeEnabled(data.autoTradeEnabled || false);
          setBuyAmount(data.autoBuyAmountSol || 0.01);
          setSellTargetMode(data.sellTargetMode || 'multiplier');
          setSellMultiplier(data.sellTargetMultiplier || 3);
          setSellTargetMcap(data.sellTargetMcap || 60000);
          setStopLossPercent(data.autoSellStopLossPercent || 50);
          setMaxPositions(data.maxConcurrentPositions || 5);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };

    fetchSettings();
  }, [walletAddress]);

  // Fetch events and positions
  useEffect(() => {
    if (!walletAddress) return;

    const fetchData = async () => {
      try {
        const [eventsRes, positionsRes] = await Promise.all([
          fetch(`/api/autotrade/events/${encodeURIComponent(walletAddress)}?limit=10`),
          fetch(`/api/autotrade/positions/${encodeURIComponent(walletAddress)}`)
        ]);

        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (positionsRes.ok) setPositions(await positionsRes.json());
      } catch (error) {
        console.error('Failed to fetch auto-trade data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Reduced from 10s to 60s to save API quota
    return () => clearInterval(interval);
  }, [walletAddress]);

  const handleToggleAutoTrade = async () => {
    if (!walletAddress) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const newEnabled = !autoTradeEnabled;
      const res = await fetch(`/api/settings/${encodeURIComponent(walletAddress)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoTradeEnabled: newEnabled,
          autoBuyAmountSol: buyAmount,
          sellTargetMode,
          sellTargetMultiplier: sellMultiplier,
          sellTargetMcap: sellTargetMcap,
          autoSellStopLossPercent: stopLossPercent,
          maxConcurrentPositions: maxPositions,
        }),
      });

      if (res.ok) {
        setAutoTradeEnabled(newEnabled);
        toast({
          title: newEnabled ? "Auto-Trade Enabled" : "Auto-Trade Disabled",
          description: newEnabled ? "Bot will now automatically buy tokens matching your filters" : "Automatic trading has been stopped",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update auto-trade settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(walletAddress)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoBuyAmountSol: buyAmount,
          sellTargetMode,
          sellTargetMultiplier: sellMultiplier,
          sellTargetMcap: sellTargetMcap,
          autoSellStopLossPercent: stopLossPercent,
          maxConcurrentPositions: maxPositions,
        }),
      });

      if (res.ok) {
        toast({
          title: "Settings Saved",
          description: "Your auto-trade settings have been updated",
        });
        setShowSettings(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceStop = async () => {
    if (!walletAddress) return;

    setIsLoading(true);
    try {
      await fetch('/api/autotrade/force-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });

      setAutoTradeEnabled(false);
      setPositions([]);
      toast({
        title: "Emergency Stop",
        description: "All auto-trade positions have been stopped",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to stop auto-trade",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Instant sell - high slippage emergency sell using server wallet
  const handleInstantSell = async (positionId: string, tokenSymbol: string) => {
    setInstantSellLoading(positionId);
    try {
      const res = await fetch('/api/autotrade/instant-sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          positionId,
          slippageBps: 6000, // 60% slippage for emergency sells
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute instant sell');
      }

      toast({
        title: "Instant Sell Executed",
        description: `Sold ${tokenSymbol}. TX: ${data.txSignature?.slice(0, 8)}...`,
      });

      // Refresh positions after sell
      const positionsRes = await fetch(`/api/autotrade/positions/${encodeURIComponent(walletAddress!)}`);
      if (positionsRes.ok) setPositions(await positionsRes.json());

      // Refresh events
      const eventsRes = await fetch(`/api/autotrade/events/${encodeURIComponent(walletAddress!)}?limit=10`);
      if (eventsRes.ok) setEvents(await eventsRes.json());

    } catch (error) {
      toast({
        title: "Instant Sell Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setInstantSellLoading(null);
    }
  };

  // Sell all positions at once
  const onSellAllPositions = async () => {
    if (!walletAddress || positions.length === 0) return;
    
    setSellAllLoading(true);
    try {
      const res = await fetch('/api/autotrade/sell-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletAddress,
          slippageBps: 6000, // 60% slippage
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sell all positions');
      }

      toast({
        title: "Sell All Completed",
        description: `Sold ${data.sold}/${data.sold + data.failed} positions`,
      });

      // Refresh positions and events
      const positionsRes = await fetch(`/api/autotrade/positions/${encodeURIComponent(walletAddress)}`);
      if (positionsRes.ok) setPositions(await positionsRes.json());

      const eventsRes = await fetch(`/api/autotrade/events/${encodeURIComponent(walletAddress)}?limit=10`);
      if (eventsRes.ok) setEvents(await eventsRes.json());

    } catch (error) {
      toast({
        title: "Sell All Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setSellAllLoading(false);
    }
  };

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className={`w-5 h-5 ${autoTradeEnabled ? 'text-cyber-primary animate-pulse' : 'text-gray-500'}`} />
            <h3 className="font-display font-bold text-white">Auto Trade</h3>
            {autoTradeEnabled && (
              <span className="px-2 py-0.5 bg-cyber-primary/20 text-cyber-primary text-[10px] font-mono rounded animate-pulse">
                ACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
              data-testid="button-autotrade-settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleToggleAutoTrade}
              disabled={isLoading || !walletAddress}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                autoTradeEnabled
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                  : 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50 hover:bg-cyber-primary/30'
              } ${(!walletAddress || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="button-toggle-autotrade"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : autoTradeEnabled ? (
                <>
                  <Power className="w-4 h-4" />
                  OFF
                </>
              ) : (
                <>
                  <Power className="w-4 h-4" />
                  ON
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10"
          >
            <div className="p-4 space-y-4">
              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-cyber-primary" />
                Buy Settings
              </div>
              
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Buy Amount (SOL)</label>
                <input
                  type="number"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(parseFloat(e.target.value) || 0.01)}
                  step="0.01"
                  min="0.001"
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyber-primary/50 focus:outline-none"
                  data-testid="input-autotrade-buy-amount"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Max Concurrent Positions</label>
                <input
                  type="number"
                  value={maxPositions}
                  onChange={(e) => setMaxPositions(parseInt(e.target.value) || 5)}
                  min="1"
                  max="20"
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyber-primary/50 focus:outline-none"
                  data-testid="input-autotrade-max-positions"
                />
              </div>

              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2 pt-2 border-t border-white/10">
                <Target className="w-4 h-4 text-green-400" />
                Sell Settings
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Sell Target Mode</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSellTargetMode('multiplier')}
                    className={`flex-1 py-2 text-xs font-mono rounded ${
                      sellTargetMode === 'multiplier'
                        ? 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50'
                        : 'bg-white/5 text-gray-400 border border-white/10'
                    }`}
                    data-testid="button-sell-mode-multiplier"
                  >
                    Multiplier (X)
                  </button>
                  <button
                    onClick={() => setSellTargetMode('mcap')}
                    className={`flex-1 py-2 text-xs font-mono rounded ${
                      sellTargetMode === 'mcap'
                        ? 'bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50'
                        : 'bg-white/5 text-gray-400 border border-white/10'
                    }`}
                    data-testid="button-sell-mode-mcap"
                  >
                    Target Mcap ($)
                  </button>
                </div>
              </div>

              {sellTargetMode === 'multiplier' ? (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Sell at X times entry mcap</label>
                  <div className="flex gap-2">
                    {[2, 3, 5, 10].map((m) => (
                      <button
                        key={m}
                        onClick={() => setSellMultiplier(m)}
                        className={`flex-1 py-2 text-xs font-mono rounded ${
                          sellMultiplier === m
                            ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                            : 'bg-white/5 text-gray-400 border border-white/10'
                        }`}
                        data-testid={`button-multiplier-${m}`}
                      >
                        {m}x
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={sellMultiplier}
                    onChange={(e) => setSellMultiplier(parseFloat(e.target.value) || 3)}
                    step="0.5"
                    min="1.1"
                    className="w-full mt-2 bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyber-primary/50 focus:outline-none"
                    placeholder="Custom multiplier..."
                    data-testid="input-autotrade-multiplier"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Example: Buy at $20K mcap → Sell at ${formatNumber(20000 * sellMultiplier)} mcap
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Target Market Cap (USD)</label>
                  <input
                    type="number"
                    value={sellTargetMcap}
                    onChange={(e) => setSellTargetMcap(parseFloat(e.target.value) || 60000)}
                    step="10000"
                    min="1000"
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyber-primary/50 focus:outline-none"
                    data-testid="input-autotrade-target-mcap"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Sell all positions when token reaches ${formatNumber(sellTargetMcap)} mcap
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
                  <TrendDownIcon className="w-3 h-3 text-red-400" />
                  Stop Loss (% from entry)
                </label>
                <div className="flex gap-2">
                  {[25, 50, 75].map((sl) => (
                    <button
                      key={sl}
                      onClick={() => setStopLossPercent(sl)}
                      className={`flex-1 py-2 text-xs font-mono rounded ${
                        stopLossPercent === sl
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                          : 'bg-white/5 text-gray-400 border border-white/10'
                      }`}
                      data-testid={`button-stoploss-${sl}`}
                    >
                      -{sl}%
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(parseFloat(e.target.value) || 50)}
                  min="10"
                  max="99"
                  className="w-full mt-2 bg-black/40 border border-white/10 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyber-primary/50 focus:outline-none"
                  placeholder="Custom stop loss..."
                  data-testid="input-autotrade-stoploss"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={isLoading}
                  className="flex-1 py-2 bg-cyber-primary/20 text-cyber-primary border border-cyber-primary/50 rounded font-bold text-sm hover:bg-cyber-primary/30 transition-all disabled:opacity-50"
                  data-testid="button-save-autotrade-settings"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Settings'}
                </button>
                {autoTradeEnabled && (
                  <button
                    onClick={handleForceStop}
                    disabled={isLoading}
                    className="py-2 px-4 bg-red-500/20 text-red-400 border border-red-500/50 rounded font-bold text-sm hover:bg-red-500/30 transition-all disabled:opacity-50"
                    data-testid="button-force-stop"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Positions */}
      {positions.length > 0 && (
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-400 font-mono">Active Auto-Trade Positions ({positions.length})</div>
            <button
              onClick={onSellAllPositions}
              disabled={sellAllLoading}
              className="py-1 px-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded text-xs font-bold hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center gap-1"
              data-testid="button-sell-all-positions"
            >
              {sellAllLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Selling All...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3" />
                  Sell All (60%)
                </>
              )}
            </button>
          </div>
          <div className="space-y-2">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="p-2 bg-white/5 rounded-lg border border-white/10"
                data-testid={`autotrade-position-${pos.tokenSymbol}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{pos.tokenSymbol}</span>
                  <span className="text-xs text-cyber-primary font-mono">
                    Target: ${formatNumber(pos.targetMarketCap)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                  <span>Entry: ${formatNumber(pos.entryMarketCap)}</span>
                  <span className="text-red-400">Stop: ${formatNumber(pos.stopLossMarketCap)}</span>
                </div>
                {/* Instant Sell Button - Emergency sell with high slippage */}
                <button
                  onClick={() => handleInstantSell(pos.id, pos.tokenSymbol)}
                  disabled={instantSellLoading === pos.id}
                  className="w-full mt-2 py-1.5 px-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded text-xs font-bold hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  data-testid={`button-instant-sell-${pos.id}`}
                >
                  {instantSellLoading === pos.id ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" />
                      Instant Sell (60% slippage)
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events */}
      <div className="max-h-[200px] overflow-y-auto no-scrollbar">
        {events.length === 0 ? (
          <div className="p-6 text-center text-gray-500 font-mono text-xs">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {autoTradeEnabled ? 'Waiting for tokens matching filters...' : 'Enable auto-trade to start'}
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="p-3 border-b border-white/5 hover:bg-white/5 transition-all"
              data-testid={`autotrade-event-${event.id}`}
            >
              <div className="flex items-center gap-2">
                {event.type === 'buy_success' && <CheckCircle className="w-4 h-4 text-green-400" />}
                {event.type === 'buy_attempt' && <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />}
                {event.type === 'buy_failed' && <XCircle className="w-4 h-4 text-red-400" />}
                {event.type === 'sell_success' && <CheckCircle className="w-4 h-4 text-cyber-primary" />}
                {event.type === 'sell_attempt' && <Target className="w-4 h-4 text-yellow-400" />}
                {event.type === 'stop_loss' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                {event.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                <span className="text-sm text-white truncate">{event.message}</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1 font-mono">
                {event.tokenSymbol && <span className="mr-2">{event.tokenSymbol}</span>}
                {timeAgo(event.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>

      {!walletAddress && (
        <div className="p-4 bg-yellow-500/10 border-t border-yellow-500/20">
          <div className="flex items-center gap-2 text-xs text-yellow-300">
            <AlertTriangle className="w-4 h-4" />
            Connect wallet to enable auto-trade
          </div>
        </div>
      )}
    </div>
  );
}

function OrderHistory({ orders }: { orders: Order[] }) {
  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-white/10">
        <h3 className="font-display font-bold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Recent Orders
        </h3>
      </div>
      
      <div className="max-h-[300px] overflow-y-auto no-scrollbar">
        {orders.length === 0 ? (
          <div className="p-6 text-center text-gray-500 font-mono text-sm">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            No orders yet
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="p-3 border-b border-white/5 hover:bg-white/5 transition-all" data-testid={`order-${order.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {order.status === 'confirmed' && <CheckCircle className="w-4 h-4 text-green-400" />}
                  {order.status === 'pending' && <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />}
                  {order.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                  <span className={`font-mono text-sm uppercase ${order.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                    {order.type}
                  </span>
                  <span className="font-bold text-white">{order.tokenSymbol}</span>
                </div>
                <span className="text-xs text-gray-500 font-mono">{timeAgo(order.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-xs font-mono text-gray-400">
                <span>{order.type === 'buy' ? `${order.amount} SOL` : `${order.amount.toLocaleString()} tokens`} @ {formatPrice(order.price)}</span>
                {order.txSignature && (
                  <button className="flex items-center gap-1 text-cyber-primary hover:underline">
                    <ExternalLink className="w-3 h-3" />
                    {order.txSignature.slice(0, 8)}...
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TradingTerminal() {
  const { walletInfo, refreshBalance } = useSolana();
  const { signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();
  const { isConnected: wsConnected, lastMessage } = useWebSocket();
  const { isAuthenticated, logout } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<{ tokensScanned: number; activePositions: number; totalVolume24h: number; networkStatus: string } | null>(null);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<string>('');
  const [filtersVersion, setFiltersVersion] = useState(0);

  const handleFiltersChange = useCallback((filters: TokenFilter) => {
    setFiltersVersion(v => v + 1);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const ordersUrl = walletInfo?.address 
          ? `/api/orders?wallet=${encodeURIComponent(walletInfo.address)}`
          : '/api/orders';
        
        const tokensUrl = walletInfo?.address
          ? `/api/tokens?wallet=${encodeURIComponent(walletInfo.address)}`
          : '/api/tokens';
        
        const [tokensRes, ordersRes, statsRes] = await Promise.all([
          fetch(tokensUrl),
          fetch(ordersUrl),
          fetch('/api/stats')
        ]);
        
        if (tokensRes.ok) setTokens(await tokensRes.json());
        if (ordersRes.ok) setOrders(await ordersRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Reduced from 5s to 60s to save API quota
    return () => clearInterval(interval);
  }, [walletInfo?.address, filtersVersion]);

  const [positions, setPositions] = useState<Position[]>([]);

  // Always use hardcoded wallet for displaying portfolio/positions to all visitors
  const DISPLAY_WALLET = 'F49kEd3Lpr21EdCMJRU5bhEaNiSxTnLqsLhD9MYfdhHQ';

  const fetchPositions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const url = forceRefresh 
        ? `/api/positions/${encodeURIComponent(DISPLAY_WALLET)}/refresh`
        : `/api/positions/${encodeURIComponent(DISPLAY_WALLET)}`;
      const options = forceRefresh ? { method: 'POST' } : {};
      const res = await fetch(url, options);
      if (res.ok) {
        const data = await res.json();
        console.log('[Positions] Fetched:', data.length, 'positions for display wallet', forceRefresh ? '(forced refresh)' : '');
        setPositions(data);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  }, []);

  useEffect(() => {
    // Always fetch positions for the hardcoded display wallet
    fetchPositions();
    const interval = setInterval(fetchPositions, 180000); // Reduced from 15s to 3 min to save RPC quota
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const handleTrade = useCallback(async (type: 'buy' | 'sell', amount: number, sellPercent?: number, slippageBps?: number) => {
    if (!selectedToken || !walletInfo || !signTransaction) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to trade",
        variant: "destructive",
      });
      return;
    }
    
    let tokenAmount: number | undefined;
    if (type === 'sell' && sellPercent) {
      const position = positions.find(p => p.tokenMint === selectedToken.mint);
      if (!position || position.balance <= 0) {
        toast({
          title: "No tokens to sell",
          description: `You don't have any ${selectedToken.symbol} to sell`,
          variant: "destructive",
        });
        return;
      }
      tokenAmount = position.balance * (sellPercent / 100);
    }
    
    setIsTrading(true);
    setTradeStatus('Getting quote...');
    
    try {
      const tradeResponse = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletInfo.address,
          tokenMint: selectedToken.mint,
          tokenSymbol: selectedToken.symbol,
          type,
          amountSol: type === 'buy' ? amount : undefined,
          amountTokens: type === 'sell' ? tokenAmount : undefined,
          sellPercent: type === 'sell' ? sellPercent : undefined,
          slippageBps: slippageBps || 1000, // Default to 10% (1000 bps) if not provided
          useMevProtection: true,
        }),
      });
      
      const tradeResult = await tradeResponse.json();
      
      if (!tradeResponse.ok) {
        throw new Error(tradeResult.error || 'Trade failed');
      }
      
      if (tradeResult.requiresSignature && tradeResult.swapTransaction) {
        setTradeStatus('Signing transaction...');
        
        const txBuffer = Buffer.from(tradeResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);
        
        const signedTx = await signTransaction(transaction);
        const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
        
        setTradeStatus('Submitting transaction...');
        
        const submitResponse = await fetch('/api/trade/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: tradeResult.orderId,
            signedTransaction: serializedTx,
            useMevProtection: true,
          }),
        });
        
        const submitResult = await submitResponse.json();
        
        if (submitResult.success) {
          toast({
            title: "Trade Successful!",
            description: `${type.toUpperCase()} order confirmed. TX: ${submitResult.txSignature?.slice(0, 8)}...`,
          });
          refreshBalance();
          
          setTimeout(() => {
            fetchPositions();
          }, 3000);
        } else {
          throw new Error(submitResult.error || 'Transaction failed');
        }
      }
      
      const ordersRes = await fetch(`/api/orders?wallet=${encodeURIComponent(walletInfo.address)}`);
      if (ordersRes.ok) {
        setOrders(await ordersRes.json());
      }
      
    } catch (error: any) {
      console.error('Trade failed:', error);
      toast({
        title: "Trade Failed",
        description: error.message || 'Unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
      setTradeStatus('');
    }
  }, [selectedToken, walletInfo, signTransaction, toast, refreshBalance, fetchPositions, positions]);

  return (
    <div className="min-h-screen bg-[#030303]">
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 group" data-testid="link-home">
              <img 
                src={counterLogo} 
                alt="Counter" 
                className="w-9 h-9 transition-transform group-hover:scale-110"
                data-testid="img-logo-terminal"
              />
              <span className="font-display font-bold text-xl tracking-tight text-white group-hover:text-cyber-primary transition-colors">counter</span>
            </a>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-xs font-mono text-gray-400">{wsConnected ? 'Live' : 'Connecting...'}</span>
              </div>
              
              {isAuthenticated ? (
                <>
                  {walletInfo && (
                    <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-sm font-mono text-gray-300">{walletInfo.balance.toFixed(4)} SOL</span>
                    </div>
                  )}
                  <WalletMultiButton />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    className="text-gray-400 hover:text-white hover:bg-white/10"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setShowLoginModal(true)}
                  className="bg-cyber-primary text-black hover:bg-cyber-primary/90 font-bold"
                  data-testid="button-login"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Unlock Trading
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="pt-24 pb-8 px-4">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="text-xs text-gray-500 font-mono mb-1">Network Status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
                <span className="text-white font-bold">{stats?.networkStatus || 'Mainnet'}</span>
              </div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="text-xs text-gray-500 font-mono mb-1">Tokens Scanned</div>
              <div className="text-white font-bold text-xl">{stats?.tokensScanned || tokens.length}</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="text-xs text-gray-500 font-mono mb-1">Active Positions</div>
              <div className="text-white font-bold text-xl">{positions.length}</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="text-xs text-gray-500 font-mono mb-1">24h Volume</div>
              <div className="text-cyber-primary font-bold text-xl">${formatNumber(stats?.totalVolume24h || 1200000)}</div>
            </div>
          </div>
          
          <div className="mb-6">
            <PortfolioPnLChart 
              positions={positions} 
              onRefresh={() => fetchPositions(true)} 
              onPositionSelect={(position) => {
                const token: Token = {
                  mint: position.tokenMint,
                  name: position.tokenName,
                  symbol: position.tokenSymbol,
                  price: position.currentPrice,
                  priceChange24h: 0,
                  marketCap: 0,
                  volume24h: 0,
                  liquidity: 0,
                  holders: 0,
                  source: 'pumpfun',
                  bondingCurveProgress: 0,
                  isNew: false,
                  createdAt: Date.now(),
                  pumpfunUrl: position.pumpfunUrl
                };
                setSelectedToken(token);
              }}
            />
          </div>
          
          {/* Protected Trading Section - Blurred for non-authenticated users */}
          <div className="relative">
            {!isAuthenticated && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
                <div className="text-center p-8">
                  <Lock className="w-16 h-16 text-cyber-primary mx-auto mb-4 opacity-80" />
                  <h3 className="text-xl font-bold text-white mb-2">Trading Locked</h3>
                  <p className="text-gray-400 mb-6">Enter password to unlock trading features</p>
                  <Button
                    onClick={() => setShowLoginModal(true)}
                    className="bg-cyber-primary text-black hover:bg-cyber-primary/90 font-bold px-8"
                    data-testid="button-unlock-trading"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Unlock Trading
                  </Button>
                </div>
              </div>
            )}
            
            <div className={!isAuthenticated ? 'blur-md pointer-events-none select-none' : ''}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <TokenFilters 
                  walletAddress={walletInfo?.address || null} 
                  onFiltersChange={handleFiltersChange}
                />
                <AutoTradePanel 
                  walletAddress={walletInfo?.address || null}
                  signTransaction={signTransaction}
                />
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 h-[500px]">
                  <TokenScanner tokens={tokens} onSelectToken={setSelectedToken} isConnected={wsConnected} />
                </div>
                
                <div className="lg:col-span-4">
                  <OrderPanel selectedToken={selectedToken} onTrade={handleTrade} isPending={isTrading} tradeStatus={tradeStatus} positions={positions} />
                </div>
                
                <div className="lg:col-span-3">
                  <OrderHistory orders={orders} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <LoginModal open={showLoginModal} onOpenChange={setShowLoginModal} />
    </div>
  );
}

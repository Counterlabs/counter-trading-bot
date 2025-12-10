import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Filter, 
  Settings2, 
  ChevronDown, 
  ChevronUp,
  Twitter,
  Globe,
  MessageCircle,
  Users,
  Droplets,
  TrendingUp,
  Clock,
  Ban,
  Check,
  Shield,
  RotateCcw
} from "lucide-react";
import { type TokenFilter } from "@shared/schema";

interface TokenFiltersProps {
  walletAddress: string | null;
  onFiltersChange?: (filters: TokenFilter) => void;
}

export function TokenFilters({ walletAddress, onFiltersChange }: TokenFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<TokenFilter>>({});

  const { data: filters } = useQuery<TokenFilter>({
    queryKey: ['/api/filters', walletAddress],
    enabled: !!walletAddress,
  });

  const updateFiltersMutation = useMutation({
    mutationFn: async (updates: Partial<TokenFilter>) => {
      if (!walletAddress) return null;
      const response = await apiRequest('PATCH', `/api/filters/${walletAddress}`, updates);
      return response.json();
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['/api/filters', walletAddress] });
        onFiltersChange?.(data);
      }
    },
  });

  const resetFiltersMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) return null;
      const response = await apiRequest('POST', `/api/filters/${walletAddress}/reset`, {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['/api/filters', walletAddress] });
        setLocalFilters({});
        onFiltersChange?.(data);
      }
    },
  });

  useEffect(() => {
    if (filters) {
      setLocalFilters(filters);
    }
  }, [filters]);

  const handleFilterChange = (key: keyof TokenFilter, value: any) => {
    if (!walletAddress) return;
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    updateFiltersMutation.mutate({ [key]: value });
  };

  const defaultFilters: Partial<TokenFilter> = {
    enabled: false,
    minLiquidity: 0,
    minBondingCurve: 0,
    maxBondingCurve: 100,
    minAge: 0,
    requireTwitter: false,
    requireTelegram: false,
    requireWebsite: false,
    excludeDevSold: false,
  };
  
  const currentFilters = { ...defaultFilters, ...(filters || {}), ...localFilters } as TokenFilter;

  if (!walletAddress) {
    return (
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Filter className="w-4 h-4" />
          <span className="text-sm">Connect wallet to configure filters</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
        data-testid="button-toggle-filters"
      >
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-cyber-primary" />
          <span className="font-display font-bold text-white">Token Filters</span>
          {currentFilters?.enabled && (
            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
              <Check className="w-3 h-3 mr-1" />
              Active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && (
            <span className="text-xs text-gray-500 font-mono">
              {getActiveFilterCount(currentFilters)} filters active
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-white/10 p-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-white">Enable Filters</Label>
              <span className="text-xs text-gray-500">(off = show all tokens)</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resetFiltersMutation.mutate()}
                className="text-xs text-gray-400 hover:text-white"
                disabled={resetFiltersMutation.isPending}
                data-testid="button-reset-filters"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset
              </Button>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={currentFilters?.enabled ? "ghost" : "default"}
                  onClick={() => handleFilterChange('enabled', false)}
                  className={`px-3 py-1 text-xs font-bold ${!currentFilters?.enabled ? 'bg-red-500 hover:bg-red-600 text-white' : 'text-gray-400'}`}
                  data-testid="button-filters-off"
                >
                  OFF
                </Button>
                <Button
                  size="sm"
                  variant={currentFilters?.enabled ? "default" : "ghost"}
                  onClick={() => handleFilterChange('enabled', true)}
                  className={`px-3 py-1 text-xs font-bold ${currentFilters?.enabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'text-gray-400'}`}
                  data-testid="button-filters-on"
                >
                  ON
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <FilterSection title="Liquidity" icon={<Droplets className="w-4 h-4" />}>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Min Liquidity (SOL)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={currentFilters?.minLiquidity ?? ''}
                  onChange={(e) => handleFilterChange('minLiquidity', e.target.value ? Number(e.target.value) : 0)}
                  className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                  data-testid="input-min-liquidity"
                />
              </div>
            </FilterSection>

            <FilterSection title="Market Cap" icon={<TrendingUp className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Min ($)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={currentFilters?.minMarketCap ?? ''}
                    onChange={(e) => handleFilterChange('minMarketCap', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-min-marketcap"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Max ($)</Label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={currentFilters?.maxMarketCap ?? ''}
                    onChange={(e) => handleFilterChange('maxMarketCap', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-max-marketcap"
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Bonding Curve" icon={<TrendingUp className="w-4 h-4" />}>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Progress Range</span>
                  <span className="font-mono text-cyber-primary">
                    {currentFilters?.minBondingCurve ?? 0}% - {currentFilters?.maxBondingCurve ?? 100}%
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={currentFilters?.minBondingCurve ?? ''}
                    onChange={(e) => handleFilterChange('minBondingCurve', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8 w-20"
                    data-testid="input-min-bonding"
                  />
                  <span className="text-gray-500">to</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="100"
                    value={currentFilters?.maxBondingCurve ?? ''}
                    onChange={(e) => handleFilterChange('maxBondingCurve', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8 w-20"
                    data-testid="input-max-bonding"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Token Age" icon={<Clock className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Min (minutes)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={currentFilters?.minAge ?? ''}
                    onChange={(e) => handleFilterChange('minAge', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-min-age"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Max (minutes)</Label>
                  <Input
                    type="number"
                    placeholder="No limit"
                    value={currentFilters?.maxAge ?? ''}
                    onChange={(e) => handleFilterChange('maxAge', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-max-age"
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Holders" icon={<Users className="w-4 h-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Min Holders</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={currentFilters?.minHolders ?? ''}
                    onChange={(e) => handleFilterChange('minHolders', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-min-holders"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Max Top 10 %</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={currentFilters?.maxTopHolderPercent ?? ''}
                    onChange={(e) => handleFilterChange('maxTopHolderPercent', e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-max-top-holder"
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Volume" icon={<TrendingUp className="w-4 h-4" />}>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Min 24h Volume (USD)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={currentFilters?.minVolume24h ?? ''}
                  onChange={(e) => handleFilterChange('minVolume24h', e.target.value ? Number(e.target.value) : undefined)}
                  className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                  data-testid="input-min-volume"
                />
              </div>
            </FilterSection>

            <FilterSection title="Social Requirements" icon={<Globe className="w-4 h-4" />}>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="require-twitter"
                    checked={currentFilters?.requireTwitter ?? false}
                    onCheckedChange={(checked) => handleFilterChange('requireTwitter', checked === true)}
                    className="border-blue-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                    data-testid="checkbox-require-twitter"
                  />
                  <label htmlFor="require-twitter" className="flex items-center gap-2 cursor-pointer">
                    <Twitter className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white">Require Twitter</span>
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="require-telegram"
                    checked={currentFilters?.requireTelegram ?? false}
                    onCheckedChange={(checked) => handleFilterChange('requireTelegram', checked === true)}
                    className="border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    data-testid="checkbox-require-telegram"
                  />
                  <label htmlFor="require-telegram" className="flex items-center gap-2 cursor-pointer">
                    <MessageCircle className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-white">Require Telegram</span>
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="require-website"
                    checked={currentFilters?.requireWebsite ?? false}
                    onCheckedChange={(checked) => handleFilterChange('requireWebsite', checked === true)}
                    className="border-green-400 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                    data-testid="checkbox-require-website"
                  />
                  <label htmlFor="require-website" className="flex items-center gap-2 cursor-pointer">
                    <Globe className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-white">Require Website</span>
                  </label>
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Safety" icon={<Shield className="w-4 h-4" />}>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="exclude-dev-sold"
                  checked={currentFilters?.excludeDevSold ?? false}
                  onCheckedChange={(checked) => handleFilterChange('excludeDevSold', checked === true)}
                  className="border-red-400 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                  data-testid="checkbox-exclude-dev-sold"
                />
                <label htmlFor="exclude-dev-sold" className="flex items-center gap-2 cursor-pointer">
                  <Ban className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-white">Exclude if Dev Sold</span>
                </label>
              </div>
            </FilterSection>

            <FilterSection title="Name/Symbol Filter" icon={<Settings2 className="w-4 h-4" />}>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Name Contains</Label>
                  <Input
                    placeholder="e.g., moon, pepe"
                    value={currentFilters?.nameContains ?? ''}
                    onChange={(e) => handleFilterChange('nameContains', e.target.value || undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-name-contains"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Symbol Contains</Label>
                  <Input
                    placeholder="e.g., AI, MEME"
                    value={currentFilters?.symbolContains ?? ''}
                    onChange={(e) => handleFilterChange('symbolContains', e.target.value || undefined)}
                    className="bg-black/40 border-white/10 text-white font-mono text-sm h-8"
                    data-testid="input-symbol-contains"
                  />
                </div>
              </div>
            </FilterSection>
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-gray-500 text-center">
              Filters apply to all scanned tokens. Only matching tokens will be shown.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        {icon}
        <span>{title}</span>
      </div>
      <div className="pl-6">
        {children}
      </div>
    </div>
  );
}

function getActiveFilterCount(filters: TokenFilter | undefined): number {
  if (!filters || !filters.enabled) return 0;
  
  let count = 0;
  if (filters.minLiquidity && filters.minLiquidity > 0) count++;
  if (filters.minMarketCap) count++;
  if (filters.maxMarketCap) count++;
  if (filters.minBondingCurve && filters.minBondingCurve > 0) count++;
  if (filters.maxBondingCurve && filters.maxBondingCurve < 100) count++;
  if (filters.minAge && filters.minAge > 0) count++;
  if (filters.maxAge) count++;
  if (filters.minHolders && filters.minHolders > 0) count++;
  if (filters.maxTopHolderPercent && filters.maxTopHolderPercent < 100) count++;
  if (filters.minVolume24h && filters.minVolume24h > 0) count++;
  if (filters.requireTwitter) count++;
  if (filters.requireTelegram) count++;
  if (filters.requireWebsite) count++;
  if (filters.excludeDevSold) count++;
  if (filters.nameContains) count++;
  if (filters.symbolContains) count++;
  
  return count;
}

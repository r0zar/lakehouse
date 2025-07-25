'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Treemap, ResponsiveContainer, Cell, Tooltip } from 'recharts'

interface TokenActivity {
  tx_hash: string
  user_address: string
  user_display: string
  block_time: string | { value: string }
  success: boolean
  token_bought: number
  token_sold: number
  other_token_bought: number
  other_token_sold: number
  other_token: string
  router_name: string
  swap_description: string
  // Formatted fields from API
  atomic_token_bought?: string
  atomic_token_sold?: string
  atomic_other_token_bought?: string
  atomic_other_token_sold?: string
  formatted_token_bought?: number
  formatted_token_sold?: number
  formatted_other_token_bought?: number
  formatted_other_token_sold?: number
  formatted_swap_description?: string
  // Token metadata
  token_metadata?: {
    contract_address?: string
    token_symbol?: string
    token_uri?: string
    image_url?: string
    description?: string
    total_supply?: string
    validation_status?: string
  }
  other_token_metadata?: {
    contract_address?: string
    token_symbol?: string
    token_uri?: string
    image_url?: string
    description?: string
    total_supply?: string
    validation_status?: string
  }
}

interface TokenActivityResponse {
  data: TokenActivity[]
  summary: {
    token_name: string
    total_swaps_buying: number
    total_swaps_selling: number
    total_swaps: number
    total_bought: number
    total_sold: number
    // Formatted fields from API
    atomic_total_bought?: string
    atomic_total_sold?: string
    formatted_total_bought?: number
    formatted_total_sold?: number
    display_total_bought?: string
    display_total_sold?: string
  }
  pagination: {
    limit: number
    offset: number
    count: number
  }
  timestamp: string
}

// We'll load token metadata dynamically from the API
interface TokenInfo {
  symbol: string
  name: string
  color: string
  image: string
  image_url?: string
  metadata?: {
    contract_address?: string
    token_symbol?: string
    token_name?: string
    decimals?: number
    validation_status?: string
    token_uri?: string
    image_url?: string
    description?: string
    total_supply?: string
    token_type?: string
  }
}

const PopularTokens: TokenInfo[] = [
  { symbol: 'STX', name: 'Stacks', color: 'bg-orange-500', image: 'https://charisma.rocks/stx-logo.png' },
  { symbol: 'aeUSDC', name: 'USDC', color: 'bg-blue-500', image: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
  { symbol: 'sbtc-token', name: 'sBTC', color: 'bg-yellow-500', image: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png' },
  { symbol: 'usdh', name: 'USDH', color: 'bg-green-500', image: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' },
  { symbol: 'ststx', name: 'stSTX', color: 'bg-purple-500', image: 'https://charisma.rocks/stx-logo.png' },
  { symbol: 'usda', name: 'USDA', color: 'bg-red-500', image: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' }
];

function TokenButton({ token, isSelected, onClick }: {
  token: TokenInfo,
  isSelected: boolean,
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${isSelected
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg scale-105'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 hover:shadow-md'
        }`}
    >
      {/* Token Image/Icon */}
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold ${!token.image_url && token.color}`}>
        {(token.metadata?.image_url || token.image) ? (
          <img
            src={token.metadata?.image_url || token.image}
            alt={token.metadata?.token_name || token.name}
            className="w-12 h-12 rounded-lg object-cover"
            onError={(e) => e.currentTarget.style.display = 'none'}
          />
        ) : (
          <span className="text-lg">{(token.metadata?.token_symbol || token.symbol).substring(0, 2)}</span>
        )}
      </div>

      {/* Token Info */}
      <div className="text-left">
        <div className="font-bold text-gray-900 dark:text-white">{token.metadata?.token_symbol || token.symbol}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{token.metadata?.token_name || token.name}</div>
        {token.metadata?.validation_status && (
          <div className={`text-xs mt-1 ${token.metadata.validation_status === 'completed' ? 'text-green-600' :
            token.metadata.validation_status === 'pending' ? 'text-yellow-600' : 'text-red-600'
            }`}>
            {token.metadata.validation_status === 'completed' ? '✓ Verified' :
              token.metadata.validation_status === 'pending' ? '⏳ Pending' : '⚠ Unverified'}
          </div>
        )}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

// Simple Custom Treemap Content that preserves colors and adds click
function SimpleTreemapContent(props: any) {
  const { root, depth, x, y, width, height, payload } = props;

  if (!payload || depth !== 1) return null;

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={payload.fill}
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
      onClick={() => {
        if (payload.tx_hash) {
          window.open(`https://explorer.hiro.so/txid/${payload.tx_hash}?chain=mainnet`, '_blank');
        }
      }}
    />
  );
}

// Custom Tooltip Component for Treemap
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr;
    const date = new Date(time as string);
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAmount = (amount: any) => {
    if (typeof amount === 'number') {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return amount?.toString() || '0';
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 text-sm">
      <div className={`font-bold mb-2 ${data.isBuying ? 'text-green-600' : 'text-red-600'}`}>
        {data.isBuying ? '🟢 BOUGHT' : '🔴 SOLD'}
      </div>
      <div className="space-y-1">
        <div><strong>{formatAmount(data.primaryAmount)} {data.primaryToken}</strong></div>
        <div className="text-gray-600 dark:text-gray-400">
          {data.isBuying ? 'by spending' : 'and got'} {formatAmount(data.secondaryAmount)} {data.secondaryToken}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{data.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{formatTime(data.time)}</div>
      </div>
    </div>
  );
}

function TradeCard({ activity, tokenName, tokenMetadata }: {
  activity: TokenActivity,
  tokenName: string,
  tokenMetadata: Map<string, any>
}) {
  const isBuying = activity.token_bought > 0;
  const isSelling = activity.token_sold > 0;

  // Get token metadata for proper formatting with better lookup
  const findTokenMetadata = (tokenSymbol: string) => {
    // Try direct lookup first
    let metadata = tokenMetadata.get(tokenSymbol);
    if (metadata) return metadata;

    // Try all entries to find by token_symbol
    for (const [key, value] of tokenMetadata.entries()) {
      if (value.token_symbol === tokenSymbol ||
        value.token_name === tokenSymbol ||
        key.includes(tokenSymbol)) {
        return value;
      }
    }

    // Special case for STX
    if (tokenSymbol === 'STX') {
      return {
        token_symbol: 'STX',
        token_name: 'Stacks',
        decimals: 6,
        validation_status: 'completed'
      };
    }

    return null;
  };

  const primaryTokenMeta = findTokenMetadata(tokenName);
  const secondaryTokenMeta = findTokenMetadata(activity.other_token);

  // Function to get token image with fallbacks
  const getTokenImage = (tokenSymbol: string, metadata: any) => {
    if (metadata?.image_url) return metadata.image_url;

    // Fallback images for common tokens
    const tokenImages: { [key: string]: string } = {
      'STX': 'https://charisma.rocks/stx-logo.png',
      'aeUSDC': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      'USDC': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      'sbtc-token': 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
      'sBTC': 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
      'usdh': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      'USDH': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      'ststx': 'https://charisma.rocks/stx-logo.png',
      'stSTX': 'https://charisma.rocks/stx-logo.png',
      'usda': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
      'USDA': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
    };

    return tokenImages[tokenSymbol] || null;
  };


  // Determine primary action and amounts - use API formatted amounts if available
  const primaryAction = isBuying ? 'BOUGHT' : 'SOLD';

  // Use pre-formatted amounts from API first, fallback to raw amounts only if needed
  let primaryAmount = isBuying ?
    (activity.formatted_token_bought ?? activity.token_bought) :
    (activity.formatted_token_sold ?? activity.token_sold);

  let secondaryAmount = isBuying ?
    (activity.formatted_other_token_sold ?? activity.other_token_sold) :
    (activity.formatted_other_token_bought ?? activity.other_token_bought);

  // Trust the API formatting - use formatted amounts when available, raw amounts otherwise

  // Use proper token symbols from metadata
  const primaryTokenSymbol = primaryTokenMeta?.token_symbol || tokenName;
  const secondaryTokenSymbol = secondaryTokenMeta?.token_symbol || activity.other_token;

  const formatTime = (timeStr: string | { value: string }) => {
    const time = typeof timeStr === 'object' && timeStr?.value ? timeStr.value : timeStr;
    const date = new Date(time as string);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-white dark:bg-gray-800 rounded-lg p-4 border-l-4 ${isBuying
        ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10'
        : 'border-red-500 bg-red-50/50 dark:bg-red-900/10'
        } shadow hover:shadow-md transition-all duration-200`}
    >
      {/* Action Badge */}
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mb-3 ${isBuying ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        }`}>
        {isBuying ? (
          <><svg className="h-3 w-3 mr-1 inline" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>BOUGHT</>
        ) : (
          <><svg className="h-3 w-3 mr-1 inline" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
          </svg>SOLD</>
        )}
      </div>

      {/* Main Content */}
      <div>
        {/* Primary Amount */}
        <div className="mb-3">
          <div className={`text-xl font-bold mb-1 flex items-center ${isBuying ? 'text-green-600' : 'text-red-600'
            }`}>
            {/* Token Image */}
            {getTokenImage(primaryTokenSymbol, primaryTokenMeta) && (
              <img
                src={getTokenImage(primaryTokenSymbol, primaryTokenMeta)}
                alt={primaryTokenSymbol}
                className="w-6 h-6 rounded-full mr-2"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
            )}
            {typeof primaryAmount === 'number' ?
              primaryAmount.toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 0 }) :
              primaryAmount
            } {primaryTokenSymbol}
          </div>
        </div>

        {/* Trade Arrow and Secondary Amount */}
        <div className="mb-3">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm">
            {isBuying ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
              </svg>
            )}
            <span>{isBuying ? 'by spending' : 'and got'}</span>
            <span className="font-medium text-gray-900 dark:text-white flex items-center">
              {/* Token Image */}
              {getTokenImage(secondaryTokenSymbol, secondaryTokenMeta) && (
                <img
                  src={getTokenImage(secondaryTokenSymbol, secondaryTokenMeta)}
                  alt={secondaryTokenSymbol}
                  className="w-4 h-4 rounded-full mr-1"
                  onError={(e) => e.currentTarget.style.display = 'none'}
                />
              )}
              {typeof secondaryAmount === 'number' ?
                secondaryAmount.toLocaleString(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 0 }) :
                secondaryAmount
              } {secondaryTokenSymbol}
            </span>
          </div>
        </div>

        {/* User and Time */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                {activity.user_display.substring(0, 2)}
              </span>
            </div>
            <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
              {activity.user_display}
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(activity.block_time)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function TokenBuyersAndSellersPage() {
  const [data, setData] = useState<TokenActivityResponse | null>(null);
  const [allTrades, setAllTrades] = useState<TokenActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState('STX');
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, any>>(new Map());
  const [offset, setOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'cards' | 'treemap'>('cards');
  const limit = 20; // Smaller batches for smoother loading

  const fetchData = async (isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setOffset(0);
        setAllTrades([]);
        setHasMoreData(true);
      }

      const currentOffset = isLoadMore ? offset : 0;
      const params = new URLSearchParams({
        token: selectedToken,
        limit: limit.toString(),
        offset: currentOffset.toString()
      });

      const response = await fetch(`/api/analytics/token-activity?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Check if we got less data than requested - means no more data available
      const newTrades = result.data || [];
      if (newTrades.length < limit) {
        setHasMoreData(false);
      }

      // Extract token metadata from API response (only on initial load)
      if (!isLoadMore && result.token_metadata) {
        const metadataMap = new Map();

        // Add STX metadata first
        metadataMap.set('STX', {
          contract_address: 'STX',
          token_symbol: 'STX',
          token_name: 'Stacks',
          decimals: 6,
          validation_status: 'completed',
          image_url: 'https://charisma.rocks/stx-logo.png'
        });

        result.token_metadata.forEach((token: any) => {
          // Create multiple lookup keys for better matching
          if (token.token_symbol) {
            metadataMap.set(token.token_symbol, token);
          }
          if (token.contract_address) {
            metadataMap.set(token.contract_address, token);
          }
          if (token.token_name) {
            metadataMap.set(token.token_name, token);
          }
          // Use the API key as a fallback
          if (token.key) {
            metadataMap.set(token.key, token);
          }

          // Special handling for common token variations
          if (token.token_symbol === 'aeUSDC') {
            metadataMap.set('USDC', token);
          }
          if (token.token_symbol === 'sbtc-token') {
            metadataMap.set('sBTC', token);
          }
          if (token.token_symbol === 'ststx') {
            metadataMap.set('stSTX', token);
          }
        });

        setTokenMetadata(metadataMap);

        // Update PopularTokens with metadata
        PopularTokens.forEach(token => {
          // Try multiple lookup strategies
          let metadata = metadataMap.get(token.symbol);
          if (!metadata) {
            // Try by contract address or alternative symbol matching
            for (const [key, value] of metadataMap.entries()) {
              if (value.token_symbol === token.symbol ||
                value.token_name?.toLowerCase().includes(token.name.toLowerCase()) ||
                key.includes(token.symbol.toLowerCase())) {
                metadata = value;
                break;
              }
            }
          }
          if (metadata) {
            token.metadata = metadata;
            // Use metadata image if available
            if (metadata.image_url && !token.image) {
              token.image = metadata.image_url;
            }
          }
        });
      }

      if (isLoadMore) {
        // Append new trades to existing ones
        setAllTrades(prev => [...prev, ...newTrades]);
        setOffset(prev => prev + limit);
      } else {
        // Initial load - replace all trades
        setAllTrades(newTrades);
        setOffset(limit);
        setData(result);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      if (isLoadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Infinite scroll hook
  useEffect(() => {
    const handleScroll = () => {
      if (loadingMore || !hasMoreData) return;

      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      // Trigger when user is 200px from bottom
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        fetchData(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingMore, hasMoreData, selectedToken, offset]);

  useEffect(() => {
    fetchData(false);
  }, [selectedToken]);

  // Process data for treemap visualization
  const processTreemapData = () => {
    if (!allTrades.length) return [];

    // Group trades by user and token pair
    const userTradeMap = new Map();

    allTrades.forEach((trade, index) => {
      const isBuying = trade.token_bought > 0;
      const primaryAmount = isBuying ?
        (trade.formatted_token_bought ?? trade.token_bought) :
        (trade.formatted_token_sold ?? trade.token_sold);

      const secondaryAmount = isBuying ?
        (trade.formatted_other_token_sold ?? trade.other_token_sold) :
        (trade.formatted_other_token_bought ?? trade.other_token_bought);

      const primaryToken = data?.summary.token_name || selectedToken;
      const secondaryToken = trade.other_token;

      // Use transaction hash as unique key to prevent duplicates
      const tradeKey = trade.tx_hash;
      const tradeValue = typeof primaryAmount === 'number' ? Math.abs(primaryAmount) : Math.abs(parseFloat(primaryAmount) || 1);

      // Ensure we have a valid trade value
      const finalValue = tradeValue > 0 ? tradeValue : 1;

      // Only add if not already present (prevents duplicates during infinite scroll)
      if (!userTradeMap.has(tradeKey)) {
        userTradeMap.set(tradeKey, {
          name: trade.user_display,
          value: finalValue,
          isBuying: Boolean(isBuying), // Ensure it's explicitly boolean
          fill: isBuying ? '#10b981' : '#ef4444', // Add fill color directly to data
          primaryToken,
          secondaryToken,
          primaryAmount,
          secondaryAmount,
          time: trade.block_time,
          tx_hash: trade.tx_hash
        });
      }
    });

    const result = Array.from(userTradeMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.min(100, allTrades.length)); // Limit for performance

    // Debug logging
    console.log('Treemap data processed:', result.length, 'unique items from', allTrades.length, 'total trades');
    console.log('Buyers:', result.filter(d => d.isBuying).length, 'Sellers:', result.filter(d => !d.isBuying).length);
    if (result.length > 0) {
      console.log('Sample data:', result.slice(0, 3));
    }

    return result;
  };

  const treemapData = processTreemapData();

  // Debug logging for treemap colors
  console.log('Treemap data with colors:', treemapData.map(d => ({
    name: d.name,
    isBuying: d.isBuying,
    value: d.value,
    expectedColor: d.isBuying ? '#10b981' : '#ef4444'
  })));


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-xl text-gray-600 dark:text-gray-300">Loading trades...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
          <div className="text-red-500 mb-4">
            <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Oops! Something went wrong</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => fetchData()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const selectedTokenData = PopularTokens.find(t => t.symbol === selectedToken);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-green-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-8">
      <div className="container mx-auto">

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Token Buyers & Sellers
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                See who's buying and selling tokens in real-time.
                <span className="text-green-600 font-semibold">Green = Buying</span>,
                <span className="text-red-600 font-semibold"> Red = Selling</span>
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="/defi-flows"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Full DeFi Flows
              </a>
              <a
                href="/"
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </a>
            </div>
          </div>
        </header>

        {/* Token Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Select Token
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {PopularTokens.map((token) => (
              <TokenButton
                key={token.symbol}
                token={token}
                isSelected={selectedToken === token.symbol}
                onClick={() => setSelectedToken(token.symbol)}
              />
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Total Bought */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-green-600 mb-2 flex items-center">
                <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                </svg>
                {data.summary.formatted_total_bought?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ||
                  data.summary.total_bought?.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{data.summary.token_name} Bought</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                from {data.summary.total_swaps_buying || 0} swaps
              </div>
            </motion.div>

            {/* Total Sold */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-red-600 mb-2 flex items-center">
                <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                </svg>
                {data.summary.formatted_total_sold?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ||
                  data.summary.total_sold?.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{data.summary.token_name} Sold</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                from {data.summary.total_swaps_selling || 0} swaps
              </div>
            </motion.div>

            {/* Total Trades */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="text-2xl font-bold text-blue-600 mb-2 flex items-center">
                <svg className="h-6 w-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {data.summary.total_swaps?.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Trades</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                all time activity
              </div>
            </motion.div>
          </div>
        )}

        {/* Recent Trades */}
        <div className="mb-8">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Recent {data?.summary.token_name || selectedToken} Activity
              </h2>

              {/* View Toggle */}
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-1 flex">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'cards'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                  >
                    <svg className="h-4 w-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Cards
                  </button>
                  <button
                    onClick={() => setViewMode('treemap')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'treemap'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                  >
                    <svg className="h-4 w-4 mr-1 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                    Treemap
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-gray-600 dark:text-gray-400">
                <span className="text-green-600 font-semibold">Green = Buying</span>,
                <span className="text-red-600 font-semibold">Red = Selling</span> -
                {viewMode === 'treemap' ? 'Larger rectangles = bigger trades' : 'Easy to understand trade summaries'}
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {allTrades.length || 0} results
              </div>
            </div>
          </div>
          {allTrades && allTrades.length > 0 ? (
            <>
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {allTrades.map((activity, index) => (
                      <TradeCard
                        key={`${activity.tx_hash}-${index}`}
                        activity={activity}
                        tokenName={data?.summary.token_name || selectedToken}
                        tokenMetadata={tokenMetadata}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <>
                  {/* Treemap View */}
                  <div className="mb-6">
                    <div className="rounded-lg shadow-lg p-4" style={{ height: '80vh', backgroundColor: 'transparent' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                          data={treemapData}
                          dataKey="value"
                          aspectRatio={4 / 3}
                          stroke="#fff"
                        >
                          <Tooltip content={<CustomTooltip />} />
                          {treemapData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.fill}
                              onClick={() => {
                                if (entry.tx_hash) {
                                  window.open(`https://explorer.hiro.so/txid/${entry.tx_hash}?chain=mainnet`, '_blank');
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          ))}
                        </Treemap>
                      </ResponsiveContainer>
                    </div>
                  </div>

                </>
              )}

              {/* Loading More Indicator */}
              {loadingMore && (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-300">Loading more trades...</span>
                </div>
              )}

              {/* End of Data Indicator */}
              {!hasMoreData && allTrades.length > 0 && (
                <div className="text-center py-8">
                  <div className="text-gray-500 dark:text-gray-400 text-sm">
                    You've reached the end! Total trades shown: {allTrades.length}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="mb-4">
                <svg className="h-16 w-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 12a8 8 0 01-8 8 8 8 0 01-8-8 8 8 0 018-8c.58 0 1.15.05 1.69.15M12 8v4l3 3" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                No Recent Trades
              </h3>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                No one has traded {selectedToken} recently. Try a different token!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown'}
        </div>
      </div>
    </div>
  );
}
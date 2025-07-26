'use client';

import React, { useState, useTransition, useEffect } from 'react';
import NetworkChart3D, { NetworkData } from './NetworkChart3D';
import { Drawer } from 'vaul';

interface NetworkChartClientProps {
  initialLimit?: number;
  initialMinValue?: number;
  initialAsset?: string;
  initialHideIsolated?: boolean;
}

export default function NetworkChartClient({
  initialLimit = 500,
  initialMinValue = 0,
  initialAsset = '',
  initialHideIsolated = true
}: NetworkChartClientProps) {
  // Always start with initialLimit to avoid hydration mismatch
  const [limit, setLimitState] = useState(initialLimit);
  const [minValue, setMinValue] = useState(initialMinValue);
  const [asset, setAsset] = useState(initialAsset);
  const [hideIsolatedNodes, setHideIsolatedNodes] = useState(initialHideIsolated);
  const [isPending, startTransition] = useTransition();
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Function to update URL search parameters
  const updateUrlParams = (params: { limit: number; minValue: number; asset: string; hideIsolatedNodes: boolean }) => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const searchParams = url.searchParams;

    // Update or set parameters
    searchParams.set('limit', params.limit.toString());
    searchParams.set('minValue', params.minValue.toString());

    if (params.asset) {
      searchParams.set('asset', params.asset);
    } else {
      searchParams.delete('asset');
    }

    if (params.hideIsolatedNodes === false) {
      searchParams.set('hideIsolated', 'false');
    } else {
      searchParams.delete('hideIsolated'); // Default is true, so omit when true
    }

    // Update URL without page reload
    window.history.replaceState({}, '', url.toString());
  };

  // Current parameters for API calls - start with initial values
  const [currentParams, setCurrentParams] = useState({
    limit: initialLimit,
    minValue: initialMinValue,
    asset: initialAsset || '',
    hideIsolatedNodes: initialHideIsolated
  });

  // Fetch data from API
  const fetchNetworkData = async (params: typeof currentParams) => {
    try {
      setError(null);
      const searchParams = new URLSearchParams({
        limit: params.limit.toString(),
        minValue: params.minValue.toString(),
        ...(params.asset && { asset: params.asset })
      });

      const response = await fetch(`/api/network-data?${searchParams}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setNetworkData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching network data:', err);
    }
  };

  // Load from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    setIsHydrated(true);

    try {
      const saved = localStorage.getItem('networkChart_transactionLimit');
      if (saved) {
        const parsed = parseInt(saved, 10);
        // Validate the saved value is within acceptable range
        if (parsed >= 10 && parsed <= 100000 && parsed !== initialLimit) {
          setLimitState(parsed);
          // Update current params if different from initial
          const updatedParams = { ...currentParams, limit: parsed };
          setCurrentParams(updatedParams);
          // Update URL to reflect saved limit
          updateUrlParams(updatedParams);
          // Fetch new data with saved limit
          fetchNetworkData(updatedParams);
          return; // Don't fetch initial data if we're loading saved data
        }
      }
    } catch (error) {
      console.warn('Failed to load transaction limit from localStorage:', error);
    }

    // Fetch initial data if no saved limit or saved limit equals initial
    fetchNetworkData(currentParams);
  }, []);

  // Custom setLimit function that also saves to localStorage and updates URL
  const setLimit = (newLimit: number) => {
    setLimitState(newLimit);

    // Save to localStorage
    if (isHydrated) {
      try {
        localStorage.setItem('networkChart_transactionLimit', newLimit.toString());
      } catch (error) {
        console.warn('Failed to save transaction limit to localStorage:', error);
      }
    }

    // Update URL immediately
    updateUrlParams({
      limit: newLimit,
      minValue,
      asset: asset || '',
      hideIsolatedNodes
    });
  };

  // Custom setMinValue function that updates URL
  const setMinValueAndUrl = (newMinValue: number) => {
    setMinValue(newMinValue);
    updateUrlParams({
      limit,
      minValue: newMinValue,
      asset: asset || '',
      hideIsolatedNodes
    });
  };

  // Custom setAsset function that updates URL
  const setAssetAndUrl = (newAsset: string) => {
    setAsset(newAsset);
    updateUrlParams({
      limit,
      minValue,
      asset: newAsset || '',
      hideIsolatedNodes
    });
  };

  // Custom setHideIsolatedNodes function that updates URL
  const setHideIsolatedAndUrl = (newHideIsolated: boolean) => {
    setHideIsolatedNodes(newHideIsolated);
    updateUrlParams({
      limit,
      minValue,
      asset: asset || '',
      hideIsolatedNodes: newHideIsolated
    });
  };

  const handleApplyChanges = () => {
    const newParams = {
      limit,
      minValue,
      asset: asset || '',
      hideIsolatedNodes
    };

    // Update URL to make it shareable
    updateUrlParams(newParams);

    startTransition(() => {
      setCurrentParams(newParams);
      fetchNetworkData(newParams);
    });
  };

  const hasChanges =
    limit !== currentParams.limit ||
    minValue !== currentParams.minValue ||
    asset !== (currentParams.asset || '') ||
    hideIsolatedNodes !== currentParams.hideIsolatedNodes;

  return (
    <div className="relative">
      {/* Sci-fi Controls Button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="absolute top-4 left-4 z-20 bg-gradient-to-r from-black to-gray-900 text-[#00ff88] px-4 py-2 rounded-none border-2 border-[#00ff88] flex items-center gap-2 shadow-lg transition-all hover:shadow-[0_0_20px_rgba(0,255,136,0.5)] hover:bg-gradient-to-r hover:from-gray-900 hover:to-black font-mono text-sm uppercase tracking-wider"
        style={{
          boxShadow: '0 0 10px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
        <span className="text-xs">◦ SYSTEM ◦</span>
      </button>

      {/* Sci-fi Drawer */}
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} direction="left">
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content
            className="bg-gradient-to-b from-black to-gray-900 flex flex-col rounded-none h-full w-100 fixed top-0 left-0 bottom-0 z-50 border-r-2 border-[#00ff88]"
            style={{
              boxShadow: '0 0 30px rgba(0,255,136,0.3), inset 1px 0 0 rgba(0,255,136,0.2)'
            }}
          >
            <div className="p-6 bg-gradient-to-b from-black to-gray-900 flex-1 overflow-auto font-mono">

              <div className="text-white space-y-8">
                <div className="text-center border-b border-[#00ff88]/30 pb-4">
                  <Drawer.Title className="font-bold text-lg mb-2 text-[#00ff88] uppercase tracking-wider">
                    ◦ LAKEHOUSE ◦
                  </Drawer.Title>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">
                    STACKS NETWORK EXPLORER
                  </p>
                  <div className="mt-2 w-full h-px bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[#00ff88] text-xs mb-3 font-medium uppercase tracking-wider">
                      ◦ TRANSACTION LIMIT ◦
                    </label>
                    <input
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
                      min="10"
                      max="100000"
                      step="50"
                      className="w-full bg-black text-[#00ff88] px-3 py-3 rounded-none border border-[#00ff88]/50 focus:border-[#00ff88] focus:ring-0 focus:outline-none transition-all font-mono text-sm"
                      style={{
                        boxShadow: 'inset 0 0 10px rgba(0,255,136,0.1), 0 0 5px rgba(0,255,136,0.2)'
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-2 uppercase tracking-wide">RANGE: 10-100,000 RECORDS</div>
                  </div>

                  <div>
                    <label className="block text-[#00ff88] text-xs mb-3 font-medium uppercase tracking-wider">
                      ◦ MINIMUM VALUE FILTER ◦
                    </label>
                    <input
                      type="number"
                      value={minValue}
                      onChange={(e) => setMinValueAndUrl(parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.1"
                      className="w-full bg-black text-[#00ff88] px-3 py-3 rounded-none border border-[#00ff88]/50 focus:border-[#00ff88] focus:ring-0 focus:outline-none transition-all font-mono text-sm"
                      style={{
                        boxShadow: 'inset 0 0 10px rgba(0,255,136,0.1), 0 0 5px rgba(0,255,136,0.2)'
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-2 uppercase tracking-wide">EXCLUDE TRANSACTIONS BELOW VALUE</div>
                  </div>

                  <div>
                    <label className="block text-[#00ff88] text-xs mb-3 font-medium uppercase tracking-wider">
                      ◦ TOKEN IDENTIFIER ◦
                    </label>
                    <input
                      type="text"
                      value={asset}
                      onChange={(e) => setAssetAndUrl(e.target.value)}
                      placeholder="STX | SBTC-TOKEN | USDA"
                      className="w-full bg-black text-[#00ff88] px-3 py-3 rounded-none border border-[#00ff88]/50 focus:border-[#00ff88] focus:ring-0 focus:outline-none transition-all font-mono text-sm placeholder-gray-600"
                      style={{
                        boxShadow: 'inset 0 0 10px rgba(0,255,136,0.1), 0 0 5px rgba(0,255,136,0.2)'
                      }}
                    />
                    <div className="text-xs text-gray-500 mt-2 uppercase tracking-wide">EMPTY = ALL TOKENS</div>
                  </div>

                  <div>
                    <label className="flex items-center space-x-3 text-[#00ff88] text-xs font-medium uppercase tracking-wider cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={hideIsolatedNodes}
                          onChange={(e) => setHideIsolatedAndUrl(e.target.checked)}
                          className="sr-only"
                        />
                        <div
                          className={`w-5 h-5 border border-[#00ff88] bg-black transition-all ${hideIsolatedNodes ? 'bg-[#00ff88]/20' : ''}`}
                          style={{
                            boxShadow: hideIsolatedNodes ? '0 0 8px rgba(0,255,136,0.5), inset 0 0 8px rgba(0,255,136,0.3)' : '0 0 3px rgba(0,255,136,0.3)'
                          }}
                        >
                          {hideIsolatedNodes && (
                            <div className="w-full h-full flex items-center justify-center text-[#00ff88] text-xs">✓</div>
                          )}
                        </div>
                      </div>
                      <span>◦ HIDE ISOLATED NODES ◦</span>
                    </label>
                    <div className="text-xs text-gray-500 mt-2 ml-8 uppercase tracking-wide">SHOW ONLY CONNECTED ENTITIES</div>
                  </div>

                  <button
                    onClick={handleApplyChanges}
                    disabled={!hasChanges || isPending}
                    className={`w-full py-4 px-4 rounded-none text-xs font-medium transition-all uppercase tracking-wider border-2 font-mono ${hasChanges && !isPending
                      ? 'bg-gradient-to-r from-black to-gray-900 text-[#00ff88] border-[#00ff88] hover:bg-gradient-to-r hover:from-gray-900 hover:to-black hover:shadow-[0_0_20px_rgba(0,255,136,0.5)]'
                      : 'bg-black text-gray-600 border-gray-700 cursor-not-allowed'
                      }`}
                    style={hasChanges && !isPending ? {
                      boxShadow: '0 0 10px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                    } : {}}
                  >
                    {isPending ? '◦ PROCESSING ◦' : hasChanges ? '◦ EXECUTE CHANGES ◦' : '◦ NO CHANGES DETECTED ◦'}
                  </button>
                </div>

                <div className="border-t border-[#00ff88]/30 pt-6">
                  <div className="text-xs text-gray-400 space-y-3">
                    <div className="text-[#00ff88] uppercase tracking-wider font-medium">◦ DATA ACQUISITION PROTOCOL ◦</div>
                    <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                      <div>→ SUCCESSFUL CREDIT+DEBIT PAIRS ONLY</div>
                      <div>→ ADDRESS-TO-ADDRESS TRANSFERS</div>
                      <div>→ CHRONOLOGICAL ORDERING (NEWEST FIRST)</div>
                      <div>→ DECIMAL-ADJUSTED TOKEN VALUES</div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#00ff88]/30 pt-6">
                  <div className="text-xs space-y-3">
                    <div className="text-[#00ff88] uppercase tracking-wider font-medium">◦ ENTITY CLASSIFICATION ◦</div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="flex items-center gap-1">
                        <span style={{ color: '#3B82F6' }}>●</span>
                        <span className="text-gray-400">WALLET</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span style={{ color: '#EF4444' }}>●</span>
                        <span className="text-gray-400">CONTRACT</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span style={{ color: '#10B981' }}>●</span>
                        <span className="text-gray-400">MULTISIG</span>
                      </div>
                    </div>
                    <div className="text-gray-500 font-mono">MOUSE: ROTATE/ZOOM • CLICK: FOCUS NODE</div>
                  </div>
                </div>

                <div className="border-t border-[#00ff88]/30 pt-6">
                  <div className="text-xs text-gray-400">
                    <div className="text-[#00ff88] uppercase tracking-wider font-medium mb-3">◦ ACTIVE CONFIGURATION ◦</div>
                    <div className="space-y-1 font-mono">
                      <div>RECORDS: {currentParams.limit.toLocaleString()}</div>
                      {currentParams.minValue > 0 && <div>MIN_VALUE: {currentParams.minValue}</div>}
                      {currentParams.asset && <div>TOKEN_FILTER: {currentParams.asset.toUpperCase()}</div>}
                      {networkData?.dateRange && (() => {
                        try {
                          const newestDate = new Date(networkData.dateRange.newest);
                          const oldestDate = new Date(networkData.dateRange.oldest);

                          if (!isNaN(newestDate.getTime()) && !isNaN(oldestDate.getTime())) {
                            return (
                              <div>
                                <div>DATE_RANGE: {newestDate.toLocaleDateString()} → {oldestDate.toLocaleDateString()}</div>
                                <div className="text-gray-600">TEMPORAL_ORDER: NEWEST_FIRST ({networkData.dateRange.count} RECORDS)</div>
                              </div>
                            );
                          }
                        } catch (e) {
                          console.warn('Invalid date range:', networkData.dateRange);
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Loading overlay */}
      {isPending && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-black bg-opacity-80 rounded-lg p-6 text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-3"></div>
            <div>Loading transactions...</div>
            <div className="text-sm text-gray-400 mt-1">
              Fetching {limit} records with filters
            </div>
          </div>
        </div>
      )}

      {/* Render network chart or error state */}
      {error ? (
        <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
          <div className="text-red-500 text-lg text-center">
            <div className="mb-2">Error loading network data</div>
            <div className="text-sm text-gray-400">{error}</div>
            <button
              onClick={() => fetchNetworkData(currentParams)}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      ) : networkData ? (
        <NetworkChart3D data={networkData} hideIsolatedNodes={currentParams.hideIsolatedNodes} />
      ) : (
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <div className="text-white text-lg text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
            <div>Loading initial data...</div>
          </div>
        </div>
      )}
    </div>
  );
}
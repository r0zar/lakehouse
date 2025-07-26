'use client';

import React, { useState, useTransition, useEffect } from 'react';
import NetworkChart3D, { NetworkData } from './NetworkChart3D';

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
      {/* Controls overlay */}
      <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-90 rounded-lg p-4 max-w-sm">
        <div className="text-white text-sm space-y-3">
          <div className="font-bold text-lg mb-3 text-cyan-400">Charisma Explore</div>

          <div className="space-y-3">
            <div>
              <label className="block text-cyan-300 text-xs mb-1">Transaction Limit</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
                min="10"
                max="100000"
                step="50"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded text-xs"
              />
              <div className="text-xs text-gray-400 mt-1">Most recent transactions (10-100000)</div>
            </div>

            <div>
              <label className="block text-cyan-300 text-xs mb-1">Minimum Value</label>
              <input
                type="number"
                value={minValue}
                onChange={(e) => setMinValueAndUrl(parseFloat(e.target.value) || 0)}
                min="0"
                step="0.1"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded text-xs"
              />
              <div className="text-xs text-gray-400 mt-1">Filter transactions below this value</div>
            </div>

            <div>
              <label className="block text-cyan-300 text-xs mb-1">Token Filter (Optional)</label>
              <input
                type="text"
                value={asset}
                onChange={(e) => setAssetAndUrl(e.target.value)}
                placeholder="e.g., STX, CHA, GECKO"
                className="w-full bg-gray-800 text-white px-2 py-1 rounded text-xs placeholder-gray-500"
              />
              <div className="text-xs text-gray-400 mt-1">Show only specific token (leave empty for all)</div>
            </div>

            <div>
              <label className="flex items-center space-x-2 text-cyan-300 text-xs">
                <input
                  type="checkbox"
                  checked={hideIsolatedNodes}
                  onChange={(e) => setHideIsolatedAndUrl(e.target.checked)}
                  className="w-3 h-3 text-cyan-600 bg-gray-800 border-gray-600 rounded focus:ring-cyan-500 focus:ring-1"
                />
                <span>Hide isolated nodes (no connections)</span>
              </label>
              <div className="text-xs text-gray-400 mt-1">Only show nodes that have transaction links</div>
            </div>

            <button
              onClick={handleApplyChanges}
              disabled={!hasChanges || isPending}
              className={`w-full py-2 px-3 rounded text-xs font-medium transition-colors ${hasChanges && !isPending
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
              {isPending ? 'Loading...' : hasChanges ? 'Apply Changes' : 'No Changes'}
            </button>
          </div>

          <div className="border-t border-gray-600 pt-2">
            <div className="text-xs text-gray-300 space-y-1">
              <div><strong>How data is selected:</strong></div>
              <div>• Only successful CREDIT + DEBIT pairs</div>
              <div>• Address-to-address transfers</div>
              <div>• Ordered by most recent first</div>
              <div>• Token amounts with proper decimals</div>
            </div>
          </div>

          <div className="border-t border-gray-600 pt-2">
            <div className="text-xs space-y-1">
              <div><strong className="text-cyan-300">Node Colors:</strong></div>
              <div><span style={{ color: '#3B82F6' }}>●</span> Wallets <span style={{ color: '#EF4444' }}>●</span> Contracts <span style={{ color: '#10B981' }}>●</span> Multisig</div>
              <div><strong className="text-cyan-300">Controls:</strong> Mouse to rotate/zoom • Click node to focus</div>
            </div>
          </div>

          <div className="text-xs text-gray-400 border-t border-gray-600 pt-1">
            Current: {currentParams.limit} transactions
            {currentParams.minValue > 0 && `, min value: ${currentParams.minValue}`}
            {currentParams.asset && `, token: ${currentParams.asset}`}
            {networkData?.dateRange && (() => {
              try {
                const newestDate = new Date(networkData.dateRange.newest);
                const oldestDate = new Date(networkData.dateRange.oldest);

                if (!isNaN(newestDate.getTime()) && !isNaN(oldestDate.getTime())) {
                  return (
                    <div className="mt-1">
                      <div>Date range: {newestDate.toLocaleDateString()} - {oldestDate.toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">Most recent → oldest ({networkData.dateRange.count} transactions)</div>
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
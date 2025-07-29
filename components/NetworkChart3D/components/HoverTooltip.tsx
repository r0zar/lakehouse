import React from 'react';
import { formatTokenAmount } from '@/lib/tokenFormatter';
import { NetworkNode } from './NodeContextMenu';

export interface HoverTooltipProps {
  node: NetworkNode | null;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ node }) => {
  if (!node) {
    return null;
  }

  const getCategoryDisplayName = (category: string) => {
    const displayNames = {
      'System': 'Multisig',
      'Wallet': 'Wallet',
      'Contract': 'Contract', 
      'Multisig': 'Multisig',
      'DeFi': 'DeFi',
      'Stacking': 'Stacking'
    };
    return displayNames[category as keyof typeof displayNames] || category;
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      'Wallet': '#3B82F6',    // Blue
      'Contract': '#EF4444',  // Red  
      'System': '#10B981',    // Green (legacy name for multisig wallets)
      'Multisig': '#10B981',  // Green (proper name for multisig wallets)
      'DeFi': '#8B5CF6',      // Purple
      'Stacking': '#F59E0B'   // Amber
    };
    return colors[category as keyof typeof colors] || '#6B7280';
  };

  // Get dominant token flow for quick info
  const getMainTokenInfo = () => {
    if (!node.tokenFlows) return null;
    
    const tokenFlowsArray = Object.entries(node.tokenFlows);
    if (tokenFlowsArray.length === 0) return null;
    
    // Find token with highest total flow
    const dominantToken = tokenFlowsArray.reduce((prev, current) => {
      return (current[1].total > prev[1].total) ? current : prev;
    });
    
    return {
      token: dominantToken[0],
      inbound: dominantToken[1].inbound,
      outbound: dominantToken[1].outbound,
      total: dominantToken[1].total
    };
  };

  const mainToken = getMainTokenInfo();

  return (
    <div
      className="fixed bottom-4 left-4 z-30 bg-gradient-to-r from-black/90 to-gray-900/90 border border-[#00ff88]/50 rounded-none font-mono text-xs backdrop-blur-sm transition-all duration-200"
      style={{
        boxShadow: '0 0 15px rgba(0,255,136,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
        maxWidth: '380px'
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#00ff88]/30 bg-black/50">
        <div className="flex items-center space-x-2">
          <div 
            className="w-2 h-2 rounded-full animate-pulse" 
            style={{ 
              backgroundColor: getCategoryColor(node.category),
              boxShadow: `0 0 6px ${getCategoryColor(node.category)}`
            }}
          />
          <span className="text-[#00ff88] font-bold uppercase tracking-wider">
            {getCategoryDisplayName(node.category)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {/* Node name/address */}
        <div className="mb-2">
          {node.name.includes('.') ? (
            // Contract with name - split on first dot
            <>
              <div className="text-white font-medium text-sm break-all">
                {node.name.split('.').slice(1).join('.')}
              </div>
              <div className="text-gray-400 text-xs font-mono break-all mt-1">
                {node.name.split('.')[0]}
              </div>
            </>
          ) : (
            // Regular address - keep original format with truncation
            <div className="text-white font-medium text-sm break-all">
              {node.name.length > 40 ? `${node.name.substring(0, 37)}...` : node.name}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-300">
            <span className="text-[#00ff88]">{node.neighbors?.length || 0}</span> connections
          </div>
          
          {mainToken && (
            <div className="text-right">
              <div className="text-gray-300">
                <span className="text-[#00ff88]">{mainToken.token}</span>
              </div>
              <div className="text-xs text-gray-400">
                {formatTokenAmount(mainToken.total, mainToken.token)}
              </div>
            </div>
          )}
        </div>

        {/* Hotkey hints */}
        <div className="text-gray-500 text-xs mt-2 text-center border-t border-[#00ff88]/20 pt-2">
          <div className="flex items-center justify-center space-x-3 mb-1">
            <span className="text-[#00ff88] font-mono">Q</span>
            <span>Pin</span>
            <span className="text-gray-600">•</span>
            <span className="text-[#00ff88] font-mono">W</span>
            <span>Focus</span>
            <span className="text-gray-600">•</span>
            <span className="text-[#00ff88] font-mono">F</span>
            <span>Filter</span>
          </div>
          <div className="text-gray-600">Right-click for more options</div>
        </div>
      </div>

      {/* Corner accent */}
      <div className="absolute top-1 right-1 w-1 h-1 bg-[#00ff88] rounded-full opacity-60" />
    </div>
  );
};
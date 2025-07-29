import React, { useState } from 'react';
import { formatTokenAmount } from '@/lib/tokenFormatter';
import { NetworkNode } from './NodeContextMenu';

export interface PinnedTooltipProps {
  node: NetworkNode | null;
  onClose: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  index?: number; // For positioning multiple tooltips (legacy)
  useFlexbox?: boolean; // Use flexbox instead of manual positioning
}

export const PinnedTooltip: React.FC<PinnedTooltipProps> = ({
  node,
  onClose,
  position = 'top-right',
  index = 0,
  useFlexbox = false
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

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

  const getPositionClasses = () => {
    // Calculate offset based on index (spacing them vertically)
    const verticalOffset = index * 440; // 400px tooltip height + 40px gap
    
    switch (position) {
      case 'top-left':
        return 'left-4';
      case 'bottom-right':
        return 'right-4';
      case 'bottom-left':
        return 'left-4';
      case 'top-right':
      default:
        return 'right-4';
    }
  };

  const getPositionStyle = () => {
    const verticalOffset = index * 440; // 400px tooltip height + 40px gap
    
    switch (position) {
      case 'top-left':
      case 'top-right':
        return { top: `${16 + verticalOffset}px` };
      case 'bottom-left':
      case 'bottom-right':
        return { bottom: `${16 + verticalOffset}px` };
      default:
        return { top: `${16 + verticalOffset}px` };
    }
  };

  // Generate tooltip content (reusing logic from original tooltip)
  const generateTooltipContent = () => {
    const tokenFlowsArray = Object.entries(node.tokenFlows || {});
    
    // Create aligned grid for token flows - sort by total activity
    const sortedTokens = tokenFlowsArray
      .sort((a: any, b: any) => b[1].total - a[1].total)
      .filter(([_, flow]: any) => flow.inbound > 0 || flow.outbound > 0);

    let tokenFlowsGrid = '';
    if (sortedTokens.length > 0) {
      tokenFlowsGrid = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px;">
          <!-- Credits Column -->
          <div>
            <div style="color: #00ff88; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-align: center; border-bottom: 1px solid rgba(0,255,136,0.3); padding-bottom: 2px;">
              ◦ CREDITS ◦
            </div>
            ${sortedTokens.map(([token, flow]: any) => {
              if (flow.inbound > 0) {
                return `<div style="color: #00ff88; font-family: 'Courier New', monospace; font-size: 10px; margin-bottom: 3px; text-align: right; padding-right: 4px;">+ ${formatTokenAmount(flow.inbound, token)}</div>`;
              } else {
                return `<div style="height: 16px;"></div>`; // Spacer for alignment
              }
            }).join('')}
          </div>
          
          <!-- Debits Column -->
          <div>
            <div style="color: #ff4444; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; text-align: center; border-bottom: 1px solid rgba(255,68,68,0.3); padding-bottom: 2px;">
              ◦ DEBITS ◦
            </div>
            ${sortedTokens.map(([token, flow]: any) => {
              if (flow.outbound > 0) {
                return `<div style="color: #ff4444; font-family: 'Courier New', monospace; font-size: 10px; margin-bottom: 3px; text-align: left; padding-left: 4px;">- ${formatTokenAmount(flow.outbound, token)}</div>`;
              } else {
                return `<div style="height: 16px;"></div>`; // Spacer for alignment
              }
            }).join('')}
          </div>
        </div>
      `;
    }

    const dateSection = (node.earliestTransaction && node.latestTransaction) ? (() => {
      const earliest = new Date(node.earliestTransaction);
      const latest = new Date(node.latestTransaction);
      
      const dateOptions: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      };
      const timeOptions: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      };
      
      const sameDay = earliest.toDateString() === latest.toDateString();
      
      if (sameDay) {
        return `
          <div style="color: #8aa3b3; font-size: 10px; margin-bottom: 8px; font-family: 'Courier New', monospace; text-align: center;">
            ${earliest.toLocaleDateString(undefined, dateOptions)}<br>
            ${earliest.toLocaleTimeString(undefined, timeOptions)} → ${latest.toLocaleTimeString(undefined, timeOptions)}
          </div>
        `;
      } else {
        return `
          <div style="color: #8aa3b3; font-size: 10px; margin-bottom: 8px; font-family: 'Courier New', monospace; text-align: center;">
            ${earliest.toLocaleDateString(undefined, dateOptions)} → ${latest.toLocaleDateString(undefined, dateOptions)}<br>
            <span style="font-size: 9px; opacity: 0.8;">${earliest.toLocaleTimeString(undefined, timeOptions)} to ${latest.toLocaleTimeString(undefined, timeOptions)}</span>
          </div>
        `;
      }
    })() : '';

    return {
      dateSection,
      tokenFlowsGrid: tokenFlowsGrid || `<div style="color: #00ff88; font-family: 'Courier New', monospace; text-align: center;">◦ ${formatTokenAmount(node.value, node.dominantToken || 'STX')}</div>`
    };
  };

  const { dateSection, tokenFlowsGrid } = generateTooltipContent();

  return (
    <div
      className={`${useFlexbox ? '' : 'fixed'} z-40 bg-gradient-to-b from-black to-gray-900 border-2 border-[#00ff88] rounded-none font-mono transition-all duration-300 ${useFlexbox ? '' : getPositionClasses()}`}
      style={{
        boxShadow: '0 0 20px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        width: isMinimized ? '280px' : '400px',
        maxHeight: isMinimized ? '60px' : '500px',
        overflow: 'hidden',
        ...(useFlexbox ? {} : getPositionStyle())
      }}
    >
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#00ff88]/30 bg-black/30">
        <div className="flex items-center space-x-2">
          <div className="text-[#00ff88] text-xs uppercase tracking-wider font-bold">
            ◦ {getCategoryDisplayName(node.category)} ◦
          </div>
          <div className="w-2 h-2 bg-[#00ff88] rounded-full animate-pulse" 
               style={{ boxShadow: '0 0 6px #00ff88' }} />
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-[#00ff88] hover:text-white transition-colors p-1"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '📈' : '📉'}
          </button>
          <button
            onClick={onClose}
            className="text-[#00ff88] hover:text-red-400 transition-colors p-1"
            title="Close (ESC)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-4">
          {/* Node name */}
          <div className="mb-2 text-center">
            {node.name.includes('.') ? (
              // Contract with name - split on first dot
              <>
                <div className="text-white font-bold text-sm break-all">
                  {node.name.split('.').slice(1).join('.')}
                </div>
                <div className="text-gray-400 text-xs font-mono break-all mt-1">
                  {node.name.split('.')[0]}
                </div>
              </>
            ) : (
              // Regular address - show full address
              <div className="text-white font-bold text-sm break-all">
                {node.name}
              </div>
            )}
          </div>

          {/* Date section */}
          {dateSection && (
            <div 
              dangerouslySetInnerHTML={{ __html: dateSection }}
              className="mb-4"
            />
          )}

          {/* Transaction flows section */}
          <div className="mb-4">
            <div className="text-[#00ff88] text-xs uppercase tracking-wider mb-2 text-center border-b border-[#00ff88]/30 pb-2">
              ◦ TRANSACTION FLOWS ◦
            </div>
            <div dangerouslySetInnerHTML={{ __html: tokenFlowsGrid }} />
          </div>

          {/* Additional info */}
          <div className="text-gray-400 text-xs text-center border-t border-[#00ff88]/30 pt-2">
            <div>Connections: {node.neighbors?.length || 0}</div>
            <div>Links: {node.links?.length || 0}</div>
          </div>
        </div>
      )}

      {/* Minimized content */}
      {isMinimized && (
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="text-white text-sm font-medium truncate flex-1 mr-2">
            {node.name}
          </div>
          <div className="text-[#00ff88] text-xs">
            {node.neighbors?.length || 0} connections
          </div>
        </div>
      )}

      {/* Resize handle (visual only) */}
      <div className="absolute bottom-1 right-1 w-3 h-3 opacity-30">
        <div className="w-full h-full bg-gradient-to-br from-transparent to-[#00ff88] rounded-tl" />
      </div>
    </div>
  );
};
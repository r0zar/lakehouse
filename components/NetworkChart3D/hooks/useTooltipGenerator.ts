import { useRef } from 'react';
import { TooltipLRUCache } from '../utils/LRUCache';
import { formatTokenAmount } from '@/lib/tokenFormatter';

// Display proper category names (convert legacy names to current ones)
const getCategoryDisplayName = (category: string): string => {
  const displayNames = {
    'System': 'Multisig',  // Convert legacy "System" to "Multisig"
    'Wallet': 'Wallet',
    'Contract': 'Contract',
    'Multisig': 'Multisig',
    'DeFi': 'DeFi',
    'Stacking': 'Stacking'
  };
  return displayNames[category as keyof typeof displayNames] || category;
};

export const useTooltipGenerator = (cacheSize: number = 200) => {
  const tooltipCache = useRef(new TooltipLRUCache(cacheSize));

  // Generate and cache tooltip HTML using LRU cache (for pinned tooltips)
  const generateTooltipHTML = (node: any): string => {
    // tokenFlows is now always a plain object (not Map) for JSON serialization
    const tokenFlowsArray = Object.entries(node.tokenFlows || {});
    
    const cacheKey = `${node.name}_${node.earliestTransaction || 'no-earliest'}_${node.latestTransaction || 'no-latest'}_${tokenFlowsArray.map((entry: any) => `${entry[0]}:${entry[1].inbound}:${entry[1].outbound}`).join('|')}`;
    
    // Check LRU cache first
    const cachedHTML = tooltipCache.current.get(cacheKey);
    if (cachedHTML) {
      return cachedHTML;
    }

    // Create aligned grid for token flows - sort by total activity
    const sortedTokens = tokenFlowsArray
      .sort((a: any, b: any) => b[1].total - a[1].total)
      .filter(([_, flow]: any) => flow.inbound > 0 || flow.outbound > 0);

    let tokenFlowsGrid = '';
    if (sortedTokens.length > 0) {
      // Create two-column grid with headers
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
      // Debug: Log the original strings and parsed dates
      console.log('Date Debug:', {
        earliestString: node.earliestTransaction,
        latestString: node.latestTransaction,
        earliestParsed: new Date(node.earliestTransaction).toISOString(),
        latestParsed: new Date(node.latestTransaction).toISOString(),
        earliestLocal: new Date(node.earliestTransaction).toString(),
        latestLocal: new Date(node.latestTransaction).toString()
      });
      
      const earliest = new Date(node.earliestTransaction);
      const latest = new Date(node.latestTransaction);
      
      // Format dates in local timezone with consistent options
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
      
      // If same day (in local timezone), show date range differently
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

    const html = `
      <div style="
        background: linear-gradient(135deg, rgba(0,15,35,0.95) 0%, rgba(0,25,50,0.95) 100%);
        border: 2px solid #00ff88;
        border-radius: 0px;
        padding: 12px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        max-width: 700px;
        word-break: break-word;
        overflow-wrap: anywhere;
        box-shadow: 0 0 20px rgba(0,255,136,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        position: relative;
      ">
        <div style="
          color: #00ff88; 
          font-weight: bold; 
          font-size: 9px; 
          text-transform: uppercase; 
          letter-spacing: 2px;
          margin-bottom: 8px;
          border-bottom: 1px solid rgba(0,255,136,0.3);
          padding-bottom: 4px;
        ">
          ${getCategoryDisplayName(node.category)} NODE
        </div>
        <div style="color: #ffffff; font-weight: bold; margin-bottom: 8px; font-size: 12px;">
          ${node.name}
        </div>
        ${dateSection}
        <div style="margin-top: 8px;">
          <div style="color: #00ff88; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px; text-align: center;">
            ◦ TRANSACTION FLOWS ◦
          </div>
          ${tokenFlowsGrid || `<div style="color: #00ff88; font-family: 'Courier New', monospace; text-align: center;">◦ ${formatTokenAmount(node.value, node.dominantToken)}</div>`}
        </div>
        <div style="
          position: absolute;
          top: 4px;
          right: 8px;
          width: 6px;
          height: 6px;
          background: #00ff88;
          border-radius: 50%;
          box-shadow: 0 0 8px #00ff88;
          animation: pulse 2s infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      </style>
    `;

    // Store in LRU cache
    tooltipCache.current.set(cacheKey, html);
    return html;
  };

  // Clear tooltip cache
  const clearCache = () => {
    tooltipCache.current.clear();
  };

  // Get cache statistics
  const getCacheStats = () => {
    return {
      size: tooltipCache.current.size(),
      maxSize: cacheSize
    };
  };

  return {
    generateTooltipHTML,
    clearCache,
    getCacheStats
  };
};
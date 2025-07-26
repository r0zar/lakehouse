// Token formatting utilities for blockchain data

/**
 * Format already-converted token amount with appropriate scale
 * @param value Already converted token value (e.g., 1234.56 STX, not microSTX)
 * @param symbol Token symbol (STX, aeUSDC, etc.)
 * @returns Formatted token amount with symbol
 */
export function formatTokenAmount(value: number, symbol: string): string {
  if (!value) return `0 ${symbol}`;
  
  // Format with appropriate scale
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B ${symbol}`;
  } else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M ${symbol}`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K ${symbol}`;
  } else if (value >= 1) {
    return `${value.toFixed(2)} ${symbol}`;
  } else {
    return `${value.toFixed(6)} ${symbol}`;
  }
}

/**
 * Get token color for visualization
 */
export function getTokenColor(symbol: string): string {
  const tokenColors: Record<string, string> = {
    'STX': '#FF5C00',      // Stacks orange
    'aeUSDC': '#2775CA',   // USDC blue
    'aBTC': '#F7931A',     // Bitcoin orange
    'ALEX': '#00D4FF',     // ALEX cyan
    'NASTY': '#8B5CF6',    // Purple
    'longcoin': '#10B981', // Green
    'sbtc': '#F59E0B',     // Amber
    'leo': '#EF4444',      // Red
  };
  
  return tokenColors[symbol] || '#6B7280'; // Default gray
}
// Token formatting utilities using dim_tokens metadata

export interface TokenMetadata {
  contract_address: string;
  token_name: string | null;
  token_symbol: string | null;
  decimals: number | null;
  image_url: string | null;
}

/**
 * Format a token amount using its decimal places
 * @param amount Raw token amount (atomic units)
 * @param decimals Number of decimal places for the token
 * @param symbol Token symbol for display
 * @returns Formatted token string
 */
export function formatTokenAmount(
  amount: number | string | null, 
  decimals: number = 6, 
  symbol: string | null = null
): string {
  if (amount === null || amount === undefined) {
    return symbol ? `0 ${symbol}` : '0';
  }

  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (numericAmount === 0) {
    return symbol ? `0 ${symbol}` : '0';
  }

  // Convert from atomic units to display units
  const displayAmount = numericAmount / Math.pow(10, decimals);
  
  // Format with appropriate precision
  let formattedAmount: string;
  if (displayAmount >= 1000000) {
    formattedAmount = (displayAmount / 1000000).toFixed(2) + 'M';
  } else if (displayAmount >= 1000) {
    formattedAmount = (displayAmount / 1000).toFixed(2) + 'K';
  } else if (displayAmount >= 1) {
    formattedAmount = displayAmount.toFixed(2);
  } else if (displayAmount >= 0.01) {
    formattedAmount = displayAmount.toFixed(4);
  } else {
    formattedAmount = displayAmount.toExponential(2);
  }

  return symbol ? `${formattedAmount} ${symbol}` : formattedAmount;
}

/**
 * Format a token amount with metadata lookup
 * @param amount Raw token amount (atomic units)
 * @param contractAddress Token contract address
 * @param tokenMetadata Map of contract addresses to token metadata
 * @returns Formatted token string
 */
export function formatTokenWithMetadata(
  amount: number | string | null,
  contractAddress: string | null,
  tokenMetadata: Record<string, TokenMetadata> = {}
): string {
  if (!contractAddress) {
    return amount?.toString() || '0';
  }

  const metadata = tokenMetadata[contractAddress];
  
  if (!metadata) {
    // No metadata available - show raw amount with contract address
    return `${amount || '0'} (${contractAddress})`;
  }

  return formatTokenAmount(
    amount, 
    metadata.decimals || 0, 
    metadata.token_symbol
  );
}

/**
 * Get token display info
 */
export function getTokenDisplayInfo(
  contractAddress: string | null,
  tokenMetadata: Record<string, TokenMetadata> = {}
): { symbol: string | null; name: string | null; imageUrl: string | null } {
  if (!contractAddress) {
    return {
      symbol: null,
      name: null,
      imageUrl: null
    };
  }

  const metadata = tokenMetadata[contractAddress];
  
  return {
    symbol: metadata?.token_symbol || null,
    name: metadata?.token_name || null,
    imageUrl: metadata?.image_url || null
  };
}
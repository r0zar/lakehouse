/**
 * Token Amount Formatting Utilities
 * 
 * Handles the conversion from atomic units (stored in database) to human-readable
 * amounts using token metadata. This ensures data integrity while providing 
 * user-friendly display values.
 */

export interface TokenMetadata {
  token_name?: string;
  token_symbol?: string;
  decimals?: number;
  validation_status?: string;
  contract_address?: string;
  token_uri?: string;
  image_url?: string;
  description?: string;
  total_supply?: string;
  token_type?: string;
}

/**
 * Format token amount from atomic units to human-readable format
 */
export function formatTokenAmount(atomicAmount: string | number, decimals: number): number {
  const amount = typeof atomicAmount === 'string' ? parseFloat(atomicAmount) : atomicAmount;
  const divisor = Math.pow(10, decimals);
  return amount / divisor;
}

/**
 * Format STX amount (always 6 decimals)
 */
export function formatStxAmount(atomicAmount: string | number): number {
  return formatTokenAmount(atomicAmount, 6);
}

/**
 * Create display string for token amount
 */
export function createDisplayAmount(
  atomicAmount: string | number, 
  decimals: number, 
  symbol: string,
  precision: number = 6
): string {
  const formatted = formatTokenAmount(atomicAmount, decimals);
  return `${formatted.toFixed(precision)} ${symbol}`;
}

/**
 * Categorize transfer size based on formatted amount
 */
export function categorizeTransferSize(formattedAmount: number): 'small' | 'medium' | 'large' {
  if (formattedAmount >= 1000) return 'large';
  if (formattedAmount >= 10) return 'medium';
  return 'small';
}

/**
 * Process a row with token amount fields, applying formatting
 */
export function processTokenRow(row: any, tokenMetadataMap?: Map<string, TokenMetadata>) {
  // Handle different amount field names
  const atomicAmount = row.atomic_amount || row.amount || row.ft_amount || row.stx_amount;
  const contractId = row.contract_id || row.asset_identifier;
  
  if (!atomicAmount) return row;

  // Get token metadata
  let decimals = 6; // Default to 6 (STX standard)
  let tokenSymbol = 'UNKNOWN';
  let tokenName = 'Unknown Token';

  if (contractId === 'STX') {
    decimals = 6;
    tokenSymbol = 'STX';
    tokenName = 'Stacks';
  } else if (tokenMetadataMap && contractId) {
    const metadata = tokenMetadataMap.get(contractId);
    if (metadata) {
      decimals = metadata.decimals || 6;
      tokenSymbol = metadata.token_symbol || 'UNKNOWN';
      tokenName = metadata.token_name || 'Unknown Token';
    }
  }

  // Format the amount
  const atomicAmountNum = typeof atomicAmount === 'bigint' ? Number(atomicAmount) : atomicAmount;
  const formattedAmount = formatTokenAmount(atomicAmountNum, decimals);

  return {
    ...row,
    // Raw atomic amount (preserved)
    atomic_amount: atomicAmountNum.toString(),
    
    // Formatted fields (calculated at read-time)
    formatted_amount: formattedAmount,
    display_amount: createDisplayAmount(atomicAmountNum, decimals, tokenSymbol),
    
    // Token metadata
    token_name: tokenName,
    token_symbol: tokenSymbol,
    decimals: decimals,
    
    // Analytics
    transfer_size: categorizeTransferSize(formattedAmount)
  };
}

/**
 * Get token metadata map from database results
 */
export function createTokenMetadataMap(tokenRows: any[]): Map<string, TokenMetadata> {
  const map = new Map<string, TokenMetadata>();
  
  for (const row of tokenRows) {
    if (row.contract_address || row.contract_id) {
      const key = row.contract_address || row.contract_id;
      map.set(key, {
        contract_address: row.contract_address,
        token_name: row.token_name,
        token_symbol: row.token_symbol,
        decimals: row.decimals,
        validation_status: row.validation_status,
        token_uri: row.token_uri,
        image_url: row.image_url,
        description: row.description,
        total_supply: row.total_supply,
        token_type: row.token_type
      });
    }
  }
  
  return map;
}
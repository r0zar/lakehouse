// Simple classification engine for wallets and contracts
// Uses rule-based logic to determine entity types and generate descriptions

interface WalletData {
  recent_transactions: number;
  avg_usd_per_tx: number;
  avg_txs_per_day: number;
  recent_counterparties: number;
  active_tokens: number;
  token_activity: Array<{
    token_symbol: string;
    token_name?: string;
    display_symbol?: string;
    inbound_tokens: number;
    outbound_tokens: number;
    inbound_usd: number;
    outbound_usd: number;
    transaction_count: number;
  }>;
  top_counterparties: Array<{
    counterparty: string;
    transaction_count: number;
    total_usd_volume: number;
  }>;
}

interface ContractData {
  recent_interactions: number;
  avg_usd_per_interaction: number;
  avg_interactions_per_day: number;
  recent_users: number;
  active_tokens: number;
  abi?: any;
  interfaces: Array<{
    interface: string;
    metadata: any;
  }>;
  token_activity: Array<{
    token_symbol: string;
    token_name?: string;
    display_symbol?: string;
    inbound_tokens: number;
    outbound_tokens: number;
    inbound_usd: number;
    outbound_usd: number;
    transaction_count: number;
  }>;
}

// Wallet Classification Logic
export function classifyWallet(data: WalletData): string {
  const totalUsdVolume = data.token_activity.reduce((sum, token) => 
    sum + token.inbound_usd + token.outbound_usd, 0
  );
  
  const totalInbound = data.token_activity.reduce((sum, token) => sum + token.inbound_usd, 0);
  const totalOutbound = data.token_activity.reduce((sum, token) => sum + token.outbound_usd, 0);
  const netFlow = totalInbound - totalOutbound;
  
  // Automated wallet detection (hundreds of transactions per day)
  if (data.avg_txs_per_day >= 100) {
    return "Automated Wallet";
  }
  
  // Jeet pattern - selling microcap/meme tokens for stables/majors
  const stableTokens = ['STX', 'SBTC', 'USDA', 'SUSDT', 'DIKO', 'ALEX'];
  const stableInboundUsd = data.token_activity
    .filter(token => stableTokens.some(stable => token.token_symbol.toUpperCase().includes(stable)))
    .reduce((sum, token) => sum + token.inbound_usd, 0);
  const microcapOutboundUsd = data.token_activity
    .filter(token => !stableTokens.some(stable => token.token_symbol.toUpperCase().includes(stable)))
    .reduce((sum, token) => sum + token.outbound_usd, 0);
  
  // Jeet: selling microcaps for stables, with significant activity in both
  if (stableInboundUsd > 50 && // Minimum stable inbound threshold
      microcapOutboundUsd > 50 && // Minimum microcap selling threshold  
      stableInboundUsd / totalInbound > 0.3 && // At least 30% of inbound is stables
      microcapOutboundUsd / totalOutbound > 0.3 && // At least 30% of outbound is microcaps
      data.active_tokens >= 2) { // Reduced from 3 to 2 tokens (can be just stable + microcap)
    return "Jeet";
  }
  
  // High activity DeFi user
  if (data.active_tokens >= 8 && data.avg_txs_per_day >= 20) {
    return "DeFi Power User";
  }
  
  // Accumulation pattern
  if (totalInbound > totalOutbound * 3 && data.avg_txs_per_day < 10) {
    return "Token Accumulator";
  }
  
  // Active trading pattern
  if (data.avg_txs_per_day >= 10 && Math.abs(netFlow) < totalUsdVolume * 0.3) {
    return "Active Trader";
  }
  
  // Liquidity provider (high AMM interactions)
  const hasAmmInteractions = data.top_counterparties.some(cp => 
    cp.counterparty.includes('stableswap') || 
    cp.counterparty.includes('amm') ||
    cp.counterparty.includes('alex') ||
    cp.counterparty.includes('arkadiko')
  );
  
  if (hasAmmInteractions && data.active_tokens >= 4) {
    return "Liquidity Provider";
  }
  
  // Low activity user
  if (data.avg_txs_per_day < 5) {
    return "Casual User";
  }
  
  // Default classification
  return "Active User";
}

// Helper function to check if ABI contains swap functions
function hasSwapFunctions(abi: any): boolean {
  if (!abi || !abi.functions) return false;
  
  const swapFunctionNames = ['swap', 'swap-exact-tokens-for-tokens', 'swap-tokens-for-exact-tokens', 
    'do-swap', 'exchange', 'trade', 'swap-x-for-y', 'swap-y-for-x'];
  
  return abi.functions.some((func: any) => 
    func.name && swapFunctionNames.some(swapName => 
      func.name.toLowerCase().includes(swapName.toLowerCase())
    )
  );
}

// Helper function to check if ABI contains reward/staking functions
function hasRewardFunctions(abi: any): boolean {
  if (!abi || !abi.functions) return false;
  
  const rewardFunctionNames = ['claim', 'claim-reward', 'claim-rewards', 'get-reward', 'harvest',
    'stake', 'unstake', 'deposit', 'withdraw', 'earn', 'compound', 'pending-reward'];
  
  return abi.functions.some((func: any) => 
    func.name && rewardFunctionNames.some(rewardName => 
      func.name.toLowerCase().includes(rewardName.toLowerCase())
    )
  );
}

// Helper function to detect obfuscated/minified source code (arbitrage indicator)
function hasObfuscatedCode(data: ContractData): boolean {
  if (!data.abi || !data.abi.functions) return false;
  
  // Look for dispatch pattern and minified function names
  const hasDispatchPattern = data.abi.functions.some((func: any) => 
    func.name && func.name.toLowerCase() === 'dispatch'
  );
  
  // Count functions with minified names (hex-like or random chars, 6-8 chars)
  const minifiedFunctions = data.abi.functions.filter((func: any) => 
    func.name && /^[a-z0-9]{6,8}$/.test(func.name.toLowerCase())
  );
  
  // If >50% of functions are minified or has dispatch pattern, likely obfuscated
  return hasDispatchPattern || (minifiedFunctions.length > data.abi.functions.length * 0.5);
}

// Contract Classification Logic
export function classifyContract(data: ContractData): string {
  const hasVaultInterface = data.interfaces.some(i => i.interface === 'vault');
  const hasSip010Interface = data.interfaces.some(i => i.interface === 'sip-010-ft');
  const hasSwapAbi = hasSwapFunctions(data.abi);
  const hasRewardAbi = hasRewardFunctions(data.abi);
  const isObfuscated = hasObfuscatedCode(data);
  
  // Token contract (highest priority for SIP-010 interface)
  if (hasSip010Interface) {
    return "Token Contract";
  }
  
  // Yield farming / Reward contracts (ABI-based detection)
  if (hasRewardAbi) {
    return "Yield Farm";
  }
  
  // Arbitrage contracts (obfuscated code + high frequency + low value)
  if (isObfuscated && data.avg_interactions_per_day >= 50 && data.avg_usd_per_interaction < 100) {
    return "Arbitrage Contract";
  }
  
  // DEX contracts (ABI-based detection or high volume patterns)
  if (hasSwapAbi || (data.active_tokens >= 5 && data.avg_interactions_per_day >= 50)) {
    const totalInbound = data.token_activity.reduce((sum, token) => sum + token.inbound_usd, 0);
    const totalOutbound = data.token_activity.reduce((sum, token) => sum + token.outbound_usd, 0);
    
    // Balanced flows with high token diversity or swap functions indicate DEX
    if (hasSwapAbi || Math.abs(totalInbound - totalOutbound) < (totalInbound + totalOutbound) * 0.3) {
      return "DEX";
    }
  }
  
  // AMM/DEX classification (lower threshold for vault interfaces)
  if (hasVaultInterface && data.active_tokens >= 2) {
    const totalInbound = data.token_activity.reduce((sum, token) => sum + token.inbound_usd, 0);
    const totalOutbound = data.token_activity.reduce((sum, token) => sum + token.outbound_usd, 0);
    
    // Balanced flows indicate AMM
    if (Math.abs(totalInbound - totalOutbound) < (totalInbound + totalOutbound) * 0.2) {
      return "Automated Market Maker";
    }
  }
  
  // High frequency, low value patterns (non-obfuscated arbitrage) - very restrictive now
  if (data.avg_interactions_per_day >= 200 && data.avg_usd_per_interaction < 25 && data.active_tokens <= 2) {
    return "Arbitrage Contract";
  }
  
  // Bridge pattern (specific token pairs)
  if (data.active_tokens === 2 && data.recent_interactions > 100) {
    return "Bridge Contract";
  }
  
  // Staking pattern (more inbound than outbound)
  const totalInbound = data.token_activity.reduce((sum, token) => sum + token.inbound_usd, 0);
  const totalOutbound = data.token_activity.reduce((sum, token) => sum + token.outbound_usd, 0);
  
  if (totalInbound > totalOutbound * 2) {
    return "Staking Pool";
  }
  
  // Default
  return "Smart Contract";
}

// Template-based narrative generation
export function generateWalletAnalysis(data: WalletData): string {
  const classification = classifyWallet(data);
  const totalVolume = data.token_activity.reduce((sum, token) => 
    sum + token.inbound_usd + token.outbound_usd, 0
  );
  
  const formatVolume = (amount: number): string => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };
  
  const primaryTokens = data.token_activity
    .slice(0, 3)
    .map(t => t.display_symbol || t.token_symbol)
    .join(", ");
  
  const topCounterparty = data.top_counterparties[0];
  
  let analysis = `This wallet exhibits the behavior of a **${classification}**, handling ${formatVolume(totalVolume)} across ${data.active_tokens} different tokens. `;
  
  // Add automated detection note
  if (data.avg_txs_per_day >= 100) {
    analysis += `⚠️ **High-frequency activity detected** - With ${Math.round(data.avg_txs_per_day)} transactions per day, this wallet appears to be **automated** rather than manually operated. `;
  }
  
  analysis += `The address executes an average of ${Math.round(data.avg_txs_per_day)} transactions daily with a typical transaction value of ${formatVolume(data.avg_usd_per_tx)}. `;
  
  if (primaryTokens) {
    if (classification === "Jeet") {
      // For jeets, separate what they're selling vs receiving
      const stableTokens = ['STX', 'SBTC', 'USDA', 'SUSDT', 'DIKO', 'ALEX'];
      const sellingTokens = data.token_activity
        .filter(token => token.outbound_tokens > token.inbound_tokens && 
                        !stableTokens.some(stable => token.token_symbol.toUpperCase().includes(stable)))
        .slice(0, 2)
        .map(t => t.display_symbol || t.token_symbol)
        .join(", ");
      const receivingTokens = data.token_activity
        .filter(token => token.inbound_tokens > token.outbound_tokens && 
                        stableTokens.some(stable => token.token_symbol.toUpperCase().includes(stable)))
        .slice(0, 2)
        .map(t => t.display_symbol || t.token_symbol)
        .join(", ");
      
      if (sellingTokens && receivingTokens) {
        analysis += `Primary activity involves selling ${sellingTokens} in exchange for ${receivingTokens}`;
      } else {
        analysis += `Primary activity involves selling microcap tokens for stable assets`;
      }
    } else {
      analysis += `Primary activity centers around ${primaryTokens} trading`;
    }
    if (topCounterparty) {
      const counterpartyType = topCounterparty.counterparty.includes('stableswap') ? 'AMM protocols' :
                              topCounterparty.counterparty.includes('alex') ? 'ALEX ecosystem' :
                              topCounterparty.counterparty.includes('arkadiko') ? 'Arkadiko platform' :
                              'DeFi protocols';
      analysis += `, with significant interactions with ${counterpartyType}`;
    }
    analysis += `. `;
  }
  
  // Add behavioral insights
  const totalInbound = data.token_activity.reduce((sum, token) => sum + token.inbound_usd, 0);
  const totalOutbound = data.token_activity.reduce((sum, token) => sum + token.outbound_usd, 0);
  
  if (classification === "Jeet") {
    analysis += `The wallet exhibits classic "jeet" behavior, consistently selling microcap and meme tokens in favor of more stable assets like STX, sBTC, and stablecoins.`;
  } else if (totalInbound > totalOutbound * 1.5) {
    analysis += `The wallet shows a net accumulation pattern, consistently acquiring more tokens than it disposes of.`;
  } else if (totalOutbound > totalInbound * 1.5) {
    analysis += `The wallet demonstrates active distribution behavior, with more outbound than inbound token flows.`;
  } else {
    analysis += `The wallet maintains balanced trading activity with relatively equal inbound and outbound flows.`;
  }
  
  return analysis;
}

// Helper function to get classification explanation
function getClassificationExplanation(classification: string): string {
  const explanations: { [key: string]: string } = {
    "DEX": "a decentralized exchange that facilitates token swaps",
    "Yield Farm": "a protocol that distributes rewards to users for staking or providing liquidity",
    "Automated Market Maker": "a liquidity pool that enables automated token trading",
    "Token Contract": "a fungible token implementation following SIP-010 standard",
    "Arbitrage Contract": "a system that exploits price differences across markets",
    "Bridge Contract": "a protocol that enables asset transfers between different networks",
    "Staking Pool": "a contract where users can stake tokens to earn rewards",
    "Smart Contract": "a general-purpose programmable contract"
  };
  
  return explanations[classification] || "a blockchain-based smart contract";
}

export function generateContractAnalysis(data: ContractData): string {
  const classification = classifyContract(data);
  const totalVolume = data.token_activity.reduce((sum, token) => 
    sum + token.inbound_usd + token.outbound_usd, 0
  );
  
  const formatVolume = (amount: number): string => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };
  
  let analysis = `This contract operates as a **${classification}** - ${getClassificationExplanation(classification)} - processing ${formatVolume(totalVolume)} through ${data.recent_interactions.toLocaleString()} interactions. `;
  
  // Interface details
  const interfaceTypes = data.interfaces.map(i => i.interface);
  if (interfaceTypes.length > 0) {
    const interfaceDesc = interfaceTypes.includes('vault') ? 'liquidity pool management' :
                         interfaceTypes.includes('sip-010-ft') ? 'fungible token standard' :
                         'smart contract interfaces';
    analysis += `The protocol implements ${interfaceDesc} with ${interfaceTypes.join(', ')} compliance. `;
  }
  
  analysis += `The system serves ${data.recent_users} recent users with an average transaction value of ${formatVolume(data.avg_usd_per_interaction)}. `;
  
  // Token activity insights
  if (data.token_activity.length > 0) {
    const primaryPairs = data.token_activity
      .slice(0, 2)
      .map(t => t.token_symbol)
      .join('-');
    
    if (data.token_activity.length === 2) {
      analysis += `The contract primarily facilitates ${primaryPairs} trading pairs with balanced liquidity provision.`;
    } else if (data.token_activity.length > 2) {
      analysis += `Multi-token operations include ${primaryPairs} and ${data.token_activity.length - 2} additional token types.`;
    }
  }
  
  return analysis;
}
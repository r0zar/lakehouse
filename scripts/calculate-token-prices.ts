#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { bigquery } from '../lib/bigquery';

loadEnvConfig(process.cwd());

interface TokenPrice {
  token_contract_id: string;
  sbtc_price: number;
  usd_price: number;
}

interface PoolData {
  vault_contract_id: string;
  token_a_id: string;
  token_b_id: string;
  reserves_a: number;
  reserves_b: number;
  pool_type: string;
  token_a_decimals: number;
  token_b_decimals: number;
}

interface PoolTVL {
  vault_contract_id: string;
  token_contract_id: string;
  individual_price: number;
  tvl_usd: number;
}

async function getBtcPriceFromKraken(): Promise<number> {
  try {
    console.log('Fetching BTC price from Kraken API...');
    
    const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=XXBTZUSD');
    const data = await response.json();
    
    if (data.error && data.error.length > 0) {
      throw new Error(`Kraken API error: ${data.error.join(', ')}`);
    }
    
    if (!data.result || !data.result.XXBTZUSD) {
      throw new Error('Invalid response structure from Kraken API');
    }
    
    const btcPrice = parseFloat(data.result.XXBTZUSD.c[0]); // 'c' is the last trade closed price
    
    if (isNaN(btcPrice) || btcPrice <= 0) {
      throw new Error(`Invalid BTC price received: ${btcPrice}`);
    }
    
    console.log(`✓ BTC price from Kraken: $${btcPrice.toLocaleString()}`);
    return btcPrice;
    
  } catch (error) {
    console.error('Error fetching BTC price from Kraken:', error);
    
    // Fallback to a reasonable default if API fails
    const fallbackPrice = 100000;
    console.log(`⚠️ Using fallback BTC price: $${fallbackPrice.toLocaleString()}`);
    return fallbackPrice;
  }
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

async function getSeedPrices(): Promise<TokenPrice[]> {
  console.log('Getting seed prices...');
  
  // Get BTC price from Kraken API
  const btcUsdPrice = await getBtcPriceFromKraken();
  
  // Create seed prices with BTC = sBTC assumption
  const seedPrices: TokenPrice[] = [
    {
      token_contract_id: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
      sbtc_price: 1.0, // 1 sBTC = 1 BTC
      usd_price: btcUsdPrice
    }
  ];
  
  // Note: No DB seeding — sBTC is the sole anchor.
  // Multi-hop iteration discovers all other prices from pool reserves.
  
  console.log(`✓ Using ${seedPrices.length} seed prices total`);
  
  // Log sample prices for verification
  console.log('Seed prices:');
  seedPrices.slice(0, 5).forEach(p => {
    console.log(`  ${p.token_contract_id}: $${p.usd_price.toFixed(6)} (${p.sbtc_price.toFixed(8)} sBTC)`);
  });
  
  return seedPrices;
}

// Global pool data loaded once at startup
let poolDataCache: PoolData[] = [];

async function loadPoolData(): Promise<void> {
  console.log('Loading pool data from BigQuery...');
  
  const query = `
    SELECT 
      cpr.pool_contract_id as vault_contract_id,
      lp.token_a_contract_id as token_a_id,
      lp.token_b_contract_id as token_b_id,
      cpr.reserves_a,
      cpr.reserves_b,
      lp.pool_type,
      COALESCE(CAST(JSON_EXTRACT_SCALAR(token_a_meta.metadata, '$.decimals') AS INT64), 6) as token_a_decimals,
      COALESCE(CAST(JSON_EXTRACT_SCALAR(token_b_meta.metadata, '$.decimals') AS INT64), 6) as token_b_decimals
    FROM crypto_data.current_pool_reserves cpr
    JOIN crypto_data.liquidity_pools lp ON lp.contract_id = cpr.pool_contract_id
    LEFT JOIN crypto_data.contract_interfaces token_a_meta ON token_a_meta.contract_id = lp.token_a_contract_id AND token_a_meta.interface = 'sip-010-ft'
    LEFT JOIN crypto_data.contract_interfaces token_b_meta ON token_b_meta.contract_id = lp.token_b_contract_id AND token_b_meta.interface = 'sip-010-ft'
    WHERE lp.pool_type = 'constant_product'  -- Only use constant product pools for price calculation
  `;
  
  try {
    const [rows] = await bigquery.query(query);
    poolDataCache = rows.map((row: any) => ({
      vault_contract_id: row.vault_contract_id,
      token_a_id: row.token_a_id,
      token_b_id: row.token_b_id,
      reserves_a: parseFloat(row.reserves_a),
      reserves_b: parseFloat(row.reserves_b),
      pool_type: row.pool_type,
      token_a_decimals: parseInt(row.token_a_decimals),
      token_b_decimals: parseInt(row.token_b_decimals)
    }));
    
    console.log(`✓ Loaded ${poolDataCache.length} pools into memory`);
    
  } catch (error) {
    console.error('Error loading pool data:', error);
    throw error;
  }
}

function calculatePoolTVLs(prices: TokenPrice[]): PoolTVL[] {
  console.log('Calculating pool TVLs in memory...');

  // sBTC is the price anchor — never re-derive it from pools
  const sbtcTokenId = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';

  // Create price lookup map
  const priceMap = new Map<string, number>();
  for (const price of prices) {
    priceMap.set(price.token_contract_id, price.usd_price);
  }

  const poolTVLs: PoolTVL[] = [];
  
  for (const pool of poolDataCache) {
    const tokenAPrice = priceMap.get(pool.token_a_id) || 0;
    const tokenBPrice = priceMap.get(pool.token_b_id) || 0;
    
    // Skip pools where neither side has a known price
    if (tokenAPrice === 0 && tokenBPrice === 0) continue;

    // Adjust reserves for decimals
    const adjustedReservesA = pool.reserves_a / Math.pow(10, pool.token_a_decimals);
    const adjustedReservesB = pool.reserves_b / Math.pow(10, pool.token_b_decimals);

    // Calculate TVL (use known prices; unknown sides contribute 0)
    const tvlUsd = adjustedReservesA * tokenAPrice + adjustedReservesB * tokenBPrice;

    // Skip pools with no meaningful TVL
    if (tvlUsd <= 0) continue;

    // Derive price for the unknown side from the known side.
    // If both sides are known, skip — re-deriving both creates oscillation.
    // Never re-derive sBTC — it is the price anchor.
    if (tokenAPrice > 0 && tokenBPrice === 0 && adjustedReservesB > 0 && pool.token_b_id !== sbtcTokenId) {
      const tokenBPriceFromPool = (adjustedReservesA / adjustedReservesB) * tokenAPrice;
      poolTVLs.push({
        vault_contract_id: pool.vault_contract_id,
        token_contract_id: pool.token_b_id,
        individual_price: tokenBPriceFromPool,
        tvl_usd: tvlUsd
      });
    } else if (tokenBPrice > 0 && tokenAPrice === 0 && adjustedReservesA > 0 && pool.token_a_id !== sbtcTokenId) {
      const tokenAPriceFromPool = (adjustedReservesB / adjustedReservesA) * tokenBPrice;
      poolTVLs.push({
        vault_contract_id: pool.vault_contract_id,
        token_contract_id: pool.token_a_id,
        individual_price: tokenAPriceFromPool,
        tvl_usd: tvlUsd
      });
    }
  }
  
  console.log(`✓ Calculated ${poolTVLs.length} pool TVLs in memory`);
  return poolTVLs;
}

function calculateWeightedPrices(poolTVLs: PoolTVL[], btcUsdRate: number): TokenPrice[] {
  console.log('Calculating TVL-weighted prices...');
  
  const tokenPriceMap = new Map<string, { totalWeightedPrice: number, totalTVL: number }>();
  
  for (const pool of poolTVLs) {
    if (!tokenPriceMap.has(pool.token_contract_id)) {
      tokenPriceMap.set(pool.token_contract_id, { totalWeightedPrice: 0, totalTVL: 0 });
    }
    
    const current = tokenPriceMap.get(pool.token_contract_id)!;
    current.totalWeightedPrice += pool.individual_price * pool.tvl_usd;
    current.totalTVL += pool.tvl_usd;
  }
  
  const weightedPrices: TokenPrice[] = [];
  for (const [tokenId, data] of tokenPriceMap) {
    if (data.totalTVL > 0) {
      const usd_price = data.totalWeightedPrice / data.totalTVL;
      weightedPrices.push({
        token_contract_id: tokenId,
        sbtc_price: usd_price / btcUsdRate,
        usd_price: usd_price
      });
    }
  }
  
  console.log(`✓ Calculated weighted prices for ${weightedPrices.length} tokens`);
  return weightedPrices;
}

function hasConverged(oldPrices: TokenPrice[], newPrices: TokenPrice[], tolerance: number = 0.001): boolean {
  const oldPriceMap = new Map(oldPrices.map(p => [p.token_contract_id, p.usd_price]));
  
  let totalChange = 0;
  let compareCount = 0;
  
  for (const newPrice of newPrices) {
    const oldPrice = oldPriceMap.get(newPrice.token_contract_id);
    if (oldPrice !== undefined && oldPrice > 0) {
      const changePercent = Math.abs(newPrice.usd_price - oldPrice) / oldPrice;
      totalChange += changePercent;
      compareCount++;
    }
  }
  
  if (compareCount === 0) return false;
  
  const avgChangePercent = totalChange / compareCount;
  console.log(`Average price change: ${(avgChangePercent * 100).toFixed(4)}%`);
  
  return avgChangePercent < tolerance;
}

function calculateConvergencePercent(oldPrices: TokenPrice[], newPrices: TokenPrice[]): number {
  const oldPriceMap = new Map(oldPrices.map(p => [p.token_contract_id, p.usd_price]));
  
  let totalChange = 0;
  let compareCount = 0;
  
  for (const newPrice of newPrices) {
    const oldPrice = oldPriceMap.get(newPrice.token_contract_id);
    if (oldPrice !== undefined && oldPrice > 0) {
      const changePercent = Math.abs(newPrice.usd_price - oldPrice) / oldPrice;
      totalChange += changePercent;
      compareCount++;
    }
  }
  
  return compareCount === 0 ? 0 : (totalChange / compareCount) * 100;
}

async function storeFinalPrices(prices: TokenPrice[], iterationCount: number, finalConvergence: number): Promise<void> {
  console.log('Storing final prices in historical table...');
  
  const calculatedAt = new Date().toISOString();
  
  // Insert into historical prices table
  const storeSQL = `
    INSERT INTO \`crypto_data.token_prices\` (
      token_contract_id,
      sbtc_price,
      usd_price,
      price_source,
      iterations_to_converge,
      final_convergence_percent,
      calculated_at
    )
    SELECT 
      token_contract_id,
      sbtc_price,
      usd_price,
      price_source,
      iterations_to_converge,
      final_convergence_percent,
      calculated_at
    FROM UNNEST([
      ${prices.map(p => 
        `STRUCT(
          '${escapeString(p.token_contract_id)}' as token_contract_id,
          CAST(${p.sbtc_price} AS NUMERIC) as sbtc_price,
          CAST(${p.usd_price} AS NUMERIC) as usd_price,
          'tvl_weighted_iteration' as price_source,
          ${iterationCount} as iterations_to_converge,
          CAST(${finalConvergence} AS NUMERIC) as final_convergence_percent,
          TIMESTAMP('${calculatedAt}') as calculated_at
        )`
      ).join(',\n      ')}
    ])
  `;
  
  try {
    await bigquery.query(storeSQL);
    console.log(`✓ Stored ${prices.length} token prices with convergence metadata`);
  } catch (error) {
    console.error('Error storing final prices:', error);
    throw error;
  }
}

async function calculateTokenPrices(): Promise<void> {
  try {
    console.log('🚀 Starting iterative token price calculation...\n');
    
    // 1. Load all pool data once at startup
    await loadPoolData();
    
    // 2. Get seed prices from API and BTC rate
    let prices = await getSeedPrices();
    const btcPrice = await getBtcPriceFromKraken();
    
    if (prices.length === 0) {
      console.log('No seed prices available from API');
      return;
    }
    
    // 3. Iterate until convergence (all in memory now)
    let finalIteration = 10;
    let finalConvergencePercent = 0;
    
    for (let iteration = 0; iteration < 10; iteration++) {
      console.log(`\n--- Iteration ${iteration + 1} ---`);
      
      // Calculate TVLs using current prices (in memory)
      const poolTVLs = calculatePoolTVLs(prices);
      
      if (poolTVLs.length === 0) {
        console.log('No pool TVL data available');
        break;
      }
      
      // Calculate new weighted prices (in memory)
      const newPrices = calculateWeightedPrices(poolTVLs, btcPrice);
      
      // Merge new prices into existing prices (preserves seed prices like sBTC)
      const mergedPrices = new Map(prices.map(p => [p.token_contract_id, p]));
      for (const np of newPrices) {
        mergedPrices.set(np.token_contract_id, np);
      }
      const updatedPrices = Array.from(mergedPrices.values());

      // Check convergence (also require no new tokens discovered this iteration)
      const newTokensDiscovered = updatedPrices.length > prices.length;
      const converged = iteration > 0 && !newTokensDiscovered && hasConverged(prices, updatedPrices, 0.001);
      if (converged) {
        console.log(`\n✅ Converged after ${iteration + 1} iterations`);
        finalIteration = iteration + 1;
        finalConvergencePercent = calculateConvergencePercent(prices, updatedPrices);
        prices = updatedPrices;
        break;
      }

      prices = updatedPrices;
      
      // Track final convergence if we hit max iterations
      if (iteration === 9) {
        finalConvergencePercent = calculateConvergencePercent(prices, newPrices);
      }
      
      // Log some sample prices
      console.log('Sample prices:');
      prices.slice(0, 3).forEach(p => {
        console.log(`  ${p.token_contract_id}: $${p.usd_price.toFixed(6)}`);
      });
    }
    
    // 4. Store final prices with convergence metadata
    // Add sBTC to final prices so it gets a fresh timestamp
    const sbtcId = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
    const sbtcSeed: TokenPrice = {
      token_contract_id: sbtcId,
      sbtc_price: 1.0,
      usd_price: btcPrice
    };
    const filteredPrices = prices.filter(p =>
      p.token_contract_id !== sbtcId &&
      isFinite(p.usd_price) && p.usd_price > 0 &&
      isFinite(p.sbtc_price) && p.sbtc_price > 0
    );
    await storeFinalPrices([sbtcSeed, ...filteredPrices], finalIteration, finalConvergencePercent);
    
    console.log(`\n🎉 Successfully calculated prices for ${prices.length} tokens!`);
    
  } catch (error) {
    console.error('❌ Error calculating token prices:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  calculateTokenPrices();
}

export { calculateTokenPrices };
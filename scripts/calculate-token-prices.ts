#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

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
  token_a_decimals: number;
  token_b_decimals: number;
}

interface PoolTVL {
  vault_contract_id: string;
  token_contract_id: string;
  individual_price: number;
  tvl_usd: number;
}

const BTC_USD_RATE = 100000; // TODO: Get from external API

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

async function getSeedPrices(): Promise<TokenPrice[]> {
  console.log('Getting seed prices from database (latest prices)...');
  
  try {
    // First try to get prices from our database
    const query = `
      SELECT 
        token_contract_id,
        sbtc_price,
        usd_price
      FROM \`crypto_data.current_token_prices\`
      WHERE usd_price > 0 AND sbtc_price > 0
    `;
    
    writeFileSync('/tmp/get_seed_prices.sql', query);
    
    const result = execSync('bq query --use_legacy_sql=false --format=json < /tmp/get_seed_prices.sql', 
      { encoding: 'utf8' });
    
    const rows = JSON.parse(result);
    
    if (rows.length > 0) {
      const seedPrices: TokenPrice[] = rows.map((row: any) => ({
        token_contract_id: row.token_contract_id,
        sbtc_price: parseFloat(row.sbtc_price),
        usd_price: parseFloat(row.usd_price)
      }));
      
      console.log(`✓ Got ${seedPrices.length} seed prices from database`);
      
      // Log a few sample prices for verification
      if (seedPrices.length > 0) {
        console.log('Sample seed prices:');
        seedPrices.slice(0, 3).forEach(p => {
          console.log(`  ${p.token_contract_id}: $${p.usd_price.toFixed(6)} (${p.sbtc_price.toFixed(8)} sBTC)`);
        });
      }
      
      return seedPrices;
    }
    
  } catch (error) {
    console.log('No database prices available, falling back to API...');
  }
  
  // If no database prices, throw error - no more API dependency
  throw new Error('No seed prices available in database. Please bootstrap by importing initial data first.');
}

// Global pool data loaded once at startup
let poolDataCache: PoolData[] = [];

async function loadPoolData(): Promise<void> {
  console.log('Loading pool data from BigQuery...');
  
  const query = `
    SELECT 
      vr.vault_contract_id,
      JSON_EXTRACT_SCALAR(vault.metadata, '$.token_a_contract_id') as token_a_id,
      JSON_EXTRACT_SCALAR(vault.metadata, '$.token_b_contract_id') as token_b_id,
      vr.reserves_a,
      vr.reserves_b,
      COALESCE(CAST(JSON_EXTRACT_SCALAR(token_a_meta.metadata, '$.decimals') AS INT64), 6) as token_a_decimals,
      COALESCE(CAST(JSON_EXTRACT_SCALAR(token_b_meta.metadata, '$.decimals') AS INT64), 6) as token_b_decimals
    FROM crypto_data.vault_reserves vr
    JOIN crypto_data.contract_interfaces vault ON vault.contract_id = vr.vault_contract_id
    LEFT JOIN crypto_data.contract_interfaces token_a_meta ON token_a_meta.contract_id = JSON_EXTRACT_SCALAR(vault.metadata, '$.token_a_contract_id') AND token_a_meta.interface = 'sip-010-ft'
    LEFT JOIN crypto_data.contract_interfaces token_b_meta ON token_b_meta.contract_id = JSON_EXTRACT_SCALAR(vault.metadata, '$.token_b_contract_id') AND token_b_meta.interface = 'sip-010-ft'
    WHERE vault.interface = 'vault'
      AND vr.reserves_updated_at = (
        SELECT MAX(reserves_updated_at) 
        FROM crypto_data.vault_reserves vr2 
        WHERE vr2.vault_contract_id = vr.vault_contract_id
      )
  `;
  
  writeFileSync('/tmp/load_pool_data.sql', query);
  
  try {
    const result = execSync('bq query --use_legacy_sql=false --format=json < /tmp/load_pool_data.sql', 
      { encoding: 'utf8' });
    
    const rows = JSON.parse(result);
    poolDataCache = rows.map((row: any) => ({
      vault_contract_id: row.vault_contract_id,
      token_a_id: row.token_a_id,
      token_b_id: row.token_b_id,
      reserves_a: parseFloat(row.reserves_a),
      reserves_b: parseFloat(row.reserves_b),
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
  
  // Create price lookup map
  const priceMap = new Map<string, number>();
  for (const price of prices) {
    priceMap.set(price.token_contract_id, price.usd_price);
  }
  
  const poolTVLs: PoolTVL[] = [];
  
  for (const pool of poolDataCache) {
    const tokenAPrice = priceMap.get(pool.token_a_id) || 0;
    const tokenBPrice = priceMap.get(pool.token_b_id) || 0;
    
    // Skip pools where we don't have both token prices
    if (tokenAPrice === 0 || tokenBPrice === 0) continue;
    
    // Adjust reserves for decimals
    const adjustedReservesA = pool.reserves_a / Math.pow(10, pool.token_a_decimals);
    const adjustedReservesB = pool.reserves_b / Math.pow(10, pool.token_b_decimals);
    
    // Calculate TVL
    const tvlUsd = adjustedReservesA * tokenAPrice + adjustedReservesB * tokenBPrice;
    
    // Skip pools with no meaningful TVL
    if (tvlUsd <= 0) continue;
    
    // Calculate individual pool prices (token ratios × reference token price)
    if (adjustedReservesA > 0) {
      const tokenARatioInB = adjustedReservesB / adjustedReservesA;
      poolTVLs.push({
        vault_contract_id: pool.vault_contract_id,
        token_contract_id: pool.token_a_id,
        individual_price: tokenARatioInB * tokenBPrice,
        tvl_usd: tvlUsd
      });
    }
    
    if (adjustedReservesB > 0) {
      const tokenBRatioInA = adjustedReservesA / adjustedReservesB;
      poolTVLs.push({
        vault_contract_id: pool.vault_contract_id,
        token_contract_id: pool.token_b_id,
        individual_price: tokenBRatioInA * tokenAPrice,
        tvl_usd: tvlUsd
      });
    }
  }
  
  console.log(`✓ Calculated ${poolTVLs.length} pool TVLs in memory`);
  return poolTVLs;
}

function calculateWeightedPrices(poolTVLs: PoolTVL[]): TokenPrice[] {
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
        sbtc_price: usd_price / BTC_USD_RATE,
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
  
  writeFileSync('/tmp/store_prices.sql', storeSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/store_prices.sql', { stdio: 'inherit' });
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
    
    // 2. Get seed prices from API
    let prices = await getSeedPrices();
    
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
      const newPrices = calculateWeightedPrices(poolTVLs);
      
      // Check convergence
      const converged = iteration > 0 && hasConverged(prices, newPrices, 0.001);
      if (converged) {
        console.log(`\n✅ Converged after ${iteration + 1} iterations`);
        finalIteration = iteration + 1;
        finalConvergencePercent = calculateConvergencePercent(prices, newPrices);
        prices = newPrices;
        break;
      }
      
      prices = newPrices;
      
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
    await storeFinalPrices(prices, finalIteration, finalConvergencePercent);
    
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
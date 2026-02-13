#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { bigquery } from '../lib/bigquery';

loadEnvConfig(process.cwd());

const SBTC_CONTRACT = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const SBTC_DECIMALS = 8;
const QUOTE_API_URL = 'https://swap.charisma.rocks/api/v1/quote';
const TOKENS_API_URL = 'https://invest.charisma.rocks/api/v1/tokens';

// ~$1 of sBTC at $100k = 0.00001 sBTC = 1000 units (8 decimals)
// Use a small amount to minimize price impact but large enough to get meaningful quotes
const SBTC_QUOTE_AMOUNT = 1000;

interface TokenPrice {
  token_contract_id: string;
  sbtc_price: number;
  usd_price: number;
}

interface TokenInfo {
  contractId: string;
  symbol: string;
  decimals: number;
  type?: string;
  base?: string;
}

interface QuoteResponse {
  success: boolean;
  data?: {
    path: { contractId: string; decimals: number }[];
    hops: any[];
    amountIn: number;
    amountOut: number;
  };
  error?: string;
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

    const btcPrice = parseFloat(data.result.XXBTZUSD.c[0]);

    if (isNaN(btcPrice) || btcPrice <= 0) {
      throw new Error(`Invalid BTC price received: ${btcPrice}`);
    }

    console.log(`BTC price from Kraken: $${btcPrice.toLocaleString()}`);
    return btcPrice;

  } catch (error) {
    console.error('Error fetching BTC price from Kraken:', error);
    const fallbackPrice = 100000;
    console.log(`Using fallback BTC price: $${fallbackPrice.toLocaleString()}`);
    return fallbackPrice;
  }
}

async function fetchTokenList(): Promise<TokenInfo[]> {
  console.log('Fetching token list from dex-cache...');

  const response = await fetch(TOKENS_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch tokens: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.status !== 'success' || !Array.isArray(json.data)) {
    throw new Error('Unexpected token list response shape');
  }

  const tokens: TokenInfo[] = json.data.map((t: any) => ({
    contractId: t.contractId,
    symbol: t.symbol || '',
    decimals: t.decimals ?? 6,
    type: t.type,
    base: t.base,
  }));

  console.log(`Fetched ${tokens.length} tokens from dex-cache`);
  return tokens;
}

async function fetchQuote(tokenIn: string, tokenOut: string, amount: number): Promise<QuoteResponse> {
  const url = `${QUOTE_API_URL}?tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&amount=${amount}`;
  const response = await fetch(url);
  return await response.json() as QuoteResponse;
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

async function storeFinalPrices(prices: TokenPrice[]): Promise<void> {
  if (prices.length === 0) {
    console.log('No prices to store');
    return;
  }

  console.log('Storing prices in BigQuery...');

  const calculatedAt = new Date().toISOString();

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
          'multihop_quote' as price_source,
          0 as iterations_to_converge,
          CAST(0 AS NUMERIC) as final_convergence_percent,
          TIMESTAMP('${calculatedAt}') as calculated_at
        )`
      ).join(',\n      ')}
    ])
  `;

  try {
    await bigquery.query(storeSQL);
    console.log(`Stored ${prices.length} token prices`);
  } catch (error) {
    console.error('Error storing prices:', error);
    throw error;
  }
}

async function calculateTokenPrices(): Promise<void> {
  try {
    console.log('Starting quote-based token price calculation...\n');

    // 1. Get BTC/USD rate from Kraken
    const btcUsdPrice = await getBtcPriceFromKraken();

    // 2. Fetch all tokens from dex-cache
    const tokens = await fetchTokenList();

    // Filter to priceable tokens: skip sBTC itself, subnet tokens (priced via their base),
    // and LP/pool tokens (they derive value from underlying tokens)
    const priceableTokens = tokens.filter(t =>
      t.contractId !== SBTC_CONTRACT &&
      t.type !== 'SUBNET'
    );

    console.log(`\nPricing ${priceableTokens.length} tokens via multihop quotes from sBTC...\n`);

    // 3. Quote sBTC → each token sequentially to avoid rate limiting
    const prices: TokenPrice[] = [];
    const failed: string[] = [];

    // Always include sBTC as the anchor
    prices.push({
      token_contract_id: SBTC_CONTRACT,
      sbtc_price: 1.0,
      usd_price: btcUsdPrice,
    });

    for (const token of priceableTokens) {
      try {
        const quote = await fetchQuote(SBTC_CONTRACT, token.contractId, SBTC_QUOTE_AMOUNT);

        if (!quote.success || !quote.data || quote.data.amountOut <= 0) {
          failed.push(`${token.symbol} (${token.contractId}): ${quote.error || 'no route'}`);
          continue;
        }

        // amountIn and amountOut are in raw micro-units
        // sbtc_price = how much sBTC for 1 token = amountIn / amountOut
        // But we need to account for decimal differences:
        //   sbtc_price_per_token = (amountIn / 10^sbtcDecimals) / (amountOut / 10^tokenDecimals)
        const sbtcAmount = quote.data.amountIn / Math.pow(10, SBTC_DECIMALS);
        const tokenAmount = quote.data.amountOut / Math.pow(10, token.decimals);
        const sbtcPricePerToken = sbtcAmount / tokenAmount;
        const usdPricePerToken = sbtcPricePerToken * btcUsdPrice;

        // Sanity check
        if (!isFinite(usdPricePerToken) || usdPricePerToken <= 0) {
          failed.push(`${token.symbol}: invalid price ${usdPricePerToken}`);
          continue;
        }

        prices.push({
          token_contract_id: token.contractId,
          sbtc_price: sbtcPricePerToken,
          usd_price: usdPricePerToken,
        });

        console.log(`  ${token.symbol.padEnd(10)} $${usdPricePerToken < 0.01 ? usdPricePerToken.toExponential(4) : usdPricePerToken.toFixed(6)} (${sbtcPricePerToken.toExponential(4)} sBTC)`);

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failed.push(`${token.symbol} (${token.contractId}): ${msg}`);
      }
    }

    // 4. Copy prices to subnet tokens from their base token
    const subnetTokens = tokens.filter(t => t.type === 'SUBNET' && t.base);
    const priceMap = new Map(prices.map(p => [p.token_contract_id, p]));

    for (const subnet of subnetTokens) {
      const basePrice = priceMap.get(subnet.base!);
      if (basePrice) {
        prices.push({
          token_contract_id: subnet.contractId,
          sbtc_price: basePrice.sbtc_price,
          usd_price: basePrice.usd_price,
        });
        console.log(`  ${subnet.symbol.padEnd(10)} $${basePrice.usd_price < 0.01 ? basePrice.usd_price.toExponential(4) : basePrice.usd_price.toFixed(6)} (subnet of ${subnet.base})`);
      }
    }

    console.log(`\nPriced ${prices.length} tokens successfully`);
    if (failed.length > 0) {
      console.log(`Failed to price ${failed.length} tokens:`);
      failed.forEach(f => console.log(`  - ${f}`));
    }

    // 5. Store in BigQuery
    await storeFinalPrices(prices);

    console.log(`\nDone! Calculated prices for ${prices.length} tokens.`);

  } catch (error) {
    console.error('Error calculating token prices:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  calculateTokenPrices();
}

export { calculateTokenPrices };

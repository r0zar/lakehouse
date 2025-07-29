import { NextRequest } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    
    if (!address) {
      return Response.json({ error: 'Address parameter is required' }, { status: 400 });
    }

    console.log(`🔍 Debug API: Analyzing wallet data for ${address}`);

    // Simple query to understand the raw data structure
    const [rawDataQuery] = await bigquery.query(`
      SELECT 
        source,
        target,
        value,
        raw_value,
        asset,
        currency_symbol,
        token_symbol,
        decimals,
        received_at,
        CASE 
          WHEN STRPOS(asset, "::") > 0 THEN SUBSTR(asset, 1, STRPOS(asset, "::") - 1)
          WHEN asset = 'STX' THEN '.stx'  -- Map STX to .stx for metadata lookup
          ELSE asset 
        END as contract_id
      FROM \`crypto_data.sankey_links\`
      WHERE source = '${address}' OR target = '${address}'
      ORDER BY received_at DESC
      LIMIT 20
    `);

    // Check token prices
    const [pricesQuery] = await bigquery.query(`
      SELECT 
        token_contract_id,
        usd_price
      FROM \`crypto_data.current_token_prices\`
      WHERE token_contract_id IN (
        SELECT DISTINCT
          CASE 
            WHEN STRPOS(asset, "::") > 0 THEN SUBSTR(asset, 1, STRPOS(asset, "::") - 1)
            WHEN asset = 'STX' THEN '.stx'
            ELSE asset 
          END as contract_id
        FROM \`crypto_data.sankey_links\`
        WHERE source = '${address}' OR target = '${address}'
        LIMIT 10
      )
    `);

    // Check token metadata
    const [metadataQuery] = await bigquery.query(`
      SELECT 
        contract_id,
        interface,
        metadata,
        JSON_EXTRACT_SCALAR(metadata, '$.decimals') as metadata_decimals,
        JSON_EXTRACT_SCALAR(metadata, '$.symbol') as metadata_symbol,
        JSON_EXTRACT_SCALAR(metadata, '$.name') as metadata_name
      FROM \`crypto_data.contract_interfaces\`
      WHERE contract_id IN (
        SELECT DISTINCT
          CASE 
            WHEN STRPOS(asset, "::") > 0 THEN SUBSTR(asset, 1, STRPOS(asset, "::") - 1)
            WHEN asset = 'STX' THEN '.stx'
            ELSE asset 
          END as contract_id
        FROM \`crypto_data.sankey_links\`
        WHERE source = '${address}' OR target = '${address}'
        LIMIT 10
      )
      AND interface = 'sip-010-ft'
    `);

    // Test different normalization approaches
    const normalizedData = rawDataQuery.map((row: any) => {
      const baseValue = row.value || 0;
      const rawValue = row.raw_value || 0;
      const decimals = row.decimals;
      
      return {
        contract_id: row.contract_id,
        token_symbol: row.token_symbol,
        currency_symbol: row.currency_symbol,
        asset: row.asset,
        raw_data: {
          value: baseValue,
          raw_value: rawValue,
          decimals: decimals
        },
        normalization_tests: {
          no_normalization: baseValue,
          divide_by_6_decimals: baseValue / 1000000,
          divide_by_8_decimals: baseValue / 100000000,
          divide_by_stored_decimals: decimals ? baseValue / Math.pow(10, decimals) : baseValue,
          raw_value_no_norm: rawValue,
          raw_value_6_decimals: rawValue / 1000000
        }
      };
    });

    return Response.json({
      debug_info: {
        address,
        total_transactions: rawDataQuery.length,
        analysis_timestamp: new Date().toISOString()
      },
      raw_transactions: rawDataQuery.slice(0, 5), // First 5 for inspection
      token_prices: pricesQuery,
      token_metadata: metadataQuery,
      normalization_analysis: normalizedData.slice(0, 5), // First 5 normalized
      summary: {
        unique_tokens: [...new Set(rawDataQuery.map((r: any) => r.contract_id))],
        date_range: {
          earliest: rawDataQuery[rawDataQuery.length - 1]?.received_at?.value || null,
          latest: rawDataQuery[0]?.received_at?.value || null,
          total_transactions: rawDataQuery.length,
          unique_days: [...new Set(rawDataQuery.map((r: any) => {
            const date = new Date(r.received_at?.value || r.received_at);
            return date.toISOString().split('T')[0];
          }))],
          transactions_per_day_calculation: {
            total_transactions: rawDataQuery.length,
            days_spanned: Math.max(1, Math.ceil(
              (new Date(rawDataQuery[0]?.received_at?.value || rawDataQuery[0]?.received_at).getTime() - 
               new Date(rawDataQuery[rawDataQuery.length - 1]?.received_at?.value || rawDataQuery[rawDataQuery.length - 1]?.received_at).getTime()) 
              / (1000 * 60 * 60 * 24)
            )),
            calculated_avg: rawDataQuery.length / Math.max(1, Math.ceil(
              (new Date(rawDataQuery[0]?.received_at?.value || rawDataQuery[0]?.received_at).getTime() - 
               new Date(rawDataQuery[rawDataQuery.length - 1]?.received_at?.value || rawDataQuery[rawDataQuery.length - 1]?.received_at).getTime()) 
              / (1000 * 60 * 60 * 24)
            ))
          }
        },
        value_ranges: {
          min_value: Math.min(...rawDataQuery.map((r: any) => r.value || 0)),
          max_value: Math.max(...rawDataQuery.map((r: any) => r.value || 0)),
          avg_value: rawDataQuery.reduce((sum: number, r: any) => sum + (r.value || 0), 0) / rawDataQuery.length,
          min_raw_value: Math.min(...rawDataQuery.map((r: any) => r.raw_value || 0)),
          max_raw_value: Math.max(...rawDataQuery.map((r: any) => r.raw_value || 0))
        },
        decimal_distribution: rawDataQuery.reduce((acc: any, r: any) => {
          const dec = r.decimals || 'null';
          acc[dec] = (acc[dec] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Debug API Error:', error);
    return Response.json(
      { error: 'Failed to analyze wallet data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
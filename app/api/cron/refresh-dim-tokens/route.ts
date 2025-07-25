import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { analyzeSip010Token } from '@/lib/token-detection';
import { callReadOnly } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const martName = 'dim_tokens';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${martName} refresh...`);

    // Step 1: Create the dim_tokens table schema
    const createTokensTableQuery = `
      CREATE OR REPLACE TABLE crypto_data.dim_tokens AS 
      WITH analyzed_contracts AS (
        SELECT 
          contract_address,
          deployer_address,
          contract_name,
          transaction_count,
          last_seen,
          
          -- Contract Analysis Data
          contract_interface,
          interface_functions,
          interface_function_count,
          contract_info,
          source_code_length,
          deployment_tx_id,
          deployment_block_height,
          canonical,
          
          analyzed_at,
          analysis_duration_ms
          
        FROM crypto_data.dim_contracts
        WHERE analysis_status = 'analyzed'
          AND contract_interface IS NOT NULL
          AND interface_functions IS NOT NULL
          AND ARRAY_LENGTH(interface_functions) > 0
      ),
      
      potential_tokens AS (
        SELECT 
          *,
          -- Check for minimum token functions using array operations
          (
            'transfer' IN UNNEST(interface_functions) AND
            'get-balance' IN UNNEST(interface_functions) AND
            'get-total-supply' IN UNNEST(interface_functions)
          ) as has_minimum_token_functions,
          
          -- Count SIP-010 functions present
          (
            SELECT COUNT(*)
            FROM UNNEST(['get-name', 'get-symbol', 'get-decimals', 'get-total-supply', 'get-token-uri', 'transfer', 'get-balance']) AS required_func
            WHERE required_func IN UNNEST(interface_functions)
          ) as sip010_function_count
          
        FROM analyzed_contracts
      )
      
      SELECT 
        contract_address,
        deployer_address,
        contract_name,
        
        -- Token Classification
        CASE 
          WHEN sip010_function_count >= 5 AND has_minimum_token_functions THEN 'sip010_token'
          WHEN sip010_function_count >= 3 AND has_minimum_token_functions THEN 'partial_token'
          ELSE 'unknown'
        END as token_type,
        
        -- SIP-010 Analysis
        sip010_function_count,
        has_minimum_token_functions,
        interface_functions as available_functions,
        
        -- Token Metadata (to be populated by validation job)
        CAST(NULL AS STRING) as token_name,
        CAST(NULL AS STRING) as token_symbol,
        CAST(NULL AS INT64) as decimals,
        CAST(NULL AS STRING) as total_supply,
        CAST(NULL AS STRING) as token_uri,
        CAST(NULL AS STRING) as image_url,
        CAST(NULL AS STRING) as description,
        
        -- Validation Status
        'pending' as validation_status,
        CAST(NULL AS ARRAY<STRING>) as validation_errors,
        CAST(NULL AS TIMESTAMP) as validated_at,
        CAST(NULL AS INT64) as validation_duration_ms,
        
        -- Contract Metadata
        transaction_count,
        last_seen,
        source_code_length,
        deployment_tx_id,
        deployment_block_height,
        canonical,
        analyzed_at,
        
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as updated_at
        
      FROM potential_tokens
      WHERE has_minimum_token_functions = true
      ORDER BY 
        sip010_function_count DESC,
        transaction_count DESC,
        last_seen DESC
    `;

    await bigquery.query({
      query: createTokensTableQuery,
      jobTimeoutMs: 120000, // 2 minute timeout for token discovery
    });

    console.log(`Token discovery completed successfully`);

    // Step 2: Get count of discovered tokens
    const getTokenCountQuery = `
      SELECT 
        COUNT(*) as total_tokens,
        COUNTIF(token_type = 'sip010_token') as sip010_tokens,
        COUNTIF(token_type = 'partial_token') as partial_tokens,
        COUNTIF(sip010_function_count = 7) as complete_sip010_tokens,
        AVG(sip010_function_count) as avg_sip010_functions
      FROM crypto_data.dim_tokens
    `;

    const [countResult] = await bigquery.query({
      query: getTokenCountQuery,
      jobTimeoutMs: 30000,
    });

    const tokenStats = countResult[0] || {};

    const duration = Date.now() - startTime;

    console.log(`${martName} refreshed successfully in ${duration}ms`);
    console.log(`📊 Token Statistics:`, tokenStats);

    // Revalidate token-related endpoints 
    revalidatePath('/api/tokens');

    return NextResponse.json({
      mart_name: martName,
      status: 'success',
      duration_ms: duration,
      token_statistics: {
        total_tokens: Number(tokenStats.total_tokens || 0),
        sip010_tokens: Number(tokenStats.sip010_tokens || 0),
        partial_tokens: Number(tokenStats.partial_tokens || 0),
        complete_sip010_tokens: Number(tokenStats.complete_sip010_tokens || 0),
        avg_sip010_functions: Number(tokenStats.avg_sip010_functions || 0),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Failed to refresh ${martName}:`, error);

    return NextResponse.json({
      mart_name: martName,
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
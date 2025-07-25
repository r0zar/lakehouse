import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'discover_tokens';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${jobName}...`);

    // Discover new tokens from ALL contracts and INSERT them (don't wipe existing table)
    const discoverTokensQuery = `
      INSERT INTO crypto_data.dim_tokens (
        contract_address,
        token_type,
        token_name,
        token_symbol,
        decimals,
        total_supply,
        token_uri,
        image_url,
        description,
        transaction_count,
        last_seen,
        validation_status,
        created_at,
        updated_at
      )
      WITH all_contracts AS (
        SELECT 
          contract_address,
          COALESCE(transaction_count, 0) as transaction_count,
          COALESCE(last_seen, created_at) as last_seen,
          parsed_abi,
          -- Also check source code for token patterns if ABI is not available
          source_code
        FROM crypto_data.dim_contracts
        WHERE contract_address IS NOT NULL
      ),
      
      potential_tokens AS (
        SELECT 
          *,
          -- Extract function names from parsed_abi when available
          CASE 
            WHEN parsed_abi IS NOT NULL THEN
              ARRAY(
                SELECT JSON_EXTRACT_SCALAR(func, '$.name') 
                FROM UNNEST(JSON_EXTRACT_ARRAY(parsed_abi, '$.functions')) AS func
                WHERE JSON_EXTRACT_SCALAR(func, '$.name') IS NOT NULL
              )
            ELSE []
          END as function_names,
          
          -- Check source code for token patterns when ABI is not available
          CASE 
            WHEN source_code IS NOT NULL THEN (
              REGEXP_CONTAINS(source_code, r'(?i)\b(transfer|get-balance|get-total-supply)\b') AND
              REGEXP_CONTAINS(source_code, r'(?i)\b(token|ft|sip-?010)\b')
            )
            ELSE false
          END as has_token_patterns_in_source
          
        FROM all_contracts
      ),
      
      token_analysis AS (
        SELECT 
          *,
          -- Check for minimum token functions (from ABI or source code patterns)
          CASE 
            WHEN ARRAY_LENGTH(function_names) > 0 THEN (
              'transfer' IN UNNEST(function_names) AND
              'get-balance' IN UNNEST(function_names) AND
              'get-total-supply' IN UNNEST(function_names)
            )
            ELSE has_token_patterns_in_source
          END as has_minimum_token_functions,
          
          -- Count SIP-010 functions present (only meaningful for ABI-based detection)
          CASE 
            WHEN ARRAY_LENGTH(function_names) > 0 THEN (
              SELECT COUNT(*)
              FROM UNNEST(['get-name', 'get-symbol', 'get-decimals', 'get-total-supply', 'get-token-uri', 'transfer', 'get-balance']) AS required_func
              WHERE required_func IN UNNEST(function_names)
            )
            WHEN has_token_patterns_in_source THEN 3 -- Assume partial token for source code matches
            ELSE 0
          END as sip010_function_count
          
        FROM potential_tokens
      ),
      
      new_tokens AS (
        SELECT t.*
        FROM token_analysis t
        LEFT JOIN crypto_data.dim_tokens existing 
          ON t.contract_address = existing.contract_address
        WHERE existing.contract_address IS NULL
          AND t.has_minimum_token_functions = true
      )
      
      SELECT 
        contract_address,
        
        -- Token Classification (enhanced for source code detection)
        CASE 
          WHEN sip010_function_count >= 5 AND has_minimum_token_functions THEN 'sip010_token'
          WHEN sip010_function_count >= 3 AND has_minimum_token_functions THEN 'partial_token'
          WHEN has_token_patterns_in_source AND ARRAY_LENGTH(function_names) = 0 THEN 'source_detected_token'
          WHEN has_minimum_token_functions THEN 'basic_token'
          ELSE 'unknown'
        END as token_type,
        
        -- Essential Token Metadata (to be populated by analyze-tokens job)
        CAST(NULL AS STRING) as token_name,
        CAST(NULL AS STRING) as token_symbol,
        CAST(NULL AS INT64) as decimals,
        CAST(NULL AS STRING) as total_supply,
        CAST(NULL AS STRING) as token_uri,
        CAST(NULL AS STRING) as image_url,
        CAST(NULL AS STRING) as description,
        
        -- Basic Tracking
        transaction_count,
        last_seen,
        'pending' as validation_status,
        
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as updated_at
        
      FROM new_tokens
      ORDER BY 
        sip010_function_count DESC,
        transaction_count DESC,
        last_seen DESC
    `;

    const [discoveryJob] = await bigquery.query({
      query: discoverTokensQuery,
      jobTimeoutMs: 120000, // 2 minute timeout for token discovery
    });

    // Get count of newly discovered tokens
    const getNewTokensCountQuery = `
      SELECT COUNT(*) as new_tokens_discovered
      FROM crypto_data.dim_tokens
      WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
        AND validation_status = 'pending'
    `;

    const [countResult] = await bigquery.query({
      query: getNewTokensCountQuery,
      jobTimeoutMs: 30000,
    });

    const newTokensCount = countResult[0]?.new_tokens_discovered || 0;

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed successfully in ${duration}ms`);
    console.log(`📊 Discovered ${newTokensCount} new tokens from expanded contract scan`);

    // Revalidate token-related endpoints 
    revalidatePath('/api/tokens');

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      new_tokens_discovered: Number(newTokensCount),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Failed to run ${jobName}:`, error);

    return NextResponse.json({
      job_name: jobName,
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
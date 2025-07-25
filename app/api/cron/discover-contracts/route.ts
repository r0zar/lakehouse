import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'discover_contracts';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${jobName}...`);

    // Discover new contracts and INSERT them (don't wipe existing table)
    const discoverContractsQuery = `
      INSERT INTO crypto_data.dim_contracts (
        contract_address,
        transaction_count,
        last_seen,
        status,
        source_code,
        parsed_abi,
        deployment_tx_id,
        deployment_block_height,
        canonical,
        analysis_status,
        analysis_errors,
        analyzed_at,
        analysis_duration_ms,
        created_at,
        updated_at
      )
      WITH discovered_contracts AS (
        SELECT DISTINCT
          contract_address,
          MAX(last_seen) as last_seen,
          COUNT(*) as transaction_count,
          STRING_AGG(DISTINCT source, ', ') as discovery_sources
        FROM (
          -- 1. Extract contracts from transaction descriptions
          SELECT 
            REGEXP_EXTRACT(description, r'(S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+)') as contract_address,
            received_at as last_seen,
            'tx_description' as source
          FROM crypto_data.stg_transactions
          WHERE REGEXP_CONTAINS(description, r'S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+')
          
          UNION ALL
          
          -- 2. Extract contracts from address data (contract_identifier)
          SELECT 
            contract_identifier as contract_address,
            received_at as last_seen,
            'address_data' as source
          FROM crypto_data.stg_addresses
          WHERE contract_identifier IS NOT NULL
            AND REGEXP_CONTAINS(contract_identifier, r'^S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+$')
          
          UNION ALL
          
          -- 3. Extract contracts from event data (ft_asset_identifier)
          SELECT 
            SPLIT(ft_asset_identifier, '::')[SAFE_OFFSET(0)] as contract_address,
            received_at as last_seen,
            'ft_events' as source
          FROM crypto_data.stg_events
          WHERE ft_asset_identifier IS NOT NULL
            AND CONTAINS_SUBSTR(ft_asset_identifier, '::')
            AND REGEXP_CONTAINS(SPLIT(ft_asset_identifier, '::')[SAFE_OFFSET(0)], r'^S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+$')
          
          UNION ALL
          
          -- 4. Extract contracts from address function calls
          SELECT 
            CONCAT(
              SPLIT(contract_identifier, '.')[SAFE_OFFSET(0)], 
              '.', 
              SPLIT(contract_identifier, '.')[SAFE_OFFSET(1)]
            ) as contract_address,
            received_at as last_seen,
            'function_calls' as source
          FROM crypto_data.stg_addresses
          WHERE contract_identifier IS NOT NULL
            AND function_name IS NOT NULL
            AND ARRAY_LENGTH(SPLIT(contract_identifier, '.')) >= 2
            AND REGEXP_CONTAINS(SPLIT(contract_identifier, '.')[SAFE_OFFSET(0)], r'^S[PM][0-9A-Z]{38,42}$')
        )
        WHERE contract_address IS NOT NULL
          AND contract_address != ''
          AND REGEXP_CONTAINS(contract_address, r'^S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+$')
          AND LENGTH(contract_address) >= 42  -- Minimum valid contract address length
        GROUP BY contract_address
      ),
      new_contracts AS (
        SELECT d.*
        FROM discovered_contracts d
        LEFT JOIN crypto_data.dim_contracts existing 
          ON d.contract_address = existing.contract_address
        WHERE existing.contract_address IS NULL
      )
      
      SELECT 
        contract_address,
        transaction_count,
        last_seen,
        CONCAT('discovered_from_', discovery_sources) as status,
        
        -- Essential Contract Analysis Columns
        CAST(NULL AS STRING) as source_code,
        CAST(NULL AS JSON) as parsed_abi,
        CAST(NULL AS STRING) as deployment_tx_id,
        CAST(NULL AS INT64) as deployment_block_height,
        CAST(NULL AS BOOLEAN) as canonical,
        
        -- Analysis Status
        'pending' as analysis_status,
        CAST(NULL AS ARRAY<STRING>) as analysis_errors,
        CAST(NULL AS TIMESTAMP) as analyzed_at,
        CAST(NULL AS INT64) as analysis_duration_ms,
        
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as updated_at
      FROM new_contracts
      ORDER BY transaction_count DESC, last_seen DESC
    `;

    const [discoveryJob] = await bigquery.query({
      query: discoverContractsQuery,
      jobTimeoutMs: 180000, // 3 minute timeout for comprehensive discovery query
    });

    // Get count of newly discovered contracts
    const getNewContractsCountQuery = `
      SELECT COUNT(*) as new_contracts_discovered
      FROM crypto_data.dim_contracts
      WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
        AND analysis_status = 'pending'
    `;

    const [countResult] = await bigquery.query({
      query: getNewContractsCountQuery,
      jobTimeoutMs: 30000,
    });

    const newContractsCount = countResult[0]?.new_contracts_discovered || 0;

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed successfully in ${duration}ms`);
    console.log(`📊 Deep scan discovered ${newContractsCount} new contracts from 4 data sources`);

    // Revalidate contract-related endpoints 
    revalidatePath('/api/contracts');

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      new_contracts_discovered: Number(newContractsCount),
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
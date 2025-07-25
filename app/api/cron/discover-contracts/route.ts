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
          COUNT(*) as transaction_count
        FROM (
          -- Extract any contract address from transaction descriptions
          SELECT 
            REGEXP_EXTRACT(description, r'(S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+)') as contract_address,
            received_at as last_seen
          FROM crypto_data.stg_transactions
          WHERE REGEXP_CONTAINS(description, r'S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+')
        )
        WHERE contract_address IS NOT NULL
          AND contract_address != ''
          AND REGEXP_CONTAINS(contract_address, r'^S[PM][0-9A-Z]{38,42}\\.[a-zA-Z0-9_-]+$')
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
        'discovered' as status,
        
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
      jobTimeoutMs: 60000, // 1 minute timeout for the discovery query
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
    console.log(`📊 Discovered ${newContractsCount} new contracts`);

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
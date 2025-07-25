import { NextRequest, NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
})

export async function POST(request: NextRequest) {
  try {
    // Simple authentication check
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()

    // Execute the fact_defi_metrics mart SQL
    const query = `
      -- DeFi Metrics Fact Table - Aggregated DeFi ecosystem metrics by time period
      CREATE OR REPLACE TABLE crypto_data.fact_defi_metrics AS
      SELECT 
        -- Time dimensions
        DATE(block_time) as metric_date,
        EXTRACT(HOUR FROM block_time) as metric_hour,
        FORMAT_DATE('%Y-%m', DATE(block_time)) as metric_month,
        EXTRACT(DAYOFWEEK FROM DATE(block_time)) as day_of_week,
        
        -- Protocol metrics
        dex_protocol,
        
        -- Volume and activity metrics (counts only to avoid overflow)
        COUNT(*) as total_swaps,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_swaps,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_swaps,
        
        -- Success rate
        SAFE_DIVIDE(
          COUNT(CASE WHEN success = true THEN 1 END),
          COUNT(*)
        ) * 100 as success_rate_percent,
        
        -- Transaction fee metrics (using SAFE_CAST to prevent overflow)
        SAFE_CAST(AVG(transaction_fee) AS INT64) as avg_transaction_fee,
        SAFE_CAST(MIN(transaction_fee) AS INT64) as min_transaction_fee,
        SAFE_CAST(MAX(transaction_fee) AS INT64) as max_transaction_fee,
        
        -- Swap category distribution
        COUNT(CASE WHEN swap_category = 'stableswap' THEN 1 END) as stableswap_count,
        COUNT(CASE WHEN swap_category = 'amm' THEN 1 END) as amm_count,
        COUNT(CASE WHEN swap_category = 'aggregated' THEN 1 END) as aggregated_count,
        COUNT(CASE WHEN swap_category = 'swap' THEN 1 END) as swap_count,
        COUNT(CASE WHEN swap_category = 'other' THEN 1 END) as other_count,
        
        -- Swap size distribution
        COUNT(CASE WHEN swap_size_category = 'small' THEN 1 END) as small_swaps,
        COUNT(CASE WHEN swap_size_category = 'medium' THEN 1 END) as medium_swaps,
        COUNT(CASE WHEN swap_size_category = 'large' THEN 1 END) as large_swaps,
        COUNT(CASE WHEN swap_size_category = 'whale' THEN 1 END) as whale_swaps,
        
        -- Unique metrics
        COUNT(DISTINCT dex_contract) as unique_contracts,
        COUNT(DISTINCT tx_hash) as unique_transactions,
        
        -- Operation metrics
        SAFE_CAST(AVG(unique_addresses) AS INT64) as avg_unique_addresses_per_swap,
        SAFE_CAST(AVG(operation_count) AS INT64) as avg_operations_per_swap,
        SAFE_CAST(SUM(unique_addresses) AS INT64) as total_unique_addresses,
        SAFE_CAST(SUM(operation_count) AS INT64) as total_operations,
        
        -- Market dominance (percentage of total swaps)
        SAFE_DIVIDE(
          COUNT(*),
          SUM(COUNT(*)) OVER (PARTITION BY DATE(block_time))
        ) * 100 as daily_market_share_percent,
        
        -- Growth metrics (compared to previous day)
        COUNT(*) - LAG(COUNT(*)) OVER (
          PARTITION BY dex_protocol 
          ORDER BY DATE(block_time)
        ) as daily_swap_growth,
        
        -- Audit fields
        MIN(created_at) as earliest_swap_time,
        MAX(created_at) as latest_swap_time,
        CURRENT_TIMESTAMP() as calculated_at

      FROM crypto_data.dim_defi_swaps

      GROUP BY 
        DATE(block_time),
        EXTRACT(HOUR FROM block_time),
        FORMAT_DATE('%Y-%m', DATE(block_time)),
        EXTRACT(DAYOFWEEK FROM DATE(block_time)),
        dex_protocol

      ORDER BY 
        metric_date DESC,
        metric_hour DESC,
        dex_protocol
    `

    const [job] = await bigquery.createQueryJob({ query })
    const [rows] = await job.getQueryResults()

    const duration = Date.now() - startTime

    return NextResponse.json({
      mart_name: 'fact_defi_metrics',
      status: 'success',
      rows_affected: rows.length,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error refreshing fact_defi_metrics:', error)
    
    return NextResponse.json({
      mart_name: 'fact_defi_metrics',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
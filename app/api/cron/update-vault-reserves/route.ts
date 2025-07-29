import { NextRequest, NextResponse } from 'next/server';
import { getVaultReserves } from '../../../../lib/vault-api';
import { bigquery } from '../../../../lib/bigquery';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('💰 [CRON] Starting vault reserves update batch');
    
    // Get ALL liquidity pools to create complete hourly snapshots
    // Use the liquidity_pools view as the canonical source
    const poolsQuery = `
      WITH recent_reserves AS (
        SELECT DISTINCT pool_contract_id
        FROM \`crypto-analytics-466908.crypto_data.liquidity_pool_reserves\`
        WHERE reserves_updated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 SECOND)
      )
      SELECT 
        lp.contract_id,
        lp.vault_contract_id,
        lp.token_a_contract_id,
        lp.token_b_contract_id,
        lp.vault_type,
        lp.protocol
      FROM \`crypto-analytics-466908.crypto_data.liquidity_pools\` lp
      LEFT JOIN recent_reserves rr ON lp.contract_id = rr.pool_contract_id
      WHERE lp.contract_id IS NOT NULL
        AND rr.pool_contract_id IS NULL  -- Haven't updated reserves in last 60 seconds
      ORDER BY lp.contract_id
      LIMIT 30  -- Process 30 pools per run to handle larger batches
    `;
    
    const [poolRows] = await bigquery.query(poolsQuery);
    
    if (poolRows.length === 0) {
      console.log('✅ [CRON] All liquidity pools have reserves for this hour - batch complete!');
      return NextResponse.json({
        success: true,
        message: 'All liquidity pools have reserves for this hour',
        processed: 0,
        updated: 0,
        errors: 0,
        timeMs: Date.now() - startTime
      });
    }
    
    console.log(`📋 [CRON] Found ${poolRows.length} liquidity pools needing hourly reserve snapshots`);
    
    // Batch fetch all reserves in parallel
    console.log('🔄 [CRON] Fetching reserves for all pools in parallel...');
    const reservePromises = poolRows.map(async (pool) => {
      try {
        const reservesResult = await getVaultReserves(
          pool.contract_id,
          pool.token_a_contract_id,
          pool.token_b_contract_id,
          pool.vault_contract_id
        );
        
        return {
          pool_contract_id: pool.contract_id,
          success: reservesResult?.success || false,
          reservesA: reservesResult?.reservesA || '0',
          reservesB: reservesResult?.reservesB || '0',
          version: reservesResult?.version || 'unknown',
          method: reservesResult?.method || 'unknown',
          error: reservesResult?.error
        };
      } catch (error) {
        return {
          pool_contract_id: pool.contract_id,
          success: false,
          reservesA: '0',
          reservesB: '0',
          version: 'unknown',
          method: 'unknown',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    // Wait for all reserves to be fetched
    const reserveResults = await Promise.allSettled(reservePromises);
    
    // Process results and prepare for batch insert
    const successfulReserves: any[] = [];
    const results: any[] = [];
    let processed = 0;
    let updated = 0;
    let errors = 0;
    
    reserveResults.forEach((result, index) => {
      processed++;
      
      if (result.status === 'fulfilled') {
        const reserveData = result.value;
        
        if (reserveData.success) {
          successfulReserves.push({
            pool_contract_id: reserveData.pool_contract_id,
            reserves_a: reserveData.reservesA,
            reserves_b: reserveData.reservesB
          });
          
          results.push({
            contractId: reserveData.pool_contract_id,
            action: 'updated',
            reservesA: reserveData.reservesA,
            reservesB: reserveData.reservesB,
            version: reserveData.version,
            method: reserveData.method
          });
          
          updated++;
          console.log(`✓ [CRON] Fetched ${reserveData.pool_contract_id}: A=${reserveData.reservesA}, B=${reserveData.reservesB} (${reserveData.version})`);
        } else {
          results.push({
            contractId: reserveData.pool_contract_id,
            action: 'error',
            error: reserveData.error || 'Failed to get reserves'
          });
          errors++;
          console.log(`⚠️ [CRON] Failed to fetch ${reserveData.pool_contract_id}: ${reserveData.error}`);
        }
      } else {
        const poolId = poolRows[index]?.contract_id || 'unknown';
        results.push({
          contractId: poolId,
          action: 'error',
          error: result.reason?.message || 'Promise rejected'
        });
        errors++;
        console.error(`✗ [CRON] Promise failed for ${poolId}:`, result.reason);
      }
    });
    
    // Batch insert all successful reserves
    if (successfulReserves.length > 0) {
      console.log(`💾 [CRON] Batch inserting ${successfulReserves.length} reserve records...`);
      
      try {
        // Create batch insert query with VALUES clause
        const valuesClauses = successfulReserves.map((_, index) => 
          `(@pool_contract_id_${index}, @reserves_a_${index}, @reserves_b_${index}, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`
        ).join(', ');
        
        const batchInsertQuery = `
          INSERT INTO \`crypto-analytics-466908.crypto_data.liquidity_pool_reserves\`
          (pool_contract_id, reserves_a, reserves_b, reserves_updated_at, created_at)
          VALUES ${valuesClauses}
        `;
        
        // Build params and types objects for batch insert
        const params: any = {};
        const types: any = {};
        
        successfulReserves.forEach((reserve, index) => {
          params[`pool_contract_id_${index}`] = reserve.pool_contract_id;
          params[`reserves_a_${index}`] = reserve.reserves_a;
          params[`reserves_b_${index}`] = reserve.reserves_b;
          
          types[`pool_contract_id_${index}`] = 'STRING';
          types[`reserves_a_${index}`] = 'NUMERIC';
          types[`reserves_b_${index}`] = 'NUMERIC';
        });
        
        await bigquery.query({
          query: batchInsertQuery,
          params,
          types
        });
        
        console.log(`✅ [CRON] Successfully batch inserted ${successfulReserves.length} reserve records`);
        
      } catch (batchError) {
        console.error('❌ [CRON] Batch insert failed, falling back to individual inserts:', batchError);
        
        // Fallback to individual inserts if batch fails
        for (const reserve of successfulReserves) {
          try {
            const individualQuery = `
              INSERT INTO \`crypto-analytics-466908.crypto_data.liquidity_pool_reserves\`
              (pool_contract_id, reserves_a, reserves_b, reserves_updated_at, created_at)
              VALUES (@pool_contract_id, @reserves_a, @reserves_b, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            `;
            
            await bigquery.query({
              query: individualQuery,
              params: {
                pool_contract_id: reserve.pool_contract_id,
                reserves_a: reserve.reserves_a,
                reserves_b: reserve.reserves_b
              },
              types: {
                pool_contract_id: 'STRING',
                reserves_a: 'NUMERIC',
                reserves_b: 'NUMERIC'
              }
            });
          } catch (individualError) {
            console.error(`Failed individual insert for ${reserve.pool_contract_id}:`, individualError);
          }
        }
      }
    }
    
    // Quick status check for logging - count pools with/without this hour's reserves
    const statusQuery = `
      WITH recent_reserves AS (
        SELECT DISTINCT pool_contract_id
        FROM \`crypto-analytics-466908.crypto_data.liquidity_pool_reserves\`
        WHERE reserves_updated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 SECOND)
      )
      SELECT 
        COUNT(*) as total_pools,
        COUNT(rr.pool_contract_id) as completed_recently,
        COUNT(*) - COUNT(rr.pool_contract_id) as remaining_to_update
      FROM \`crypto-analytics-466908.crypto_data.liquidity_pools\` lp
      LEFT JOIN recent_reserves rr ON lp.contract_id = rr.pool_contract_id
      WHERE lp.contract_id IS NOT NULL
    `;
    
    const [statusRows] = await bigquery.query(statusQuery);
    const status = statusRows[0];
    
    const endTime = Date.now();
    console.log(`🎉 [CRON] Hourly reserve snapshot batch complete: ${updated} updated, ${errors} errors, ${status.remaining_this_hour} remaining this hour (${endTime - startTime}ms)`);
    
    return NextResponse.json({
      success: true,
      message: 'Vault reserves hourly snapshot batch complete',
      processed,
      updated,
      errors,
      timeMs: endTime - startTime,
      recentProgress: {
        totalPools: parseInt(status.total_pools),
        completedRecently: parseInt(status.completed_recently),
        remainingToUpdate: parseInt(status.remaining_to_update)
      },
      results: results.slice(0, 5) // Limit response size
    });
    
  } catch (error) {
    console.error('❌ [CRON] Fatal error in vault reserves update:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timeMs: Date.now() - startTime
    }, { status: 500 });
  }
}
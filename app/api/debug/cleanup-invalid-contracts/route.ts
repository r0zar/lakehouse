import { NextRequest, NextResponse } from 'next/server';
import { getContractInfoWithParsedAbi } from '../../../../lib/stacks-api';
import { bigquery } from '../../../../lib/bigquery';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') !== 'false'; // Default to dry run
    const limit = parseInt(searchParams.get('limit') || '20');
    
    console.log('🧹 [DEBUG] Starting invalid contract cleanup');
    console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE CLEANUP'}`);
    console.log(`  Limit: ${limit} contracts`);
    
    // Find contracts that are missing both ABI and source code (likely candidates for invalidity)
    const candidatesQuery = `
      WITH unique_contracts AS (
        SELECT 
          contract_address,
          contract_name,
          abi,
          source_code,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY contract_address, contract_name 
            ORDER BY created_at DESC
          ) as rn
        FROM \`crypto-analytics-466908.crypto_data.contracts\`
      )
      SELECT 
        contract_address,
        contract_name,
        CONCAT(contract_address, '.', contract_name) as contract_id
      FROM unique_contracts
      WHERE rn = 1
        AND abi IS NULL 
        AND source_code IS NULL
        AND contract_address != ''  -- Skip invalid entries
        AND contract_name != 'stx'  -- Skip STX placeholder
      ORDER BY contract_address, contract_name
      LIMIT ${limit}
    `;
    
    const [candidateRows] = await bigquery.query(candidatesQuery);
    
    if (candidateRows.length === 0) {
      console.log('✅ [DEBUG] No candidate contracts found for cleanup');
      return NextResponse.json({
        success: true,
        message: 'No invalid contract candidates found',
        dryRun,
        processed: 0,
        invalidContracts: 0,
        deletedContracts: 0,
        timeMs: Date.now() - startTime
      });
    }
    
    console.log(`📋 [DEBUG] Found ${candidateRows.length} candidate contracts for validation`);
    
    // Test each contract 3 times to determine if it's truly invalid
    console.log('🔄 [DEBUG] Testing contract validity with 3 attempts each...');
    const validationPromises = candidateRows.map(async (contract) => {
      const contractId = contract.contract_id;
      let successCount = 0;
      let lastError = '';
      
      // Try 3 times to get contract info
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const contractInfo = await getContractInfoWithParsedAbi(contractId);
          if (contractInfo) {
            successCount++;
            break; // If we get valid info, no need to try again
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          // Continue to next attempt
        }
        
        // Small delay between attempts
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return {
        contract_address: contract.contract_address,
        contract_name: contract.contract_name,
        contractId,
        isValid: successCount > 0,
        successCount,
        lastError: successCount === 0 ? lastError : null
      };
    });
    
    // Wait for all validations to complete
    const validationResults = await Promise.allSettled(validationPromises);
    
    // Process results and identify truly invalid contracts
    const invalidContracts: any[] = [];
    const validContracts: any[] = [];
    const results: any[] = [];
    
    validationResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const validation = result.value;
        
        if (validation.isValid) {
          validContracts.push(validation);
          results.push({
            contractId: validation.contractId,
            status: 'valid',
            successCount: validation.successCount
          });
          console.log(`✓ [DEBUG] ${validation.contractId} is valid (${validation.successCount}/3 successes)`);
        } else {
          invalidContracts.push(validation);
          results.push({
            contractId: validation.contractId,
            status: 'invalid',
            lastError: validation.lastError
          });
          console.log(`✗ [DEBUG] ${validation.contractId} is INVALID (0/3 successes): ${validation.lastError}`);
        }
      } else {
        const contract = candidateRows[index];
        const contractId = contract.contract_id;
        results.push({
          contractId,
          status: 'validation_failed',
          error: result.reason?.message || 'Promise rejected'
        });
        console.error(`⚠️ [DEBUG] Validation failed for ${contractId}:`, result.reason);
      }
    });
    
    let deletedCount = 0;
    
    // Delete invalid contracts if not in dry run mode
    if (!dryRun && invalidContracts.length > 0) {
      console.log(`🗑️ [DEBUG] Deleting ${invalidContracts.length} invalid contracts...`);
      
      try {
        // Build delete query for batch deletion
        const deleteConditions = invalidContracts.map((_, index) => 
          `(contract_address = @address_${index} AND contract_name = @name_${index})`
        ).join(' OR ');
        
        const params: any = {};
        const types: any = {};
        
        invalidContracts.forEach((contract, index) => {
          params[`address_${index}`] = contract.contract_address;
          params[`name_${index}`] = contract.contract_name;
          types[`address_${index}`] = 'STRING';
          types[`name_${index}`] = 'STRING';
        });
        
        const deleteQuery = `
          DELETE FROM \`crypto-analytics-466908.crypto_data.contracts\`
          WHERE ${deleteConditions}
        `;
        
        await bigquery.query({
          query: deleteQuery,
          params,
          types
        });
        
        deletedCount = invalidContracts.length;
        console.log(`✅ [DEBUG] Successfully deleted ${deletedCount} invalid contracts`);
        
      } catch (deleteError) {
        console.error('❌ [DEBUG] Batch delete failed, trying individual deletes:', deleteError);
        
        // Fallback to individual deletes
        for (const contract of invalidContracts) {
          try {
            const individualDeleteQuery = `
              DELETE FROM \`crypto-analytics-466908.crypto_data.contracts\`
              WHERE contract_address = @contract_address 
                AND contract_name = @contract_name
            `;
            
            await bigquery.query({
              query: individualDeleteQuery,
              params: {
                contract_address: contract.contract_address,
                contract_name: contract.contract_name
              },
              types: {
                contract_address: 'STRING',
                contract_name: 'STRING'
              }
            });
            
            deletedCount++;
          } catch (individualError) {
            console.error(`Failed to delete ${contract.contractId}:`, individualError);
          }
        }
      }
    }
    
    // Get updated statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_contracts,
        COUNT(abi) as contracts_with_abi,
        ROUND(COUNT(abi) * 100.0 / COUNT(*), 1) as abi_coverage_percent
      FROM \`crypto-analytics-466908.crypto_data.contracts\`
      WHERE contract_name IS NOT NULL
    `;
    
    const [statsRows] = await bigquery.query(statsQuery);
    const stats = statsRows[0];
    
    const endTime = Date.now();
    console.log(`🎉 [DEBUG] Cleanup complete: ${validContracts.length} valid, ${invalidContracts.length} invalid, ${deletedCount} deleted (${endTime - startTime}ms)`);
    
    return NextResponse.json({
      success: true,
      message: `Invalid contract cleanup ${dryRun ? 'analysis' : 'complete'}`,
      dryRun,
      processed: candidateRows.length,
      validContracts: validContracts.length,
      invalidContracts: invalidContracts.length,
      deletedContracts: deletedCount,
      timeMs: endTime - startTime,
      updatedStats: {
        totalContracts: parseInt(stats.total_contracts),
        contractsWithAbi: parseInt(stats.contracts_with_abi),
        abiCoveragePercent: parseFloat(stats.abi_coverage_percent)
      },
      results: results.slice(0, 10), // Limit response size
      invalidContractExamples: invalidContracts.slice(0, 5).map(c => ({
        contractId: c.contractId,
        lastError: c.lastError
      }))
    });
    
  } catch (error) {
    console.error('❌ [DEBUG] Fatal error in invalid contract cleanup:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timeMs: Date.now() - startTime
    }, { status: 500 });
  }
}
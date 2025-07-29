import { NextRequest, NextResponse } from 'next/server';
import { getContractInfoWithParsedAbi } from '../../../../lib/stacks-api';
import { bigquery } from '../../../../lib/bigquery';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('🔄 [CRON] Starting contract ABI/source_code backfill batch');
    
    // Find contracts missing ABI or source code (small batch for cron)
    const missingDataQuery = `
      WITH unique_contracts AS (
        SELECT 
          contract_address,
          contract_name,
          abi,
          source_code,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY contract_address, contract_name 
            ORDER BY 
              CASE WHEN abi IS NOT NULL THEN 1 ELSE 0 END DESC,
              CASE WHEN source_code IS NOT NULL THEN 1 ELSE 0 END DESC,
              created_at DESC
          ) as rn
        FROM \`crypto-analytics-466908.crypto_data.contracts\`
      )
      SELECT 
        contract_address,
        contract_name,
        abi IS NULL as missing_abi,
        source_code IS NULL as missing_source_code
      FROM unique_contracts
      WHERE rn = 1
        AND (abi IS NULL OR source_code IS NULL)
        AND contract_address != ''  -- Skip invalid entries
      ORDER BY contract_address, contract_name
      LIMIT 8  -- Small batch for cron job
    `;
    
    const [missingDataRows] = await bigquery.query(missingDataQuery);
    
    if (missingDataRows.length === 0) {
      console.log('✅ [CRON] No contracts found missing ABI or source code - backfill complete!');
      return NextResponse.json({
        success: true,
        message: 'Contract backfill complete - no missing data found',
        processed: 0,
        updated: 0,
        errors: 0,
        timeMs: Date.now() - startTime
      });
    }
    
    console.log(`📋 [CRON] Found ${missingDataRows.length} contracts needing backfill`);
    
    // Batch fetch all contract info in parallel
    console.log('🔄 [CRON] Fetching contract info for all contracts in parallel...');
    const contractPromises = missingDataRows.map(async (contract) => {
      const contractId = `${contract.contract_address}.${contract.contract_name}`;
      try {
        const contractInfo = await getContractInfoWithParsedAbi(contractId);
        return {
          contract_address: contract.contract_address,
          contract_name: contract.contract_name,
          contractId,
          missing_abi: contract.missing_abi,
          missing_source_code: contract.missing_source_code,
          success: !!contractInfo,
          abi: contractInfo?.abi || null,
          source_code: contractInfo?.source_code || null,
          error: contractInfo ? null : 'Contract info not found'
        };
      } catch (error) {
        return {
          contract_address: contract.contract_address,
          contract_name: contract.contract_name,
          contractId,
          missing_abi: contract.missing_abi,
          missing_source_code: contract.missing_source_code,
          success: false,
          abi: null,
          source_code: null,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    // Wait for all contract info to be fetched
    const contractResults = await Promise.allSettled(contractPromises);
    
    // Process results and prepare for batch update
    const successfulContracts: any[] = [];
    const results: any[] = [];
    let updated = 0;
    let errors = 0;
    
    contractResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const contractData = result.value;
        
        if (contractData.success) {
          successfulContracts.push({
            contract_address: contractData.contract_address,
            contract_name: contractData.contract_name,
            abi: contractData.abi ? JSON.parse(contractData.abi) : null,
            source_code: contractData.source_code || null
          });
          
          results.push({
            contractId: contractData.contractId,
            action: 'updated',
            abiBackfilled: contractData.missing_abi && !!contractData.abi,
            sourceCodeBackfilled: contractData.missing_source_code && !!contractData.source_code
          });
          
          updated++;
          console.log(`✓ [CRON] Fetched ${contractData.contractId}: ABI=${!!contractData.abi}, Source=${!!contractData.source_code}`);
        } else {
          results.push({
            contractId: contractData.contractId,
            action: 'error',
            error: contractData.error || 'Failed to get contract info'
          });
          errors++;
          console.log(`⚠️ [CRON] Failed to fetch ${contractData.contractId}: ${contractData.error}`);
        }
      } else {
        const contract = missingDataRows[index];
        const contractId = `${contract.contract_address}.${contract.contract_name}`;
        results.push({
          contractId,
          action: 'error',
          error: result.reason?.message || 'Promise rejected'
        });
        errors++;
        console.error(`✗ [CRON] Promise failed for ${contractId}:`, result.reason);
      }
    });
    
    // Batch update all successful contracts
    if (successfulContracts.length > 0) {
      console.log(`💾 [CRON] Batch updating ${successfulContracts.length} contracts...`);
      
      try {
        // Create batch update query with CASE statements
        const caseStatements = {
          abi: [] as string[],
          source_code: [] as string[]
        };
        
        const params: any = {};
        const types: any = {};
        
        successfulContracts.forEach((contract, index) => {
          const addressParam = `address_${index}`;
          const nameParam = `name_${index}`;
          const abiParam = `abi_${index}`;
          const sourceParam = `source_${index}`;
          
          caseStatements.abi.push(
            `WHEN contract_address = @${addressParam} AND contract_name = @${nameParam} THEN @${abiParam}`
          );
          caseStatements.source_code.push(
            `WHEN contract_address = @${addressParam} AND contract_name = @${nameParam} THEN @${sourceParam}`
          );
          
          params[addressParam] = contract.contract_address;
          params[nameParam] = contract.contract_name;
          params[abiParam] = contract.abi;
          params[sourceParam] = contract.source_code;
          
          types[addressParam] = 'STRING';
          types[nameParam] = 'STRING';
          types[abiParam] = 'JSON';
          types[sourceParam] = 'STRING';
        });
        
        const batchUpdateQuery = `
          UPDATE \`crypto-analytics-466908.crypto_data.contracts\`
          SET 
            abi = CASE 
              ${caseStatements.abi.join(' ')}
              ELSE abi
            END,
            source_code = CASE 
              ${caseStatements.source_code.join(' ')}
              ELSE source_code
            END
          WHERE (${successfulContracts.map((_, i) => `(contract_address = @address_${i} AND contract_name = @name_${i})`).join(' OR ')})
        `;
        
        await bigquery.query({
          query: batchUpdateQuery,
          params,
          types
        });
        
        console.log(`✅ [CRON] Successfully batch updated ${successfulContracts.length} contracts`);
        
      } catch (batchError) {
        console.error('❌ [CRON] Batch update failed, falling back to individual updates:', batchError);
        
        // Fallback to individual updates if batch fails
        for (const contract of successfulContracts) {
          try {
            const individualQuery = `
              UPDATE \`crypto-analytics-466908.crypto_data.contracts\`
              SET 
                abi = @abi,
                source_code = @source_code
              WHERE contract_address = @contract_address 
                AND contract_name = @contract_name
            `;
            
            await bigquery.query({
              query: individualQuery,
              params: {
                contract_address: contract.contract_address,
                contract_name: contract.contract_name,
                abi: contract.abi,
                source_code: contract.source_code
              },
              types: {
                contract_address: 'STRING',
                contract_name: 'STRING',
                abi: 'JSON',
                source_code: 'STRING'
              }
            });
          } catch (individualError) {
            console.error(`Failed individual update for ${contract.contract_address}.${contract.contract_name}:`, individualError);
          }
        }
      }
    }
    
    // Quick status check for logging
    const statusQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN abi IS NULL THEN 1 END) as missing_abi,
        COUNT(CASE WHEN source_code IS NULL THEN 1 END) as missing_source_code
      FROM \`crypto-analytics-466908.crypto_data.contracts\`
    `;
    
    const [statusRows] = await bigquery.query(statusQuery);
    const status = statusRows[0];
    
    const endTime = Date.now();
    console.log(`🎉 [CRON] Batch complete: ${updated} updated, ${errors} errors, ${status.missing_abi} ABIs still missing (${endTime - startTime}ms)`);
    
    return NextResponse.json({
      success: true,
      message: 'Contract backfill batch complete',
      processed: missingDataRows.length,
      updated,
      errors,
      timeMs: endTime - startTime,
      remaining: {
        missingAbi: parseInt(status.missing_abi),
        missingSourceCode: parseInt(status.missing_source_code),
        totalContracts: parseInt(status.total)
      },
      results: results.slice(0, 5) // Limit response size
    });
    
  } catch (error) {
    console.error('❌ [CRON] Fatal error in contract backfill:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timeMs: Date.now() - startTime
    }, { status: 500 });
  }
}
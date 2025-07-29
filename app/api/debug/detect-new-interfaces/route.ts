import { NextRequest, NextResponse } from 'next/server';
import { isSip010Contract, extractSip010Identifier } from '../../../../lib/stacks-api';
import { bigquery } from '../../../../lib/bigquery';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const dryRun = searchParams.get('dry_run') === 'true';
  
  try {
    console.log(`🔍 Detecting missing interfaces on contracts with updated ABIs (limit: ${limit})`);
    
    // Find contracts with ABIs that might be missing some interface entries
    // Prioritize contracts that might be missing vault interfaces
    const getContractsQuery = `
      WITH contracts_with_abi AS (
        SELECT 
          CONCAT(contract_address, '.', contract_name) as contract_id,
          contract_address,
          contract_name,
          abi,
          created_at,
          ROW_NUMBER() OVER (PARTITION BY contract_address, contract_name ORDER BY created_at DESC) as rn
        FROM \`crypto-analytics-466908.crypto_data.contracts\`
        WHERE abi IS NOT NULL
      ),
      existing_interfaces AS (
        SELECT 
          contract_id,
          ARRAY_AGG(interface) as existing_interfaces
        FROM \`crypto-analytics-466908.crypto_data.contract_interfaces\`
        GROUP BY contract_id
      ),
      contracts_with_vault_functions AS (
        SELECT 
          c.contract_id,
          c.contract_address,
          c.contract_name,
          c.abi,
          COALESCE(ei.existing_interfaces, []) as existing_interfaces,
          -- Prioritize contracts that might have vault functions but no vault interface
          CASE 
            WHEN (TO_JSON_STRING(c.abi) LIKE '%"execute"%' AND TO_JSON_STRING(c.abi) LIKE '%"quote"%')
             AND NOT 'vault' IN UNNEST(COALESCE(ei.existing_interfaces, []))
            THEN 1 
            WHEN NOT 'vault' IN UNNEST(COALESCE(ei.existing_interfaces, []))
            THEN 2
            ELSE 3 
          END as priority
        FROM contracts_with_abi c
        LEFT JOIN existing_interfaces ei ON c.contract_id = ei.contract_id
        WHERE c.rn = 1
      )
      SELECT 
        contract_id,
        contract_address,
        contract_name,
        abi,
        existing_interfaces
      FROM contracts_with_vault_functions
      ORDER BY priority ASC, contract_id DESC
      LIMIT ${limit}
    `;
    
    const [contractRows] = await bigquery.query(getContractsQuery);
    
    if (contractRows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No contracts found for interface detection',
        processed: 0,
        newInterfacesFound: 0
      });
    }
    
    console.log(`📋 Found ${contractRows.length} contracts to analyze for missing interfaces`);
    
    let processed = 0;
    let newInterfacesFound = 0;
    let interfacesCreated = 0;
    let errors = 0;
    const results: any[] = [];
    
    for (const contract of contractRows) {
      processed++;
      console.log(`[${processed}/${contractRows.length}] Analyzing: ${contract.contract_id}`);
      
      try {
        const abi = JSON.parse(contract.abi);
        const existingInterfaces = contract.existing_interfaces || [];
        const missingInterfaces: any[] = [];
        
        // Check for missing SIP-010 interface
        const isSip010 = isSip010Contract(abi);
        if (isSip010 && !existingInterfaces.includes('sip-010-ft')) {
          const identifier = extractSip010Identifier(abi);
          console.log(`  ✓ Missing SIP-010 interface (identifier: ${identifier})`);
          
          missingInterfaces.push({
            interface: 'sip-010-ft',
            metadata: {
              identifier: identifier || 'unknown',
              contract_id: contract.contract_id,
              needs_metadata_backfill: true,
              detected_by_abi: true
            }
          });
        }
        
        // Enhanced vault interface detection
        const hasExecuteFunction = abi.functions?.some((f: any) => 
          f.name === 'execute' && f.access === 'public'
        );
        const hasQuoteFunction = abi.functions?.some((f: any) => 
          f.name === 'quote' && f.access === 'read_only'
        );
        
        // Additional vault indicators for better detection
        const hasGetReservesFunction = abi.functions?.some((f: any) => 
          f.name === 'get-reserves' && f.access === 'read_only'
        );
        const hasSwapFunctions = abi.functions?.some((f: any) => 
          (f.name === 'swap-a-to-b' || f.name === 'swap-b-to-a') && f.access === 'private'
        );
        const hasLiquidityConstants = abi.variables?.some((v: any) => 
          v.name === 'OP_LOOKUP_RESERVES' || v.name === 'OP_SWAP_A_TO_B' || v.name === 'OP_SWAP_B_TO_A'
        );
        
        // Detect vault if it has execute + quote OR strong indicators of being a liquidity pool
        const isVault = (hasExecuteFunction && hasQuoteFunction) || 
                        (hasGetReservesFunction && hasSwapFunctions && hasLiquidityConstants);
        
        if (isVault && !existingInterfaces.includes('vault')) {
          console.log(`  ✓ Missing vault interface (execute: ${hasExecuteFunction}, quote: ${hasQuoteFunction}, reserves: ${hasGetReservesFunction}, swaps: ${hasSwapFunctions})`);
          
          // Determine vault version based on function signatures
          let vaultVersion = 'v1';
          if (hasGetReservesFunction || hasSwapFunctions) {
            vaultVersion = 'v0'; // v0 pools typically have get-reserves and explicit swap functions
          }
          
          missingInterfaces.push({
            interface: 'vault',
            metadata: {
              type: 'POOL',
              version: vaultVersion,
              has_execute: hasExecuteFunction,
              has_quote: hasQuoteFunction,
              has_get_reserves: hasGetReservesFunction,
              has_swap_functions: hasSwapFunctions,
              has_liquidity_constants: hasLiquidityConstants,
              needs_metadata_migration: true,
              detected_by_abi: true
            }
          });
        }
        
        if (missingInterfaces.length === 0) {
          console.log(`  ℹ No missing interfaces detected`);
          results.push({
            contractId: contract.contract_id,
            existingInterfaces,
            missingInterfaces: [],
            action: 'no_changes'
          });
          continue;
        }
        
        newInterfacesFound += missingInterfaces.length;
        
        // Create missing interfaces if not dry run
        if (!dryRun) {
          for (const interfaceData of missingInterfaces) {
            const insertQuery = `
              INSERT INTO \`crypto-analytics-466908.crypto_data.contract_interfaces\`
              (contract_id, interface, metadata, created_at, updated_at)
              VALUES (@contract_id, @interface, @metadata, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            `;
            
            await bigquery.query({
              query: insertQuery,
              params: {
                contract_id: contract.contract_id,
                interface: interfaceData.interface,
                metadata: interfaceData.metadata
              },
              types: {
                contract_id: 'STRING',
                interface: 'STRING',
                metadata: 'JSON'
              }
            });
            
            interfacesCreated++;
            console.log(`    ✓ Created ${interfaceData.interface} interface`);
          }
        } else {
          interfacesCreated += missingInterfaces.length;
        }
        
        results.push({
          contractId: contract.contract_id,
          existingInterfaces,
          missingInterfaces: missingInterfaces.map(i => i.interface),
          action: dryRun ? 'would_create' : 'created',
          count: missingInterfaces.length
        });
        
      } catch (error) {
        console.error(`  ✗ Error analyzing ${contract.contract_id}:`, error);
        errors++;
        results.push({
          contractId: contract.contract_id,
          existingInterfaces: contract.existing_interfaces || [],
          missingInterfaces: [],
          action: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return NextResponse.json({
      success: true,
      message: `Missing interface detection complete${dryRun ? ' (DRY RUN)' : ''}`,
      summary: {
        contractsProcessed: processed,
        newInterfacesFound,
        interfacesCreated,
        errors,
        successRate: `${(((processed - errors) / processed) * 100).toFixed(1)}%`
      },
      results: results.slice(0, 15), // Show first 15 results
      recommendations: newInterfacesFound > 0 ? [
        'Run SIP-010 metadata backfill for new sip-010-ft interfaces', 
        'Run vault metadata migration for new vault interfaces',
        'Update views to reflect expanded interface coverage'
      ] : []
    });
    
  } catch (error) {
    console.error('Fatal error in missing interface detection:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { getContractInfoWithParsedAbi } from '../../../../lib/stacks-api';
import { bigquery } from '../../../../lib/bigquery';

export async function POST(request: NextRequest) {
  const { contractAddress, contractName, forceUpdate } = await request.json();
  
  if (!contractAddress || !contractName) {
    return NextResponse.json({
      success: false,
      error: 'contractAddress and contractName are required'
    }, { status: 400 });
  }
  
  try {
    const contractId = `${contractAddress}.${contractName}`;
    console.log(`🔄 Upserting contract: ${contractId}`);
    
    // Check if contract already exists
    const existsQuery = `
      SELECT 
        contract_address,
        contract_name,
        abi IS NOT NULL as has_abi,
        source_code IS NOT NULL as has_source_code,
        created_at
      FROM \`crypto_data.contracts\`
      WHERE contract_address = @contract_address 
        AND contract_name = @contract_name
    `;
    
    const [existingRows] = await bigquery.query({
      query: existsQuery,
      params: {
        contract_address: contractAddress,
        contract_name: contractName
      },
      types: {
        contract_address: 'STRING',
        contract_name: 'STRING'
      }
    });
    
    const existing = existingRows[0];
    
    // Skip if exists and has complete data (unless forced)
    if (existing && existing.has_abi && existing.has_source_code && !forceUpdate) {
      return NextResponse.json({
        success: true,
        action: 'skipped',
        contractId,
        message: 'Contract already exists with complete data',
        existing: {
          hasAbi: existing.has_abi,
          hasSourceCode: existing.has_source_code,
          createdAt: existing.created_at
        }
      });
    }
    
    // Fetch fresh contract data
    const contractInfo = await getContractInfoWithParsedAbi(contractId);
    if (!contractInfo) {
      return NextResponse.json({
        success: false,
        error: `Contract ${contractId} not found on chain`
      }, { status: 404 });
    }
    
    // Use MERGE for safe upsert (prevents race conditions)
    const mergeQuery = `
      MERGE \`crypto_data.contracts\` T
      USING (
        SELECT 
          @contract_address as contract_address,
          @contract_name as contract_name,
          @abi as abi,
          @source_code as source_code,
          CURRENT_TIMESTAMP() as created_at
      ) S
      ON T.contract_address = S.contract_address 
         AND T.contract_name = S.contract_name
      WHEN MATCHED THEN
        UPDATE SET 
          abi = S.abi,
          source_code = S.source_code
      WHEN NOT MATCHED THEN
        INSERT (contract_address, contract_name, abi, source_code, created_at)
        VALUES (S.contract_address, S.contract_name, S.abi, S.source_code, S.created_at)
    `;
    
    await bigquery.query({
      query: mergeQuery,
      params: {
        contract_address: contractAddress,
        contract_name: contractName,
        abi: contractInfo.abi ? JSON.parse(contractInfo.abi) : null,
        source_code: contractInfo.source_code || null
      },
      types: {
        contract_address: 'STRING',
        contract_name: 'STRING',
        abi: 'JSON',
        source_code: 'STRING'
      }
    });
    
    const action = existing ? 'updated' : 'inserted';
    console.log(`✓ ${action} contract: ${contractId}`);
    
    return NextResponse.json({
      success: true,
      action,
      contractId,
      message: existing ? 'Contract updated with latest data' : 'New contract inserted',
      data: {
        hasAbi: !!contractInfo.abi,
        hasSourceCode: !!contractInfo.source_code,
        abiLength: contractInfo.abi?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error upserting contract:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// GET endpoint to demonstrate safe batch upserts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'validate';
  
  if (action === 'validate') {
    // Check for any potential duplicates that might have been inserted
    const duplicateCheckQuery = `
      SELECT 
        contract_address,
        contract_name,
        COUNT(*) as count
      FROM \`crypto_data.contracts\`
      GROUP BY contract_address, contract_name
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;
    
    const [duplicates] = await bigquery.query(duplicateCheckQuery);
    
    return NextResponse.json({
      success: true,
      message: duplicates.length === 0 ? 'No duplicates found' : `Found ${duplicates.length} duplicates`,
      duplicates: duplicates.map((row: any) => ({
        contractId: `${row.contract_address}.${row.contract_name}`,
        count: row.count
      })),
      recommendation: duplicates.length > 0 ? 'Run deduplication process' : 'Table integrity maintained'
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid action. Use: validate'
  }, { status: 400 });
}
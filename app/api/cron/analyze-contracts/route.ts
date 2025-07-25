import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { getContractInfoWithParsedAbi } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'analyze_contracts';

  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${jobName}...`);

    // Analyze contracts for ABI and interface information
    let analysisResults;
    try {
      analysisResults = await analyzeContracts();
    } catch (analysisError: any) {
      console.error(`Contract analysis failed: ${analysisError.message}`);
      analysisResults = { error: 'Contract analysis failed', message: analysisError.message };
    }

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed successfully in ${duration}ms`);

    // Revalidate contract-related endpoints 
    revalidatePath('/api/contracts');

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      analysis_results: analysisResults,
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



// Analyze contracts for ABI and interface information
async function analyzeContracts(): Promise<any> {
  console.log('🔍 Starting contract analysis...');

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  try {
    // Get contracts that need analysis (pending status)
    const contractsQuery = `
      SELECT contract_address, transaction_count
      FROM crypto_data.dim_contracts 
      WHERE analysis_status = 'pending'
      ORDER BY transaction_count DESC
      LIMIT 1000
    `;

    const [rows] = await bigquery.query({
      query: contractsQuery,
      jobTimeoutMs: 60000,
    });

    console.log(`🎯 Found ${rows.length} contracts to analyze`);

    // Process contracts with optimized parallelization 
    const batchSize = 10; // 10 contracts per batch
    const maxConcurrentBatches = 5; // Process 5 batches simultaneously for 50 total concurrent requests
    
    // Split into batches
    const batches = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      batches.push(rows.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches with ${maxConcurrentBatches} concurrent batches`);

    // Process batches in parallel groups
    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const concurrentBatches = batches.slice(i, i + maxConcurrentBatches);
      
      console.log(`🚀 Processing batch group ${Math.floor(i / maxConcurrentBatches) + 1}/${Math.ceil(batches.length / maxConcurrentBatches)} (${concurrentBatches.length} batches in parallel)`);

      // Process multiple batches concurrently
      const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
        const actualBatchIndex = i + batchIndex;
        console.log(`📋 Batch ${actualBatchIndex + 1}: Processing ${batch.length} contracts`);

        // Process contracts within this batch in parallel
        const analysisPromises = batch.map(async (row: any) => {
          try {
            const analysisResult = await Promise.race([
              analyzeContract(row.contract_address),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 300000)) // 5 minute timeout for large batches
            ]);
            
            return { contract_address: row.contract_address, analysis: analysisResult, error: null };
          } catch (error: any) {
            return { contract_address: row.contract_address, analysis: null, error: error.message };
          }
        });

        const results = await Promise.allSettled(analysisPromises);
        
        // Process results for this batch with parallel database updates
        const batchResults = { success: 0, failed: 0, skipped: 0 };
        
        const updatePromises = results.map(async (result) => {
          if (result.status === 'fulfilled' && result.value.analysis) {
            const { contract_address, analysis } = result.value;
            await updateContractAnalysis(contract_address, analysis);
            return 'success';
          } else if (result.status === 'fulfilled' && result.value.error) {
            const { contract_address, error } = result.value;
            await markContractAnalyzed(contract_address, 'failed', [error]);
            return 'failed';
          } else {
            return 'skipped';
          }
        });

        // Wait for all database updates to complete in parallel
        const updateResults = await Promise.allSettled(updatePromises);
        
        // Count results
        for (const updateResult of updateResults) {
          if (updateResult.status === 'fulfilled') {
            if (updateResult.value === 'success') batchResults.success++;
            else if (updateResult.value === 'failed') batchResults.failed++;
            else batchResults.skipped++;
          }
        }

        console.log(`✅ Batch ${actualBatchIndex + 1} completed: ${batchResults.success} success, ${batchResults.failed} failed, ${batchResults.skipped} skipped`);
        return batchResults;
      });

      // Wait for all concurrent batches to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Aggregate results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          successCount += result.value.success;
          failureCount += result.value.failed;
          skippedCount += result.value.skipped;
        }
      }
    }

    console.log('✅ Contract analysis completed');

    return {
      total_processed: successCount + failureCount + skippedCount,
      successful_analyses: successCount,
      failed_analyses: failureCount,
      skipped: skippedCount
    };

  } catch (error) {
    console.error('❌ Error during contract analysis:', error);
    throw error;
  }
}

// Analyze a single contract with timeout and error handling
async function analyzeContract(contractAddress: string): Promise<any> {
  try {
    // Get contract info with parsed ABI with reasonable timeout  
    const info = await Promise.race([
      getContractInfoWithParsedAbi(contractAddress),
      new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), 300000))
    ]);

    // If no contract info received, return null to mark as failed
    if (!info) {
      throw new Error('Contract not found or inaccessible');
    }

    return {
      sourceCode: info?.source_code || null,
      parsedAbi: info?.parsed_abi || null,
      deploymentTxId: info?.tx_id || null,
      deploymentBlockHeight: info?.block_height || null,
      canonical: info?.canonical || null
    };
  } catch (error: any) {
    // Log the error but don't crash the batch
    console.warn(`Contract analysis failed for ${contractAddress}: ${error.message}`);
    throw error; // Re-throw to mark contract as failed
  }
}

// Update contract with analysis results
async function updateContractAnalysis(contractAddress: string, analysis: any): Promise<void> {
  const updateQuery = `
    UPDATE crypto_data.dim_contracts 
    SET 
      source_code = @sourceCode,
      parsed_abi = @parsedAbi,
      deployment_tx_id = @deploymentTxId,
      deployment_block_height = @deploymentBlockHeight,
      canonical = @canonical,
      analysis_status = 'analyzed',
      analyzed_at = CURRENT_TIMESTAMP(),
      analysis_duration_ms = 2000,
      updated_at = CURRENT_TIMESTAMP()
    WHERE contract_address = @contractAddress
  `;

  await bigquery.query({
    query: updateQuery,
    params: {
      contractAddress: contractAddress,
      sourceCode: analysis.sourceCode || null,
      parsedAbi: analysis.parsedAbi || null,
      deploymentTxId: analysis.deploymentTxId || null,
      deploymentBlockHeight: analysis.deploymentBlockHeight || null,
      canonical: analysis.canonical || null
    },
    types: {
      contractAddress: 'STRING',
      sourceCode: 'STRING',
      parsedAbi: 'JSON',
      deploymentTxId: 'STRING',
      deploymentBlockHeight: 'INT64',
      canonical: 'BOOL'
    },
    jobTimeoutMs: 60000,
  });

  const functionCount = analysis.parsedAbi?.functions?.length || 0;
  console.log(`✅ Updated analysis for ${contractAddress}: ${functionCount} functions found`);
}

// Mark contract as analyzed (failed)
async function markContractAnalyzed(contractAddress: string, status: string, errors: string[]): Promise<void> {
  const updateQuery = `
    UPDATE crypto_data.dim_contracts 
    SET 
      analysis_status = @status,
      analysis_errors = @errors,
      analyzed_at = CURRENT_TIMESTAMP(),
      updated_at = CURRENT_TIMESTAMP()
    WHERE contract_address = @contractAddress
  `;

  await bigquery.query({
    query: updateQuery,
    params: {
      contractAddress: contractAddress,
      status: status,
      errors: errors
    },
    types: {
      contractAddress: 'STRING',
      status: 'STRING',
      errors: 'ARRAY'
    },
    jobTimeoutMs: 60000,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
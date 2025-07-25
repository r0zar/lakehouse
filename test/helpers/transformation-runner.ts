import { readFileSync } from 'fs';
import { join } from 'path';
import { bigquery } from '@/lib/bigquery';

/**
 * Execute a SQL transformation file against BigQuery
 */
export async function runTransformation(sqlFilePath: string): Promise<any[]> {
  const fullPath = join(process.cwd(), 'analytics', 'sql', sqlFilePath);
  const sqlContent = readFileSync(fullPath, 'utf8');
  
  console.log(`Running transformation: ${sqlFilePath}`);
  
  const [rows] = await bigquery.query({
    query: sqlContent,
  });
  
  return rows;
}

/**
 * Execute a SQL file and create/replace a table with the results
 */
export async function runTransformationAsTable(
  sqlFilePath: string, 
  destinationTable: string,
  writeDisposition: 'WRITE_TRUNCATE' | 'WRITE_APPEND' = 'WRITE_TRUNCATE',
  datasetName?: string
): Promise<void> {
  const fullPath = join(process.cwd(), 'analytics', 'sql', sqlFilePath);
  let sqlContent = readFileSync(fullPath, 'utf8');
  
  // Use provided dataset or default to test dataset
  const dataset = datasetName || process.env.BIGQUERY_DATASET || 'crypto_data_test';
  
  // Replace dataset references in SQL content
  sqlContent = sqlContent.replace(/crypto_data_test\./g, `${dataset}.`);
  
  const startTime = Date.now();
  console.log(`🚀 [${new Date().toISOString()}] Starting transformation: ${sqlFilePath} -> ${dataset}.${destinationTable}`);
  
  try {
    await bigquery.query({
      query: sqlContent,
      destination: bigquery.dataset(dataset).table(destinationTable),
      writeDisposition,
      jobTimeoutMs: 60000,
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ [${new Date().toISOString()}] Transformation completed: ${sqlFilePath} -> ${dataset}.${destinationTable} (${duration}ms)`);
  } catch (error: any) {
    console.error(`❌ Transformation failed: ${sqlFilePath} -> ${dataset}.${destinationTable}`);
    console.error(`❌ Error:`, error.message);
    
    // Log detailed error for BigQuery issues
    if (error.errors && Array.isArray(error.errors)) {
      console.error(`❌ BigQuery errors:`, JSON.stringify(error.errors, null, 2));
    }
    
    throw error;
  }
}

/**
 * Run multiple transformations in sequence
 */
export async function runTransformationPipeline(
  transformations: Array<{
    sqlFile: string;
    destinationTable: string;
    writeDisposition?: 'WRITE_TRUNCATE' | 'WRITE_APPEND';
  }>,
  datasetName?: string
): Promise<void> {
  const pipelineStartTime = Date.now();
  const totalSteps = transformations.length;
  
  console.log(`🏗️  [${new Date().toISOString()}] Starting pipeline with ${totalSteps} transformations`);
  
  for (let i = 0; i < transformations.length; i++) {
    const transformation = transformations[i];
    const stepNumber = i + 1;
    
    console.log(`📋 [${new Date().toISOString()}] Step ${stepNumber}/${totalSteps}: ${transformation.sqlFile}`);
    
    try {
      await runTransformationAsTable(
        transformation.sqlFile,
        transformation.destinationTable,
        transformation.writeDisposition,
        datasetName
      );
      
      console.log(`✅ [${new Date().toISOString()}] Step ${stepNumber}/${totalSteps} completed successfully`);
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Step ${stepNumber}/${totalSteps} failed: ${transformation.sqlFile}`);
      throw error; // Re-throw to stop pipeline
    }
  }
  
  const pipelineDuration = Date.now() - pipelineStartTime;
  console.log(`🎉 [${new Date().toISOString()}] Pipeline completed successfully! Total time: ${pipelineDuration}ms (${(pipelineDuration/1000).toFixed(2)}s)`);
}

/**
 * Execute raw SQL against BigQuery (for testing queries)
 */
export async function executeSQL(sql: string): Promise<any[]> {
  const [rows] = await bigquery.query({
    query: sql,
  });
  return rows;
}
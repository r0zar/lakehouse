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
  
  console.log(`Running transformation: ${sqlFilePath} -> ${dataset}.${destinationTable}`);
  
  await bigquery.query({
    query: sqlContent,
    destination: bigquery.dataset(dataset).table(destinationTable),
    writeDisposition,
  });
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
  for (const transformation of transformations) {
    await runTransformationAsTable(
      transformation.sqlFile,
      transformation.destinationTable,
      transformation.writeDisposition,
      datasetName
    );
  }
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
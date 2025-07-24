import { bigquery, dataset } from '@/lib/bigquery';

// Test dataset for isolated testing
const testDataset = bigquery.dataset('crypto_data_test');

export interface TestWebhookData {
  event_id: string;
  received_at: string;
  webhook_path: string;
  body_json: any;
  headers?: any;
  url?: string;
  method?: string;
}

/**
 * Insert test webhook data into the test events table
 */
export async function insertTestWebhookData(data: TestWebhookData[]): Promise<void> {
  try {
    // Convert data to match BigQuery schema (JSON fields as strings)
    const formattedData = data.map(row => ({
      ...row,
      body_json: typeof row.body_json === 'string' ? row.body_json : JSON.stringify(row.body_json),
      headers: typeof row.headers === 'string' ? row.headers : JSON.stringify(row.headers || {})
    }));

    await testDataset.table('events').insert(formattedData, {
      ignoreUnknownValues: true,
      skipInvalidRows: false
    });
  } catch (error: any) {
    console.error('Failed to insert test data:', error.message);
    if (error.errors) {
      console.error('Insert errors:', JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

/**
 * Clear all data from test tables
 */
export async function clearTestData(): Promise<void> {
  try {
    await bigquery.query({
      query: 'TRUNCATE TABLE crypto_data_test.events',
    });
  } catch (error: any) {
    // Ignore if table doesn't exist or is already empty
    if (!error.message.includes('does not exist') && !error.message.includes('0 rows')) {
      console.warn('Failed to clear test data:', error.message);
    }
  }
}

/**
 * Execute a query against the test dataset
 */
export async function queryTestDatabase(query: string): Promise<any[]> {
  const [rows] = await bigquery.query({
    query: query,
  });
  return rows;
}

/**
 * Check if a table exists in the test dataset
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const [exists] = await testDataset.table(tableName).exists();
    return exists;
  } catch {
    return false;
  }
}

/**
 * Create a test table with the given schema
 */
export async function createTestTable(tableName: string, schema: any[]): Promise<void> {
  await testDataset.createTable(tableName, { schema });
}

/**
 * Drop a test table if it exists
 */
export async function dropTestTable(tableName: string): Promise<void> {
  try {
    await testDataset.table(tableName).delete();
  } catch (error: any) {
    // Ignore if table doesn't exist
    if (!error.message.includes('does not exist')) {
      throw error;
    }
  }
}

/**
 * Generate a unique test event ID
 */
export function generateTestEventId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
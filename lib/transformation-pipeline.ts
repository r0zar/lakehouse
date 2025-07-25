import { runTransformationPipeline } from '../test/helpers/transformation-runner';
import { dataset, bigquery } from './bigquery';

/**
 * Define the full transformation pipeline
 * Order matters - staging tables must be built before marts
 */
const TRANSFORMATION_PIPELINE = [
  // Staging layer - extract and clean raw data (optimized for real-time)
  {
    sqlFile: 'staging/stg_events.sql',
    destinationTable: 'stg_events',
    writeDisposition: 'WRITE_TRUNCATE' as const // Full refresh for reliability
  },
  {
    sqlFile: 'staging/stg_blocks.sql',
    destinationTable: 'stg_blocks',
    writeDisposition: 'WRITE_TRUNCATE' as const // Full refresh for reliability
  },
  {
    sqlFile: 'staging/stg_transactions.sql', 
    destinationTable: 'stg_transactions',
    writeDisposition: 'WRITE_TRUNCATE' as const // Full refresh for reliability
  },
  {
    sqlFile: 'staging/stg_addresses.sql',
    destinationTable: 'stg_addresses', 
    writeDisposition: 'WRITE_TRUNCATE' as const // Full refresh for reliability
  },
  
  // Marts layer - business intelligence models
  {
    sqlFile: 'marts/dim_blocks.sql',
    destinationTable: 'dim_blocks',
    writeDisposition: 'WRITE_TRUNCATE' as const
  },
  {
    sqlFile: 'marts/dim_transactions.sql',
    destinationTable: 'dim_transactions',
    writeDisposition: 'WRITE_TRUNCATE' as const
  },
  {
    sqlFile: 'marts/fact_daily_activity.sql',
    destinationTable: 'fact_daily_activity',
    writeDisposition: 'WRITE_TRUNCATE' as const
  },
  {
    sqlFile: 'marts/dim_defi_swaps.sql',
    destinationTable: 'dim_defi_swaps',
    writeDisposition: 'WRITE_TRUNCATE' as const
  },
  {
    sqlFile: 'marts/dim_smart_contract_activity.sql',
    destinationTable: 'dim_smart_contract_activity',
    writeDisposition: 'WRITE_TRUNCATE' as const
  },
  {
    sqlFile: 'marts/fact_defi_metrics.sql',
    destinationTable: 'fact_defi_metrics',
    writeDisposition: 'WRITE_TRUNCATE' as const
  }
];

/**
 * Execute the full transformation pipeline
 * Transforms raw webhook data into staging tables and business marts
 */
export async function runFullPipeline(): Promise<void> {
  console.log('🚀 Starting transformation pipeline...');
  
  try {
    // Use production dataset (crypto_data) unless test mode is enabled
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    console.log(`🔍 Using dataset for full pipeline: ${datasetName} (NODE_ENV: ${process.env.NODE_ENV})`);
    await runTransformationPipeline(TRANSFORMATION_PIPELINE, datasetName);
    console.log('✅ Transformation pipeline completed successfully');
  } catch (error) {
    console.error('❌ Transformation pipeline failed:', error);
    throw error;
  }
}

/**
 * Execute only staging transformations (faster, for real-time updates)
 */
export async function runStagingPipeline(): Promise<void> {
  const pipelineStartTime = Date.now();
  console.log(`🔄 [${new Date().toISOString()}] Starting real-time staging pipeline...`);
  
  const stagingTransformations = TRANSFORMATION_PIPELINE.filter(t => 
    t.sqlFile.startsWith('staging/')
  );
  
  console.log(`📊 Found ${stagingTransformations.length} staging transformations to run`);
  
  try {
    // Use production dataset (crypto_data) unless test mode is enabled
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    console.log(`🔍 Using dataset: ${datasetName} (NODE_ENV: ${process.env.NODE_ENV})`);
    
    await runTransformationPipeline(stagingTransformations, datasetName);
    
    const duration = Date.now() - pipelineStartTime;
    console.log(`✅ [${new Date().toISOString()}] Real-time staging pipeline completed successfully (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - pipelineStartTime;
    console.error(`❌ [${new Date().toISOString()}] Staging pipeline failed after ${duration}ms:`, error);
    throw error;
  }
}

/**
 * Execute only mart transformations (assumes staging is up to date)
 */
export async function runMartsPipeline(): Promise<void> {
  console.log('📊 Starting on-demand marts pipeline...');
  
  const martTransformations = TRANSFORMATION_PIPELINE.filter(t => 
    t.sqlFile.startsWith('marts/')
  );
  
  try {
    // Use production dataset (crypto_data) unless test mode is enabled
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    console.log(`🔍 Using dataset: ${datasetName} (NODE_ENV: ${process.env.NODE_ENV})`);
    await runTransformationPipeline(martTransformations, datasetName);
    console.log('✅ On-demand marts pipeline completed successfully');
  } catch (error) {
    console.error('❌ Marts pipeline failed:', error);
    throw error;
  }
}

/**
 * Execute specific mart transformations based on query requirements
 */
export async function runSpecificMarts(martNames: string[]): Promise<void> {
  console.log(`📊 Starting specific marts pipeline for: ${martNames.join(', ')}`);
  
  const specificTransformations = TRANSFORMATION_PIPELINE.filter(t => 
    t.sqlFile.startsWith('marts/') && 
    martNames.some(name => t.sqlFile.includes(name))
  );
  
  if (specificTransformations.length === 0) {
    console.log('No matching mart transformations found');
    return;
  }
  
  try {
    // Use production dataset (crypto_data) unless test mode is enabled
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    console.log(`🔍 Using dataset for specific marts: ${datasetName} (NODE_ENV: ${process.env.NODE_ENV})`);
    await runTransformationPipeline(specificTransformations, datasetName);
    console.log(`✅ Specific marts completed: ${martNames.join(', ')}`);
  } catch (error) {
    console.error(`❌ Specific marts failed for ${martNames.join(', ')}:`, error);
    throw error;
  }
}

/**
 * Check if we have recent data to transform
 */
export async function hasRecentData(minutesThreshold: number = 5): Promise<boolean> {
  const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
  const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000).toISOString();
  
  const query = `
    SELECT COUNT(*) as recent_count
    FROM \`${datasetName}.events\`
    WHERE received_at >= '${thresholdTime}'
  `;
  
  const [rows] = await bigquery.query(query);
  return rows[0]?.recent_count > 0;
}

/**
 * Analyze SQL query to determine which marts it needs
 */
export function detectRequiredMarts(sqlQuery: string): string[] {
  const query = sqlQuery.toLowerCase();
  const requiredMarts: string[] = [];
  
  // Map table references to mart files
  const martMappings = {
    'dim_blocks': 'dim_blocks',
    'dim_transactions': 'dim_transactions',
    'fact_daily_activity': 'fact_daily_activity',
    'dim_defi_swaps': 'dim_defi_swaps', 
    'dim_smart_contract_activity': 'dim_smart_contract_activity',
    'fact_defi_metrics': 'fact_defi_metrics'
  };
  
  // Check which marts are referenced in the query
  for (const [tableName, martFile] of Object.entries(martMappings)) {
    if (query.includes(tableName)) {
      requiredMarts.push(martFile);
    }
  }
  
  return requiredMarts;
}

/**
 * Check if staging tables are fresh enough (last updated within threshold)
 */
export async function isStagingFresh(minutesThreshold: number = 10): Promise<boolean> {
  try {
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000).toISOString();
    
    // Check if any staging table has recent data
    const query = `
      SELECT MAX(received_at) as latest_staging_update
      FROM \`${datasetName}.stg_events\`
      WHERE received_at >= '${thresholdTime}'
    `;
    
    const [rows] = await bigquery.query(query);
    return rows[0]?.latest_staging_update !== null;
  } catch (error) {
    console.warn('Could not check staging freshness:', error);
    return false; // Assume not fresh if we can't check
  }
}

/**
 * Get mart freshness status - when were marts last updated
 */
export async function getMartFreshness(): Promise<Record<string, Date | null>> {
  try {
    const datasetName = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    
    const martTables = [
      'dim_blocks',
      'dim_transactions',
      'fact_daily_activity',
      'dim_defi_swaps', 
      'dim_smart_contract_activity',
      'fact_defi_metrics'
    ];
    
    const freshness: Record<string, Date | null> = {};
    
    for (const tableName of martTables) {
      try {
        const query = `
          SELECT table_id, last_modified_time
          FROM \`${datasetName}.__TABLES__\`
          WHERE table_id = '${tableName}'
        `;
        
        const [rows] = await bigquery.query(query);
        if (rows.length > 0) {
          freshness[tableName] = new Date(parseInt(rows[0].last_modified_time));
        } else {
          freshness[tableName] = null; // Table doesn't exist
        }
      } catch (error) {
        freshness[tableName] = null; // Error checking this table
      }
    }
    
    return freshness;
  } catch (error) {
    console.warn('Could not check mart freshness:', error);
    return {};
  }
}
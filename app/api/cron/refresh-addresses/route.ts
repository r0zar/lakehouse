import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

interface ProcessingResult {
  table_name: string;
  status: 'success' | 'error' | 'no_new_data';
  rows_processed?: number;
  last_processed_at?: string;
  error?: string;
  duration_ms: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const tableName = 'stg_addresses';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting incremental refresh for ${tableName}...`);

    // Get the last processed timestamp for this table
    const watermarkQuery = `
      SELECT last_processed_at, last_processed_event_id
      FROM crypto_data.processing_watermarks 
      WHERE table_name = '${tableName}'
      ORDER BY updated_at DESC 
      LIMIT 1
    `;

    const [watermarkRows] = await bigquery.query({
      query: watermarkQuery,
      jobTimeoutMs: 30000,
    });

    let lastProcessedAt = '1970-01-01 00:00:00 UTC'; // Default to epoch if no watermark
    if (watermarkRows.length > 0) {
      const watermark = watermarkRows[0];
      lastProcessedAt = watermark.last_processed_at?.value || watermark.last_processed_at;
    }

    console.log(`Last processed timestamp for ${tableName}: ${lastProcessedAt}`);

    // Check if there are new events to process
    const newEventsQuery = `
      SELECT COUNT(*) as new_event_count,
             MAX(received_at) as max_received_at
      FROM crypto_data.events 
      WHERE received_at > TIMESTAMP('${lastProcessedAt}')
        AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) > 0
    `;

    const [countRows] = await bigquery.query({
      query: newEventsQuery,
      jobTimeoutMs: 30000,
    });

    const newEventCount = parseInt(countRows[0]?.new_event_count || '0');
    const maxReceivedAt = countRows[0]?.max_received_at?.value || countRows[0]?.max_received_at;

    if (newEventCount === 0) {
      console.log(`No new events to process for ${tableName}`);
      return NextResponse.json({
        table_name: tableName,
        status: 'no_new_data',
        rows_processed: 0,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`Found ${newEventCount} new events to process for ${tableName}`);

    // Process new events incrementally
    const insertQuery = `
      INSERT INTO crypto_data.stg_addresses (
        event_id,
        block_hash,
        tx_hash,
        operation_type,
        address,
        amount,
        contract_identifier,
        function_name,
        function_args,
        webhook_path,
        received_at
      )
      SELECT 
        events.event_id,
        JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
        JSON_EXTRACT_SCALAR(tx_data, '$.transaction_identifier.hash') as tx_hash,
        JSON_EXTRACT_SCALAR(op_data, '$.type') as operation_type,
        JSON_EXTRACT_SCALAR(op_data, '$.account.address') as address,
        JSON_EXTRACT_SCALAR(op_data, '$.amount.value') as amount,
        JSON_EXTRACT_SCALAR(tx_data, '$.metadata.kind.data.contract_identifier') as contract_identifier,
        JSON_EXTRACT_SCALAR(tx_data, '$.metadata.kind.data.method') as function_name,
        JSON_EXTRACT_ARRAY(tx_data, '$.metadata.kind.data.args') as function_args,
        events.webhook_path,
        events.received_at
      FROM crypto_data.events,
        UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block_data,
        UNNEST(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as tx_data,
        UNNEST(JSON_EXTRACT_ARRAY(tx_data, '$.operations')) as op_data
      WHERE events.received_at > TIMESTAMP('${lastProcessedAt}')
        AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) > 0
        AND JSON_EXTRACT_ARRAY(tx_data, '$.operations') IS NOT NULL
        AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(tx_data, '$.operations')) > 0
      ORDER BY events.received_at ASC
    `;

    const [insertJob] = await bigquery.query({
      query: insertQuery,
      jobTimeoutMs: 300000, // 5 minutes
    });

    const rowsProcessed = (insertJob as any).metadata?.statistics?.query?.numDmlAffectedRows 
      ? parseInt((insertJob as any).metadata.statistics.query.numDmlAffectedRows) 
      : 0;

    // Update watermark after successful processing
    const updateWatermarkQuery = `
      MERGE crypto_data.processing_watermarks AS target
      USING (
        SELECT 
          '${tableName}' as table_name,
          TIMESTAMP('${maxReceivedAt}') as last_processed_at,
          '' as last_processed_event_id,
          CURRENT_TIMESTAMP() as updated_at,
          ${rowsProcessed} as rows_processed,
          'success' as status
      ) AS source
      ON target.table_name = source.table_name
      WHEN MATCHED THEN
        UPDATE SET 
          last_processed_at = source.last_processed_at,
          last_processed_event_id = source.last_processed_event_id,
          updated_at = source.updated_at,
          rows_processed = source.rows_processed,
          status = source.status
      WHEN NOT MATCHED THEN
        INSERT (table_name, last_processed_at, last_processed_event_id, updated_at, rows_processed, status)
        VALUES (source.table_name, source.last_processed_at, source.last_processed_event_id, source.updated_at, source.rows_processed, source.status)
    `;

    await bigquery.query({
      query: updateWatermarkQuery,
      jobTimeoutMs: 30000,
    });

    const duration = Date.now() - startTime;

    console.log(`${tableName} processed successfully: ${rowsProcessed} rows in ${duration}ms`);

    // Revalidate addresses API and page
    revalidatePath('/api/addresses');
    revalidatePath('/addresses');

    return NextResponse.json({
      table_name: tableName,
      status: 'success',
      rows_processed: rowsProcessed,
      last_processed_at: maxReceivedAt,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Update watermark with error status
    try {
      const errorWatermarkQuery = `
        MERGE crypto_data.processing_watermarks AS target
        USING (
          SELECT 
            '${tableName}' as table_name,
            CURRENT_TIMESTAMP() as updated_at,
            'error' as status
        ) AS source
        ON target.table_name = source.table_name
        WHEN MATCHED THEN
          UPDATE SET 
            updated_at = source.updated_at,
            status = source.status
        WHEN NOT MATCHED THEN
          INSERT (table_name, last_processed_at, updated_at, status)
          VALUES (source.table_name, TIMESTAMP('1970-01-01 00:00:00 UTC'), source.updated_at, source.status)
      `;
      
      await bigquery.query({
        query: errorWatermarkQuery,
        jobTimeoutMs: 30000,
      });
    } catch (watermarkError) {
      console.error('Failed to update error watermark:', watermarkError);
    }
    
    console.error(`Failed to process ${tableName}:`, error);

    return NextResponse.json({
      table_name: tableName,
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Allow both POST (for cron jobs) and GET (for manual testing)
export async function GET(request: NextRequest) {
  return POST(request);
}
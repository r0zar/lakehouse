import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const tableName = 'stg_events';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting incremental refresh for ${tableName}...`);

    // Get the last processed timestamp for this table
    const watermarkQuery = `
      SELECT last_processed_at
      FROM crypto_data.processing_watermarks 
      WHERE table_name = '${tableName}'
      ORDER BY updated_at DESC 
      LIMIT 1
    `;

    const [watermarkRows] = await bigquery.query({
      query: watermarkQuery,
      jobTimeoutMs: 30000,
    });

    let lastProcessedAt = '1970-01-01 00:00:00 UTC';
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

    // Process new smart contract events incrementally
    const insertQuery = `
      INSERT INTO crypto_data.stg_events (
        event_id,
        block_hash,
        block_time,
        tx_hash,
        event_type,
        position_index,
        contract_identifier,
        topic,
        action,
        ft_sender,
        ft_recipient,
        ft_amount,
        ft_asset_identifier,
        raw_event_data,
        received_at,
        webhook_path
      )
      SELECT 
        events.event_id,
        JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
        CASE 
          WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64) IS NOT NULL 
          AND SAFE_CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64) BETWEEN 0 AND 253402300799
          THEN TIMESTAMP_SECONDS(CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64))
          ELSE NULL
        END as block_time,
        JSON_EXTRACT_SCALAR(tx_data, '$.transaction_identifier.hash') as tx_hash,
        JSON_EXTRACT_SCALAR(event_data, '$.type') as event_type,
        SAFE_CAST(JSON_EXTRACT_SCALAR(event_data, '$.position.index') AS INT64) as position_index,
        JSON_EXTRACT_SCALAR(event_data, '$.data.contract_identifier') as contract_identifier,
        JSON_EXTRACT_SCALAR(event_data, '$.data.topic') as topic,
        JSON_EXTRACT_SCALAR(event_data, '$.data.value.action') as action,
        JSON_EXTRACT_SCALAR(event_data, '$.data.sender') as ft_sender,
        JSON_EXTRACT_SCALAR(event_data, '$.data.recipient') as ft_recipient,
        SAFE_CAST(JSON_EXTRACT_SCALAR(event_data, '$.data.amount') AS INT64) as ft_amount,
        JSON_EXTRACT_SCALAR(event_data, '$.data.asset_identifier') as ft_asset_identifier,
        event_data as raw_event_data,
        events.received_at,
        events.webhook_path
      FROM crypto_data.events,
        UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block_data,
        UNNEST(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as tx_data,
        UNNEST(JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events')) as event_data
      WHERE events.received_at > TIMESTAMP('${lastProcessedAt}')
        AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        AND JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events') IS NOT NULL
        AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events')) > 0
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
          updated_at = source.updated_at,
          rows_processed = source.rows_processed,
          status = source.status
      WHEN NOT MATCHED THEN
        INSERT (table_name, last_processed_at, updated_at, rows_processed, status)
        VALUES (source.table_name, source.last_processed_at, source.updated_at, source.rows_processed, source.status)
    `;

    await bigquery.query({
      query: updateWatermarkQuery,
      jobTimeoutMs: 30000,
    });

    const duration = Date.now() - startTime;

    console.log(`${tableName} processed successfully: ${rowsProcessed} rows in ${duration}ms`);

    // Revalidate events API and page
    revalidatePath('/api/events');
    revalidatePath('/events');

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

export async function GET(request: NextRequest) {
  return POST(request);
}
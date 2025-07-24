-- Extract block data from webhook JSON
-- This model unpacks the apply[] array to create one row per block
SELECT 
  events.event_id,
  
  -- Block identifiers
  JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
  CAST(JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.index') AS INT64) as block_index,
  
  -- Block metadata
  TIMESTAMP_SECONDS(CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64)) as block_time,
  JSON_EXTRACT_SCALAR(block_data, '$.metadata.bitcoin_anchor_block_identifier.hash') as bitcoin_anchor_hash,
  CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.bitcoin_anchor_block_identifier.index') AS INT64) as bitcoin_anchor_index,
  JSON_EXTRACT_SCALAR(block_data, '$.metadata.stacks_block_hash') as stacks_block_hash,
  
  -- Derived metrics
  ARRAY_LENGTH(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as transaction_count,
  
  -- Webhook metadata
  events.webhook_path,
  JSON_EXTRACT_SCALAR(events.body_json, '$.chainhook.uuid') as chainhook_uuid,
  CAST(JSON_EXTRACT_SCALAR(events.body_json, '$.chainhook.is_streaming_blocks') AS BOOL) as is_streaming_blocks,
  events.received_at
  
FROM crypto_data_test.events,
  UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block_data
WHERE JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
  AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) > 0
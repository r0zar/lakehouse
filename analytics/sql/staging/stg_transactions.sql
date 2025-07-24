-- Extract transaction data from blocks in webhook JSON
-- This model unpacks blocks and then their transactions to create one row per transaction
SELECT 
  events.event_id,
  
  -- Block identifiers 
  JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
  CAST(JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.index') AS INT64) as block_index,
  
  -- Transaction data
  JSON_EXTRACT_SCALAR(tx_data, '$.transaction_identifier.hash') as tx_hash,
  JSON_EXTRACT_SCALAR(tx_data, '$.metadata.description') as description,
  CAST(JSON_EXTRACT_SCALAR(tx_data, '$.metadata.fee') AS INT64) as fee,
  CAST(JSON_EXTRACT_SCALAR(tx_data, '$.metadata.success') AS BOOL) as success,
  
  -- Derived metrics
  ARRAY_LENGTH(JSON_EXTRACT_ARRAY(tx_data, '$.operations')) as operation_count,
  
  -- Webhook metadata
  events.webhook_path,
  events.received_at
  
FROM crypto_data_test.events,
  UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block_data,
  UNNEST(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as tx_data
WHERE JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
  AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) > 0
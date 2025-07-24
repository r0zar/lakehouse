-- Extract address data from transaction operations in webhook JSON
-- This model unpacks blocks -> transactions -> operations to create one row per address operation
SELECT 
  events.event_id,
  
  -- Block identifiers
  JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
  
  -- Transaction identifier
  JSON_EXTRACT_SCALAR(tx_data, '$.transaction_identifier.hash') as tx_hash,
  
  -- Operation data
  JSON_EXTRACT_SCALAR(op_data, '$.type') as operation_type,
  JSON_EXTRACT_SCALAR(op_data, '$.address') as address,
  JSON_EXTRACT_SCALAR(op_data, '$.amount') as amount,
  
  -- Contract call specific fields
  JSON_EXTRACT_SCALAR(op_data, '$.contract_identifier') as contract_identifier,
  JSON_EXTRACT_SCALAR(op_data, '$.function_name') as function_name,
  JSON_EXTRACT_ARRAY(op_data, '$.args') as function_args,
  
  -- Metadata
  events.webhook_path,
  events.received_at
  
FROM crypto_data_test.events,
  UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block_data,
  UNNEST(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as tx_data,
  UNNEST(JSON_EXTRACT_ARRAY(tx_data, '$.operations')) as op_data
WHERE JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
  AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) > 0
  AND JSON_EXTRACT_ARRAY(tx_data, '$.operations') IS NOT NULL
  AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(tx_data, '$.operations')) > 0
-- Extract smart contract events from transaction metadata in webhook JSON
-- This model unpacks blocks -> transactions -> events to create one row per blockchain event
SELECT 
  events.event_id,
  
  -- Block identifiers
  JSON_EXTRACT_SCALAR(block_data, '$.block_identifier.hash') as block_hash,
  TIMESTAMP_SECONDS(SAFE_CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64)) as block_time,
  
  -- Transaction identifier
  JSON_EXTRACT_SCALAR(tx_data, '$.transaction_identifier.hash') as tx_hash,
  
  -- Event metadata
  JSON_EXTRACT_SCALAR(event_data, '$.type') as event_type,
  SAFE_CAST(JSON_EXTRACT_SCALAR(event_data, '$.position.index') AS INT64) as position_index,
  
  -- Smart contract event fields
  JSON_EXTRACT_SCALAR(event_data, '$.data.contract_identifier') as contract_identifier,
  JSON_EXTRACT_SCALAR(event_data, '$.data.topic') as topic,
  JSON_EXTRACT_SCALAR(event_data, '$.data.value.action') as action,
  
  -- FT Transfer event fields
  JSON_EXTRACT_SCALAR(event_data, '$.data.sender') as ft_sender,
  JSON_EXTRACT_SCALAR(event_data, '$.data.recipient') as ft_recipient,
  SAFE_CAST(JSON_EXTRACT_SCALAR(event_data, '$.data.amount') AS INT64) as ft_amount,
  JSON_EXTRACT_SCALAR(event_data, '$.data.asset_identifier') as ft_asset_identifier,
  
  -- Raw event data for complex parsing
  event_data as raw_event_data,
  
  -- Audit fields
  events.received_at,
  events.webhook_path

FROM 
  `crypto_data_test.events` as events,
  
  -- Unnest blocks
  UNNEST(JSON_EXTRACT_ARRAY(events.body_json, '$.apply')) as block_data,
  
  -- Unnest transactions within each block
  UNNEST(JSON_EXTRACT_ARRAY(block_data, '$.transactions')) as tx_data,
  
  -- Unnest events within each transaction
  UNNEST(JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events')) as event_data

WHERE 
  -- Only process webhooks with event data
  JSON_EXTRACT_ARRAY(events.body_json, '$.apply') IS NOT NULL
  AND JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events') IS NOT NULL
  AND ARRAY_LENGTH(JSON_EXTRACT_ARRAY(tx_data, '$.metadata.receipt.events')) > 0
  -- Filter out invalid timestamps (temporarily disabled)
  -- AND SAFE_CAST(JSON_EXTRACT_SCALAR(block_data, '$.metadata.block_time') AS INT64) BETWEEN 946684800 AND 4102444800
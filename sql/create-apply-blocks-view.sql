-- Materialized view to flatten apply blocks array into individual block records
-- Each block gets its own row with structured JSON fields

CREATE MATERIALIZED VIEW `crypto_data.apply_blocks`
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
AS
SELECT 
  event_id,
  received_at,
  webhook_path,
  
  -- Block structure as specified
  JSON_EXTRACT(block, '$.block_identifier') as block_identifier,
  JSON_EXTRACT(block, '$.metadata') as metadata,
  JSON_EXTRACT(block, '$.parent_block_identifier') as parent_block_identifier,
  CAST(JSON_VALUE(block, '$.timestamp') AS NUMERIC) as timestamp,
  JSON_EXTRACT_ARRAY(block, '$.transactions') as transactions

FROM `crypto_data.chainhooks`,
UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block;
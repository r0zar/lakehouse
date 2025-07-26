-- Materialized view to flatten transactions array into individual transaction records
-- Each transaction gets its own row with structured JSON fields

CREATE MATERIALIZED VIEW `crypto_data.transactions`
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
AS
SELECT 
  event_id,
  received_at,
  webhook_path,
  
  -- Transaction structure as specified
  JSON_EXTRACT(tx, '$.metadata') as metadata,
  JSON_EXTRACT_ARRAY(tx, '$.operations') as operations,
  JSON_EXTRACT(tx, '$.transaction_identifier') as transaction_identifier

FROM `crypto_data.chainhooks`,
UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block,
UNNEST(JSON_EXTRACT_ARRAY(block, '$.transactions')) as tx;
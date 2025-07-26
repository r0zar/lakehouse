-- Materialized view to flatten operations array into individual operation records
-- Operations are inside transactions, not at transaction level

CREATE MATERIALIZED VIEW `crypto_data.operations`
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
AS
SELECT 
  event_id,
  received_at,
  webhook_path,
  
  -- Operation fields from the Rosetta-style operations array
  JSON_VALUE(op, '$.type') as operation_type,
  JSON_VALUE(op, '$.status') as status,
  JSON_EXTRACT(op, '$.operation_identifier') as operation_identifier,
  JSON_EXTRACT_ARRAY(op, '$.related_operations') as related_operations,
  JSON_EXTRACT(op, '$.account') as account,
  JSON_EXTRACT(op, '$.amount') as amount

FROM `crypto_data.chainhooks`,
UNNEST(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as block,
UNNEST(JSON_EXTRACT_ARRAY(block, '$.transactions')) as tx,
UNNEST(JSON_EXTRACT_ARRAY(tx, '$.operations')) as op;
-- Materialized view to flatten chainhook JSON into key arrays
-- Only keeps essential flattened arrays: apply, chainhook, events, rollback

CREATE MATERIALIZED VIEW `crypto_data.chainhooks_flattened`
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
AS
SELECT 
  event_id,
  received_at,
  webhook_path,
  
  -- Flatten key JSON objects/arrays only
  JSON_EXTRACT(body_json, '$.chainhook') as chainhook,
  JSON_EXTRACT_ARRAY(body_json, '$.apply') as apply,
  JSON_EXTRACT_ARRAY(body_json, '$.events') as events,
  JSON_EXTRACT_ARRAY(body_json, '$.rollback') as rollback

FROM `crypto_data.chainhooks`;
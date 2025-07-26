-- Create view combining transactions metadata with their operations as arrays
-- Provides easy access to complete transaction context without duplicating data

CREATE VIEW `crypto_data.transactions_with_operations` AS

WITH tx_flattened AS (
  SELECT 
    event_id,
    received_at,
    webhook_path,
    JSON_VALUE(metadata, '$.description') as tx_description,
    JSON_VALUE(metadata, '$.sender') as tx_sender,
    CAST(JSON_VALUE(metadata, '$.fee') AS INT64) as tx_fee,
    CAST(JSON_VALUE(metadata, '$.success') AS BOOL) as tx_success,
    JSON_VALUE(metadata, '$.kind.type') as tx_type,
    JSON_VALUE(metadata, '$.kind.data.contract_identifier') as contract_identifier,
    JSON_VALUE(metadata, '$.kind.data.method') as contract_method,
    JSON_VALUE(transaction_identifier, '$.hash') as tx_hash
  FROM `crypto_data.transactions`
)

SELECT 
  t.*,
  ARRAY_AGG(
    STRUCT(
      o.operation_type,
      o.status as operation_status,
      JSON_VALUE(o.operation_identifier, '$.index') as operation_index,
      JSON_VALUE(o.account, '$.address') as operation_account,
      JSON_VALUE(o.amount, '$.value') as amount_value,
      JSON_VALUE(o.amount, '$.currency.symbol') as currency_symbol,
      JSON_VALUE(o.amount, '$.currency.metadata.asset_class_identifier') as asset_identifier
    ) ORDER BY CAST(JSON_VALUE(o.operation_identifier, '$.index') AS INT64)
  ) as operations

FROM tx_flattened t
LEFT JOIN `crypto_data.operations` o 
  ON t.event_id = o.event_id 
GROUP BY 
  t.event_id, t.received_at, t.webhook_path, t.tx_description, t.tx_sender, 
  t.tx_fee, t.tx_success, t.tx_type, t.contract_identifier, t.contract_method, t.tx_hash;
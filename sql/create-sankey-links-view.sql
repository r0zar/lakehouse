-- Create sankey links view for source→target→value flows
-- Provides the 'links' array for Sankey diagram showing asset flows

CREATE VIEW `crypto_data.sankey_links` AS

WITH operation_flows AS (
  -- Extract individual operations from the operations table directly
  SELECT 
    event_id,
    received_at,
    webhook_path,
    operation_type,
    status as operation_status,
    JSON_VALUE(operation_identifier, '$.index') as operation_index,
    JSON_VALUE(account, '$.address') as address,
    CAST(JSON_VALUE(amount, '$.value') AS FLOAT64) as amount_value,
    JSON_VALUE(amount, '$.currency.symbol') as currency_symbol,
    JSON_VALUE(amount, '$.currency.metadata.asset_class_identifier') as asset_identifier
    
  FROM `crypto_data.operations`
  WHERE status = 'SUCCESS'
    AND JSON_VALUE(amount, '$.value') IS NOT NULL
    AND CAST(JSON_VALUE(amount, '$.value') AS FLOAT64) > 0
    AND JSON_VALUE(account, '$.address') IS NOT NULL
),

-- Create flows by pairing DEBIT (source) with CREDIT (target) operations
flow_pairs AS (
  SELECT 
    debit.event_id,
    debit.received_at,
    
    -- Source (DEBIT - money leaving)
    debit.address as source,
    
    -- Target (CREDIT - money arriving) 
    credit.address as target,
    
    -- Amount and asset details
    debit.amount_value as value,
    COALESCE(debit.asset_identifier, debit.currency_symbol, 'STX') as asset,
    debit.currency_symbol,
    
    -- Priority scoring: prefer flows involving smart contracts
    CASE 
      WHEN debit.address LIKE '%.%' OR credit.address LIKE '%.%' THEN 1  -- Contract involved
      ELSE 2  -- Wallet-to-wallet
    END as flow_priority
    
  FROM operation_flows debit
  JOIN operation_flows credit 
    ON debit.event_id = credit.event_id
    AND debit.operation_type = 'DEBIT'  
    AND credit.operation_type = 'CREDIT'
    AND debit.currency_symbol = credit.currency_symbol
    AND COALESCE(debit.asset_identifier, '') = COALESCE(credit.asset_identifier, '')
    AND debit.amount_value = credit.amount_value
    -- Ensure DEBIT comes before CREDIT in operation order
    AND CAST(debit.operation_index AS INT64) <= CAST(credit.operation_index AS INT64)
    
  WHERE debit.address != credit.address  -- Exclude self-transfers
),

-- Deduplicate flows, prioritizing contract-based flows over wallet-to-wallet
prioritized_flows AS (
  SELECT 
    event_id,
    received_at,
    source,
    target,
    value,
    asset,
    currency_symbol,
    ROW_NUMBER() OVER (
      PARTITION BY event_id, currency_symbol, value 
      ORDER BY flow_priority ASC, source ASC
    ) as priority_rank
  FROM flow_pairs
),

-- Use only the highest priority flows (prefer contract-based flows)
all_flows AS (
  SELECT 
    event_id,
    received_at,
    source,
    target,
    value,
    asset,
    currency_symbol
  FROM prioritized_flows 
  WHERE priority_rank = 1
)

SELECT 
  source,
  target, 
  value,
  asset,
  currency_symbol
  
FROM all_flows
ORDER BY value DESC;
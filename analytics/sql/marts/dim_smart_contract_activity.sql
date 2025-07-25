-- Smart Contract Activity Analysis - Contract usage patterns and metrics
CREATE OR REPLACE TABLE crypto_data.dim_smart_contract_activity AS
SELECT 
  -- Contract identifiers
  e.contract_identifier,
  
  -- Extract contract name and deployer
  SPLIT(e.contract_identifier, '.')[OFFSET(0)] as contract_deployer,
  SPLIT(e.contract_identifier, '.')[OFFSET(1)] as contract_name,
  
  -- Activity metrics
  e.action,
  COUNT(*) as event_count,
  COUNT(DISTINCT e.tx_hash) as unique_transactions,
  COUNT(DISTINCT e.block_hash) as unique_blocks,
  
  -- Transaction success correlation
  COUNT(CASE WHEN t.success = true THEN 1 END) as successful_transactions,
  COUNT(CASE WHEN t.success = false THEN 1 END) as failed_transactions,
  SAFE_DIVIDE(COUNT(CASE WHEN t.success = true THEN 1 END), COUNT(*)) as success_rate,
  
  -- Fee analysis
  AVG(t.fee) as avg_transaction_fee,
  SUM(t.fee) as total_fees_generated,
  
  -- Protocol categorization
  CASE 
    WHEN LOWER(e.contract_identifier) LIKE '%stableswap%' THEN 'DEX - Stableswap'
    WHEN LOWER(e.contract_identifier) LIKE '%pool%' OR LOWER(e.contract_identifier) LIKE '%xyk%' THEN 'DEX - AMM' 
    WHEN LOWER(e.contract_identifier) LIKE '%lending%' OR LOWER(e.contract_identifier) LIKE '%borrow%' THEN 'Lending'
    WHEN LOWER(e.contract_identifier) LIKE '%pox%' OR LOWER(e.contract_identifier) LIKE '%stacking%' THEN 'Stacking'
    WHEN LOWER(e.contract_identifier) LIKE '%token%' THEN 'Token Contract'
    WHEN LOWER(e.contract_identifier) LIKE '%aggregator%' OR LOWER(e.contract_identifier) LIKE '%wrapper%' THEN 'DeFi Aggregator'
    ELSE 'Other'
  END as protocol_category,
  
  -- Activity intensity
  CASE 
    WHEN COUNT(*) < 10 THEN 'low'
    WHEN COUNT(*) < 100 THEN 'medium' 
    WHEN COUNT(*) < 1000 THEN 'high'
    ELSE 'very_high'
  END as activity_level,
  
  -- Audit fields
  MIN(e.block_time) as first_seen,
  MAX(e.block_time) as last_seen,
  CURRENT_TIMESTAMP() as updated_at

FROM 
  crypto_data.stg_events e
  
  -- Join transaction data for success metrics
  LEFT JOIN crypto_data.stg_transactions t ON (e.tx_hash = t.tx_hash)

WHERE 
  e.event_type = 'SmartContractEvent'
  AND e.contract_identifier IS NOT NULL
  AND e.action IS NOT NULL

GROUP BY 
  e.contract_identifier,
  contract_deployer,
  contract_name,
  e.action,
  protocol_category

ORDER BY 
  event_count DESC
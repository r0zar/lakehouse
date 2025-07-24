-- Smart Contract Activity Analysis - Event-driven contract intelligence
-- This mart analyzes smart contract usage patterns, popular functions, and interaction trends

SELECT 
  -- Contract identifiers
  e.contract_identifier,
  
  -- Extract contract name and deployer
  SPLIT(e.contract_identifier, '.')[OFFSET(0)] as contract_deployer,
  SPLIT(e.contract_identifier, '.')[OFFSET(1)] as contract_name,
  
  -- Time dimensions
  DATE(e.block_time) as activity_date,
  EXTRACT(HOUR FROM e.block_time) as activity_hour,
  
  -- Activity metrics
  e.action,
  COUNT(*) as event_count,
  COUNT(DISTINCT e.tx_hash) as unique_transactions,
  COUNT(DISTINCT e.block_hash) as unique_blocks,
  
  -- Transaction success correlation
  COUNT(CASE WHEN t.success = true THEN 1 END) as successful_transactions,
  COUNT(CASE WHEN t.success = false THEN 1 END) as failed_transactions,
  AVG(CASE WHEN t.success = true THEN 1.0 ELSE 0.0 END) as success_rate,
  
  -- Fee analysis
  AVG(t.fee) as avg_transaction_fee,
  SUM(t.fee) as total_fees_generated,
  
  -- Operation complexity (from financial layer)
  AVG(op_summary.operation_count) as avg_operations_per_transaction,
  SUM(op_summary.total_value_moved) as total_value_facilitated,
  
  -- Protocol categorization
  CASE 
    WHEN e.contract_identifier LIKE '%stableswap%' THEN 'DEX - Stableswap'
    WHEN e.contract_identifier LIKE '%xyk%' OR e.contract_identifier LIKE '%pool%' THEN 'DEX - AMM' 
    WHEN e.contract_identifier LIKE '%lending%' OR e.contract_identifier LIKE '%borrow%' THEN 'Lending'
    WHEN e.contract_identifier LIKE '%pox%' OR e.contract_identifier LIKE '%stacking%' THEN 'Stacking'
    WHEN e.contract_identifier LIKE '%token%' THEN 'Token Contract'
    WHEN e.contract_identifier LIKE '%aggregator%' OR e.contract_identifier LIKE '%helper%' THEN 'DeFi Aggregator'
    ELSE 'Other'
  END as protocol_category,
  
  -- Activity intensity
  CASE 
    WHEN COUNT(*) < 10 THEN 'low'
    WHEN COUNT(*) < 100 THEN 'medium' 
    WHEN COUNT(*) < 1000 THEN 'high'
    ELSE 'very_high'
  END as activity_level,
  
  -- Most common event actions
  STRING_AGG(DISTINCT e.action, ', ' ORDER BY e.action) as all_actions,
  
  -- Audit fields
  MIN(e.block_time) as first_seen,
  MAX(e.block_time) as last_seen

FROM 
  `crypto_data_test.stg_events` e
  
  -- Join transaction data for success metrics
  LEFT JOIN `crypto_data_test.stg_transactions` t ON (e.tx_hash = t.tx_hash)
  
  -- Join operations summary for financial context
  LEFT JOIN (
    SELECT 
      tx_hash,
      COUNT(*) as operation_count,
      SUM(SAFE_CAST(amount AS INT64)) as total_value_moved
    FROM `crypto_data_test.stg_addresses`
    WHERE operation_type IN ('DEBIT', 'CREDIT')
    AND amount IS NOT NULL
    GROUP BY tx_hash
  ) op_summary ON (e.tx_hash = op_summary.tx_hash)

WHERE 
  e.event_type = 'SmartContractEvent'
  AND e.contract_identifier IS NOT NULL
  AND e.action IS NOT NULL

GROUP BY 
  e.contract_identifier,
  contract_deployer,
  contract_name,
  activity_date,
  activity_hour,
  e.action,
  protocol_category

ORDER BY 
  activity_date DESC,
  event_count DESC
-- DeFi Protocol Metrics - Daily aggregated insights across all DeFi activity
-- This fact table provides KPIs for DeFi ecosystem monitoring and analytics

SELECT 
  -- Time dimensions
  DATE(base_events.block_time) as metrics_date,
  
  -- Protocol aggregations
  COUNT(DISTINCT swap_events.contract_identifier) as active_dex_contracts,
  COUNT(DISTINCT lending_events.contract_identifier) as active_lending_contracts,
  COUNT(DISTINCT stacking_events.contract_identifier) as active_stacking_contracts,
  
  -- Swap metrics
  COUNT(swap_events.tx_hash) as total_swaps,
  COUNT(DISTINCT swap_events.tx_hash) as unique_swap_transactions,
  SUM(SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount') AS INT64)) as total_swap_volume_input,
  AVG(SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount') AS INT64)) as avg_swap_size,
  
  -- Fee analysis
  SUM(SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount-fees-protocol') AS INT64)) as total_protocol_fees,
  SUM(SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount-fees-provider') AS INT64)) as total_provider_fees,
  SUM(SAFE_CAST(JSON_EXTRACT_SCALAR(agg_fee_events.raw_event_data, '$.data.value.data.amount-fees-total') AS INT64)) as total_aggregator_fees,
  
  -- User activity
  COUNT(DISTINCT ft_events.ft_sender) as unique_traders,
  COUNT(DISTINCT ft_events.ft_recipient) as unique_recipients,
  
  -- Token diversity
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-token')) as unique_input_tokens,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.y-token')) as unique_output_tokens,
  
  -- Pool activity
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.pool-contract')) as active_pools,
  COUNT(pool_update_events.tx_hash) as pool_updates,
  
  -- Transaction success metrics
  COUNT(CASE WHEN t.success = true THEN 1 END) as successful_defi_transactions,
  COUNT(CASE WHEN t.success = false THEN 1 END) as failed_defi_transactions,
  AVG(CASE WHEN t.success = true THEN 1.0 ELSE 0.0 END) as defi_success_rate,
  
  -- Financial flow (from operations)
  SUM(ops.total_debits) as total_value_debited,
  SUM(ops.total_credits) as total_value_credited,
  AVG(ops.operation_count) as avg_operations_per_defi_tx,
  
  -- Complexity metrics
  AVG(ARRAY_LENGTH(SPLIT(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.caller'), '.'))) as avg_call_depth,
  COUNT(CASE WHEN agg_fee_events.tx_hash IS NOT NULL THEN 1 END) as aggregated_transactions,
  COUNT(CASE WHEN agg_fee_events.tx_hash IS NULL THEN 1 END) as direct_transactions,
  
  -- Market concentration
  COUNT(CASE WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount') AS INT64) > 100000000 THEN 1 END) as whale_transactions,
  COUNT(CASE WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_events.raw_event_data, '$.data.value.data.x-amount') AS INT64) <= 1000000 THEN 1 END) as retail_transactions

FROM 
  `crypto_data_test.stg_events` base_events
  
  -- Swap events
  LEFT JOIN `crypto_data_test.stg_events` swap_events ON (
    base_events.block_hash = swap_events.block_hash
    AND swap_events.event_type = 'SmartContractEvent' 
    AND (swap_events.action LIKE '%swap%' OR swap_events.action LIKE '%helper%')
  )
  
  -- Lending events  
  LEFT JOIN `crypto_data_test.stg_events` lending_events ON (
    base_events.block_hash = lending_events.block_hash
    AND lending_events.event_type = 'SmartContractEvent'
    AND (lending_events.action LIKE '%lend%' OR lending_events.action LIKE '%borrow%' OR lending_events.action LIKE '%supply%')
  )
  
  -- Stacking events
  LEFT JOIN `crypto_data_test.stg_events` stacking_events ON (
    base_events.block_hash = stacking_events.block_hash
    AND stacking_events.event_type = 'SmartContractEvent'
    AND (stacking_events.action LIKE '%pox%' OR stacking_events.action LIKE '%delegate%' OR stacking_events.action LIKE '%stack%')
  )
  
  -- Aggregator fee events
  LEFT JOIN `crypto_data_test.stg_events` agg_fee_events ON (
    base_events.block_hash = agg_fee_events.block_hash
    AND agg_fee_events.event_type = 'SmartContractEvent'
    AND agg_fee_events.action = 'transfer-aggregator-fees'
  )
  
  -- Token transfer events
  LEFT JOIN `crypto_data_test.stg_events` ft_events ON (
    base_events.block_hash = ft_events.block_hash
    AND ft_events.event_type = 'FTTransferEvent'
  )
  
  -- Pool update events
  LEFT JOIN `crypto_data_test.stg_events` pool_update_events ON (
    base_events.block_hash = pool_update_events.block_hash
    AND pool_update_events.event_type = 'SmartContractEvent'
    AND pool_update_events.action LIKE '%pool%'
  )
  
  -- Transaction success data
  LEFT JOIN `crypto_data_test.stg_transactions` t ON (base_events.tx_hash = t.tx_hash)
  
  -- Operations summary
  LEFT JOIN (
    SELECT 
      tx_hash,
      SUM(CASE WHEN operation_type = 'DEBIT' THEN SAFE_CAST(amount AS INT64) END) as total_debits,
      SUM(CASE WHEN operation_type = 'CREDIT' THEN SAFE_CAST(amount AS INT64) END) as total_credits,
      COUNT(*) as operation_count
    FROM `crypto_data_test.stg_addresses`
    WHERE operation_type IN ('DEBIT', 'CREDIT')
    GROUP BY tx_hash
  ) ops ON (base_events.tx_hash = ops.tx_hash)

WHERE 
  -- Focus on DeFi-related activity
  (swap_events.tx_hash IS NOT NULL 
   OR lending_events.tx_hash IS NOT NULL 
   OR stacking_events.tx_hash IS NOT NULL
   OR agg_fee_events.tx_hash IS NOT NULL)

GROUP BY 
  DATE(base_events.block_time)

ORDER BY 
  metrics_date DESC
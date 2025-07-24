-- DeFi Swap Analysis - Combines operations and events for comprehensive swap analytics
-- This mart provides detailed insights into DEX activity, fees, and swap patterns

SELECT 
  -- Transaction identifiers
  t.tx_hash,
  t.block_hash,
  swap_event.block_time,
  t.success,
  t.fee as transaction_fee,
  
  -- Swap event details from smart contract events
  swap_event.action as swap_type,
  swap_event.contract_identifier as dex_contract,
  JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.pool-name') as pool_name,
  SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) as input_amount,
  SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.dy') AS INT64) as output_amount,
  JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-token') as input_token,
  JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.y-token') as output_token,
  
  -- Fee breakdown from events
  SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount-fees-protocol') AS INT64) as protocol_fees,
  SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount-fees-provider') AS INT64) as provider_fees,
  
  -- Aggregator fee details (if applicable)
  agg_fee_event.contract_identifier as aggregator_contract,
  SAFE_CAST(JSON_EXTRACT_SCALAR(agg_fee_event.raw_event_data, '$.data.value.data.amount-fees-total') AS INT64) as aggregator_fees_total,
  SAFE_CAST(JSON_EXTRACT_SCALAR(agg_fee_event.raw_event_data, '$.data.value.data.contract-fee') AS INT64) as aggregator_fee_bps,
  
  -- Financial validation from operations
  op_summary.total_debits,
  op_summary.total_credits,
  op_summary.unique_addresses,
  op_summary.operation_count,
  
  -- Calculated metrics
  CASE 
    WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) > 0 
    THEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.dy') AS INT64) / SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64)
    ELSE NULL 
  END as swap_rate,
  
  -- Fee percentage calculations
  CASE 
    WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) > 0
    THEN (SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount-fees-protocol') AS INT64) + 
          SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount-fees-provider') AS INT64)) * 100.0 / 
         SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64)
    ELSE NULL
  END as total_fee_percentage,
  
  -- Swap categorization
  CASE 
    WHEN swap_event.action LIKE '%stableswap%' THEN 'stableswap'
    WHEN swap_event.action LIKE '%xyk%' OR swap_event.action LIKE '%pool%' THEN 'amm'
    WHEN swap_event.action LIKE '%helper%' THEN 'aggregated'
    ELSE 'other'
  END as swap_category,
  
  -- Size categorization
  CASE 
    WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) < 1000000 THEN 'small'
    WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) < 10000000 THEN 'medium'
    WHEN SAFE_CAST(JSON_EXTRACT_SCALAR(swap_event.raw_event_data, '$.data.value.data.x-amount') AS INT64) < 100000000 THEN 'large'
    ELSE 'whale'
  END as swap_size_category

FROM 
  `crypto_data_test.stg_transactions` t
  
  -- Join swap events (business logic)
  LEFT JOIN `crypto_data_test.stg_events` swap_event ON (
    t.tx_hash = swap_event.tx_hash 
    AND swap_event.event_type = 'SmartContractEvent'
    AND (swap_event.action LIKE '%swap%' OR swap_event.action LIKE '%helper%')
  )
  
  -- Join aggregator fee events  
  LEFT JOIN `crypto_data_test.stg_events` agg_fee_event ON (
    t.tx_hash = agg_fee_event.tx_hash 
    AND agg_fee_event.event_type = 'SmartContractEvent'
    AND agg_fee_event.action = 'transfer-aggregator-fees'
  )
  
  -- Aggregate operations data (financial validation)
  LEFT JOIN (
    SELECT 
      tx_hash,
      SUM(CASE WHEN operation_type = 'DEBIT' THEN SAFE_CAST(amount AS INT64) END) as total_debits,
      SUM(CASE WHEN operation_type = 'CREDIT' THEN SAFE_CAST(amount AS INT64) END) as total_credits,
      COUNT(DISTINCT address) as unique_addresses,
      COUNT(*) as operation_count
    FROM `crypto_data_test.stg_addresses`
    WHERE operation_type IN ('DEBIT', 'CREDIT')
    GROUP BY tx_hash
  ) op_summary ON (t.tx_hash = op_summary.tx_hash)

WHERE 
  -- Only include transactions with swap events
  swap_event.tx_hash IS NOT NULL
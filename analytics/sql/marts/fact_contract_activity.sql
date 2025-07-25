-- Contract Activity Mart
-- Aggregates smart contract usage metrics by contract and day
-- Includes function calls, unique callers, transaction volume

CREATE OR REPLACE TABLE crypto_data.fact_contract_activity AS

WITH daily_contract_stats AS (
  SELECT 
    DATE(a.received_at) as activity_date,
    a.contract_identifier,
    a.function_name,
    
    -- Transaction metrics
    COUNT(DISTINCT a.tx_hash) as transaction_count,
    COUNT(DISTINCT a.address) as unique_callers,
    
    -- Success metrics
    COUNT(CASE WHEN t.success = true THEN 1 END) as successful_calls,
    COUNT(CASE WHEN t.success = false THEN 1 END) as failed_calls,
    
    -- Fee metrics (in microSTX)
    SUM(CASE WHEN t.fee IS NOT NULL THEN t.fee ELSE 0 END) as total_fees,
    AVG(CASE WHEN t.fee IS NOT NULL THEN t.fee ELSE NULL END) as avg_fee_per_call,
    
    -- Volume metrics (use NUMERIC to handle large values)
    SUM(CASE WHEN a.amount IS NOT NULL THEN SAFE_CAST(a.amount AS NUMERIC) ELSE 0 END) as total_amount_transferred,
    
    -- Time metrics
    MIN(a.received_at) as first_call_time,
    MAX(a.received_at) as last_call_time
    
  FROM crypto_data.stg_addresses a
  LEFT JOIN crypto_data.stg_transactions t ON a.tx_hash = t.tx_hash
  WHERE a.contract_identifier IS NOT NULL 
    AND a.function_name IS NOT NULL
    AND a.received_at IS NOT NULL
  
  GROUP BY 
    DATE(a.received_at),
    a.contract_identifier, 
    a.function_name
),

contract_summaries AS (
  SELECT 
    activity_date,
    contract_identifier,
    
    -- Extract contract name and deployer
    CASE 
      WHEN STRPOS(contract_identifier, '.') > 0 
      THEN SUBSTR(contract_identifier, STRPOS(contract_identifier, '.') + 1)
      ELSE contract_identifier
    END as contract_name,
    
    CASE 
      WHEN STRPOS(contract_identifier, '.') > 0 
      THEN SUBSTR(contract_identifier, 1, STRPOS(contract_identifier, '.') - 1)
      ELSE NULL
    END as deployer_address,
    
    -- Aggregate across all functions for this contract
    COUNT(DISTINCT function_name) as unique_functions_called,
    SUM(transaction_count) as total_transactions,
    SUM(unique_callers) as total_unique_callers, -- Note: may double-count users across functions
    SUM(successful_calls) as total_successful_calls,
    SUM(failed_calls) as total_failed_calls,
    SUM(total_fees) as total_contract_fees,
    AVG(avg_fee_per_call) as avg_fee_per_call,
    SUM(total_amount_transferred) as total_amount_transferred,
    MIN(first_call_time) as first_call_time,
    MAX(last_call_time) as last_call_time,
    
    -- Success rate
    SAFE_DIVIDE(SUM(successful_calls), SUM(successful_calls) + SUM(failed_calls)) * 100 as success_rate_percent
    
  FROM daily_contract_stats
  GROUP BY activity_date, contract_identifier
)

-- Aggregate directly from daily contract stats, bypassing the contract_summaries CTE
SELECT 
  contract_identifier,
  
  -- Extract contract name and deployer
  CASE 
    WHEN STRPOS(contract_identifier, '.') > 0 
    THEN SUBSTR(contract_identifier, STRPOS(contract_identifier, '.') + 1)
    ELSE contract_identifier
  END as contract_name,
  
  CASE 
    WHEN STRPOS(contract_identifier, '.') > 0 
    THEN SUBSTR(contract_identifier, 1, STRPOS(contract_identifier, '.') - 1)
    ELSE NULL
  END as deployer_address,
  
  -- Time period info
  DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) as period_start,
  CURRENT_DATE() as period_end,
  COUNT(DISTINCT activity_date) as active_days,
  
  -- Activity metrics (aggregated across all days)
  COUNT(DISTINCT function_name) as total_unique_functions,
  SUM(transaction_count) as total_transactions,
  SUM(unique_callers) as total_unique_callers,
  SUM(successful_calls) as total_successful_calls,
  SUM(failed_calls) as total_failed_calls,
  ROUND(SAFE_DIVIDE(SUM(successful_calls), SUM(successful_calls) + SUM(failed_calls)) * 100, 2) as success_rate_percent,
  
  -- Economic metrics (aggregated)
  SUM(total_fees) as total_contract_fees,
  ROUND(AVG(avg_fee_per_call), 2) as avg_fee_per_call,
  SUM(total_amount_transferred) as total_amount_transferred,
  
  -- Time metrics (across full period)
  MIN(first_call_time) as first_call_time,
  MAX(last_call_time) as last_call_time,
  TIMESTAMP_DIFF(MAX(last_call_time), MIN(first_call_time), SECOND) as total_activity_duration_seconds,
  
  -- Daily averages
  ROUND(SUM(transaction_count) / COUNT(DISTINCT activity_date), 1) as avg_daily_transactions,
  ROUND(SUM(total_fees) / COUNT(DISTINCT activity_date), 0) as avg_daily_fees,
  
  -- Function breakdown (simplified - just JSON string for now)
  '[]' as top_functions,
  
  -- Metadata
  CURRENT_TIMESTAMP() as created_at,
  'fact_contract_activity' as mart_name
  
FROM daily_contract_stats
WHERE activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) -- Last 90 days
GROUP BY contract_identifier
ORDER BY total_transactions DESC, total_contract_fees DESC;
-- Dimensional transactions table with business logic and derived metrics
-- Provides enriched transaction data with categorization and calculated metrics

CREATE OR REPLACE TABLE crypto_data.dim_transactions AS
SELECT 
  -- Primary identifiers
  tx.tx_hash,
  tx.block_hash,
  tx.block_index,
  
  -- Transaction details
  tx.description,
  tx.fee,
  tx.success,
  tx.operation_count,
  
  -- Extract transaction type by splitting on colon for invoked and deployed calls
  CASE 
    WHEN tx.description LIKE 'invoked:%' THEN SPLIT(tx.description, ':')[OFFSET(0)]
    WHEN tx.description LIKE 'deployed:%' THEN SPLIT(tx.description, ':')[OFFSET(0)]
    ELSE tx.description
  END as transaction_type,
  
  -- Calculated metrics
  CASE 
    WHEN tx.operation_count = 0 THEN NULL
    ELSE tx.fee / tx.operation_count 
  END as fee_per_operation,
  
  -- Fee categories for analysis
  CASE 
    WHEN tx.fee = 0 THEN 'free'
    WHEN tx.fee <= 1000 THEN 'low'
    WHEN tx.fee <= 5000 THEN 'medium' 
    WHEN tx.fee <= 10000 THEN 'high'
    ELSE 'very_high'
  END as fee_category,
  
  -- Success indicators
  CASE 
    WHEN tx.success = true THEN 'successful'
    WHEN tx.success = false THEN 'failed'
    ELSE 'unknown'
  END as status,
  
  -- Metadata
  tx.webhook_path,
  
  -- Audit fields
  tx.received_at as created_at,
  CURRENT_TIMESTAMP() as updated_at

FROM crypto_data.stg_transactions tx
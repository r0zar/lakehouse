-- Dimensional blocks table with business logic and derived metrics
WITH block_transactions AS (
  SELECT 
    block_hash,
    COUNT(*) as transaction_count,
    SUM(fee) as total_fees,
    COUNT(CASE WHEN success = true THEN 1 END) as successful_transactions,
    COUNT(CASE WHEN success = false THEN 1 END) as failed_transactions
  FROM crypto_data_test.stg_transactions
  GROUP BY block_hash
),

block_addresses AS (
  SELECT 
    block_hash,
    COUNT(DISTINCT address) as unique_addresses
  FROM crypto_data_test.stg_addresses
  WHERE address IS NOT NULL
  GROUP BY block_hash
)

SELECT 
  -- Primary identifiers
  blocks.block_hash,
  blocks.block_index,
  blocks.block_time,
  
  -- Block metadata
  blocks.bitcoin_anchor_hash,
  blocks.bitcoin_anchor_index,
  blocks.stacks_block_hash,
  blocks.chainhook_uuid,
  blocks.is_streaming_blocks,
  blocks.webhook_path,
  
  -- Transaction metrics
  COALESCE(tx.transaction_count, 0) as transaction_count,
  COALESCE(tx.total_fees, 0) as total_fees,
  COALESCE(tx.successful_transactions, 0) as successful_transactions,
  COALESCE(tx.failed_transactions, 0) as failed_transactions,
  
  -- Calculated metrics
  CASE 
    WHEN COALESCE(tx.transaction_count, 0) = 0 THEN NULL
    ELSE COALESCE(tx.successful_transactions, 0) / tx.transaction_count 
  END as success_rate,
  
  CASE 
    WHEN COALESCE(tx.transaction_count, 0) = 0 THEN NULL
    ELSE COALESCE(tx.total_fees, 0) / tx.transaction_count 
  END as avg_fee_per_transaction,
  
  -- Address metrics
  COALESCE(addr.unique_addresses, 0) as unique_addresses,
  
  -- Audit fields
  blocks.received_at as created_at,
  CURRENT_TIMESTAMP() as updated_at

FROM crypto_data_test.stg_blocks blocks
LEFT JOIN block_transactions tx ON blocks.block_hash = tx.block_hash
LEFT JOIN block_addresses addr ON blocks.block_hash = addr.block_hash
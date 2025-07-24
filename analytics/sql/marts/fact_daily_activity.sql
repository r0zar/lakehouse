-- Daily activity fact table aggregating crypto metrics by webhook path
WITH daily_blocks AS (
  SELECT 
    DATE(block_time) as activity_date,
    webhook_path,
    COUNT(*) as total_blocks,
    COUNT(DISTINCT block_hash) as unique_blocks
  FROM crypto_data_test.stg_blocks
  GROUP BY DATE(block_time), webhook_path
),

daily_transactions AS (
  SELECT 
    DATE(blocks.block_time) as activity_date,
    blocks.webhook_path,
    COUNT(*) as total_transactions,
    SUM(tx.fee) as total_fees,
    COUNT(CASE WHEN tx.success = true THEN 1 END) as successful_transactions,
    COUNT(CASE WHEN tx.success = false THEN 1 END) as failed_transactions,
    AVG(tx.fee) as avg_fee_per_transaction,
    MIN(tx.fee) as min_fee,
    MAX(tx.fee) as max_fee
  FROM crypto_data_test.stg_transactions tx
  JOIN crypto_data_test.stg_blocks blocks ON tx.block_hash = blocks.block_hash
  GROUP BY DATE(blocks.block_time), blocks.webhook_path
),

daily_addresses AS (
  SELECT 
    DATE(blocks.block_time) as activity_date,
    blocks.webhook_path,
    COUNT(DISTINCT addr.address) as unique_addresses,
    COUNT(*) as total_operations
  FROM crypto_data_test.stg_addresses addr
  JOIN crypto_data_test.stg_blocks blocks ON addr.block_hash = blocks.block_hash
  WHERE addr.address IS NOT NULL
  GROUP BY DATE(blocks.block_time), blocks.webhook_path
)

SELECT 
  -- Date and path dimensions
  COALESCE(blocks.activity_date, tx.activity_date, addr.activity_date) as activity_date,
  COALESCE(blocks.webhook_path, tx.webhook_path, addr.webhook_path) as webhook_path,
  
  -- Block metrics
  COALESCE(blocks.total_blocks, 0) as total_blocks,
  COALESCE(blocks.unique_blocks, 0) as unique_blocks,
  
  -- Transaction metrics
  COALESCE(tx.total_transactions, 0) as total_transactions,
  COALESCE(tx.total_fees, 0) as total_fees,
  COALESCE(tx.successful_transactions, 0) as successful_transactions,
  COALESCE(tx.failed_transactions, 0) as failed_transactions,
  
  -- Calculated transaction metrics
  CASE 
    WHEN COALESCE(tx.total_transactions, 0) = 0 THEN NULL
    ELSE COALESCE(tx.successful_transactions, 0) / tx.total_transactions 
  END as success_rate,
  
  COALESCE(tx.avg_fee_per_transaction, 0) as avg_fee_per_transaction,
  COALESCE(tx.min_fee, 0) as min_fee,
  COALESCE(tx.max_fee, 0) as max_fee,
  
  -- Address metrics
  COALESCE(addr.unique_addresses, 0) as unique_addresses,
  COALESCE(addr.total_operations, 0) as total_operations,
  
  -- Derived metrics
  CASE 
    WHEN COALESCE(blocks.total_blocks, 0) = 0 THEN NULL
    ELSE COALESCE(tx.total_transactions, 0) / blocks.total_blocks 
  END as avg_transactions_per_block,
  
  CASE 
    WHEN COALESCE(addr.unique_addresses, 0) = 0 THEN NULL
    ELSE COALESCE(tx.total_transactions, 0) / addr.unique_addresses 
  END as avg_transactions_per_address,
  
  -- Audit fields
  CURRENT_TIMESTAMP() as created_at

FROM daily_blocks blocks
FULL OUTER JOIN daily_transactions tx 
  ON blocks.activity_date = tx.activity_date 
  AND blocks.webhook_path = tx.webhook_path
FULL OUTER JOIN daily_addresses addr 
  ON COALESCE(blocks.activity_date, tx.activity_date) = addr.activity_date 
  AND COALESCE(blocks.webhook_path, tx.webhook_path) = addr.webhook_path

WHERE COALESCE(blocks.activity_date, tx.activity_date, addr.activity_date) IS NOT NULL
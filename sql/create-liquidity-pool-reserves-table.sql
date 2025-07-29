-- Create liquidity pool reserves table for tracking liquidity reserves time-series data
-- Partitioned by reserves_updated_at for efficient time-series queries

CREATE TABLE IF NOT EXISTS `crypto_data.liquidity_pool_reserves` (
  pool_contract_id STRING NOT NULL,
  reserves_a NUMERIC NOT NULL,
  reserves_b NUMERIC NOT NULL,
  reserves_updated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(reserves_updated_at)
CLUSTER BY pool_contract_id, reserves_updated_at
OPTIONS (
  description="Liquidity pool reserves time-series data for price calculations",
  partition_expiration_days=365
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.liquidity_pool_reserves` (
  pool_contract_id STRING NOT NULL,
  reserves_a NUMERIC NOT NULL,
  reserves_b NUMERIC NOT NULL,
  reserves_updated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(reserves_updated_at)
CLUSTER BY pool_contract_id, reserves_updated_at
OPTIONS (
  description="Test liquidity pool reserves time-series data",
  partition_expiration_days=30
);
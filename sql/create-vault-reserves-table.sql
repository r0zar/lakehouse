-- Create vault reserves table for tracking liquidity reserves time-series data
-- Partitioned by reserves_updated_at for efficient time-series queries

CREATE TABLE IF NOT EXISTS `crypto_data.vault_reserves` (
  vault_contract_id STRING NOT NULL,
  reserves_a NUMERIC NOT NULL,
  reserves_b NUMERIC NOT NULL,
  reserves_updated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(reserves_updated_at)
CLUSTER BY vault_contract_id, reserves_updated_at
OPTIONS (
  description="Vault liquidity reserves time-series data for price calculations",
  partition_expiration_days=365
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.vault_reserves` (
  vault_contract_id STRING NOT NULL,
  reserves_a NUMERIC NOT NULL,
  reserves_b NUMERIC NOT NULL,
  reserves_updated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(reserves_updated_at)
CLUSTER BY vault_contract_id, reserves_updated_at
OPTIONS (
  description="Test vault liquidity reserves time-series data",
  partition_expiration_days=30
);
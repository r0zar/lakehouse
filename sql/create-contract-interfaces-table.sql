-- Create contract interfaces table for tracking smart contract interface implementations
-- Partitioned by detected_at for efficient querying

CREATE TABLE IF NOT EXISTS `crypto_data.contract_interfaces` (
  contract_id STRING NOT NULL,
  interface STRING NOT NULL,
  metadata JSON,
  detected_at TIMESTAMP NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(detected_at)
CLUSTER BY contract_id, interface
OPTIONS (
  description="Smart contract interface implementations partitioned by detection date",
  partition_expiration_days=1095
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.contract_interfaces` (
  contract_id STRING NOT NULL,
  interface STRING NOT NULL,
  metadata JSON,
  detected_at TIMESTAMP NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(detected_at)
CLUSTER BY contract_id, interface
OPTIONS (
  description="Test smart contract interface implementations partitioned by detection date",
  partition_expiration_days=30
);
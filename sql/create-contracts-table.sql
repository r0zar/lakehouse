-- Create contracts table for storing contract addresses and names

CREATE TABLE IF NOT EXISTS `crypto_data.contracts` (
  contract_address STRING NOT NULL,
  contract_name STRING NOT NULL,
  abi JSON,
  source_code STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY contract_address, contract_name
OPTIONS (
  description="Smart contracts table with address and name, compound key for uniqueness"
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.contracts` (
  contract_address STRING NOT NULL,
  contract_name STRING NOT NULL,
  abi JSON,
  source_code STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY contract_address, contract_name
OPTIONS (
  description="Test smart contracts table with address and name, compound key for uniqueness"
);
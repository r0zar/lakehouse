-- Single token prices table for both current and historical data
-- Partitioned by calculated_at for efficient time-series queries

CREATE TABLE IF NOT EXISTS `crypto_data.token_prices` (
  token_contract_id STRING NOT NULL,
  sbtc_price NUMERIC NOT NULL,
  usd_price NUMERIC NOT NULL,
  price_source STRING DEFAULT 'tvl_weighted_iteration',
  iterations_to_converge INT64,
  final_convergence_percent NUMERIC,
  calculated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(calculated_at)
CLUSTER BY token_contract_id, calculated_at
OPTIONS (
  description="Token prices table with full historical data, partitioned by calculation date",
  partition_expiration_days=1095
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.token_prices` (
  token_contract_id STRING NOT NULL,
  sbtc_price NUMERIC NOT NULL,
  usd_price NUMERIC NOT NULL,
  price_source STRING DEFAULT 'tvl_weighted_iteration',
  iterations_to_converge INT64,
  final_convergence_percent NUMERIC,
  calculated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(calculated_at)
CLUSTER BY token_contract_id, calculated_at
OPTIONS (
  description="Test token prices table with full historical data",
  partition_expiration_days=30
);

-- Convenience view for latest prices only
CREATE OR REPLACE VIEW `crypto_data.current_token_prices` AS
SELECT 
  token_contract_id,
  sbtc_price,
  usd_price,
  price_source,
  iterations_to_converge,
  final_convergence_percent,
  calculated_at
FROM (
  SELECT 
    *,
    ROW_NUMBER() OVER (PARTITION BY token_contract_id ORDER BY calculated_at DESC) as rn
  FROM `crypto_data.token_prices`
)
WHERE rn = 1;

-- Test view version
CREATE OR REPLACE VIEW `crypto_data_test.current_token_prices` AS
SELECT 
  token_contract_id,
  sbtc_price,
  usd_price,
  price_source,
  iterations_to_converge,
  final_convergence_percent,
  calculated_at
FROM (
  SELECT 
    *,
    ROW_NUMBER() OVER (PARTITION BY token_contract_id ORDER BY calculated_at DESC) as rn
  FROM `crypto_data_test.token_prices`
)
WHERE rn = 1;
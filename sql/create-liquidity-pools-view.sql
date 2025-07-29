-- Create comprehensive liquidity pools view
-- Combines vault classification with latest reserves and metadata

CREATE OR REPLACE VIEW `crypto_data.liquidity_pools` AS
WITH latest_reserves AS (
  SELECT DISTINCT 
    pool_contract_id,
    FIRST_VALUE(reserves_a) OVER (
      PARTITION BY pool_contract_id 
      ORDER BY reserves_updated_at DESC 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as reserves_a,
    FIRST_VALUE(reserves_b) OVER (
      PARTITION BY pool_contract_id 
      ORDER BY reserves_updated_at DESC 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as reserves_b,
    FIRST_VALUE(reserves_updated_at) OVER (
      PARTITION BY pool_contract_id 
      ORDER BY reserves_updated_at DESC 
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) as reserves_updated_at
  FROM `crypto_data.liquidity_pool_reserves`
),

vault_metadata AS (
  SELECT 
    contract_id,
    JSON_VALUE(metadata, '$.fee_percentage') as fee_percentage,
    JSON_VALUE(metadata, '$.token_a_contract_id') as token_a_contract_id,
    JSON_VALUE(metadata, '$.token_b_contract_id') as token_b_contract_id,
    JSON_VALUE(metadata, '$.protocol') as protocol,
    JSON_VALUE(metadata, '$.name') as pool_name,
    JSON_VALUE(metadata, '$.symbol') as pool_symbol,
    JSON_VALUE(metadata, '$.decimals') as pool_decimals,
    JSON_VALUE(metadata, '$.image') as pool_image
  FROM `crypto_data.contract_interfaces`
  WHERE interface = 'vault'
    AND JSON_VALUE(metadata, '$.type') = 'POOL'
),

-- Get pool images from various sources
pool_images AS (
  SELECT 
    vm.contract_id,
    COALESCE(
      vm.pool_image,
      -- Try to get from contract URI in source code if available
      CASE 
        WHEN c.source_code IS NOT NULL AND REGEXP_CONTAINS(c.source_code, r'https://[^"\'\\s]+\.(png|jpg|jpeg|gif|svg|webp)')
        THEN REGEXP_EXTRACT(c.source_code, r'(https://[^"\'\\s]+\.(png|jpg|jpeg|gif|svg|webp))')
        ELSE NULL
      END,
      -- Default fallback based on protocol
      CASE 
        WHEN vm.protocol = 'CHARISMA' THEN 'https://charisma.rocks/logo.png'
        WHEN vm.protocol = 'ALEX' THEN 'https://alexlab.co/logo.png'
        ELSE 'https://via.placeholder.com/64x64?text=LP'
      END
    ) as pool_image
  FROM vault_metadata vm
  LEFT JOIN `crypto_data.contracts` c ON vm.contract_id = CONCAT(c.contract_address, '.', c.contract_name)
)

SELECT 
  v.contract_id,
  v.contract_address,
  v.contract_name,
  v.vault_type,
  v.supported_opcodes,
  
  -- Pool metadata from contract_interfaces
  vm.fee_percentage,
  vm.token_a_contract_id,
  vm.token_b_contract_id,
  vm.protocol,
  vm.pool_name,
  vm.pool_symbol,
  CAST(vm.pool_decimals as INT64) as pool_decimals,
  
  -- Latest reserves data
  r.reserves_a,
  r.reserves_b,
  r.reserves_updated_at,
  
  -- Calculated fields
  CASE 
    WHEN r.reserves_a > 0 AND r.reserves_b > 0 
    THEN SAFE_DIVIDE(r.reserves_b, r.reserves_a)
    ELSE NULL 
  END as price_ratio_b_to_a,
  
  CASE 
    WHEN r.reserves_a > 0 AND r.reserves_b > 0 
    THEN SAFE_DIVIDE(r.reserves_a, r.reserves_b)
    ELSE NULL 
  END as price_ratio_a_to_b,
  
  -- Pool health indicators
  STRUCT(
    r.reserves_a > 0 AND r.reserves_b > 0 as has_liquidity,
    TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), r.reserves_updated_at, HOUR) <= 24 as reserves_fresh,
    ARRAY_LENGTH(v.supported_opcodes) as opcode_count
  ) as pool_status

FROM `crypto_data.vault_contracts` v
LEFT JOIN vault_metadata vm ON v.contract_id = vm.contract_id
LEFT JOIN latest_reserves r ON v.contract_id = r.pool_contract_id
WHERE v.vault_type LIKE 'liquidity-pool%'
ORDER BY v.contract_id;

-- Test table version
CREATE OR REPLACE VIEW `crypto_data_test.liquidity_pools` AS
SELECT * FROM `crypto_data.liquidity_pools`;
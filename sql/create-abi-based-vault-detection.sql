-- ABI-based vault detection queries
-- Detects vault trait by execute/quote function signatures and extracts opcodes

-- Query to detect contracts that implement the vault trait (execute + quote functions)
CREATE OR REPLACE VIEW `crypto_data.vault_trait_contracts` AS
WITH vault_contracts AS (
  SELECT 
    CONCAT(contract_address, '.', contract_name) as contract_id,
    contract_address,
    contract_name,
    abi,
    source_code
  FROM `crypto_data.contracts`
  WHERE 
    abi IS NOT NULL
    -- Check for execute function with correct signature
    AND EXISTS (
      SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(abi, '$.functions')) as func
      WHERE JSON_VALUE(func, '$.name') = 'execute'
        AND JSON_VALUE(func, '$.access') = 'public'
        AND ARRAY_LENGTH(JSON_QUERY_ARRAY(func, '$.args')) >= 2
        AND JSON_VALUE(JSON_QUERY_ARRAY(func, '$.args')[OFFSET(0)], '$.name') = 'amount'
        AND JSON_VALUE(JSON_QUERY_ARRAY(func, '$.args')[OFFSET(1)], '$.name') = 'opcode'
    )
    -- Check for quote function with correct signature  
    AND EXISTS (
      SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(abi, '$.functions')) as func
      WHERE JSON_VALUE(func, '$.name') = 'quote'
        AND JSON_VALUE(func, '$.access') = 'read_only'
        AND ARRAY_LENGTH(JSON_QUERY_ARRAY(func, '$.args')) >= 2
        AND JSON_VALUE(JSON_QUERY_ARRAY(func, '$.args')[OFFSET(0)], '$.name') = 'amount'
        AND JSON_VALUE(JSON_QUERY_ARRAY(func, '$.args')[OFFSET(1)], '$.name') = 'opcode'
    )
)

SELECT 
  contract_id,
  contract_address,
  contract_name,
  -- Extract all supported opcodes from ABI constants
  ARRAY_AGG(
    CASE 
      WHEN JSON_VALUE(variable, '$.name') = 'OP_SWAP_A_TO_B' THEN '0x00'
      WHEN JSON_VALUE(variable, '$.name') = 'OP_SWAP_B_TO_A' THEN '0x01' 
      WHEN JSON_VALUE(variable, '$.name') = 'OP_ADD_LIQUIDITY' THEN '0x02'
      WHEN JSON_VALUE(variable, '$.name') = 'OP_REMOVE_LIQUIDITY' THEN '0x03'
      WHEN JSON_VALUE(variable, '$.name') = 'OP_LOOKUP_RESERVES' THEN '0x04'
      -- Add more opcodes as they are discovered
      ELSE NULL
    END IGNORE NULLS
  ) as supported_opcodes,
  
  -- Extract opcode names for debugging
  ARRAY_AGG(
    JSON_VALUE(variable, '$.name') IGNORE NULLS
  ) as opcode_constants,
  
  abi,
  source_code
FROM vault_contracts,
UNNEST(JSON_QUERY_ARRAY(abi, '$.variables')) as variable
WHERE JSON_VALUE(variable, '$.name') LIKE 'OP_%'
  AND JSON_VALUE(variable, '$.access') = 'constant'
GROUP BY contract_id, contract_address, contract_name, abi, source_code;

-- Query to classify vault types based on supported opcodes
CREATE OR REPLACE VIEW `crypto_data.vault_classification` AS
SELECT 
  contract_id,
  contract_address,
  contract_name,
  supported_opcodes,
  opcode_constants,
  
  -- Classify vault type based on opcodes
  CASE 
    WHEN '0x04' IN UNNEST(supported_opcodes) THEN 'liquidity-pool-v1'
    WHEN ARRAY_LENGTH(supported_opcodes) >= 4 
      AND '0x00' IN UNNEST(supported_opcodes)
      AND '0x01' IN UNNEST(supported_opcodes) 
      AND '0x02' IN UNNEST(supported_opcodes)
      AND '0x03' IN UNNEST(supported_opcodes) THEN 'liquidity-pool-v0'
    WHEN ARRAY_LENGTH(supported_opcodes) > 0 THEN 'vault-custom'
    ELSE 'vault-unknown'
  END as vault_type,
  
  -- Additional classification metadata
  STRUCT(
    ARRAY_LENGTH(supported_opcodes) as opcode_count,
    '0x00' IN UNNEST(supported_opcodes) as has_swap_a_to_b,
    '0x01' IN UNNEST(supported_opcodes) as has_swap_b_to_a,
    '0x02' IN UNNEST(supported_opcodes) as has_add_liquidity,
    '0x03' IN UNNEST(supported_opcodes) as has_remove_liquidity,
    '0x04' IN UNNEST(supported_opcodes) as has_lookup_reserves
  ) as capabilities,
  
  abi,
  source_code
FROM `crypto_data.vault_trait_contracts`;

-- Test table versions
CREATE OR REPLACE VIEW `crypto_data_test.vault_trait_contracts` AS
SELECT * FROM `crypto_data.vault_trait_contracts`;

CREATE OR REPLACE VIEW `crypto_data_test.vault_classification` AS
SELECT * FROM `crypto_data.vault_classification`;
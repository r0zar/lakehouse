-- Clean up mixed metadata in contract_interfaces table
-- Fix missing identifiers and descriptions for SIP-010 contracts

-- First, let's add missing identifiers where they can be derived from symbols
UPDATE `crypto_data.contract_interfaces`
SET metadata = JSON_SET(
  metadata,
  '$.identifier',
  LOWER(JSON_VALUE(metadata, '$.symbol'))
)
WHERE interface = 'sip-010-ft'
  AND JSON_VALUE(metadata, '$.identifier') IS NULL
  AND JSON_VALUE(metadata, '$.symbol') IS NOT NULL;

-- Add basic descriptions for contracts missing them
UPDATE `crypto_data.contract_interfaces`
SET metadata = JSON_SET(
  metadata,
  '$.description',
  CONCAT(
    JSON_VALUE(metadata, '$.name'),
    ' is a fungible token on the Stacks blockchain. Contract: ',
    contract_id
  )
)
WHERE interface = 'sip-010-ft'
  AND JSON_VALUE(metadata, '$.description') IS NULL
  AND JSON_VALUE(metadata, '$.name') IS NOT NULL;

-- For vault contracts, ensure they have the 'type' field set to 'POOL'
UPDATE `crypto_data.contract_interfaces`
SET metadata = JSON_SET(metadata, '$.type', 'POOL')
WHERE interface = 'vault'
  AND JSON_VALUE(metadata, '$.type') IS NULL;

-- Clean up any vault metadata that might have SIP-010 fields (shouldn't happen but just in case)
UPDATE `crypto_data.contract_interfaces`
SET metadata = JSON_REMOVE(
  metadata,
  '$.identifier',
  '$.total_supply',
  '$.token_uri'
)
WHERE interface = 'vault'
  AND (
    JSON_VALUE(metadata, '$.identifier') IS NOT NULL
    OR JSON_VALUE(metadata, '$.total_supply') IS NOT NULL
    OR JSON_VALUE(metadata, '$.token_uri') IS NOT NULL
  );

-- Clean up any SIP-010 metadata that might have vault-specific fields
UPDATE `crypto_data.contract_interfaces`
SET metadata = JSON_REMOVE(
  metadata,
  '$.fee_percentage',
  '$.protocol',
  '$.token_a_contract_id',
  '$.token_b_contract_id',
  '$.type'
)
WHERE interface = 'sip-010-ft'
  AND (
    JSON_VALUE(metadata, '$.fee_percentage') IS NOT NULL
    OR JSON_VALUE(metadata, '$.protocol') IS NOT NULL
    OR JSON_VALUE(metadata, '$.token_a_contract_id') IS NOT NULL
    OR JSON_VALUE(metadata, '$.token_b_contract_id') IS NOT NULL
    OR JSON_VALUE(metadata, '$.type') IS NOT NULL
  );
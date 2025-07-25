-- Token Amount Formatting Utilities
-- These functions help convert atomic token amounts to human-readable format

-- Function to extract contract ID from full asset identifier
CREATE OR REPLACE FUNCTION crypto_data.extract_contract_id(asset_identifier STRING)
RETURNS STRING AS (
  CASE 
    WHEN asset_identifier LIKE '%::%' THEN
      REGEXP_EXTRACT(asset_identifier, r'^([^:]+)')
    ELSE asset_identifier
  END
);

-- Function to format token amount using decimals
CREATE OR REPLACE FUNCTION crypto_data.format_token_amount(
  atomic_amount INT64, 
  decimals INT64
)
RETURNS FLOAT64 AS (
  CASE 
    WHEN decimals IS NULL OR decimals = 0 THEN CAST(atomic_amount AS FLOAT64)
    ELSE CAST(atomic_amount AS FLOAT64) / POW(10, decimals)
  END
);

-- Function to format STX amount (always 6 decimals)
CREATE OR REPLACE FUNCTION crypto_data.format_stx_amount(atomic_amount INT64)
RETURNS FLOAT64 AS (
  CAST(atomic_amount AS FLOAT64) / 1000000
);
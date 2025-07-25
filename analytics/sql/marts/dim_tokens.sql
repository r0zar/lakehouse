-- dim_tokens.sql
-- Token metadata dimension table populated via on-chain contract calls

CREATE OR REPLACE TABLE `{{ project_id }}.{{ dataset }}.dim_tokens` AS 
WITH discovered_tokens AS (
  -- Extract all unique token contract addresses from our data
  SELECT DISTINCT
    contract_address,
    MAX(last_seen) as last_seen
  FROM (
    -- From transaction contract calls
    SELECT 
      REGEXP_EXTRACT(contract_call_contract_id, r'^([^.]+\.[^.]+)') as contract_address,
      MAX(created_at) as last_seen
    FROM `{{ project_id }}.{{ dataset }}.stg_transactions`
    WHERE contract_call_contract_id IS NOT NULL
      AND contract_call_contract_id LIKE '%.%'
    GROUP BY 1
      
    UNION ALL
    
    -- From DeFi swap input tokens
    SELECT 
      input_token as contract_address,
      MAX(created_at) as last_seen
    FROM `{{ project_id }}.{{ dataset }}.dim_defi_swaps`
    WHERE input_token IS NOT NULL
      AND input_token LIKE '%.%'
    GROUP BY 1
      
    UNION ALL
    
    -- From DeFi swap output tokens
    SELECT 
      output_token as contract_address,
      MAX(created_at) as last_seen
    FROM `{{ project_id }}.{{ dataset }}.dim_defi_swaps`
    WHERE output_token IS NOT NULL
      AND output_token LIKE '%.%'
    GROUP BY 1

    UNION ALL
    
    -- Add STX as native token
    SELECT 
      'STX' as contract_address,
      CURRENT_TIMESTAMP() as last_seen
  )
  WHERE contract_address IS NOT NULL
  GROUP BY contract_address
)

SELECT 
  contract_address,
  
  -- Metadata fields to be populated by on-chain contract calls
  CAST(NULL AS STRING) as token_name,
  CAST(NULL AS STRING) as token_symbol, 
  CAST(NULL AS INT64) as decimals,
  CAST(NULL AS STRING) as token_uri,
  CAST(NULL AS STRING) as image_url,
  CAST(NULL AS STRING) as description,
  CAST(NULL AS INT64) as total_supply,
  
  -- Discovery metadata  
  last_seen,
  'discovered' as metadata_status, -- Will be 'fetched' after on-chain lookup
  CURRENT_TIMESTAMP() as created_at,
  CURRENT_TIMESTAMP() as updated_at

FROM discovered_tokens
ORDER BY last_seen DESC;
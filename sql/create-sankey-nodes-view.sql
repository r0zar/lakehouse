-- Create sankey nodes view for all unique addresses/contracts
-- Provides the 'nodes' array for Sankey diagram with categories

CREATE VIEW `crypto_data.sankey_nodes` AS

WITH all_addresses AS (
  -- Collect all unique addresses from operations (extract from JSON)
  SELECT DISTINCT JSON_VALUE(account, '$.address') as address 
  FROM `crypto_data.operations`
  WHERE JSON_VALUE(account, '$.address') IS NOT NULL
  
  UNION DISTINCT
  
  -- Add transaction senders
  SELECT DISTINCT tx_sender as address
  FROM `crypto_data.transactions_with_operations`  
  WHERE tx_sender IS NOT NULL
  
  UNION DISTINCT
  
  -- Add all source and target addresses from links to ensure completeness
  SELECT DISTINCT source as address FROM `crypto_data.sankey_links`
  WHERE source IS NOT NULL
  
  UNION DISTINCT
  
  SELECT DISTINCT target as address FROM `crypto_data.sankey_links`
  WHERE target IS NOT NULL
)

SELECT 
  address as name,
  CASE 
    -- Smart contracts (contain dots)
    WHEN address LIKE '%.%' THEN 'Contract'
    -- Regular Stacks addresses (start with SP)
    WHEN address LIKE 'SP%' THEN 'Wallet'
    -- Other addresses
    ELSE 'System'
  END as category,
  
  -- Additional metadata for enhanced categorization
  CASE 
    WHEN address LIKE '%pool%' OR address LIKE '%swap%' OR address LIKE '%dex%' THEN 'DeFi'
    WHEN address LIKE '%pox%' OR address LIKE '%stack%' THEN 'Stacking'
    WHEN address LIKE '%vault%' OR address LIKE '%bank%' THEN 'Vault'
    WHEN address LIKE '%.%' THEN 'Contract'
    ELSE 'Wallet'
  END as subcategory

FROM all_addresses
WHERE address != ''
ORDER BY address;
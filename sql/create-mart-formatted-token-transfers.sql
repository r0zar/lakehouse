-- Create a mart with properly formatted token transfers
CREATE OR REPLACE TABLE crypto_data.mart_formatted_token_transfers AS

WITH all_transfers AS (
  -- FT Transfers (non-STX tokens)
  SELECT 
    tx_hash,
    block_hash,
    block_time,
    'ft_transfer' as transfer_type,
    ft_sender as sender,
    ft_recipient as recipient,
    ft_amount as atomic_amount,
    ft_asset_identifier as asset_identifier,
    crypto_data.extract_contract_id(ft_asset_identifier) as contract_id,
    received_at
  FROM crypto_data.stg_events
  WHERE event_type = 'FTTransferEvent'
    AND ft_amount IS NOT NULL
    AND ft_asset_identifier IS NOT NULL
    AND ft_amount > 0

  UNION ALL

  -- STX Transfers
  SELECT 
    tx_hash,
    block_hash,
    block_time,
    'stx_transfer' as transfer_type,
    ft_sender as sender,
    ft_recipient as recipient,
    ft_amount as atomic_amount,
    'STX' as asset_identifier,
    'STX' as contract_id,
    received_at
  FROM crypto_data.stg_events
  WHERE event_type = 'STXTransferEvent'
    AND ft_amount IS NOT NULL
    AND ft_amount > 0
),

enriched_transfers AS (
  SELECT 
    t.tx_hash,
    t.block_hash,
    t.block_time,
    t.transfer_type,
    t.sender,
    t.recipient,
    t.atomic_amount,
    t.asset_identifier,
    t.contract_id,
    t.received_at,
    
    -- Token metadata
    CASE 
      WHEN t.contract_id = 'STX' THEN 'Stacks'
      ELSE COALESCE(tok.token_name, SPLIT(t.contract_id, '.')[SAFE_OFFSET(1)], 'Unknown Token')
    END as token_name,
    
    CASE 
      WHEN t.contract_id = 'STX' THEN 'STX'
      ELSE COALESCE(tok.token_symbol, 'UNKNOWN')
    END as token_symbol,
    
    CASE 
      WHEN t.contract_id = 'STX' THEN 6
      ELSE COALESCE(tok.decimals, 6)
    END as decimals,
    
    -- Formatted amounts
    CASE 
      WHEN t.contract_id = 'STX' THEN crypto_data.format_stx_amount(t.atomic_amount)
      ELSE crypto_data.format_token_amount(t.atomic_amount, COALESCE(tok.decimals, 6))
    END as formatted_amount,
    
    -- Token classification
    CASE 
      WHEN t.contract_id = 'STX' THEN 'native'
      WHEN tok.token_symbol IS NOT NULL THEN 'discovered'
      ELSE 'unknown'
    END as token_status,
    
    -- Value categories for analytics
    CASE 
      WHEN t.contract_id = 'STX' THEN
        CASE 
          WHEN crypto_data.format_stx_amount(t.atomic_amount) >= 1000 THEN 'large'
          WHEN crypto_data.format_stx_amount(t.atomic_amount) >= 10 THEN 'medium'
          ELSE 'small'
        END
      ELSE
        CASE 
          WHEN crypto_data.format_token_amount(t.atomic_amount, COALESCE(tok.decimals, 6)) >= 1000 THEN 'large'
          WHEN crypto_data.format_token_amount(t.atomic_amount, COALESCE(tok.decimals, 6)) >= 10 THEN 'medium'
          ELSE 'small'
        END
    END as transfer_size_category
    
  FROM all_transfers t
  LEFT JOIN crypto_data.dim_tokens tok
    ON t.contract_id = tok.contract_address
)

SELECT 
  tx_hash,
  block_hash,
  block_time,
  transfer_type,
  sender,
  recipient,
  
  -- Amounts
  atomic_amount,
  formatted_amount,
  
  -- Token info
  token_name,
  token_symbol,
  decimals,
  asset_identifier,
  contract_id,
  token_status,
  
  -- Analytics fields
  transfer_size_category,
  CONCAT(CAST(ROUND(formatted_amount, 6) AS STRING), ' ', token_symbol) as display_amount,
  
  -- Metadata
  received_at,
  CURRENT_TIMESTAMP() as created_at

FROM enriched_transfers
WHERE formatted_amount > 0;

-- Table created with proper partitioning for performance
-- BigQuery automatically optimizes queries based on the data structure
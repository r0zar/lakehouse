import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount, formatTokenAmount, createTokenMetadataMap } from '@/lib/token-formatting';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || 'STX';
    const userAddress = searchParams.get('user');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get token metadata for formatting - include all metadata fields
    const tokenMetadataQuery = `
      SELECT 
        contract_address, 
        token_name, 
        token_symbol, 
        decimals, 
        validation_status,
        token_uri,
        image_url,
        description,
        total_supply,
        token_type
      FROM crypto_data.dim_tokens
    `;
    
    const [tokenRows] = await bigquery.query({
      query: tokenMetadataQuery,
      jobTimeoutMs: 30000,
    });
    
    const tokenMetadataMap = createTokenMetadataMap(tokenRows);
    
    // Get decimals for the target token
    let targetTokenDecimals = 0; // Default to 0 (no decimals) for unknown tokens
    
    if (token === 'STX') {
      targetTokenDecimals = 6;
    } else {
      // Look up in metadata table
      for (const [contractId, metadata] of tokenMetadataMap) {
        if (metadata.token_symbol === token) {
          targetTokenDecimals = metadata.decimals || 0;
          break;
        }
      }
    }

    const query = `
      WITH router_transactions AS (
        SELECT 
          t.tx_hash,
          t.block_hash,
          t.success,
          t.fee as transaction_fee,
          a.contract_identifier as router_contract,
          a.function_name as router_function,
          SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(1)] as router_name
        FROM crypto_data.stg_transactions t
        INNER JOIN crypto_data.stg_addresses a ON (
          t.tx_hash = a.tx_hash
          AND (
            -- BitFlow routers
            a.contract_identifier IN (
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stableswap-xyk-multihop-v-1-1',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-stableswap-v-1-2',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stableswap-xyk-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-swap-helper-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-swap-helper-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-swap-helper-v-1-5'
            )
            -- ALEX protocol contracts
            OR a.contract_identifier LIKE '%alex%'
            -- Arkadiko protocol contracts  
            OR a.contract_identifier LIKE '%arkadiko%'
            -- Charisma protocol contracts
            OR a.contract_identifier LIKE '%charisma%'
            -- Velar protocol contracts
            OR a.contract_identifier LIKE '%velar%'
            -- Other potential DeFi protocols
            OR (a.function_name IN ('swap', 'swap-exact-tokens-for-tokens', 'swap-tokens-for-exact-tokens', 'multi-hop-swap') 
                AND a.contract_identifier LIKE '%pool%' OR a.contract_identifier LIKE '%dex%' OR a.contract_identifier LIKE '%swap%')
          )
          AND a.function_args IS NOT NULL
        )
      ),
      
      user_identification AS (
        SELECT 
          rt.tx_hash,
          rt.router_contract,
          rt.router_function,
          rt.router_name,
          rt.transaction_fee,
          rt.success,
          rt.block_hash,
          e.ft_sender as user_address,
          ROW_NUMBER() OVER (PARTITION BY rt.tx_hash ORDER BY e.position_index) as rn
        FROM router_transactions rt
        INNER JOIN crypto_data.stg_events e ON (
          e.tx_hash = rt.tx_hash
          AND e.event_type IN ('FTTransferEvent', 'STXTransferEvent')
          AND (e.ft_recipient LIKE '%pool%')
          AND e.ft_sender NOT LIKE '%pool%'
          AND e.ft_sender NOT LIKE '%router%'
        )
      ),
      
      users AS (
        SELECT * FROM user_identification WHERE rn = 1
      ),
      
      token_flows AS (
        SELECT
          u.tx_hash,
          u.router_name,
          u.user_address,
          u.success,
          u.transaction_fee,
          u.block_hash,
          MIN(e.block_time) as block_time,
          
          -- Check if user bought the token (received it)
          SUM(CASE 
            WHEN e.ft_recipient = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' = 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] = '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as token_bought,
          
          -- Check if user sold the token (sent it)
          SUM(CASE 
            WHEN e.ft_sender = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' = 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] = '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as token_sold,
          
          -- Get the token they sold (opposite direction)
          SUM(CASE 
            WHEN e.ft_sender = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' != 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] != '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as other_token_sold,
          
          -- Get the token they bought (opposite direction)  
          SUM(CASE 
            WHEN e.ft_recipient = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' != 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] != '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as other_token_bought,
          
          -- Get the other token name
          ARRAY_AGG(
            CASE 
              WHEN e.event_type = 'STXTransferEvent' AND '${token}' != 'STX' THEN 'STX'
              WHEN e.event_type = 'FTTransferEvent' 
                   AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] != '${token}' 
                   THEN SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)]
            END 
            IGNORE NULLS ORDER BY e.ft_amount DESC LIMIT 1
          )[SAFE_OFFSET(0)] as other_token
          
        FROM users u
        INNER JOIN crypto_data.stg_events e ON (
          e.tx_hash = u.tx_hash
          AND e.event_type IN ('FTTransferEvent', 'STXTransferEvent')
          AND (e.ft_sender = u.user_address OR e.ft_recipient = u.user_address)
        )
        GROUP BY u.tx_hash, u.router_name, u.user_address, u.success, u.transaction_fee, u.block_hash
      )
      
      SELECT 
        tx_hash,
        user_address,
        -- Truncate user address for display
        CONCAT(
          SUBSTR(user_address, 1, 6),
          '...',
          SUBSTR(user_address, -4)
        ) as user_display,
        block_time,
        success,
        
        -- Token amounts
        token_bought,
        token_sold,
        other_token_bought,
        other_token_sold,
        
        other_token,
        router_name,
        
        -- Better swap description showing both sides
        CASE 
          -- Standard swap: sold other token, bought target token
          WHEN other_token_sold > 0 AND token_bought > 0 THEN 
            CONCAT(CAST(other_token_sold as STRING), ' ', COALESCE(other_token, 'Unknown'), ' → ', CAST(token_bought as STRING), ' ${token}')
          -- Reverse swap: sold target token, bought other token  
          WHEN token_sold > 0 AND other_token_bought > 0 THEN 
            CONCAT(CAST(token_sold as STRING), ' ${token} → ', CAST(other_token_bought as STRING), ' ', COALESCE(other_token, 'Unknown'))
          -- Only received target token
          WHEN token_bought > 0 AND token_sold = 0 THEN 
            CONCAT('Received ', CAST(token_bought as STRING), ' ${token}')
          -- Only sent target token
          WHEN token_sold > 0 AND token_bought = 0 THEN 
            CONCAT('Sent ', CAST(token_sold as STRING), ' ${token}')
          ELSE 'Complex transaction'
        END as swap_description
        
      FROM token_flows
      WHERE (token_bought > 0 OR token_sold > 0)
        AND user_address IS NOT NULL
        ${userAddress ? `AND user_address = '${userAddress}'` : ''}
      ORDER BY block_time DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows] = await bigquery.query({
      query,
      jobTimeoutMs: 120000,
      maxResults: limit,
    });

    // Format the token amounts in each row
    const formattedRows = rows.map(row => {
      const formatTokenAmountBySymbol = (amount: number, tokenSymbol: string) => {
        if (tokenSymbol === 'STX') {
          return formatStxAmount(amount);
        }
        
        // Find token metadata by symbol
        for (const [contractId, metadata] of tokenMetadataMap) {
          if (metadata.token_symbol === tokenSymbol) {
            return formatTokenAmount(amount, metadata.decimals || 0);
          }
        }
        
        // Unknown token - use 0 decimals
        return formatTokenAmount(amount, 0);
      };

      const tokenBoughtFormatted = row.token_bought ? formatTokenAmountBySymbol(row.token_bought, token) : 0;
      const tokenSoldFormatted = row.token_sold ? formatTokenAmountBySymbol(row.token_sold, token) : 0;
      const otherTokenBoughtFormatted = row.other_token_bought ? formatTokenAmountBySymbol(row.other_token_bought, row.other_token || 'STX') : 0;
      const otherTokenSoldFormatted = row.other_token_sold ? formatTokenAmountBySymbol(row.other_token_sold, row.other_token || 'STX') : 0;

      // Create better swap description with formatted amounts
      let formattedSwapDescription = '';
      
      // Get decimals for target token and other token
      const targetDecimals = token === 'STX' ? 6 : targetTokenDecimals;
      let otherTokenDecimals = 6; // Default STX
      if (row.other_token && row.other_token !== 'STX') {
        for (const [contractId, metadata] of tokenMetadataMap) {
          if (metadata.token_symbol === row.other_token) {
            otherTokenDecimals = metadata.decimals || 0;
            break;
          }
        }
        if (otherTokenDecimals === 6) otherTokenDecimals = 0; // Unknown token fallback
      }
      
      if (otherTokenSoldFormatted > 0 && tokenBoughtFormatted > 0) {
        formattedSwapDescription = `${otherTokenSoldFormatted.toFixed(otherTokenDecimals)} ${row.other_token || 'Unknown'} → ${tokenBoughtFormatted.toFixed(targetDecimals)} ${token}`;
      } else if (tokenSoldFormatted > 0 && otherTokenBoughtFormatted > 0) {
        formattedSwapDescription = `${tokenSoldFormatted.toFixed(targetDecimals)} ${token} → ${otherTokenBoughtFormatted.toFixed(otherTokenDecimals)} ${row.other_token || 'Unknown'}`;
      } else if (tokenBoughtFormatted > 0 && tokenSoldFormatted === 0) {
        formattedSwapDescription = `Received ${tokenBoughtFormatted.toFixed(targetDecimals)} ${token}`;
      } else if (tokenSoldFormatted > 0 && tokenBoughtFormatted === 0) {
        formattedSwapDescription = `Sent ${tokenSoldFormatted.toFixed(targetDecimals)} ${token}`;
      } else {
        formattedSwapDescription = 'Complex transaction';
      }

      return {
        ...row,
        // Raw atomic amounts (preserved)
        atomic_token_bought: row.token_bought?.toString(),
        atomic_token_sold: row.token_sold?.toString(),
        atomic_other_token_bought: row.other_token_bought?.toString(),
        atomic_other_token_sold: row.other_token_sold?.toString(),
        
        // Formatted amounts
        formatted_token_bought: tokenBoughtFormatted,
        formatted_token_sold: tokenSoldFormatted,
        formatted_other_token_bought: otherTokenBoughtFormatted,
        formatted_other_token_sold: otherTokenSoldFormatted,
        
        // Enhanced swap description with formatted amounts
        formatted_swap_description: formattedSwapDescription
      };
    });

    // Get summary stats for the token - use the token_flows CTE directly
    const summaryQuery = `
      WITH router_transactions AS (
        SELECT 
          t.tx_hash,
          t.block_hash,
          t.success,
          t.fee as transaction_fee,
          a.contract_identifier as router_contract,
          a.function_name as router_function,
          SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(1)] as router_name
        FROM crypto_data.stg_transactions t
        INNER JOIN crypto_data.stg_addresses a ON (
          t.tx_hash = a.tx_hash
          AND (
            -- BitFlow routers
            a.contract_identifier IN (
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stableswap-xyk-multihop-v-1-1',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-xyk-stableswap-v-1-2',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.router-stableswap-xyk-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-swap-helper-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-swap-helper-v-1-3',
              'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-swap-helper-v-1-5'
            )
            -- ALEX protocol contracts
            OR a.contract_identifier LIKE '%alex%'
            -- Arkadiko protocol contracts  
            OR a.contract_identifier LIKE '%arkadiko%'
            -- Charisma protocol contracts
            OR a.contract_identifier LIKE '%charisma%'
            -- Velar protocol contracts
            OR a.contract_identifier LIKE '%velar%'
            -- Other potential DeFi protocols
            OR (a.function_name IN ('swap', 'swap-exact-tokens-for-tokens', 'swap-tokens-for-exact-tokens', 'multi-hop-swap') 
                AND a.contract_identifier LIKE '%pool%' OR a.contract_identifier LIKE '%dex%' OR a.contract_identifier LIKE '%swap%')
          )
          AND a.function_args IS NOT NULL
        )
      ),
      
      user_identification AS (
        SELECT 
          rt.tx_hash,
          rt.router_contract,
          rt.router_function,
          rt.router_name,
          rt.transaction_fee,
          rt.success,
          rt.block_hash,
          e.ft_sender as user_address,
          ROW_NUMBER() OVER (PARTITION BY rt.tx_hash ORDER BY e.position_index) as rn
        FROM router_transactions rt
        INNER JOIN crypto_data.stg_events e ON (
          e.tx_hash = rt.tx_hash
          AND e.event_type IN ('FTTransferEvent', 'STXTransferEvent')
          AND (e.ft_recipient LIKE '%pool%')
          AND e.ft_sender NOT LIKE '%pool%'
          AND e.ft_sender NOT LIKE '%router%'
        )
      ),
      
      users AS (
        SELECT * FROM user_identification WHERE rn = 1
      ),
      
      token_flows AS (
        SELECT
          u.tx_hash,
          u.router_name,
          u.user_address,
          u.success,
          u.transaction_fee,
          u.block_hash,
          MIN(e.block_time) as block_time,
          
          -- Check if user bought the token (received it)
          SUM(CASE 
            WHEN e.ft_recipient = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' = 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] = '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as token_bought,
          
          -- Check if user sold the token (sent it)
          SUM(CASE 
            WHEN e.ft_sender = u.user_address 
            AND (
              (e.event_type = 'STXTransferEvent' AND '${token}' = 'STX') OR
              (e.event_type = 'FTTransferEvent' AND SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)] = '${token}')
            )
            THEN e.ft_amount ELSE 0 
          END) as token_sold
          
        FROM users u
        INNER JOIN crypto_data.stg_events e ON (
          e.tx_hash = u.tx_hash
          AND e.event_type IN ('FTTransferEvent', 'STXTransferEvent')
          AND (e.ft_sender = u.user_address OR e.ft_recipient = u.user_address)
        )
        GROUP BY u.tx_hash, u.router_name, u.user_address, u.success, u.transaction_fee, u.block_hash
      )
      
      SELECT 
        '${token}' as token_name,
        COUNT(CASE WHEN token_bought > 0 THEN 1 END) as total_swaps_buying,
        COUNT(CASE WHEN token_sold > 0 THEN 1 END) as total_swaps_selling,
        COUNT(*) as total_swaps,
        SUM(token_bought) as total_bought,
        SUM(token_sold) as total_sold
      FROM token_flows
      WHERE (token_bought > 0 OR token_sold > 0)
        AND user_address IS NOT NULL
        ${userAddress ? `AND user_address = '${userAddress}'` : ''}
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 60000,
    });

    const summary = summaryRows[0] || {};
    
    // Format summary statistics
    const totalBoughtAtomic = parseInt(summary.total_bought || '0');
    const totalSoldAtomic = parseInt(summary.total_sold || '0');
    
    const formattedSummary = {
      token_name: token,
      total_swaps_buying: parseInt(summary.total_swaps_buying || '0'),
      total_swaps_selling: parseInt(summary.total_swaps_selling || '0'),
      total_swaps: parseInt(summary.total_swaps || '0'),
      
      // Raw atomic amounts (preserved)
      atomic_total_bought: totalBoughtAtomic.toString(),
      atomic_total_sold: totalSoldAtomic.toString(),
      
      // Formatted amounts
      formatted_total_bought: token === 'STX' ? formatStxAmount(totalBoughtAtomic) : formatTokenAmount(totalBoughtAtomic, targetTokenDecimals),
      formatted_total_sold: token === 'STX' ? formatStxAmount(totalSoldAtomic) : formatTokenAmount(totalSoldAtomic, targetTokenDecimals),
      display_total_bought: token === 'STX' ? 
        `${formatStxAmount(totalBoughtAtomic).toFixed(6)} STX` : 
        `${formatTokenAmount(totalBoughtAtomic, targetTokenDecimals).toFixed(targetTokenDecimals)} ${token}`,
      display_total_sold: token === 'STX' ? 
        `${formatStxAmount(totalSoldAtomic).toFixed(6)} STX` : 
        `${formatTokenAmount(totalSoldAtomic, targetTokenDecimals).toFixed(targetTokenDecimals)} ${token}`
    };

    return NextResponse.json({
      data: formattedRows,
      summary: formattedSummary,
      pagination: {
        limit,
        offset,
        count: formattedRows.length,
      },
      token_metadata: Array.from(tokenMetadataMap.entries()).map(([key, value]) => ({
        key,
        ...value
      })),
      formatting_info: {
        note: "Token amounts are formatted dynamically from atomic units using current token metadata",
        atomic_units_stored: true,
        formatting_applied_at_read_time: true
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Token activity API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch token activity data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
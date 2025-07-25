import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount, formatTokenAmount, createTokenMetadataMap } from '@/lib/token-formatting';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get token metadata for formatting and display
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
    

    // Simple query: just aggregate all transfers in/out for router transactions
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
          e.ft_sender as swap_user,
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
      
      flows AS (
        SELECT
          u.tx_hash,
          u.router_name,
          u.router_function,
          u.swap_user,
          u.success,
          u.transaction_fee,
          u.block_hash,
          MIN(e.block_time) as block_time,
          
          -- Total STX flowing OUT from user
          SUM(CASE 
            WHEN e.event_type = 'STXTransferEvent' AND e.ft_sender = u.swap_user 
            THEN e.ft_amount ELSE 0 
          END) as total_stx_out,
          
          -- Total STX flowing IN to user
          SUM(CASE 
            WHEN e.event_type = 'STXTransferEvent' AND e.ft_recipient = u.swap_user 
            THEN e.ft_amount ELSE 0 
          END) as total_stx_in,
          
          -- Count of different tokens involved
          COUNT(DISTINCT 
            CASE WHEN e.event_type = 'FTTransferEvent' THEN e.ft_asset_identifier
                 WHEN e.event_type = 'STXTransferEvent' THEN 'STX'
            END
          ) as total_tokens_involved,
          
          -- Token events as structured JSON array
          ARRAY_AGG(
            STRUCT(
              e.event_type,
              e.ft_amount,
              CASE WHEN e.event_type = 'STXTransferEvent' THEN 'STX' 
                   ELSE COALESCE(SPLIT(e.ft_asset_identifier, '::')[SAFE_OFFSET(1)], 'Unknown') END as token_name,
              CASE WHEN e.event_type = 'STXTransferEvent' THEN 'STX' 
                   ELSE e.ft_asset_identifier END as token_contract_address,
              CASE WHEN e.ft_sender = u.swap_user THEN 'outgoing' ELSE 'incoming' END as direction,
              CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END as counterparty,
              -- Truncated counterparty for display
              CASE 
                WHEN CONTAINS_SUBSTR(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, '.') THEN
                  CONCAT(
                    SUBSTR(SPLIT(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, '.')[SAFE_OFFSET(0)], 1, 6),
                    '...',
                    SUBSTR(SPLIT(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, '.')[SAFE_OFFSET(0)], -4),
                    '.',
                    SPLIT(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, '.')[SAFE_OFFSET(1)]
                  )
                ELSE
                  CONCAT(
                    SUBSTR(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, 1, 6),
                    '...',
                    SUBSTR(CASE WHEN e.ft_sender = u.swap_user THEN e.ft_recipient ELSE e.ft_sender END, -4)
                  )
              END as counterparty_display
            )
            ORDER BY e.position_index
          ) as token_events
          
        FROM users u
        INNER JOIN crypto_data.stg_events e ON (
          e.tx_hash = u.tx_hash
          AND e.event_type IN ('FTTransferEvent', 'STXTransferEvent')
          AND (e.ft_sender = u.swap_user OR e.ft_recipient = u.swap_user)
        )
        GROUP BY u.tx_hash, u.router_name, u.router_function, u.swap_user, u.success, u.transaction_fee, u.block_hash
      )
      
      SELECT 
        tx_hash,
        router_name,
        router_function,
        swap_user,
        success,
        transaction_fee,
        block_time,
        
        -- Token events
        token_events,
        total_tokens_involved
        
      FROM flows
      WHERE swap_user IS NOT NULL
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
      // Format transaction fee (always STX with 6 decimals)
      const atomicFee = row.transaction_fee ? parseInt(row.transaction_fee) : null;
      const formattedFee = atomicFee ? formatStxAmount(atomicFee) : null;
      
      // Format token events array with full metadata
      const formattedTokenEvents = row.token_events?.map((event: any) => {
        let formattedAmount = null;
        let displayAmount = null;
        let decimals = 6; // Default
        let tokenMetadata = null;
        
        if (event.ft_amount) {
          // Look up token metadata by contract address first, then by name/symbol
          let metadata = null;
          
          // For STX, use 'STX' as the contract address key
          const lookupKey = event.token_name === 'STX' ? 'STX' : event.token_contract_address;
          
          
          // Try exact contract address match first
          if (lookupKey && lookupKey !== 'Unknown') {
            metadata = tokenMetadataMap.get(lookupKey);
          }
          
          // Fallback to name/symbol matching for non-STX tokens
          if (!metadata && event.token_name !== 'STX') {
            const tokenKey = Array.from(tokenMetadataMap.keys()).find(key => {
              const tokenData = tokenMetadataMap.get(key);
              return tokenData && (
                key.includes(event.token_name) || 
                tokenData.token_symbol === event.token_name ||
                tokenData.token_name === event.token_name
              );
            });
            
            if (tokenKey) {
              metadata = tokenMetadataMap.get(tokenKey);
            }
          }
          
          if (metadata) {
            decimals = metadata.decimals || 0;
            formattedAmount = formatTokenAmount(event.ft_amount, decimals);
            
            // Use full decimal precision for the token, but cap display at reasonable limit
            const displayDecimals = decimals === 0 ? 0 : Math.min(decimals, 8);
            // Format without scientific notation and remove trailing zeros
            const formatted = formattedAmount.toFixed(displayDecimals);
            const cleanFormatted = parseFloat(formatted).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: displayDecimals,
              useGrouping: false
            });
            displayAmount = `${cleanFormatted} ${metadata.token_symbol || event.token_name}`;
            
            // Include full metadata
            tokenMetadata = {
              contract_address: metadata.contract_address,
              token_symbol: metadata.token_symbol,
              token_name: metadata.token_name,
              decimals: metadata.decimals,
              validation_status: metadata.validation_status,
              token_uri: metadata.token_uri,
              image_url: metadata.image_url,
              description: metadata.description,
              total_supply: metadata.total_supply,
              token_type: metadata.token_type
            };
          } else {
            // Unknown token - use 0 decimals (no decimal formatting)
            decimals = 0;
            formattedAmount = formatTokenAmount(event.ft_amount, 0);
            displayAmount = `${formattedAmount.toFixed(0)} ${event.token_name}`;
            
            tokenMetadata = {
              contract_address: event.token_contract_address || 'Unknown',
              token_symbol: event.token_name,
              token_name: event.token_name,
              decimals: 0,
              validation_status: 'unknown'
            };
          }
        }
        
        return {
          ...event,
          atomic_amount: event.ft_amount?.toString(),
          formatted_amount: formattedAmount,
          display_amount: displayAmount,
          decimals: decimals,
          token_metadata: tokenMetadata
        };
      }) || [];
      
      return {
        ...row,
        // Raw atomic fee (preserved)
        atomic_transaction_fee: atomicFee?.toString(),
        
        // Formatted transaction fee
        formatted_transaction_fee: formattedFee,
        display_transaction_fee: formattedFee ? `${formattedFee.toFixed(6)} STX` : null,
        
        // Enhanced token events with formatting
        token_events: formattedTokenEvents
      };
    });

    // Get summary statistics
    const summaryQuery = `
      WITH router_transactions AS (
        SELECT 
          t.tx_hash,
          t.success,
          t.fee as transaction_fee,
          a.contract_identifier as router_contract,
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
      )
      
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_transactions,
        ROUND(AVG(CASE WHEN success = true THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_percent,
        COUNT(DISTINCT router_name) as unique_routers,
        SUM(transaction_fee) as total_transaction_fees,
        AVG(transaction_fee) as avg_transaction_fee
      FROM router_transactions
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 60000,
    });

    const summary = summaryRows[0] || {};
    
    // Format summary statistics
    const totalFeesAtomic = parseInt(summary.total_transaction_fees || '0');
    const avgFeeAtomic = parseFloat(summary.avg_transaction_fee || '0');
    
    const formattedSummary = {
      total_transactions: parseInt(summary.total_transactions || '0'),
      successful_transactions: parseInt(summary.successful_transactions || '0'),
      success_rate_percent: parseFloat(summary.success_rate_percent || '0'),
      unique_routers: parseInt(summary.unique_routers || '0'),
      
      // Raw atomic fees (preserved)
      atomic_total_transaction_fees: totalFeesAtomic.toString(),
      atomic_avg_transaction_fee: avgFeeAtomic.toString(),
      
      // Formatted fees
      formatted_total_transaction_fees: formatStxAmount(totalFeesAtomic),
      formatted_avg_transaction_fee: formatStxAmount(avgFeeAtomic),
      display_total_transaction_fees: `${formatStxAmount(totalFeesAtomic).toFixed(6)} STX`,
      display_avg_transaction_fee: `${formatStxAmount(avgFeeAtomic).toFixed(6)} STX`
    };

    // Get router breakdown grouped by contract address
    const routerBreakdownQuery = `
      WITH router_transactions AS (
        SELECT 
          t.tx_hash,
          t.success,
          SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)] as contract_address,
          -- Create a display name for the contract address
          CASE 
            WHEN SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)] = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR' THEN 'BitFlow (SM1793...HCCR)'
            WHEN SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)] LIKE '%ALEX%' THEN CONCAT('ALEX (', SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], 1, 6), '...', SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], -4), ')')
            WHEN SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)] LIKE '%ARKADIKO%' OR SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)] LIKE '%arkadiko%' THEN CONCAT('Arkadiko (', SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], 1, 6), '...', SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], -4), ')')
            ELSE CONCAT(SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], 1, 6), '...', SUBSTR(SPLIT(a.contract_identifier, '.')[SAFE_OFFSET(0)], -4))
          END as display_name
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
      )
      
      SELECT 
        display_name as router_name,
        COUNT(*) as transaction_count,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_transactions,  
        ROUND(AVG(CASE WHEN success = true THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
      FROM router_transactions
      GROUP BY contract_address, display_name
      ORDER BY transaction_count DESC
    `;

    const [routerBreakdownRows] = await bigquery.query({
      query: routerBreakdownQuery,
      jobTimeoutMs: 60000,
    });

    return NextResponse.json({
      data: formattedRows,
      pagination: {
        limit,
        offset,
        count: formattedRows.length,
      },
      summary: formattedSummary,
      router_breakdown: routerBreakdownRows,
      formatting_info: {
        note: "Token amounts and fees are formatted dynamically from atomic units using current token metadata",
        atomic_units_stored: true,
        formatting_applied_at_read_time: true
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('DeFi flows API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch DeFi flows data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
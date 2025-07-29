import { NextRequest } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { getContractInfoWithParsedAbi, isSip010Contract, extractSip010Identifier } from '@/lib/stacks-api';

// Cache control headers for node details
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
  'CDN-Cache-Control': 'public, max-age=600',
  'Vercel-CDN-Cache-Control': 'public, max-age=600'
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    
    if (!address) {
      return Response.json({ error: 'Address parameter is required' }, { status: 400 });
    }

    // Detect if this is a contract (contains dot) or wallet address
    const isContract = address.includes('.');
    
    if (isContract) {
      // Fetch contract details
      const contractData = await fetchContractDetails(address);
      return Response.json({
        type: 'contract',
        address,
        ...contractData
      }, {
        headers: CACHE_HEADERS
      });
    } else {
      // Fetch wallet details
      const walletData = await fetchWalletDetails(address);
      return Response.json({
        type: 'wallet', 
        address,
        ...walletData
      }, {
        headers: CACHE_HEADERS
      });
    }
  } catch (error) {
    console.error('Error fetching node details:', error);
    return Response.json(
      { error: 'Failed to fetch node details' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
}

async function fetchContractDetails(contractId: string) {
  try {
    // Parse contract address and name
    const [contractAddress, contractName] = contractId.split('.');
    
    const [contractQuery] = await bigquery.query(`
      WITH contract_interfaces AS (
        SELECT 
          contract_id,
          ARRAY_AGG(
            STRUCT(
              interface,
              metadata,
              is_verified
            )
          ) as interfaces
        FROM \`crypto_data.contract_interfaces\`
        WHERE contract_id = '${contractId}'
        GROUP BY contract_id
      ),
      
      recent_contract_transactions AS (
        SELECT 
          source,
          target,
          value,
          raw_value,
          asset,
          currency_symbol,
          token_symbol,
          decimals,
          received_at,
          CASE 
            WHEN STRPOS(asset, "::") > 0 THEN SUBSTR(asset, 1, STRPOS(asset, "::") - 1)
            WHEN asset = 'STX' THEN '.stx'
            WHEN asset = 'DEBIT' THEN 'DEBIT'  -- Handle DEBIT token directly
            ELSE asset 
          END as token_contract_id,
          CASE 
            WHEN source = '${contractId}' THEN target 
            ELSE source 
          END as counterparty,
          -- Use the value field directly - it's already normalized in sankey_links
          value as normalized_value
        FROM \`crypto_data.sankey_links\`
        WHERE source = '${contractId}' OR target = '${contractId}'
        ORDER BY received_at DESC
        LIMIT 10000
      ),
      
      -- Enhanced token activity for contracts
      contract_token_activity AS (
        SELECT 
          rct.*,
          ci.metadata,
          COALESCE(tp.usd_price, 0) as usd_price
        FROM recent_contract_transactions rct
        LEFT JOIN \`crypto_data.contract_interfaces\` ci 
          ON rct.token_contract_id = ci.contract_id AND ci.interface = 'sip-010-ft'
        LEFT JOIN \`crypto_data.current_token_prices\` tp 
          ON rct.token_contract_id = tp.token_contract_id
      ),
      
      -- Group contract token activity
      contract_token_grouped AS (
        SELECT 
          token_contract_id,
          COALESCE(token_symbol, currency_symbol) as token_symbol,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN target = '${contractId}' THEN normalized_value ELSE 0 END) as inbound_tokens,
          SUM(CASE WHEN source = '${contractId}' THEN normalized_value ELSE 0 END) as outbound_tokens,
          SUM(CASE WHEN target = '${contractId}' THEN normalized_value * COALESCE(usd_price, 0) ELSE 0 END) as inbound_usd,
          SUM(CASE WHEN source = '${contractId}' THEN normalized_value * COALESCE(usd_price, 0) ELSE 0 END) as outbound_usd,
          AVG(normalized_value) as avg_tokens_per_tx,
          AVG(normalized_value * COALESCE(usd_price, 0)) as avg_usd_per_tx,
          MAX(usd_price) as current_price
        FROM contract_token_activity
        GROUP BY token_contract_id, token_symbol
        HAVING COUNT(*) > 0
        ORDER BY (inbound_usd + outbound_usd) DESC
        LIMIT 15
      ),
      
      -- Enhanced contract token activity with metadata
      enhanced_contract_token_activity AS (
        SELECT 
          ctg.*,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.name') as token_name,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.symbol') as display_symbol,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.image') as token_image
        FROM contract_token_grouped ctg
        LEFT JOIN \`crypto_data.contract_interfaces\` ci 
          ON ctg.token_contract_id = ci.contract_id AND ci.interface = 'sip-010-ft'
      )
      
      SELECT 
        c.contract_address,
        c.contract_name,
        c.abi,
        c.source_code,
        c.created_at,
        
        -- Get detected interfaces
        COALESCE(ci.interfaces, []) as interfaces,
        
        -- Transaction-based averages (calculated inline with COALESCE for safety)
        COALESCE((
          SELECT COUNT(*) 
          FROM recent_contract_transactions
        ), 0) as recent_interactions,
        
        COALESCE((
          SELECT AVG(normalized_value * COALESCE(tp.usd_price, 0))
          FROM recent_contract_transactions rct
          LEFT JOIN \`crypto_data.current_token_prices\` tp 
            ON rct.token_contract_id = tp.token_contract_id
        ), 0) as avg_usd_per_interaction,
        
        COALESCE((
          SELECT 
            CASE 
              WHEN DATE_DIFF(MAX(received_at), MIN(received_at), DAY) >= 1 THEN 
                COUNT(*) / DATE_DIFF(MAX(received_at), MIN(received_at), DAY)
              ELSE 
                COUNT(*) / GREATEST(
                  TIMESTAMP_DIFF(MAX(received_at), MIN(received_at), HOUR) / 24.0,
                  1.0/24.0
                )
            END
          FROM recent_contract_transactions
        ), 0) as avg_interactions_per_day,
        
        COALESCE((
          SELECT COUNT(DISTINCT counterparty) 
          FROM recent_contract_transactions
        ), 0) as recent_users,
        
        COALESCE((
          SELECT COUNT(DISTINCT token_contract_id) 
          FROM recent_contract_transactions
        ), 0) as active_tokens,
        
        (SELECT MIN(received_at) FROM recent_contract_transactions) as earliest_transaction,
        (SELECT MAX(received_at) FROM recent_contract_transactions) as latest_transaction,
        
        -- Enhanced token activity with USD values and metadata
        ARRAY(
          SELECT AS STRUCT
            token_contract_id,
            token_symbol,
            token_name,
            display_symbol,
            token_image,
            transaction_count,
            inbound_tokens,
            outbound_tokens,
            inbound_usd,
            outbound_usd,
            avg_tokens_per_tx,
            avg_usd_per_tx,
            current_price
          FROM enhanced_contract_token_activity
          ORDER BY (inbound_usd + outbound_usd) DESC
        ) as token_activity
        
      FROM \`crypto_data.contracts\` c
      LEFT JOIN contract_interfaces ci 
        ON CONCAT(c.contract_address, '.', c.contract_name) = ci.contract_id
      
      WHERE c.contract_address = '${contractAddress}' 
        AND c.contract_name = '${contractName}'
    `);

    const [contract] = contractQuery;
    
    if (!contract) {
      // Contract not in our database - discover and store it
      console.log(`🔍 Contract ${contractId} not found in database, attempting to discover...`);
      
      try {
        const contractInfo = await getContractInfoWithParsedAbi(contractId);
        
        if (contractInfo) {
          console.log(`✓ Found contract info for ${contractId}, storing in database...`);
          
          // Store the contract in the database
          const insertContractQuery = `
            INSERT INTO \`crypto_data.contracts\`
            (contract_address, contract_name, abi, source_code, created_at)
            VALUES (@contract_address, @contract_name, @abi, @source_code, CURRENT_TIMESTAMP())
          `;
          
          await bigquery.query({
            query: insertContractQuery,
            params: {
              contract_address: contractAddress,
              contract_name: contractName,
              abi: contractInfo.parsed_abi, // Use the parsed ABI object, not the string
              source_code: contractInfo.source_code || null
            },
            types: {
              contract_address: 'STRING',
              contract_name: 'STRING', 
              abi: 'JSON',
              source_code: 'STRING'
            }
          });
          
          // Detect and store interfaces
          const interfaces = [];
          const abi = contractInfo.parsed_abi;
          
          if (abi) {
            // Check for SIP-010 interface
            if (isSip010Contract(abi)) {
              const identifier = extractSip010Identifier(abi);
              const interfaceData = {
                interface: 'sip-010-ft',
                metadata: {
                  identifier: identifier || 'unknown',
                  contract_id: contractId,
                  needs_metadata_backfill: true,
                  detected_by_abi: true
                }
              };
              
              await bigquery.query({
                query: `
                  INSERT INTO \`crypto_data.contract_interfaces\`
                  (contract_id, interface, metadata, created_at, updated_at)
                  VALUES (@contract_id, @interface, @metadata, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
                `,
                params: {
                  contract_id: contractId,
                  interface: interfaceData.interface,
                  metadata: interfaceData.metadata
                },
                types: {
                  contract_id: 'STRING',
                  interface: 'STRING',
                  metadata: 'JSON'
                }
              });
              
              interfaces.push(interfaceData);
              console.log(`✓ Detected and stored SIP-010 interface for ${contractId}`);
            }
            
            // Check for vault interface
            const hasExecute = abi.functions?.some((f: any) => f.name === 'execute' && f.access === 'public');
            const hasQuote = abi.functions?.some((f: any) => f.name === 'quote' && f.access === 'read_only');
            
            if (hasExecute && hasQuote) {
              const interfaceData = {
                interface: 'vault',
                metadata: {
                  type: 'POOL',
                  version: 'v1',
                  has_execute: hasExecute,
                  has_quote: hasQuote,
                  needs_metadata_migration: true,
                  detected_by_abi: true
                }
              };
              
              await bigquery.query({
                query: `
                  INSERT INTO \`crypto_data.contract_interfaces\`
                  (contract_id, interface, metadata, created_at, updated_at)
                  VALUES (@contract_id, @interface, @metadata, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
                `,
                params: {
                  contract_id: contractId,
                  interface: interfaceData.interface,
                  metadata: interfaceData.metadata
                },
                types: {
                  contract_id: 'STRING',
                  interface: 'STRING',
                  metadata: 'JSON'
                }
              });
              
              interfaces.push(interfaceData);
              console.log(`✓ Detected and stored vault interface for ${contractId}`);
            }
          }
          
          // Return the newly discovered contract data with transaction stats (will be 0 for new contracts)
          return {
            contract_address: contractAddress,
            contract_name: contractName,
            abi: abi,
            source_code: contractInfo.source_code,
            created_at: contractInfo.block_time ? new Date(contractInfo.block_time * 1000).toISOString() : null,
            interfaces: interfaces,
            recent_interactions: 0,
            avg_usd_per_interaction: 0,
            avg_interactions_per_day: 0,
            recent_users: 0,
            active_tokens: 0,
            earliest_transaction: null,
            latest_transaction: null,
            token_activity: []
          };
        } else {
          console.log(`⚠️ Contract ${contractId} not found on blockchain`);
        }
      } catch (discoveryError) {
        console.error(`❌ Failed to discover contract ${contractId}:`, discoveryError);
      }
      
      // Fallback if discovery failed
      return {
        contract_address: contractAddress,
        contract_name: contractName,
        abi: null,
        source_code: null,
        interfaces: [],
        recent_interactions: 0,
        avg_usd_per_interaction: 0,
        avg_interactions_per_day: 0,
        recent_users: 0,
        active_tokens: 0,
        earliest_transaction: null,
        latest_transaction: null,
        token_activity: []
      };
    }

    return {
      contract_address: contract.contract_address,
      contract_name: contract.contract_name,
      abi: contract.abi ? JSON.parse(contract.abi) : null,
      source_code: contract.source_code,
      created_at: contract.created_at,
      interfaces: contract.interfaces || [],
      recent_interactions: contract.recent_interactions || 0,
      avg_usd_per_interaction: contract.avg_usd_per_interaction || 0,
      avg_interactions_per_day: contract.avg_interactions_per_day || 0,
      earliest_transaction: contract.earliest_transaction,
      latest_transaction: contract.latest_transaction,
      recent_users: contract.recent_users || 0,
      active_tokens: contract.active_tokens || 0,
      token_activity: contract.token_activity || []
    };
    
  } catch (error) {
    console.error('Error fetching contract details:', error);
    throw error;
  }
}

async function fetchWalletDetails(address: string) {
  try {
    const [walletQuery] = await bigquery.query(`
      WITH recent_transactions AS (
        SELECT 
          source,
          target,
          value,
          raw_value,
          asset,
          currency_symbol,
          token_symbol,
          decimals,
          received_at
        FROM \`crypto_data.sankey_links\`
        WHERE source = '${address}' OR target = '${address}'
        ORDER BY received_at DESC
        LIMIT 10000
      ),
      
      -- Extract contract IDs and join with metadata/prices
      token_contract_mapping AS (
        SELECT 
          *,
          CASE 
            WHEN STRPOS(asset, "::") > 0 THEN SUBSTR(asset, 1, STRPOS(asset, "::") - 1)
            WHEN asset = 'STX' THEN '.stx'  -- Map STX to .stx for metadata lookup
            WHEN asset = 'DEBIT' THEN 'DEBIT'  -- Handle DEBIT token directly
            ELSE asset 
          END as contract_id,
          CASE 
            WHEN source = '${address}' THEN target 
            ELSE source 
          END as counterparty
        FROM recent_transactions
      ),
      
      -- Enrich with token metadata and prices
      enriched_token_activity AS (
        SELECT 
          tm.*,
          ci.metadata,
          COALESCE(tp.usd_price, 0) as usd_price,
          -- Get decimals from metadata if available, otherwise use from sankey_links
          COALESCE(
            CAST(JSON_EXTRACT_SCALAR(ci.metadata, '$.decimals') AS INT64),
            tm.decimals
          ) as token_decimals,
          -- Use the value field directly - it's already normalized in sankey_links
          tm.value as normalized_value
        FROM token_contract_mapping tm
        LEFT JOIN \`crypto_data.contract_interfaces\` ci 
          ON tm.contract_id = ci.contract_id AND ci.interface = 'sip-010-ft'
        LEFT JOIN \`crypto_data.current_token_prices\` tp 
          ON tm.contract_id = tp.token_contract_id
      ),
      
      -- Calculate averages based on recent transactions
      wallet_averages AS (
        SELECT 
          COUNT(*) as recent_transactions,
          AVG(normalized_value * COALESCE(usd_price, 0)) as avg_usd_per_tx,
          -- Calculate daily rate based on actual time span, extrapolating if needed
          CASE 
            WHEN DATE_DIFF(MAX(received_at), MIN(received_at), DAY) >= 1 THEN 
              COUNT(*) / DATE_DIFF(MAX(received_at), MIN(received_at), DAY)
            ELSE 
              -- Extrapolate from hours to daily rate
              COUNT(*) / GREATEST(
                TIMESTAMP_DIFF(MAX(received_at), MIN(received_at), HOUR) / 24.0,
                1.0/24.0  -- Minimum 1 hour worth of data
              )
          END as avg_txs_per_day,
          COUNT(DISTINCT counterparty) as recent_counterparties,
          COUNT(DISTINCT contract_id) as active_tokens,
          MIN(received_at) as earliest_recent_tx,
          MAX(received_at) as latest_recent_tx
        FROM enriched_token_activity
      ),
      
      -- Group token activity without JSON fields first (with debugging info)
      token_activity_grouped AS (
        SELECT 
          contract_id,
          COALESCE(token_symbol, currency_symbol) as token_symbol,
          token_decimals as decimals,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN target = '${address}' THEN normalized_value ELSE 0 END) as inbound_tokens,
          SUM(CASE WHEN source = '${address}' THEN normalized_value ELSE 0 END) as outbound_tokens,
          SUM(CASE WHEN target = '${address}' THEN normalized_value * COALESCE(usd_price, 0) ELSE 0 END) as inbound_usd,
          SUM(CASE WHEN source = '${address}' THEN normalized_value * COALESCE(usd_price, 0) ELSE 0 END) as outbound_usd,
          AVG(normalized_value) as avg_tokens_per_tx,
          AVG(normalized_value * COALESCE(usd_price, 0)) as avg_usd_per_tx,
          MAX(usd_price) as current_price
        FROM enriched_token_activity
        GROUP BY contract_id, token_symbol, token_decimals
        HAVING COUNT(*) > 0
        ORDER BY (inbound_usd + outbound_usd) DESC, transaction_count DESC
        LIMIT 15
      ),
      
      -- Enhanced token activity with metadata
      enhanced_token_activity AS (
        SELECT 
          tag.*,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.name') as token_name,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.symbol') as display_symbol,
          JSON_EXTRACT_SCALAR(ci.metadata, '$.image') as token_image
        FROM token_activity_grouped tag
        LEFT JOIN \`crypto_data.contract_interfaces\` ci 
          ON tag.contract_id = ci.contract_id AND ci.interface = 'sip-010-ft'
      ),
      
      -- Recent counterparties with USD values
      recent_counterparties AS (
        SELECT 
          counterparty,
          COUNT(*) as transaction_count,
          SUM(normalized_value * COALESCE(usd_price, 0)) as total_usd_volume
        FROM enriched_token_activity
        GROUP BY counterparty
        ORDER BY total_usd_volume DESC
        LIMIT 10
      )
      
      SELECT 
        -- Transaction-based averages instead of totals
        (SELECT recent_transactions FROM wallet_averages) as recent_transactions,
        (SELECT avg_usd_per_tx FROM wallet_averages) as avg_usd_per_tx,
        (SELECT avg_txs_per_day FROM wallet_averages) as avg_txs_per_day,
        (SELECT recent_counterparties FROM wallet_averages) as recent_counterparties,
        (SELECT active_tokens FROM wallet_averages) as active_tokens,
        (SELECT earliest_recent_tx FROM wallet_averages) as earliest_transaction,
        (SELECT latest_recent_tx FROM wallet_averages) as latest_transaction,
        
        -- Enhanced token activity with USD values and metadata (with debug info)
        ARRAY(
          SELECT AS STRUCT
            contract_id,
            token_symbol,
            token_name,
            display_symbol,
            token_image,
            decimals,
            transaction_count,
            inbound_tokens,
            outbound_tokens,
            inbound_usd,
            outbound_usd,
            avg_tokens_per_tx,
            avg_usd_per_tx,
            current_price
          FROM enhanced_token_activity
          ORDER BY (inbound_usd + outbound_usd) DESC, transaction_count DESC
        ) as token_activity,
        
        -- Recent counterparties with USD volumes
        ARRAY(
          SELECT AS STRUCT
            counterparty,
            transaction_count,
            total_usd_volume
          FROM recent_counterparties
          ORDER BY total_usd_volume DESC
        ) as top_counterparties
    `);

    const [wallet] = walletQuery;
    
    if (!wallet) {
      return {
        recent_transactions: 0,
        avg_usd_per_tx: 0,
        avg_txs_per_day: 0,
        recent_counterparties: 0,
        active_tokens: 0,
        token_activity: [],
        top_counterparties: []
      };
    }

    // Validation logging for corrected normalization
    console.log('✅ Wallet data processed successfully:', {
      address,
      recent_transactions: wallet.recent_transactions,
      avg_usd_per_tx: wallet.avg_usd_per_tx,
      active_tokens: wallet.active_tokens,
      sample_token: wallet.token_activity?.[0] ? {
        symbol: wallet.token_activity[0].token_symbol,
        inbound_tokens: wallet.token_activity[0].inbound_tokens,
        inbound_usd: wallet.token_activity[0].inbound_usd
      } : null
    });

    return {
      recent_transactions: wallet.recent_transactions || 0,
      avg_usd_per_tx: wallet.avg_usd_per_tx || 0,
      avg_txs_per_day: wallet.avg_txs_per_day || 0,
      earliest_transaction: wallet.earliest_transaction,
      latest_transaction: wallet.latest_transaction,
      recent_counterparties: wallet.recent_counterparties || 0,
      active_tokens: wallet.active_tokens || 0,
      token_activity: wallet.token_activity || [],
      top_counterparties: wallet.top_counterparties || []
    };
    
  } catch (error) {
    console.error('Error fetching wallet details:', error);
    throw error;
  }
}
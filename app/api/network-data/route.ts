import { NextRequest } from 'next/server';
import { bigquery } from '@/lib/bigquery';

// Server-side cache for token metadata with 1 hour TTL
let tokenMetadataCache: {
  data: any[] | null;
  timestamp: number;
  ttl: number;
} = {
  data: null,
  timestamp: 0,
  ttl: 60 * 60 * 1000 // 1 hour in milliseconds
};

// Function to get cached or fresh token metadata
async function getCachedTokenMetadata(): Promise<any[]> {
  const now = Date.now();

  // Check if cache is valid
  if (tokenMetadataCache.data && (now - tokenMetadataCache.timestamp) < tokenMetadataCache.ttl) {
    return tokenMetadataCache.data;
  }

  // Fetch fresh data
  try {
    const tokenMetadataResponse = await fetch('https://tokens.charisma.rocks/api/v1/sip10');
    const tokenMetadata = await tokenMetadataResponse.json();

    // Update cache
    tokenMetadataCache.data = tokenMetadata;
    tokenMetadataCache.timestamp = now;

    return tokenMetadata;
  } catch (error) {
    // If fetch fails and we have stale cache, use it
    if (tokenMetadataCache.data) {
      console.warn('Token metadata fetch failed, using stale cache:', error);
      return tokenMetadataCache.data;
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '500');
    const minValue = parseFloat(searchParams.get('minValue') || '0');
    const asset = searchParams.get('asset') || '';

    // Validate parameters
    if (limit < 10 || limit > 100000) {
      return Response.json({ error: 'Limit must be between 10 and 100000' }, { status: 400 });
    }
    if (minValue < 0) {
      return Response.json({ error: 'MinValue must be >= 0' }, { status: 400 });
    }

    // Build WHERE clause for links
    let whereClause = `WHERE value > ${minValue}`;
    if (asset) {
      // Check multiple fields for token matching including contract IDs (case-insensitive)
      // asset_class_identifier often contains full contract addresses like "SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token"
      whereClause += ` AND (
        UPPER(currency_symbol) = UPPER('${asset}') 
        OR UPPER(token_symbol) = UPPER('${asset}') 
        OR UPPER(asset) = UPPER('${asset}')
        OR UPPER(asset_class_identifier) = UPPER('${asset}')
        OR UPPER(asset_class_identifier) LIKE UPPER('%${asset}%')
      )`;
      console.log(`Token filter applied: ${asset} - WHERE clause: ${whereClause}`);
    }

    // Get cached token metadata
    const tokenMetadata = await getCachedTokenMetadata();

    // Create comprehensive token metadata maps for quick lookup
    const tokenImageMap = new Map();
    const tokenSymbolMap = new Map(); // Map asset_class_identifier to proper symbol
    const tokenDataMap = new Map(); // Map symbol to full token data

    tokenMetadata.forEach((token: any) => {
      if (token.symbol) {
        const symbolLower = token.symbol.toLowerCase();
        // Map symbol to image and data
        tokenImageMap.set(symbolLower, token.image);
        tokenDataMap.set(symbolLower, token);
      }

      // Map by identifier (simple form like "charisma", "GECKO")
      if (token.identifier) {
        const identifierLower = token.identifier.toLowerCase();
        tokenImageMap.set(identifierLower, token.image);
        if (token.symbol) {
          tokenSymbolMap.set(identifierLower, token.symbol);
        }
      }

      // Map by contractId (full contract like "SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-token")
      if (token.contractId) {
        const contractIdLower = token.contractId.toLowerCase();
        tokenImageMap.set(contractIdLower, token.image);
        if (token.symbol) {
          tokenSymbolMap.set(contractIdLower, token.symbol);
        }

        // Also map just the contract name part (after the dot)
        const contractParts = token.contractId.split('.');
        if (contractParts.length >= 2) {
          const contractName = contractParts[1].toLowerCase();
          tokenSymbolMap.set(contractName, token.symbol);
          tokenImageMap.set(contractName, token.image);
        }
      }

      // Handle potential :: format in asset_class_identifier (from SQL)
      // SQL extracts token symbol using REGEXP_EXTRACT(asset_class_identifier, r'::(.+)$')
      // So we need to map what comes after :: to the proper symbol
      if (token.contractId && token.symbol) {
        // Create mapping for potential :: extraction format
        const contractIdWithToken = `${token.contractId}::${token.identifier || token.symbol.toLowerCase()}`;
        tokenSymbolMap.set(contractIdWithToken.toLowerCase(), token.symbol);
        tokenImageMap.set(contractIdWithToken.toLowerCase(), token.image);

        // Map the part after :: (what SQL regex extracts)
        const extractedPart = token.identifier || token.symbol.toLowerCase();
        tokenSymbolMap.set(extractedPart.toLowerCase(), token.symbol);
        tokenImageMap.set(extractedPart.toLowerCase(), token.image);
      }
    });

    // Execute single comprehensive query to ensure data consistency
    const [comprehensiveQuery] = await Promise.all([
      bigquery.query(`
        WITH filtered_transactions AS (
          SELECT 
            source, 
            target, 
            value, 
            raw_value, 
            asset, 
            currency_symbol, 
            decimals, 
            token_symbol,
            asset_class_identifier,
            received_at,
            FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', received_at) as received_at_iso
          FROM \`crypto_data.sankey_links\`
          ${whereClause}
          ORDER BY received_at DESC
          LIMIT ${limit}
        ),
        node_aggregations AS (
          SELECT 
            source as node_name,
            token_symbol,
            SUM(value) as outbound_value,
            0 as inbound_value,
            MAX(received_at) as latest_transaction
          FROM filtered_transactions
          GROUP BY source, token_symbol
          
          UNION ALL
          
          SELECT 
            target as node_name,
            token_symbol,
            0 as outbound_value,
            SUM(value) as inbound_value,
            MAX(received_at) as latest_transaction
          FROM filtered_transactions
          GROUP BY target, token_symbol
        ),
        node_summaries AS (
          SELECT 
            node_name,
            token_symbol,
            SUM(outbound_value) as total_outbound,
            SUM(inbound_value) as total_inbound,
            SUM(outbound_value + inbound_value) as total_value,
            MAX(latest_transaction) as latest_transaction,
            FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MAX(latest_transaction)) as latest_transaction_iso
          FROM node_aggregations
          GROUP BY node_name, token_symbol
        ),
        dominant_tokens AS (
          SELECT 
            node_name,
            token_symbol as dominant_token,
            total_value,
            ROW_NUMBER() OVER (PARTITION BY node_name ORDER BY total_value DESC) as rn
          FROM node_summaries
        ),
        metadata AS (
          SELECT 
            COUNT(*) as total_count,
            FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MIN(received_at)) as oldest_iso,
            FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MAX(received_at)) as newest_iso
          FROM filtered_transactions
        ),
        nodes_in_transactions AS (
          SELECT DISTINCT node_name
          FROM (
            SELECT source as node_name FROM filtered_transactions
            UNION DISTINCT
            SELECT target as node_name FROM filtered_transactions
          )
        )
        -- Return only nodes that appear in the filtered transactions
        SELECT 
          'node' as record_type,
          n.name,
          n.category,
          COALESCE(dt.total_value, 0) as value,
          COALESCE(dt.dominant_token, 'UNKNOWN') as dominant_token,
          COALESCE(ns.latest_transaction_iso, NULL) as latest_transaction,
          TO_JSON(ARRAY_AGG(
            STRUCT(
              ns.token_symbol,
              ns.total_inbound as inbound,
              ns.total_outbound as outbound,
              ns.total_value as total
            ) ORDER BY ns.total_value DESC
          )) as token_flows,
          -- Null values for link/metadata fields
          NULL as source, NULL as target, NULL as raw_value, NULL as asset,
          NULL as currency_symbol, NULL as decimals, NULL as token_symbol, NULL as asset_class_identifier,
          NULL as received_at, NULL as received_at_iso, NULL as total_count, NULL as oldest_iso, NULL as newest_iso
        FROM \`crypto_data.sankey_nodes\` n
        INNER JOIN nodes_in_transactions nit ON n.name = nit.node_name
        LEFT JOIN dominant_tokens dt ON n.name = dt.node_name AND dt.rn = 1
        LEFT JOIN node_summaries ns ON n.name = ns.node_name
        GROUP BY n.name, n.category, dt.total_value, dt.dominant_token, ns.latest_transaction_iso
        
        UNION ALL
        
        -- Return filtered links
        SELECT 
          'link' as record_type,
          NULL as name, NULL as category, NULL as value, NULL as dominant_token,
          NULL as latest_transaction, NULL as token_flows,
          source, target, raw_value, asset, currency_symbol, decimals, token_symbol, asset_class_identifier,
          received_at, received_at_iso, NULL as total_count, NULL as oldest_iso, NULL as newest_iso
        FROM filtered_transactions
        
        UNION ALL
        
        -- Return metadata
        SELECT 
          'metadata' as record_type,
          NULL as name, NULL as category, NULL as value, NULL as dominant_token,
          NULL as latest_transaction, NULL as token_flows,
          NULL as source, NULL as target, NULL as raw_value, NULL as asset,
          NULL as currency_symbol, NULL as decimals, NULL as token_symbol, NULL as asset_class_identifier,
          NULL as received_at, NULL as received_at_iso, total_count, oldest_iso, newest_iso
        FROM metadata
      `)
    ]);

    const [comprehensiveResults] = comprehensiveQuery;

    // Separate nodes, links, and metadata from unified query results
    const nodes = comprehensiveResults.filter((row: any) => row.record_type === 'node');
    const links = comprehensiveResults.filter((row: any) => row.record_type === 'link');
    const metadataRows = comprehensiveResults.filter((row: any) => row.record_type === 'metadata');

    // Debug: Log query results
    console.log(`API Debug: Found ${nodes.length} nodes, ${links.length} links`);
    const nodesWithFlows = nodes.filter((n: any) => n.token_flows && n.token_flows !== 'null');
    console.log(`API Debug: ${nodesWithFlows.length} nodes have token flows`);

    // Debug: Show sample token data to understand field usage
    if (links.length > 0) {
      const sampleTokens = links.slice(0, 5).map(link => ({
        currency_symbol: link.currency_symbol,
        token_symbol: link.token_symbol,
        asset: link.asset,
        asset_class_identifier: link.asset_class_identifier
      }));
      console.log(`API Debug: Sample token data:`, sampleTokens);
    }

    // Create sets to check data consistency
    const nodeNamesFromAggregation = new Set(nodes.filter(n => n.token_flows && n.token_flows !== 'null').map(n => n.name));
    const nodeNamesFromLinks = new Set();
    links.forEach(link => {
      nodeNamesFromLinks.add(link.source);
      nodeNamesFromLinks.add(link.target);
    });

    const orphanedNodes = [...nodeNamesFromAggregation].filter(name => !nodeNamesFromLinks.has(name));
    console.log(`API Debug: ${orphanedNodes.length} nodes have aggregated flows but don't appear in links:`, orphanedNodes.slice(0, 5));

    // Get date range from combined query results
    let dateRange = null;
    if (metadataRows.length > 0 && metadataRows[0].total_count > 0) {
      const rangeData = metadataRows[0];
      dateRange = {
        oldest: rangeData.oldest_iso,
        newest: rangeData.newest_iso,
        count: parseInt(rangeData.total_count)
      };
    }

    // Transform data for network graph
    const networkData = {
      nodes: nodes.map((d: any) => {
        // Parse token flows from JSON string - use plain object instead of Map for JSON serialization
        let tokenFlows: Record<string, any> = {};
        if (d.token_flows) {
          try {
            const flows = typeof d.token_flows === 'string' ? JSON.parse(d.token_flows) : d.token_flows;
            if (Array.isArray(flows) && flows.length > 0) {
              flows.forEach((flow: any) => {
                if (flow.token_symbol) {
                  tokenFlows[flow.token_symbol] = {
                    inbound: flow.inbound || 0,
                    outbound: flow.outbound || 0,
                    total: flow.total || 0
                  };
                }
              });
            }
          } catch (error) {
            console.warn('Failed to parse token flows JSON:', error, d.token_flows);
          }
        }

        return {
          id: d.name,
          name: d.name,
          category: d.category,
          value: d.value || 0,
          val: 4, // Uniform size for all nodes
          dominantToken: d.dominant_token || 'UNKNOWN',
          tokenFlows: tokenFlows,
          latestTransaction: d.latest_transaction || null
        };
      }),
      links: links.map((d: any) => {
        // Priority order for finding the correct token symbol and image:
        // 1. Full asset_class_identifier (exact match)
        // 2. Extracted token_symbol (from SQL regex)
        // 3. Currency symbol fallback

        let properTokenSymbol = d.token_symbol; // Default fallback
        let tokenImage = null;

        const lookupKeys = [
          d.asset_class_identifier?.toLowerCase(),
          d.token_symbol?.toLowerCase(),
          d.currency_symbol?.toLowerCase()
        ].filter(Boolean);

        // Try to find proper symbol and image using lookup keys
        for (const key of lookupKeys) {
          const mappedSymbol = tokenSymbolMap.get(key);
          if (mappedSymbol) {
            properTokenSymbol = mappedSymbol;
            break;
          }
        }

        // Try to find image using the same lookup keys plus the resolved symbol
        const imageKeys = [
          properTokenSymbol?.toLowerCase(),
          ...lookupKeys
        ].filter(Boolean);

        for (const key of imageKeys) {
          const foundImage = tokenImageMap.get(key);
          if (foundImage) {
            tokenImage = foundImage;
            break;
          }
        }

        return {
          source: d.source,
          target: d.target,
          value: d.value,
          token_symbol: properTokenSymbol, // Use the corrected symbol
          received_at: d.received_at_iso || d.received_at
        };
      }),
      dateRange: dateRange
    };

    return Response.json(networkData);

  } catch (error) {
    console.error('Error fetching network data:', error);
    return Response.json(
      { error: 'Failed to fetch network data' },
      { status: 500 }
    );
  }
}
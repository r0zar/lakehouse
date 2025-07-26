import { bigquery } from '@/lib/bigquery';
import NetworkChart3D from './NetworkChart3D';

interface NetworkChartServerProps {
  limit?: number;
  asset?: string;
  minValue?: number;
}

export default async function NetworkChartServer({
  limit = 50,
  asset,
  minValue = 0
}: NetworkChartServerProps) {
  try {
    // Build WHERE clause for links
    let whereClause = `WHERE value > ${minValue}`;
    if (asset) {
      whereClause += ` AND currency_symbol = '${asset}'`;
    }
    
    // Fetch token metadata from Charisma API
    const tokenMetadataResponse = await fetch('https://tokens.charisma.rocks/api/v1/sip10');
    const tokenMetadata = await tokenMetadataResponse.json();
    
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
    
    
    // Execute both queries in parallel on the server
    const [nodesQuery, linksQuery] = await Promise.all([
      bigquery.query(`
        SELECT name, category 
        FROM \`crypto_data.sankey_nodes\`
        ORDER BY name
      `),
      bigquery.query(`
        SELECT source, target, value, raw_value, asset, currency_symbol, decimals, token_symbol, received_at
        FROM \`crypto_data.sankey_links\`
        ${whereClause}
        ORDER BY received_at DESC
        LIMIT ${limit}
      `)
    ]);
    
    const [nodes] = nodesQuery;
    const [links] = linksQuery;
    
    
    // Transform data for network graph
    const networkData = {
      nodes: nodes.map((d: any) => ({
        id: d.name,
        name: d.name,
        category: d.category,
        value: 0 // Default value for compatibility
      })),
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
          raw_value: d.raw_value,
          asset: d.asset || d.currency_symbol,
          currency_symbol: d.currency_symbol,
          decimals: d.decimals,
          token_symbol: properTokenSymbol, // Use the corrected symbol
          original_token_symbol: d.token_symbol, // Keep original for debugging
          asset_class_identifier: d.asset_class_identifier,
          token_image: tokenImage
        };
      })
    };

    // Pass data to 3D component
    return <NetworkChart3D data={networkData} />;
    
  } catch (error) {
    console.error('Error fetching network data:', error);
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-red-500 text-lg">
          Error loading network data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }
}
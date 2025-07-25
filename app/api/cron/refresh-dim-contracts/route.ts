import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { callReadOnly, getStxTotalSupply } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const martName = 'dim_contracts';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${martName} refresh...`);

    // Step 1: Create/refresh the base dim_contracts table to discover all contracts from transaction data
    const discoverContractsQuery = `
      CREATE OR REPLACE TABLE crypto_data.dim_contracts AS 
      WITH discovered_contracts AS (
        SELECT DISTINCT
          contract_address,
          MAX(last_seen) as last_seen,
          COUNT(*) as transaction_count
        FROM (
          -- Extract main contract from invoked transactions
          SELECT 
            REGEXP_EXTRACT(description, r'invoked: ([^:]+)') as contract_address,
            received_at as last_seen
          FROM crypto_data.stg_transactions
          WHERE description LIKE 'invoked:%'
            AND REGEXP_CONTAINS(description, r'invoked: [^:]+\\.[^:]+')
        )
        WHERE contract_address IS NOT NULL
          AND contract_address != ''
          AND REGEXP_CONTAINS(contract_address, r'^S[PM][0-9A-Z]{38,40}\\.[a-zA-Z0-9_-]+$')
        GROUP BY contract_address
      )

      SELECT 
        contract_address,
        SPLIT(contract_address, '.')[OFFSET(0)] as deployer_address,
        SPLIT(contract_address, '.')[OFFSET(1)] as contract_name,
        transaction_count,
        last_seen,
        'discovered' as status,
        
        -- Contract Analysis Columns
        CAST(NULL AS JSON) as contract_interface,
        CAST(NULL AS ARRAY<STRING>) as interface_functions,
        CAST(NULL AS INT64) as interface_function_count,
        CAST(NULL AS JSON) as contract_info,
        CAST(NULL AS STRING) as source_code,
        CAST(NULL AS INT64) as source_code_length,
        CAST(NULL AS STRING) as abi_json,
        CAST(NULL AS JSON) as parsed_abi,
        CAST(NULL AS STRING) as deployment_tx_id,
        CAST(NULL AS INT64) as deployment_block_height,
        CAST(NULL AS BOOLEAN) as canonical,
        
        -- Analysis Status
        'pending' as analysis_status,
        CAST(NULL AS ARRAY<STRING>) as analysis_errors,
        CAST(NULL AS TIMESTAMP) as analyzed_at,
        CAST(NULL AS INT64) as analysis_duration_ms,
        
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as updated_at
      FROM discovered_contracts
      ORDER BY transaction_count DESC, last_seen DESC
    `;

    await bigquery.query({
      query: discoverContractsQuery,
      jobTimeoutMs: 60000, // 1 minute timeout for the discovery query
    });

    console.log(`Contract discovery completed successfully`);

    const duration = Date.now() - startTime;

    console.log(`${martName} refreshed successfully in ${duration}ms`);

    // Revalidate contract-related endpoints 
    revalidatePath('/api/contracts');

    return NextResponse.json({
      mart_name: martName,
      status: 'success',
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Failed to refresh ${martName}:`, error);

    return NextResponse.json({
      mart_name: martName,
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Helper function to fetch token metadata from Stacks blockchain
async function fetchTokenMetadata(contractAddress: string) {
  if (contractAddress === 'STX') {
    // Handle native STX token
    try {
      const totalSupply = await getStxTotalSupply();
      return {
        name: 'Stacks',
        symbol: 'STX', 
        decimals: 6,
        tokenUri: null,
        imageUrl: 'https://cryptologos.cc/logos/stacks-stx-logo.png',
        description: 'Stacks native token',
        totalSupply: totalSupply,
      };
    } catch (error) {
      console.error('Error fetching STX total supply:', error);
      return {
        name: 'Stacks',
        symbol: 'STX', 
        decimals: 6,
        tokenUri: null,
        imageUrl: 'https://cryptologos.cc/logos/stacks-stx-logo.png',
        description: 'Stacks native token',
        totalSupply: null,
      };
    }
  }

  try {
    // Use the existing blockchain API client to make SIP-010 contract calls
    console.log(`Fetching metadata for token: ${contractAddress}`);
    
    // Make parallel calls to get token metadata
    const [name, symbol, decimals, tokenUri, totalSupply] = await Promise.allSettled([
      callReadOnly(contractAddress, 'get-name'),
      callReadOnly(contractAddress, 'get-symbol'), 
      callReadOnly(contractAddress, 'get-decimals'),
      callReadOnly(contractAddress, 'get-token-uri'),
      callReadOnly(contractAddress, 'get-total-supply'),
    ]);

    const extractValue = (result: PromiseSettledResult<any>) => {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
      return null;
    };

    const nameValue = extractValue(name);
    const symbolValue = extractValue(symbol);  
    const decimalsValue = extractValue(decimals);
    const tokenUriValue = extractValue(tokenUri);
    const totalSupplyValue = extractValue(totalSupply);

    // Fetch image URL from token URI if available
    let imageUrl = null;
    let description = null;

    if (tokenUriValue) {
      try {
        const extractedUri = extractValue(tokenUriValue);
        if (extractedUri && typeof extractedUri === 'string') {
          console.log(`🖼️ Fetching metadata from URI: ${extractedUri}`);
          
          const metadataResponse = await fetch(extractedUri, {
            signal: AbortSignal.timeout(5000), // 5 second timeout
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Lakehouse-Token-Indexer/1.0'
            }
          });
          
          if (metadataResponse.ok) {
            try {
              const metadata = await metadataResponse.json();
              const rawImageUrl = metadata.image || null;
              imageUrl = processImageUrl(rawImageUrl);
              description = metadata.description || null;
              console.log(`✅ Token metadata fetched: image=${imageUrl ? 'processed' : 'null'}`);
            } catch (jsonError) {
              console.warn(`⚠️ Failed to parse token metadata JSON:`, jsonError);
            }
          } else {
            console.warn(`⚠️ Failed to fetch token metadata: ${metadataResponse.status} ${metadataResponse.statusText}`);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch token URI metadata:', error);
      }
    }

    return {
      name: nameValue || extractTokenNameFromContract(contractAddress),
      symbol: symbolValue || extractTokenSymbolFromContract(contractAddress),
      decimals: decimalsValue || 6, // Default to 6 for Stacks ecosystem
      tokenUri: tokenUriValue,
      imageUrl: imageUrl,
      description: description,
      totalSupply: totalSupplyValue,
    };

  } catch (error) {
    console.error(`Error fetching metadata for ${contractAddress}:`, error);
    return {
      name: extractTokenNameFromContract(contractAddress),
      symbol: extractTokenSymbolFromContract(contractAddress),
      decimals: 6,
      tokenUri: null,
      imageUrl: null,
      description: null,
      totalSupply: null,
    };
  }
}

// Fallback extractors from contract address
function extractTokenNameFromContract(contractAddress: string): string {
  const parts = contractAddress.split('.');
  return parts[parts.length - 1].replace(/-/g, ' ').toUpperCase();
}

function extractTokenSymbolFromContract(contractAddress: string): string {
  const parts = contractAddress.split('.');
  const name = parts[parts.length - 1];
  return name.length <= 5 ? name.toUpperCase() : name.substring(0, 4).toUpperCase();
}

// Helper function to process image URLs and handle different formats
function processImageUrl(rawImageUrl: string | null): string | null {
  if (!rawImageUrl || typeof rawImageUrl !== 'string') {
    return null;
  }

  try {
    // Handle data URIs (base64 encoded images)
    if (rawImageUrl.startsWith('data:image/')) {
      console.log('📷 Found data URI image');
      return rawImageUrl; // Keep data URIs as-is
    }

    // Handle IPFS URLs
    if (rawImageUrl.startsWith('ipfs://')) {
      const ipfsHash = rawImageUrl.replace('ipfs://', '');
      const gatewayUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
      console.log(`🌐 Converted IPFS URL: ${rawImageUrl} -> ${gatewayUrl}`);
      return gatewayUrl;
    }

    // Handle IPFS gateway URLs that might be malformed
    if (rawImageUrl.includes('/ipfs/')) {
      // Extract the hash and use a reliable gateway
      const hashMatch = rawImageUrl.match(/\/ipfs\/([^\/?]+)/);
      if (hashMatch) {
        const ipfsHash = hashMatch[1];
        const gatewayUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
        console.log(`🔧 Fixed IPFS gateway URL: ${rawImageUrl} -> ${gatewayUrl}`);
        return gatewayUrl;
      }
    }

    // Handle regular HTTP/HTTPS URLs
    if (rawImageUrl.startsWith('http://') || rawImageUrl.startsWith('https://')) {
      // Basic URL validation
      try {
        new URL(rawImageUrl);
        return rawImageUrl;
      } catch {
        console.warn(`⚠️ Invalid HTTP URL: ${rawImageUrl}`);
        return null;
      }
    }

    // Handle relative URLs or other formats
    console.warn(`❓ Unknown image URL format: ${rawImageUrl}`);
    return null;

  } catch (error) {
    console.error('Error processing image URL:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
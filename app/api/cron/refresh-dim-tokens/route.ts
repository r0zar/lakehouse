import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { callReadOnly, getStxTotalSupply } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const martName = 'dim_tokens';

  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${martName} refresh...`);

    // Step 1: Create the simplified dim_tokens table schema
    const createTokensTableQuery = `
      CREATE OR REPLACE TABLE crypto_data.dim_tokens AS 
      WITH analyzed_contracts AS (
        SELECT 
          contract_address,
          transaction_count,
          last_seen,
          parsed_abi
        FROM crypto_data.dim_contracts
        WHERE analysis_status = 'analyzed'
          AND parsed_abi IS NOT NULL
      ),
      
      potential_tokens AS (
        SELECT 
          *,
          -- Extract function names from parsed_abi
          ARRAY(
            SELECT JSON_EXTRACT_SCALAR(func, '$.name') 
            FROM UNNEST(JSON_EXTRACT_ARRAY(parsed_abi, '$.functions')) AS func
            WHERE JSON_EXTRACT_SCALAR(func, '$.name') IS NOT NULL
          ) as function_names
          
        FROM analyzed_contracts
      ),
      
      token_analysis AS (
        SELECT 
          *,
          -- Check for minimum token functions
          (
            'transfer' IN UNNEST(function_names) AND
            'get-balance' IN UNNEST(function_names) AND
            'get-total-supply' IN UNNEST(function_names)
          ) as has_minimum_token_functions,
          
          -- Count SIP-010 functions present  
          (
            SELECT COUNT(*)
            FROM UNNEST(['get-name', 'get-symbol', 'get-decimals', 'get-total-supply', 'get-token-uri', 'transfer', 'get-balance']) AS required_func
            WHERE required_func IN UNNEST(function_names)
          ) as sip010_function_count
          
        FROM potential_tokens
      )
      
      SELECT 
        contract_address,
        
        -- Token Classification
        CASE 
          WHEN sip010_function_count >= 5 AND has_minimum_token_functions THEN 'sip010_token'
          WHEN sip010_function_count >= 3 AND has_minimum_token_functions THEN 'partial_token'
          ELSE 'unknown'
        END as token_type,
        
        -- Essential Token Metadata (to be populated by validation job)
        CAST(NULL AS STRING) as token_name,
        CAST(NULL AS STRING) as token_symbol,
        CAST(NULL AS INT64) as decimals,
        CAST(NULL AS STRING) as total_supply,
        CAST(NULL AS STRING) as token_uri,
        CAST(NULL AS STRING) as image_url,
        CAST(NULL AS STRING) as description,
        
        -- Basic Tracking
        transaction_count,
        last_seen,
        'pending' as validation_status,
        
        CURRENT_TIMESTAMP() as created_at,
        CURRENT_TIMESTAMP() as updated_at
        
      FROM token_analysis
      WHERE has_minimum_token_functions = true
      ORDER BY 
        sip010_function_count DESC,
        transaction_count DESC,
        last_seen DESC
    `;

    await bigquery.query({
      query: createTokensTableQuery,
      jobTimeoutMs: 120000, // 2 minute timeout for token discovery
    });

    console.log(`Token discovery completed successfully`);

    // Step 2: Enrich tokens with metadata from blockchain
    let enrichmentResults;
    try {
      enrichmentResults = await enrichTokenMetadata();
    } catch (enrichmentError: any) {
      console.warn(`Token metadata enrichment failed but continuing: ${enrichmentError.message}`);
      enrichmentResults = { warning: 'Token metadata enrichment failed', error: enrichmentError.message };
    }

    // Step 3: Get count of discovered tokens
    const getTokenCountQuery = `
      SELECT 
        COUNT(*) as total_tokens,
        COUNTIF(token_type = 'sip010_token') as sip010_tokens,
        COUNTIF(token_type = 'partial_token') as partial_tokens,
        COUNTIF(sip010_function_count = 7) as complete_sip010_tokens,
        AVG(sip010_function_count) as avg_sip010_functions
      FROM crypto_data.dim_tokens
    `;

    const [countResult] = await bigquery.query({
      query: getTokenCountQuery,
      jobTimeoutMs: 30000,
    });

    const tokenStats = countResult[0] || {};

    const duration = Date.now() - startTime;

    console.log(`${martName} refreshed successfully in ${duration}ms`);
    console.log(`📊 Token Statistics:`, tokenStats);

    // Revalidate token-related endpoints 
    revalidatePath('/api/tokens');

    return NextResponse.json({
      mart_name: martName,
      status: 'success',
      duration_ms: duration,
      token_statistics: {
        total_tokens: Number(tokenStats.total_tokens || 0),
        sip010_tokens: Number(tokenStats.sip010_tokens || 0),
        partial_tokens: Number(tokenStats.partial_tokens || 0),
        complete_sip010_tokens: Number(tokenStats.complete_sip010_tokens || 0),
        avg_sip010_functions: Number(tokenStats.avg_sip010_functions || 0),
      },
      enrichment_results: enrichmentResults,
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

// Enrich tokens with metadata from blockchain
async function enrichTokenMetadata(): Promise<any> {
  console.log('🔍 Starting token metadata enrichment...');

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  try {
    // Get tokens that need validation (pending status)
    const tokensQuery = `
      SELECT contract_address, token_type, transaction_count
      FROM crypto_data.dim_tokens 
      WHERE validation_status = 'pending'
        AND token_type IN ('sip010_token', 'partial_token')
      ORDER BY 
        CASE WHEN token_type = 'sip010_token' THEN 1 ELSE 2 END,
        transaction_count DESC
      LIMIT 20
    `;

    const [rows] = await bigquery.query({
      query: tokensQuery,
      jobTimeoutMs: 30000,
    });

    console.log(`🎯 Found ${rows.length} tokens to enrich with metadata`);

    // Process tokens in smaller batches to avoid overwhelming the Stacks API
    const batchSize = 3;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`📦 Processing token batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}`);

      // Process batch in parallel with timeout
      const metadataPromises = batch.map(async (row: any) => {
        try {
          console.log(`🔄 Fetching metadata for token: ${row.contract_address}`);
          const metadata = await Promise.race([
            fetchTokenMetadata(row.contract_address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
          ]);

          return { contract_address: row.contract_address, metadata, error: null };
        } catch (error: any) {
          console.warn(`⚠️ Failed to fetch metadata for ${row.contract_address}: ${error.message}`);
          return { contract_address: row.contract_address, metadata: null, error: error.message };
        }
      });

      const results = await Promise.allSettled(metadataPromises);

      // Update tokens with metadata
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.metadata) {
          const { contract_address, metadata } = result.value;
          await updateTokenMetadata(contract_address, metadata);
          successCount++;
        } else if (result.status === 'fulfilled' && result.value.error) {
          const { contract_address, error } = result.value;
          await markTokenValidated(contract_address, 'failed', [error]);
          failureCount++;
        } else {
          skippedCount++;
        }
      }

      // Add delay between batches to be respectful to the Stacks API
      if (i + batchSize < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
      }
    }

    console.log('✅ Token metadata enrichment completed');

    return {
      total_processed: successCount + failureCount + skippedCount,
      successful_enrichments: successCount,
      failed_enrichments: failureCount,
      skipped: skippedCount
    };

  } catch (error) {
    console.error('❌ Error during token metadata enrichment:', error);
    throw error;
  }
}

// Update token with fetched metadata
async function updateTokenMetadata(contractAddress: string, metadata: any): Promise<void> {
  const updateQuery = `
    UPDATE crypto_data.dim_tokens 
    SET 
      token_name = @tokenName,
      token_symbol = @tokenSymbol,
      decimals = @decimals,
      total_supply = @totalSupply,
      token_uri = @tokenUri,
      image_url = @imageUrl,
      description = @description,
      validation_status = 'completed',
      updated_at = CURRENT_TIMESTAMP()
    WHERE contract_address = @contractAddress
  `;

  await bigquery.query({
    query: updateQuery,
    params: {
      contractAddress: contractAddress,
      tokenName: metadata.name || null,
      tokenSymbol: metadata.symbol || null,
      decimals: metadata.decimals || null,
      totalSupply: metadata.totalSupply ? metadata.totalSupply.toString() : null,
      tokenUri: metadata.tokenUri || null,
      imageUrl: metadata.imageUrl || null,
      description: metadata.description || null
    },
    types: {
      contractAddress: 'STRING',
      tokenName: 'STRING',
      tokenSymbol: 'STRING',
      decimals: 'INT64',
      totalSupply: 'STRING',
      tokenUri: 'STRING',
      imageUrl: 'STRING',
      description: 'STRING'
    },
    jobTimeoutMs: 30000,
  });

  console.log(`✅ Updated token metadata for ${contractAddress}: ${metadata.name} (${metadata.symbol})`);
}

// Mark token as validated (failed)
async function markTokenValidated(contractAddress: string, status: string, errors: string[]): Promise<void> {
  const updateQuery = `
    UPDATE crypto_data.dim_tokens 
    SET 
      validation_status = @status,
      updated_at = CURRENT_TIMESTAMP()
    WHERE contract_address = @contractAddress
  `;

  await bigquery.query({
    query: updateQuery,
    params: {
      contractAddress: contractAddress,
      status: status
    },
    types: {
      contractAddress: 'STRING',
      status: 'STRING'
    },
    jobTimeoutMs: 30000,
  });
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
      let ipfsHash = rawImageUrl.replace('ipfs://', '');
      // Handle redundant ipfs/ prefix (e.g., ipfs://ipfs/hash)
      if (ipfsHash.startsWith('ipfs/')) {
        ipfsHash = ipfsHash.replace('ipfs/', '');
      }
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
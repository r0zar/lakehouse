import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { callReadOnly, getStxTotalSupply } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'analyze_tokens';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${jobName}...`);

    // Analyze tokens for metadata information
    let analysisResults;
    try {
      analysisResults = await analyzeTokens();
    } catch (analysisError: any) {
      console.error(`Token analysis failed: ${analysisError.message}`);
      analysisResults = { error: 'Token analysis failed', message: analysisError.message };
    }

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed successfully in ${duration}ms`);

    // Revalidate token-related endpoints 
    revalidatePath('/api/tokens');

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      analysis_results: analysisResults,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Failed to run ${jobName}:`, error);

    return NextResponse.json({
      job_name: jobName,
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Analyze tokens for metadata information
async function analyzeTokens(): Promise<any> {
  console.log('🔍 Starting token metadata analysis...');
  
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  
  try {
    // Get tokens that need analysis (pending status)
    const tokensQuery = `
      SELECT contract_address, token_type, transaction_count
      FROM crypto_data.dim_tokens 
      WHERE validation_status = 'pending'
        AND token_type IN ('sip010_token', 'partial_token')
      ORDER BY 
        CASE WHEN token_type = 'sip010_token' THEN 1 ELSE 2 END,
        transaction_count DESC
      LIMIT 50
    `;

    const [rows] = await bigquery.query({
      query: tokensQuery,
      jobTimeoutMs: 60000,
    });

    console.log(`🎯 Found ${rows.length} tokens to analyze`);

    // Process tokens in small batches to be gentle on APIs
    const batchSize = 5;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`📦 Processing token batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(rows.length/batchSize)} (${batch.length} tokens)`);
      
      // Process batch in parallel with timeout
      const analysisPromises = batch.map(async (row: any) => {
        try {
          console.log(`🔄 Analyzing token: ${row.contract_address}`);
          const analysisResult = await Promise.race([
            analyzeToken(row.contract_address),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
          ]);
          
          return { contract_address: row.contract_address, analysis: analysisResult, error: null };
        } catch (error: any) {
          console.warn(`⚠️ Failed to analyze ${row.contract_address}: ${error.message}`);
          return { contract_address: row.contract_address, analysis: null, error: error.message };
        }
      });

      const results = await Promise.allSettled(analysisPromises);
      
      // Update tokens with analysis results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.analysis) {
          const { contract_address, analysis } = result.value;
          await updateTokenMetadata(contract_address, analysis);
          successCount++;
        } else if (result.status === 'fulfilled' && result.value.error) {
          const { contract_address, error } = result.value;
          await markTokenAnalyzed(contract_address, 'failed');
          failureCount++;
        } else {
          skippedCount++;
        }
      }

      // Short delay between batches to be respectful to APIs
      if (i + batchSize < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    console.log('✅ Token analysis completed');
    
    return {
      total_processed: successCount + failureCount + skippedCount,
      successful_analyses: successCount,
      failed_analyses: failureCount,
      skipped: skippedCount
    };
    
  } catch (error) {
    console.error('❌ Error during token analysis:', error);
    throw error;
  }
}

// Analyze a single token for metadata
async function analyzeToken(contractAddress: string): Promise<any> {
  try {
    // Handle native STX token
    if (contractAddress === 'STX') {
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
    }

    console.log(`📋 Fetching metadata for token: ${contractAddress}`);

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
        // Handle token URI value extraction (in case it's a Clarity object)
        let uriString = tokenUriValue;
        if (typeof tokenUriValue === 'object' && tokenUriValue !== null) {
          // Try to extract string value from Clarity response
          if ('value' in tokenUriValue) {
            uriString = tokenUriValue.value;
          } else {
            console.warn(`⚠️ Token URI is object but no value field: ${JSON.stringify(tokenUriValue)}`);
            uriString = null;
          }
        }

        // Ensure we have a valid string
        if (typeof uriString === 'string' && uriString.trim()) {
          console.log(`🖼️ Fetching metadata from URI: ${uriString}`);

          const metadataResponse = await fetch(uriString, {
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
        } else {
          console.warn(`⚠️ Invalid token URI string: ${uriString}`);
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

// Update token with analysis results
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
    jobTimeoutMs: 60000,
  });

  console.log(`✅ Updated token metadata for ${contractAddress}: ${metadata.name} (${metadata.symbol})`);
}

// Mark token as analyzed (failed)
async function markTokenAnalyzed(contractAddress: string, status: string): Promise<void> {
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
    jobTimeoutMs: 60000,
  });
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
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'refresh_token_metadata_debug';
  
  try {
    console.log(`Starting ${jobName}...`);

    // Get all tokens that have token_uri but missing image_url or description
    const tokensQuery = `
      SELECT contract_address, token_uri
      FROM crypto_data.dim_tokens 
      WHERE token_uri IS NOT NULL 
        AND token_uri != ''
        AND (image_url IS NULL OR description IS NULL)
      ORDER BY transaction_count DESC
      LIMIT 50
    `;

    const [rows] = await bigquery.query({
      query: tokensQuery,
      jobTimeoutMs: 30000,
    });

    console.log(`🎯 Found ${rows.length} tokens to refresh metadata for`);

    let successCount = 0;
    let failureCount = 0;

    // Process tokens one by one to be gentle on external APIs
    for (const row of rows) {
      try {
        console.log(`🔄 Refreshing metadata for: ${row.contract_address}`);
        console.log(`📋 Token URI: ${row.token_uri}`);
        
        const metadata = await fetchTokenUriMetadata(row.token_uri);
        
        if (metadata.imageUrl || metadata.description) {
          await updateTokenUriMetadata(row.contract_address, metadata);
          successCount++;
          console.log(`✅ Updated metadata for ${row.contract_address}: image=${metadata.imageUrl ? 'yes' : 'no'}, desc=${metadata.description ? 'yes' : 'no'}`);
        } else {
          console.log(`⚠️ No metadata found for ${row.contract_address}`);
          failureCount++;
        }

        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        console.warn(`❌ Failed to refresh ${row.contract_address}: ${error.message}`);
        failureCount++;
      }
    }

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed in ${duration}ms`);

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      tokens_processed: rows.length,
      successful_updates: successCount,
      failed_updates: failureCount,
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

// Fetch metadata from token URI
async function fetchTokenUriMetadata(tokenUri: string): Promise<{ imageUrl: string | null, description: string | null }> {
  try {
    // Handle token URI value extraction (in case it's still an object)
    let uriString = tokenUri;
    if (typeof tokenUri === 'object' && tokenUri !== null) {
      // Try to extract string value from Clarity response
      if ('value' in tokenUri && typeof (tokenUri as any).value === 'string') {
        uriString = (tokenUri as any).value;
      } else {
        console.warn(`⚠️ Token URI is object but no value field: ${JSON.stringify(tokenUri)}`);
        return { imageUrl: null, description: null };
      }
    }

    // Ensure we have a valid string
    if (typeof uriString !== 'string' || !uriString.trim()) {
      console.warn(`⚠️ Invalid token URI: ${uriString}`);
      return { imageUrl: null, description: null };
    }

    console.log(`🌐 Fetching metadata from: ${uriString}`);

    const metadataResponse = await fetch(uriString, {
      signal: AbortSignal.timeout(8000), // 8 second timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Lakehouse-Token-Indexer/1.0'
      }
    });

    if (!metadataResponse.ok) {
      console.warn(`⚠️ HTTP ${metadataResponse.status}: ${metadataResponse.statusText}`);
      return { imageUrl: null, description: null };
    }

    const metadata = await metadataResponse.json();
    
    const rawImageUrl = metadata.image || null;
    const imageUrl = processImageUrl(rawImageUrl);
    const description = metadata.description || null;

    return { imageUrl, description };

  } catch (error: any) {
    console.warn(`⚠️ Failed to fetch token URI metadata: ${error.message}`);
    return { imageUrl: null, description: null };
  }
}

// Update token with refreshed metadata
async function updateTokenUriMetadata(contractAddress: string, metadata: { imageUrl: string | null, description: string | null }): Promise<void> {
  const updateQuery = `
    UPDATE crypto_data.dim_tokens 
    SET 
      image_url = @imageUrl,
      description = @description,
      updated_at = CURRENT_TIMESTAMP()
    WHERE contract_address = @contractAddress
  `;

  await bigquery.query({
    query: updateQuery,
    params: {
      contractAddress: contractAddress,
      imageUrl: metadata.imageUrl,
      description: metadata.description
    },
    types: {
      contractAddress: 'STRING',
      imageUrl: 'STRING',
      description: 'STRING'
    },
    jobTimeoutMs: 30000,
  });
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
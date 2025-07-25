import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';
import { callReadOnly } from '@/lib/stacks-api';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🎯 Starting token validation...');

    // Step 1: Get tokens that need validation
    const getPendingTokensQuery = `
      SELECT 
        contract_address,
        deployer_address,
        contract_name,
        token_type,
        available_functions,
        transaction_count
      FROM crypto_data.dim_tokens
      WHERE validation_status = 'pending'
      ORDER BY 
        CASE WHEN token_type = 'sip010_token' THEN 1 ELSE 2 END,
        transaction_count DESC
      LIMIT 30
    `;

    const [pendingTokens] = await bigquery.query({
      query: getPendingTokensQuery,
      jobTimeoutMs: 30000,
    });

    if (pendingTokens.length === 0) {
      console.log('✅ No tokens pending validation');
      return NextResponse.json({
        status: 'success',
        message: 'No tokens pending validation',
        tokens_processed: 0,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🎯 Found ${pendingTokens.length} tokens to validate`);

    // Step 2: Validate each token
    const validationResults = [];
    const batchSize = 3; // Process in small batches to avoid rate limits

    for (let i = 0; i < pendingTokens.length; i += batchSize) {
      const batch = pendingTokens.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pendingTokens.length / batchSize)}`);

      const batchPromises = batch.map(async (token) => {
        const tokenStartTime = Date.now();
        const contractId = token.contract_address;
        const availableFunctions = token.available_functions || [];

        try {
          console.log(`  🎯 Validating token ${contractId}...`);

          // Prepare parallel metadata calls based on available functions
          const metadataCalls = [];
          
          if (availableFunctions.includes('get-name')) {
            metadataCalls.push(
              callReadOnly(contractId, 'get-name').then(result => ({ field: 'name', value: result }))
            );
          }
          
          if (availableFunctions.includes('get-symbol')) {
            metadataCalls.push(
              callReadOnly(contractId, 'get-symbol').then(result => ({ field: 'symbol', value: result }))
            );
          }
          
          if (availableFunctions.includes('get-decimals')) {
            metadataCalls.push(
              callReadOnly(contractId, 'get-decimals').then(result => ({ field: 'decimals', value: result }))
            );
          }
          
          if (availableFunctions.includes('get-total-supply')) {
            metadataCalls.push(
              callReadOnly(contractId, 'get-total-supply').then(result => ({ field: 'totalSupply', value: result }))
            );
          }
          
          if (availableFunctions.includes('get-token-uri')) {
            metadataCalls.push(
              callReadOnly(contractId, 'get-token-uri').then(result => ({ field: 'tokenUri', value: result }))
            );
          }

          // Execute all metadata calls in parallel
          const metadataResults = await Promise.allSettled(metadataCalls);

          // Process results
          let tokenName = null;
          let tokenSymbol = null;
          let decimals = null;
          let totalSupply = null;
          let tokenUri = null;
          let imageUrl = null;
          let description = null;
          const errors = [];

          for (let j = 0; j < metadataResults.length; j++) {
            const result = metadataResults[j];
            if (result.status === 'fulfilled' && result.value) {
              const { field, value } = result.value;
              
              switch (field) {
                case 'name':
                  tokenName = value && typeof value === 'string' ? value : null;
                  break;
                case 'symbol':
                  tokenSymbol = value && typeof value === 'string' ? value : null;
                  break;
                case 'decimals':
                  // Handle both string and number decimals
                  if (typeof value === 'string') {
                    decimals = parseInt(value, 10);
                  } else if (typeof value === 'number') {
                    decimals = value;
                  }
                  break;
                case 'totalSupply':
                  totalSupply = value ? String(value) : null;
                  break;
                case 'tokenUri':
                  tokenUri = value && typeof value === 'string' ? value : null;
                  break;
              }
            } else if (result.status === 'rejected') {
              errors.push(`Failed to fetch ${metadataCalls[j]}: ${result.reason}`);
            }
          }

          // Fetch additional metadata from token URI if available
          if (tokenUri) {
            try {
              console.log(`  🖼️ Fetching metadata from URI: ${tokenUri}`);
              
              // Handle IPFS URIs
              let fetchUri = tokenUri;
              if (tokenUri.startsWith('ipfs://')) {
                fetchUri = `https://ipfs.io/ipfs/${tokenUri.replace('ipfs://', '')}`;
              }
              
              const metadataResponse = await fetch(fetchUri, {
                signal: AbortSignal.timeout(5000),
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Lakehouse-Token-Validator/1.0'
                }
              });
              
              if (metadataResponse.ok) {
                const metadata = await metadataResponse.json();
                
                // Override with metadata from URI if not already set
                if (!tokenName && metadata.name) {
                  tokenName = metadata.name;
                }
                if (!description && metadata.description) {
                  description = metadata.description;
                }
                
                // Process image URL
                if (metadata.image) {
                  let rawImageUrl = metadata.image;
                  if (rawImageUrl.startsWith('ipfs://')) {
                    imageUrl = `https://ipfs.io/ipfs/${rawImageUrl.replace('ipfs://', '')}`;
                  } else if (rawImageUrl.startsWith('http')) {
                    imageUrl = rawImageUrl;
                  }
                }
                
                console.log(`  ✅ Metadata fetched from URI`);
              } else {
                errors.push(`Failed to fetch token URI metadata: ${metadataResponse.status}`);
              }
            } catch (error: any) {
              errors.push(`Token URI fetch error: ${error.message}`);
            }
          }

          // Fallback name and symbol extraction if not available
          if (!tokenName) {
            const parts = contractId.split('.');
            tokenName = parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          }
          
          if (!tokenSymbol) {
            const parts = contractId.split('.');
            const name = parts[parts.length - 1];
            tokenSymbol = name.length <= 5 ? name.toUpperCase() : name.substring(0, 4).toUpperCase();
          }

          const tokenDuration = Date.now() - tokenStartTime;

          return {
            contract_address: contractId,
            validation_status: 'validated',
            token_name: tokenName,
            token_symbol: tokenSymbol,
            decimals: decimals,
            total_supply: totalSupply,
            token_uri: tokenUri,
            image_url: imageUrl,
            description: description,
            validation_errors: errors.length > 0 ? errors : null,
            validated_at: new Date().toISOString(),
            validation_duration_ms: tokenDuration,
          };

        } catch (error: any) {
          console.error(`❌ Error validating token ${contractId}:`, error);
          return {
            contract_address: contractId,
            validation_status: 'failed',
            token_name: null,
            token_symbol: null,
            decimals: null,
            total_supply: null,
            token_uri: null,
            image_url: null,
            description: null,
            validation_errors: [error.message],
            validated_at: new Date().toISOString(),
            validation_duration_ms: Date.now() - tokenStartTime,
          };
        }
      });

      // Wait for the batch to complete
      const batchResults = await Promise.all(batchPromises);
      validationResults.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < pendingTokens.length) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // Step 3: Update the database with validation results
    console.log('💾 Updating database with validation results...');

    for (const result of validationResults) {
      const updateQuery = `
        UPDATE crypto_data.dim_tokens
        SET 
          validation_status = @validation_status,
          token_name = @token_name,
          token_symbol = @token_symbol,
          decimals = @decimals,
          total_supply = @total_supply,
          token_uri = @token_uri,
          image_url = @image_url,
          description = @description,
          validation_errors = @validation_errors,
          validated_at = TIMESTAMP(@validated_at),
          validation_duration_ms = @validation_duration_ms,
          updated_at = CURRENT_TIMESTAMP()
        WHERE contract_address = @contract_address
      `;

      await bigquery.query({
        query: updateQuery,
        params: {
          contract_address: result.contract_address,
          validation_status: result.validation_status,
          token_name: result.token_name,
          token_symbol: result.token_symbol,
          decimals: result.decimals,
          total_supply: result.total_supply,
          token_uri: result.token_uri,
          image_url: result.image_url,
          description: result.description,
          validation_errors: result.validation_errors || [],
          validated_at: result.validated_at,
          validation_duration_ms: result.validation_duration_ms,
        },
        types: {
          contract_address: 'STRING',
          validation_status: 'STRING',
          token_name: 'STRING',
          token_symbol: 'STRING',
          decimals: 'INT64',
          total_supply: 'STRING',
          token_uri: 'STRING',
          image_url: 'STRING',
          description: 'STRING',
          validation_errors: ['STRING'],
          validated_at: 'STRING',
          validation_duration_ms: 'INT64',
        },
        jobTimeoutMs: 30000,
      });
    }

    const duration = Date.now() - startTime;
    const successCount = validationResults.filter(r => r.validation_status === 'validated').length;
    const failureCount = validationResults.filter(r => r.validation_status === 'failed').length;

    console.log(`✅ Token validation completed: ${successCount} success, ${failureCount} failures in ${duration}ms`);

    // Revalidate token-related endpoints
    revalidatePath('/api/tokens');

    return NextResponse.json({
      status: 'success',
      tokens_processed: validationResults.length,
      successful_validations: successCount,
      failed_validations: failureCount,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Token validation failed:', error);

    return NextResponse.json({
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
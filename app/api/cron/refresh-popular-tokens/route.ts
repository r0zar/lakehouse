import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const jobName = 'refresh_popular_tokens';

  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting ${jobName}...`);

    // Get top 6 most actively traded tokens (excluding STX)
    const topTokensQuery = `
      SELECT 
        contract_address,
        token_symbol,
        token_name,
        image_url,
        decimals,
        transaction_count,
        CURRENT_TIMESTAMP() as updated_at
      FROM crypto_data.dim_tokens 
      WHERE token_symbol IS NOT NULL 
        AND transaction_count IS NOT NULL
        AND contract_address != 'STX'
      ORDER BY transaction_count DESC
      LIMIT 6
    `;

    const [rows] = await bigquery.query({
      query: topTokensQuery,
      jobTimeoutMs: 30000,
    });

    console.log(`🎯 Found ${rows.length} popular tokens`);

    // Create or update popular tokens cache table
    const createCacheTableQuery = `
      CREATE TABLE IF NOT EXISTS crypto_data.cache_popular_tokens (
        contract_address STRING,
        token_symbol STRING,
        token_name STRING,
        image_url STRING,
        decimals INT64,
        transaction_count INT64,
        rank INT64,
        updated_at TIMESTAMP
      )
    `;

    await bigquery.query({
      query: createCacheTableQuery,
      jobTimeoutMs: 30000,
    });

    // Clear existing cache and insert new data
    const clearCacheQuery = `DELETE FROM crypto_data.cache_popular_tokens WHERE TRUE`;
    
    await bigquery.query({
      query: clearCacheQuery,
      jobTimeoutMs: 30000,
    });

    // Insert new popular tokens with ranking
    const insertCacheQuery = `
      INSERT INTO crypto_data.cache_popular_tokens (
        contract_address,
        token_symbol,
        token_name,
        image_url,
        decimals,
        transaction_count,
        rank,
        updated_at
      ) VALUES ${rows.map((row, index) => `(
        '${row.contract_address}',
        '${row.token_symbol?.replace(/'/g, "\\'")}',
        '${row.token_name?.replace(/'/g, "\\'")}',
        ${row.image_url ? `'${row.image_url}'` : 'NULL'},
        ${row.decimals || 'NULL'},
        ${row.transaction_count || 0},
        ${index + 1},
        CURRENT_TIMESTAMP()
      )`).join(', ')}
    `;

    await bigquery.query({
      query: insertCacheQuery,
      jobTimeoutMs: 30000,
    });

    const duration = Date.now() - startTime;

    console.log(`${jobName} completed successfully in ${duration}ms`);
    console.log(`📊 Updated ${rows.length} popular tokens in cache`);

    // Revalidate token-related endpoints 
    revalidatePath('/api/popular-tokens');
    revalidatePath('/token-buyers-sellers');

    return NextResponse.json({
      job_name: jobName,
      status: 'success',
      duration_ms: duration,
      popular_tokens_updated: rows.length,
      tokens: rows.map((row, index) => ({
        rank: index + 1,
        symbol: row.token_symbol,
        name: row.token_name,
        transaction_count: row.transaction_count
      })),
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

export async function GET(request: NextRequest) {
  return POST(request);
}
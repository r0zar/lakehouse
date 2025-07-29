import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

// Cache control headers for token prices (longer cache since prices don't change as frequently)
const PRICE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=7200',
  'CDN-Cache-Control': 'public, max-age=1800',
  'Vercel-CDN-Cache-Control': 'public, max-age=1800'
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tokenId = searchParams.get('token');
    const limit = parseInt(searchParams.get('limit') || '100');
    const minPrice = parseFloat(searchParams.get('minPrice') || '0');

    // Validate parameters
    if (limit < 1 || limit > 1000) {
      return NextResponse.json({ error: 'Limit must be between 1 and 1000' }, { status: 400 });
    }
    if (minPrice < 0) {
      return NextResponse.json({ error: 'MinPrice must be >= 0' }, { status: 400 });
    }

    // Build WHERE clause
    let whereClause = `WHERE usd_price >= ${minPrice}`;
    if (tokenId) {
      whereClause += ` AND token_contract_id = '${tokenId}'`;
    }

    // Query current token prices
    const query = `
      SELECT 
        token_contract_id,
        sbtc_price,
        usd_price,
        price_source,
        iterations_to_converge,
        final_convergence_percent,
        calculated_at,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', calculated_at) as calculated_at_iso
      FROM \`crypto_data.current_token_prices\`
      ${whereClause}
      ORDER BY usd_price DESC
      LIMIT ${limit}
    `;

    const [results] = await bigquery.query(query);

    // Transform results
    const prices = results.map((row: any) => ({
      token_contract_id: row.token_contract_id,
      sbtc_price: parseFloat(row.sbtc_price),
      usd_price: parseFloat(row.usd_price),
      price_source: row.price_source,
      iterations_to_converge: row.iterations_to_converge,
      final_convergence_percent: row.final_convergence_percent ? parseFloat(row.final_convergence_percent) : null,
      calculated_at: row.calculated_at_iso
    }));

    // Get summary stats
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_tokens,
        MIN(usd_price) as min_price,
        MAX(usd_price) as max_price,
        AVG(usd_price) as avg_price,
        MAX(calculated_at) as last_updated,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MAX(calculated_at)) as last_updated_iso
      FROM \`crypto_data.current_token_prices\`
      ${whereClause}
    `;

    const [summaryResults] = await bigquery.query(summaryQuery);
    const summary = summaryResults[0] ? {
      total_tokens: parseInt(summaryResults[0].total_tokens),
      min_price: parseFloat(summaryResults[0].min_price || 0),
      max_price: parseFloat(summaryResults[0].max_price || 0),
      avg_price: parseFloat(summaryResults[0].avg_price || 0),
      last_updated: summaryResults[0].last_updated_iso
    } : {
      total_tokens: 0,
      min_price: 0,
      max_price: 0,
      avg_price: 0,
      last_updated: null
    };

    const response = NextResponse.json({
      prices,
      summary,
      query_params: {
        token_filter: tokenId || null,
        limit,
        min_price: minPrice
      }
    });

    // Add caching headers - prices update hourly, so cache longer
    Object.entries(PRICE_CACHE_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;

  } catch (error) {
    console.error('Error fetching token prices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token prices' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
}
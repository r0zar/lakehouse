import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '../../../../lib/bigquery';

const PRICE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400',
  'CDN-Cache-Control': 'public, max-age=7200',
  'Vercel-CDN-Cache-Control': 'public, max-age=7200'
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tokenId = searchParams.get('token');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const limit = parseInt(searchParams.get('limit') || '1000');
    const interval = searchParams.get('interval') || 'hour';

    // Validate parameters
    if (limit < 1 || limit > 10000) {
      return NextResponse.json({ error: 'Limit must be between 1 and 10000' }, { status: 400 });
    }

    if (!tokenId) {
      return NextResponse.json({ error: 'Token parameter is required' }, { status: 400 });
    }

    const validIntervals = ['hour', 'day', 'week'];
    if (!validIntervals.includes(interval)) {
      return NextResponse.json({ 
        error: `Invalid interval. Must be one of: ${validIntervals.join(', ')}` 
      }, { status: 400 });
    }

    // Build date filters
    let dateFilter = '';
    if (startDate) {
      dateFilter += ` AND calculated_at >= TIMESTAMP('${startDate}')`;
    }
    if (endDate) {
      dateFilter += ` AND calculated_at <= TIMESTAMP('${endDate}')`;
    }

    // Set default time range if no dates provided (last 30 days)
    if (!startDate && !endDate) {
      dateFilter = ' AND calculated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)';
    }

    // Build aggregation based on interval
    let timeGrouping: string;
    let timeFormat: string;
    
    switch (interval) {
      case 'hour':
        timeGrouping = 'DATETIME_TRUNC(DATETIME(calculated_at), HOUR)';
        timeFormat = 'FORMAT_DATETIME(\'%Y-%m-%dT%H:00:00Z\', DATETIME_TRUNC(DATETIME(calculated_at), HOUR))';
        break;
      case 'day':
        timeGrouping = 'DATE(calculated_at)';
        timeFormat = 'FORMAT_DATE(\'%Y-%m-%d\', DATE(calculated_at))';
        break;
      case 'week':
        timeGrouping = 'DATE_TRUNC(DATE(calculated_at), WEEK)';
        timeFormat = 'FORMAT_DATE(\'%Y-%m-%d\', DATE_TRUNC(DATE(calculated_at), WEEK))';
        break;
      default:
        timeGrouping = 'DATETIME_TRUNC(DATETIME(calculated_at), HOUR)';
        timeFormat = 'FORMAT_DATETIME(\'%Y-%m-%dT%H:00:00Z\', DATETIME_TRUNC(DATETIME(calculated_at), HOUR))';
    }

    // Simple approach: try historical table first, fallback to current prices
    let query = `
      SELECT 
        calculated_at,
        sbtc_price,
        usd_price,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', calculated_at) as calculated_at_iso
      FROM \`crypto_data.token_prices\`
      WHERE token_contract_id = '${tokenId}'
      ${dateFilter}
      ORDER BY calculated_at DESC
      LIMIT ${limit}
    `;

    const [results] = await bigquery.query(query);

    // Transform results
    const priceHistory = results.map((row: any) => ({
      timestamp: row.calculated_at_iso,
      sbtc_price: parseFloat(row.sbtc_price || 0),
      usd_price: parseFloat(row.usd_price || 0),
      min_usd_price: parseFloat(row.usd_price || 0),
      max_usd_price: parseFloat(row.usd_price || 0),
      data_points: 1
    }));

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT DATE(calculated_at)) as total_days,
        MIN(calculated_at) as first_data_point,
        MAX(calculated_at) as last_data_point,
        MIN(usd_price) as all_time_min,
        MAX(usd_price) as all_time_max,
        AVG(usd_price) as average_price,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MIN(calculated_at)) as first_data_point_iso,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*SZ', MAX(calculated_at)) as last_data_point_iso
      FROM \`crypto_data.token_prices\`
      WHERE token_contract_id = '${tokenId}'
      ${dateFilter}
    `;

    const [summaryResults] = await bigquery.query(summaryQuery);
    const summary = summaryResults[0] ? {
      token_contract_id: tokenId,
      total_days: parseInt(summaryResults[0].total_days || 0),
      data_range: {
        start: summaryResults[0].first_data_point_iso,
        end: summaryResults[0].last_data_point_iso
      },
      price_statistics: {
        all_time_min: parseFloat(summaryResults[0].all_time_min || 0),
        all_time_max: parseFloat(summaryResults[0].all_time_max || 0),
        average_price: parseFloat(summaryResults[0].average_price || 0)
      },
      total_data_points: priceHistory.length
    } : null;

    const response = NextResponse.json({
      price_history: priceHistory,
      summary,
      query_params: {
        token: tokenId,
        start_date: startDate,
        end_date: endDate,
        interval,
        limit
      }
    });

    // Add caching headers
    Object.entries(PRICE_CACHE_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;

  } catch (error) {
    console.error('Error fetching token price history:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch token price history',
        debug: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  }
}
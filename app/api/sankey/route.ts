import { NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '1000';
    const asset = searchParams.get('asset');
    const minValue = searchParams.get('minValue') || '0';
    const address = searchParams.get('address');
    
    // Build WHERE clause for links
    let whereClause = `WHERE value > ${minValue}`;
    if (asset) {
      whereClause += ` AND currency_symbol = '${asset}'`;
    }
    if (address) {
      whereClause += ` AND (source = '${address}' OR target = '${address}')`;
    }
    
    // Execute both queries in parallel
    const [nodesQuery, linksQuery] = await Promise.all([
      bigquery.query(`
        SELECT name, category 
        FROM \`crypto_data.sankey_nodes\`
        ORDER BY name
      `),
      bigquery.query(`
        SELECT source, target, value, asset, currency_symbol
        FROM \`crypto_data.sankey_links\`
        ${whereClause}
        ORDER BY value DESC
        LIMIT ${limit}
      `)
    ]);
    
    const [nodes] = nodesQuery;
    const [links] = linksQuery;
    
    // Return in the exact Sankey format expected
    const sankeyData = {
      nodes,
      links
    };
    
    return NextResponse.json(sankeyData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error) {
    console.error('Error fetching Sankey data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Sankey data' },
      { status: 500 }
    );
  }
}
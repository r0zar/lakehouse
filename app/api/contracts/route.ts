import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { validateApiKey } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
  const search = searchParams.get('search') || '';
  
  try {
    let whereClause = '';
    const params: Record<string, any> = {};
    
    if (search) {
      whereClause += ' WHERE contract_address LIKE @search';
      params.search = `%${search}%`;
    }
    
    const query = `
      SELECT 
        contract_address,
        transaction_count,
        last_seen,
        status,
        source_code,
        parsed_abi,
        created_at,
        updated_at
      FROM crypto_data.dim_contracts
      ${whereClause}
      ORDER BY transaction_count DESC, last_seen DESC
      LIMIT @limit OFFSET @offset
    `;

    params.limit = limit;
    params.offset = offset;

    const [rows] = await bigquery.query({
      query,
      params,
      jobTimeoutMs: 30000,
    });

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM crypto_data.dim_contracts
      ${whereClause}
    `;
    
    const countParams = { ...params };
    delete countParams.limit;
    delete countParams.offset;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      params: countParams,
      jobTimeoutMs: 15000,
    });

    const total = countRows[0]?.total || 0;

    return NextResponse.json({
      data: rows,
      pagination: {
        limit,
        offset,
        total: Number(total),
        has_more: offset + limit < total
      },
      filters: {
        search: search || null
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Failed to fetch contracts:', error);
    return NextResponse.json({
      error: 'Failed to fetch contracts',
      message: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
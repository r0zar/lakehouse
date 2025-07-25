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
  const tokenType = searchParams.get('token_type') || '';
  const validationStatus = searchParams.get('validation_status') || '';
  
  try {
    let whereClause = 'WHERE 1=1';
    const params: Record<string, any> = {};
    
    if (search) {
      whereClause += ' AND (contract_address LIKE @search OR token_name LIKE @search OR token_symbol LIKE @search)';
      params.search = `%${search}%`;
    }
    
    if (tokenType) {
      whereClause += ' AND token_type = @token_type';
      params.token_type = tokenType;
    }
    
    if (validationStatus) {
      whereClause += ' AND validation_status = @validation_status';
      params.validation_status = validationStatus;
    }
    
    const query = `
      SELECT 
        contract_address,
        token_type,
        token_name,
        token_symbol,
        decimals,
        total_supply,
        token_uri,
        image_url,
        description,
        transaction_count,
        last_seen,
        validation_status,
        created_at,
        updated_at
      FROM crypto_data.dim_tokens
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN token_type = 'sip010_token' THEN 1 
          WHEN token_type = 'partial_token' THEN 2
          ELSE 3
        END,
        transaction_count DESC, 
        last_seen DESC
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
      FROM crypto_data.dim_tokens
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
        search: search || null,
        token_type: tokenType || null,
        validation_status: validationStatus || null
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Failed to fetch tokens:', error);
    return NextResponse.json({
      error: 'Failed to fetch tokens',
      message: error.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
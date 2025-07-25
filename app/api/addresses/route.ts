import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

interface AddressOperation {
  event_id: string;
  block_hash: string;
  tx_hash: string;
  operation_type: string;
  address: string;
  amount: string | null;
  contract_identifier: string | null;
  function_name: string | null;
  function_args: any[] | null;
  webhook_path: string;
  received_at: string;
  // Token metadata from linked FT transfers
  ft_asset_identifier: string | null;
  ft_amount: number | null;
  token_symbol: string | null;
  token_name: string | null;
  decimals: number | null;
  image_url: string | null;
}

interface AddressesResponse {
  operations: AddressOperation[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM crypto_data.stg_addresses
    `;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });
    
    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get paginated address operations with token metadata
    const operationsQuery = `
      SELECT 
        a.event_id,
        a.block_hash,
        a.tx_hash,
        a.operation_type,
        a.address,
        a.amount,
        a.contract_identifier,
        a.function_name,
        a.function_args,
        a.webhook_path,
        a.received_at,
        -- Token metadata from matching FT transfer events
        e.ft_asset_identifier,
        e.ft_amount,
        t.token_symbol,
        t.token_name,
        t.decimals,
        t.image_url
      FROM crypto_data.stg_addresses a
      LEFT JOIN crypto_data.stg_events e 
        ON a.tx_hash = e.tx_hash 
        AND a.event_id = e.event_id
        AND (e.ft_sender = a.address OR e.ft_recipient = a.address)
        AND e.ft_asset_identifier IS NOT NULL
      LEFT JOIN crypto_data.dim_tokens t 
        ON SPLIT(e.ft_asset_identifier, '::')[OFFSET(0)] = t.contract_address
      ORDER BY a.received_at DESC
      LIMIT ${limit} 
      OFFSET ${offset}
    `;

    const [operationRows] = await bigquery.query({
      query: operationsQuery,
      jobTimeoutMs: 60000,
    });

    const operations: AddressOperation[] = operationRows.map((row: any) => ({
      event_id: row.event_id,
      block_hash: row.block_hash,
      tx_hash: row.tx_hash,
      operation_type: row.operation_type,
      address: row.address,
      amount: row.amount,
      contract_identifier: row.contract_identifier,
      function_name: row.function_name,
      function_args: row.function_args,
      webhook_path: row.webhook_path,
      received_at: row.received_at?.value || row.received_at,
      // Token metadata from linked FT transfers
      ft_asset_identifier: row.ft_asset_identifier,
      ft_amount: row.ft_amount ? parseInt(row.ft_amount) : null,
      token_symbol: row.token_symbol,
      token_name: row.token_name,
      decimals: row.decimals ? parseInt(row.decimals) : null,
      image_url: row.image_url,
    }));

    const response: AddressesResponse = {
      operations,
      totalCount,
      page,
      limit,
      hasMore: offset + limit < totalCount,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    console.error('Addresses API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch address operations',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
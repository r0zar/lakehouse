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

    // Get paginated address operations
    const operationsQuery = `
      SELECT 
        event_id,
        block_hash,
        tx_hash,
        operation_type,
        address,
        amount,
        contract_identifier,
        function_name,
        function_args,
        webhook_path,
        received_at
      FROM crypto_data.stg_addresses 
      ORDER BY received_at DESC
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
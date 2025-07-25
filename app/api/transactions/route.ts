import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount } from '@/lib/token-formatting';

interface Transaction {
  event_id: string;
  block_hash: string;
  block_index: number;
  tx_hash: string;
  description: string | null;
  atomic_fee: number | null;
  formatted_fee: number | null;
  display_fee: string | null;
  success: boolean | null;
  operation_count: number;
  webhook_path: string;
  received_at: string;
}

interface TransactionsResponse {
  transactions: Transaction[];
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
      FROM crypto_data.stg_transactions
    `;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });
    
    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get paginated transactions
    const transactionsQuery = `
      SELECT 
        event_id,
        block_hash,
        block_index,
        tx_hash,
        description,
        fee,
        success,
        operation_count,
        webhook_path,
        received_at
      FROM crypto_data.stg_transactions 
      ORDER BY block_index DESC, received_at DESC 
      LIMIT ${limit} 
      OFFSET ${offset}
    `;

    const [transactionRows] = await bigquery.query({
      query: transactionsQuery,
      jobTimeoutMs: 60000,
    });

    const transactions: Transaction[] = transactionRows.map((row: any) => {
      const atomicFee = row.fee ? parseInt(row.fee) : null;
      const formattedFee = atomicFee ? formatStxAmount(atomicFee) : null;
      
      return {
        event_id: row.event_id,
        block_hash: row.block_hash,
        block_index: parseInt(row.block_index || '0'),
        tx_hash: row.tx_hash,
        description: row.description,
        atomic_fee: atomicFee,
        formatted_fee: formattedFee,
        display_fee: formattedFee ? `${formattedFee.toFixed(6)} STX` : null,
        success: row.success,
        operation_count: parseInt(row.operation_count || '0'),
        webhook_path: row.webhook_path,
        received_at: row.received_at?.value || row.received_at,
      };
    });

    const response: TransactionsResponse = {
      transactions,
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
    console.error('Transactions API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch transactions',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
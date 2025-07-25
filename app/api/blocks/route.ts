import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

interface Block {
  event_id: string;
  block_hash: string;
  block_index: number;
  block_time: string | null;
  bitcoin_anchor_hash: string | null;
  bitcoin_anchor_index: number | null;
  stacks_block_hash: string | null;
  transaction_count: number;
  webhook_path: string;
  chainhook_uuid: string | null;
  is_streaming_blocks: boolean | null;
  received_at: string;
}

interface BlocksResponse {
  blocks: Block[];
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
      FROM crypto_data.stg_blocks
    `;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });
    
    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get paginated blocks
    const blocksQuery = `
      SELECT 
        event_id,
        block_hash,
        block_index,
        block_time,
        bitcoin_anchor_hash,
        bitcoin_anchor_index,
        stacks_block_hash,
        transaction_count,
        webhook_path,
        chainhook_uuid,
        is_streaming_blocks,
        received_at
      FROM crypto_data.stg_blocks 
      ORDER BY block_index DESC 
      LIMIT ${limit} 
      OFFSET ${offset}
    `;

    const [blockRows] = await bigquery.query({
      query: blocksQuery,
      jobTimeoutMs: 60000,
    });

    const blocks: Block[] = blockRows.map((row: any) => ({
      event_id: row.event_id,
      block_hash: row.block_hash,
      block_index: parseInt(row.block_index || '0'),
      block_time: row.block_time?.value || row.block_time,
      bitcoin_anchor_hash: row.bitcoin_anchor_hash,
      bitcoin_anchor_index: row.bitcoin_anchor_index ? parseInt(row.bitcoin_anchor_index) : null,
      stacks_block_hash: row.stacks_block_hash,
      transaction_count: parseInt(row.transaction_count || '0'),
      webhook_path: row.webhook_path,
      chainhook_uuid: row.chainhook_uuid,
      is_streaming_blocks: row.is_streaming_blocks,
      received_at: row.received_at?.value || row.received_at,
    }));

    const response: BlocksResponse = {
      blocks,
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
    console.error('Blocks API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch blocks',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
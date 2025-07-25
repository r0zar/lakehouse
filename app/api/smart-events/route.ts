import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

interface SmartEvent {
  event_id: string;
  block_hash: string;
  block_time: string;
  tx_hash: string;
  event_type: string;
  position_index: number | null;
  contract_identifier: string | null;
  topic: string | null;
  action: string | null;
  ft_sender: string | null;
  ft_recipient: string | null;
  ft_amount: number | null;
  ft_asset_identifier: string | null;
  raw_event_data: any;
  received_at: string;
  webhook_path: string;
  // Token metadata
  token_symbol: string | null;
  token_name: string | null;
  decimals: number | null;
  image_url: string | null;
}

interface SmartEventsResponse {
  events: SmartEvent[];
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
      FROM crypto_data.stg_events
    `;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });
    
    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get paginated smart contract events with token metadata
    const eventsQuery = `
      SELECT 
        e.event_id,
        e.block_hash,
        e.block_time,
        e.tx_hash,
        e.event_type,
        e.position_index,
        e.contract_identifier,
        e.topic,
        e.action,
        e.ft_sender,
        e.ft_recipient,
        e.ft_amount,
        e.ft_asset_identifier,
        e.raw_event_data,
        e.received_at,
        e.webhook_path,
        -- Token metadata from dim_tokens table
        t.token_symbol,
        t.token_name,
        t.decimals,
        t.image_url
      FROM crypto_data.stg_events e
      LEFT JOIN crypto_data.dim_tokens t 
        ON SPLIT(e.ft_asset_identifier, '::')[OFFSET(0)] = t.contract_address
      ORDER BY e.block_time DESC, e.position_index DESC
      LIMIT ${limit} 
      OFFSET ${offset}
    `;

    const [eventRows] = await bigquery.query({
      query: eventsQuery,
      jobTimeoutMs: 60000,
    });

    const events: SmartEvent[] = eventRows.map((row: any) => ({
      event_id: row.event_id,
      block_hash: row.block_hash,
      block_time: row.block_time?.value || row.block_time,
      tx_hash: row.tx_hash,
      event_type: row.event_type,
      position_index: row.position_index ? parseInt(row.position_index) : null,
      contract_identifier: row.contract_identifier,
      topic: row.topic,
      action: row.action,
      ft_sender: row.ft_sender,
      ft_recipient: row.ft_recipient,
      ft_amount: row.ft_amount ? parseInt(row.ft_amount) : null,
      ft_asset_identifier: row.ft_asset_identifier,
      raw_event_data: row.raw_event_data,
      received_at: row.received_at?.value || row.received_at,
      webhook_path: row.webhook_path,
      // Token metadata
      token_symbol: row.token_symbol,
      token_name: row.token_name,
      decimals: row.decimals ? parseInt(row.decimals) : null,
      image_url: row.image_url,
    }));

    const response: SmartEventsResponse = {
      events,
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
    console.error('Smart Events API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch smart contract events',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
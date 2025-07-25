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

    // Get paginated smart contract events
    const eventsQuery = `
      SELECT 
        event_id,
        block_hash,
        block_time,
        tx_hash,
        event_type,
        position_index,
        contract_identifier,
        topic,
        action,
        ft_sender,
        ft_recipient,
        ft_amount,
        ft_asset_identifier,
        raw_event_data,
        received_at,
        webhook_path
      FROM crypto_data.stg_events 
      ORDER BY block_time DESC, position_index DESC
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
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

interface Event {
  event_id: string;
  received_at: string;
  webhook_path: string;
  body_json: string;
  headers: string;
  url: string;
  method: string;
}

interface EventsResponse {
  events: Event[];
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
      FROM crypto_data.events
    `;
    
    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });
    
    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get paginated events
    const eventsQuery = `
      SELECT 
        event_id,
        received_at,
        webhook_path,
        body_json,
        headers,
        url,
        method
      FROM crypto_data.events 
      ORDER BY received_at DESC 
      LIMIT ${limit} 
      OFFSET ${offset}
    `;

    const [eventRows] = await bigquery.query({
      query: eventsQuery,
      jobTimeoutMs: 60000,
    });

    const events: Event[] = eventRows.map((row: any) => ({
      event_id: row.event_id,
      received_at: row.received_at.value || row.received_at,
      webhook_path: row.webhook_path,
      body_json: row.body_json,
      headers: row.headers,
      url: row.url,
      method: row.method,
    }));

    const response: EventsResponse = {
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
    console.error('Events API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch events',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
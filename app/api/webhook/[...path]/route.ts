// app/api/webhook/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dataset } from '@/lib/bigquery';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const eventId = crypto.randomUUID();
    const resolvedParams = await params;
    const bodyText = await request.text();

    await dataset.table('chainhooks').insert([{
        event_id: eventId,
        received_at: new Date().toISOString(),
        webhook_path: resolvedParams.path.join('/') || 'root',
        body_json: bodyText,
        headers: JSON.stringify(Object.fromEntries(request.headers.entries())),
        url: request.url,
        method: request.method
    }]);

    return NextResponse.json({ ok: true, event_id: eventId }, { status: 200 });
}

// Handle other methods
export async function GET() {
    return NextResponse.json({
        status: 'Webhook endpoint active',
        accepts: 'POST requests only'
    });
}
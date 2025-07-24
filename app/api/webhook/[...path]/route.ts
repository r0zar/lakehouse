// app/api/webhook/[...path]/route.ts
import { BigQuery } from '@google-cloud/bigquery';
import { NextRequest, NextResponse } from 'next/server';

// Initialize BigQuery
const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS!)
});

const dataset = bigquery.dataset('crypto_data');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const startTime = Date.now();
    const eventId = crypto.randomUUID();
    const resolvedParams = await params;
    
    try {
        // Read body once and store both parsed and raw versions
        const bodyText = await request.text();
        let body: any;

        try {
            // Parse body
            body = JSON.parse(bodyText);
        } catch (parseError: any) {
            console.error(`❌ JSON parsing failed for ${eventId}:`, parseError);
            
            // Store unparsed body in raw events table
            try {
                await dataset.table('events_raw').insert([{
                    event_id: eventId,
                    received_at: new Date().toISOString(),
                    webhook_path: resolvedParams.path?.join('/') || 'root',
                    webhook_source: request.headers.get('x-webhook-source') || 'unknown',
                    body: bodyText,
                    headers: Object.fromEntries(request.headers.entries()),
                    parse_error: parseError.message
                }]);
                
                return NextResponse.json({
                    ok: true,
                    event_id: eventId,
                    note: 'Stored as raw data due to parse error'
                });
            } catch (rawInsertError: any) {
                console.error(`❌ Raw insert failed for ${eventId}:`, rawInsertError);
                throw new Error(`Parse error: ${parseError.message}, Raw insert error: ${rawInsertError.message}`);
            }
        }

        // Build context from request
        const context = {
            event_id: eventId,
            received_at: new Date().toISOString(),
            webhook_path: resolvedParams.path?.join('/') || 'root',
            webhook_source: request.headers.get('x-webhook-source') || 'unknown',
            content_type: request.headers.get('content-type'),
            user_agent: request.headers.get('user-agent'),
        };

        // Try auto-schema insert first
        try {
            await dataset.table('events_auto').insert([{
                ...context,
                ...body
            }], {
                ignoreUnknownValues: true,
                skipInvalidRows: true
            });

            console.log(`✅ Auto-inserted ${eventId} in ${Date.now() - startTime}ms`);

        } catch (schemaError: any) {
            // Fallback to JSON column
            console.log(`⚠️ Schema failed for ${eventId}, using JSON fallback`);

            await dataset.table('events_raw').insert([{
                ...context,
                body: body,
                headers: Object.fromEntries(request.headers.entries()),
                schema_error: schemaError.message
            }]);
        }

        return NextResponse.json({
            ok: true,
            event_id: eventId,
            latency_ms: Date.now() - startTime
        });

    } catch (error: any) {
        console.error(`❌ Webhook ${eventId} failed:`, error);

        // Try dead letter queue
        try {
            await dataset.table('events_failed').insert([{
                event_id: eventId,
                failed_at: new Date().toISOString(),
                error: error.message,
                raw_body: 'Body already consumed',
                url: request.url
            }]);
        } catch (dlqError) {
            console.error('Dead letter queue failed:', dlqError);
        }

        // Return 200 to prevent retries
        return NextResponse.json({
            ok: false,
            event_id: eventId,
            error: 'Stored in dead letter queue'
        }, { status: 200 });
    }
}

// Handle other methods
export async function GET() {
    return NextResponse.json({
        status: 'Webhook endpoint active',
        accepts: 'POST requests only'
    });
}
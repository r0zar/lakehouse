// app/api/webhook/[...path]/route.ts
import { BigQuery } from '@google-cloud/bigquery';
import { NextRequest, NextResponse } from 'next/server';

// Initialize BigQuery with better error handling
let credentials;
try {
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        // Try base64 decode first, then regular JSON parse
        const credString = process.env.GOOGLE_CLOUD_CREDENTIALS.startsWith('{')
            ? process.env.GOOGLE_CLOUD_CREDENTIALS
            : Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString();

        credentials = JSON.parse(credString);

        // Fix private key formatting
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
    }
} catch (error) {
    console.error('Failed to parse Google Cloud credentials:', error);
}

const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    credentials
});

const dataset = bigquery.dataset('crypto_data');

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const eventId = crypto.randomUUID();
    const resolvedParams = await params;

    try {
        const bodyText = await request.text();
        
        // Create event record with all data as JSON
        const eventRecord = {
            event_id: eventId,
            received_at: new Date().toISOString(),
            webhook_path: resolvedParams.path?.join('/') || 'root',
            body_text: bodyText,
            headers: Object.fromEntries(request.headers.entries()),
            url: request.url,
            method: request.method
        };

        // Try to parse JSON and add it as structured field, but don't fail if parsing fails
        try {
            eventRecord.body_json = JSON.parse(bodyText);
        } catch {
            // If JSON parsing fails, body_json will be null and we still have body_text
        }

        // Insert into events table - use insertIgnore to handle any BigQuery issues
        await dataset.table('events').insert([eventRecord]);

        return NextResponse.json({
            ok: true,
            event_id: eventId
        });

    } catch (error: any) {
        console.error(`Webhook ${eventId} failed:`, error);
        
        // Always return 200 to prevent webhook retries
        return NextResponse.json({
            ok: false,
            event_id: eventId,
            error: 'Processing failed'
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
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

        // Parse JSON body for proper JSON column storage
        let bodyJson = null;
        try {
            bodyJson = JSON.parse(bodyText);
        } catch {
            // If parsing fails, store the raw text as a JSON string
            bodyJson = bodyText;
        }

        // Create event record with JSON types
        const eventRecord = {
            event_id: eventId,
            received_at: new Date().toISOString(),
            webhook_path: resolvedParams.path?.join('/') || 'root',
            body_json: bodyJson,
            headers: Object.fromEntries(request.headers.entries()),
            url: request.url,
            method: request.method
        };

        // Insert into events table with options for better reliability
        await dataset.table('events').insert([eventRecord], {
            ignoreUnknownValues: true,
            skipInvalidRows: false
        });

        return NextResponse.json({
            ok: true,
            event_id: eventId
        });

    } catch (error: any) {
        console.error(`Webhook ${eventId} failed:`, error);
        
        // Log detailed error info for PartialFailureError
        if (error.name === 'PartialFailureError' && error.errors) {
            console.error('BigQuery insert errors:', JSON.stringify(error.errors, null, 2));
        }
        if (error.response) {
            console.error('BigQuery response:', JSON.stringify(error.response, null, 2));
        }

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
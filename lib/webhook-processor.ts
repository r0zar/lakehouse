import { NextRequest } from 'next/server';
import { dataset } from './bigquery';
import { WebhookEvent, WebhookResponse } from '../types/webhook';

export async function processWebhook(
    request: NextRequest,
    path: string[],
    eventId: string
): Promise<WebhookResponse> {
    try {
        // Read the raw request body as text for BigQuery JSON column
        const bodyText = await request.text();
        
        // Validate it's valid JSON by parsing it
        try {
            JSON.parse(bodyText);
        } catch (parseError: any) {
            throw new Error(`Invalid JSON in request body: ${parseError.message}`);
        }

        // Create event record
        const eventRecord: WebhookEvent = {
            event_id: eventId,
            received_at: new Date().toISOString(),
            webhook_path: path.join('/') || 'root',
            body_json: bodyText, // Store as JSON string for BigQuery JSON column
            headers: JSON.stringify(Object.fromEntries(request.headers.entries())), // Stringify for BigQuery JSON column
            url: request.url,
            method: request.method
        };

        // Insert into BigQuery
        await insertEvent(eventRecord);

        return {
            ok: true,
            event_id: eventId
        };

    } catch (error: any) {
        console.error(`Webhook ${eventId} failed:`, error);
        
        // Log detailed error info for PartialFailureError
        if (error.name === 'PartialFailureError' && error.errors) {
            console.error('BigQuery insert errors:', JSON.stringify(error.errors, null, 2));
        }
        if (error.response) {
            console.error('BigQuery response:', JSON.stringify(error.response, null, 2));
        }

        return {
            ok: false,
            event_id: eventId,
            error: 'Processing failed'
        };
    }
}

async function insertEvent(eventRecord: WebhookEvent): Promise<void> {
    await dataset.table('events').insert([eventRecord], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
    });
}
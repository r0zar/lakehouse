import { NextRequest } from 'next/server';
import { dataset } from './bigquery';
import { WebhookEvent, WebhookResponse } from '../types/webhook';
import { runStagingPipeline } from './transformation-pipeline';

export async function processWebhook(
    request: NextRequest,
    path: string[],
    eventId: string
): Promise<WebhookResponse> {
    const webhookPath = path.join('/') || 'root';
    console.log(`🌐 [${eventId}] Processing webhook: ${request.method} /${webhookPath}`);
    
    try {
        // Read the raw request body as text for BigQuery JSON column
        const bodyText = await request.text();
        console.log(`📄 [${eventId}] Body size: ${bodyText.length} characters`);
        
        // Validate it's valid JSON by parsing it
        let parsedBody;
        try {
            parsedBody = JSON.parse(bodyText);
            console.log(`🔍 [${eventId}] JSON structure keys:`, Object.keys(parsedBody));
            
            // Log key information for debugging
            if (parsedBody.apply && Array.isArray(parsedBody.apply)) {
                console.log(`📦 [${eventId}] Found 'apply' array with ${parsedBody.apply.length} items`);
                
                // Log first apply item structure to understand the data
                if (parsedBody.apply.length > 0) {
                    const firstItem = parsedBody.apply[0];
                    console.log(`🔍 [${eventId}] First apply item keys:`, Object.keys(firstItem || {}));
                    
                    // Check if it has block_identifier (which stg_blocks.sql expects)
                    if (firstItem && firstItem.block_identifier) {
                        console.log(`🏗️ [${eventId}] Block identifier found:`, firstItem.block_identifier);
                    } else {
                        console.log(`⚠️ [${eventId}] No block_identifier in apply item`);
                    }
                }
            } else {
                console.log(`⚠️ [${eventId}] No 'apply' array found in webhook data`);
            }
            
            if (parsedBody.chainhook) {
                console.log(`🔗 [${eventId}] Chainhook UUID: ${parsedBody.chainhook.uuid}`);
                console.log(`🔗 [${eventId}] Is streaming blocks: ${parsedBody.chainhook.is_streaming_blocks}`);
            }
            
        } catch (parseError: any) {
            console.error(`❌ [${eventId}] Invalid JSON in request body:`, parseError.message);
            console.error(`❌ [${eventId}] Body preview:`, bodyText.substring(0, 500));
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

        // Trigger staging pipeline asynchronously (real-time)
        // Marts will be generated on-demand when users query
        triggerStagingPipeline(eventId).catch(error => {
            console.error(`❌ Staging pipeline failed for event ${eventId}:`, error);
            console.error(`❌ Error details:`, error.message);
            console.error(`❌ Error stack:`, error.stack);
            
            // Log additional error details for BigQuery issues
            if (error.errors && Array.isArray(error.errors)) {
                console.error(`❌ BigQuery errors:`, JSON.stringify(error.errors, null, 2));
            }
        });

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

/**
 * Trigger staging pipeline asynchronously after webhook data is inserted
 * Only processes staging tables for real-time data freshness
 */
async function triggerStagingPipeline(eventId: string): Promise<void> {
    // Allow disabling pipeline via environment variable (useful for testing)
    if (process.env.DISABLE_AUTO_STAGING === 'true') {
        console.log(`🚫 [${eventId}] Staging pipeline disabled for event`);
        return;
    }

    const pipelineStartTime = Date.now();
    console.log(`🔄 [${eventId}] [${new Date().toISOString()}] Triggering staging pipeline for event`);
    
    try {
        await runStagingPipeline();
        const duration = Date.now() - pipelineStartTime;
        console.log(`✅ [${eventId}] [${new Date().toISOString()}] Staging pipeline completed successfully (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - pipelineStartTime;
        console.error(`❌ [${eventId}] [${new Date().toISOString()}] Staging pipeline failed after ${duration}ms:`, error);
        throw error;
    }
}
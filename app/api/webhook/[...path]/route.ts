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

    // Extract block identifier for deduplication
    const bodyJson = JSON.parse(bodyText);
    const blockHash = bodyJson?.apply?.[0]?.block_identifier?.hash;
    const blockIndex = bodyJson?.apply?.[0]?.block_identifier?.index;
    
    if (!blockHash || !blockIndex) {
        console.warn('No block identifier found in webhook data, skipping deduplication');
        // Fallback to regular insert for non-block events
        await dataset.table('chainhooks').insert([{
            event_id: eventId,
            received_at: new Date().toISOString(),
            webhook_path: resolvedParams.path.join('/') || 'root',
            body_json: bodyText,
            headers: JSON.stringify(Object.fromEntries(request.headers.entries())),
            url: request.url,
            method: request.method
        }]);
    } else {
        // Check if block already exists to prevent duplicates
        const existsQuery = `
            SELECT COUNT(*) as count
            FROM \`crypto_data.chainhooks\`
            WHERE JSON_EXTRACT_SCALAR(body_json, '$.apply[0].block_identifier.hash') = @block_hash
        `;
        
        const [existsResult] = await dataset.query({
            query: existsQuery,
            params: { block_hash: blockHash }
        });
        
        const blockExists = existsResult[0]?.count > 0;
        
        if (blockExists) {
            console.log(`Block ${blockIndex} (${blockHash}) already exists, skipping duplicate`);
        } else {
            // Insert new block data
            await dataset.table('chainhooks').insert([{
                event_id: eventId,
                received_at: new Date().toISOString(),
                webhook_path: resolvedParams.path.join('/') || 'root',
                body_json: bodyText,
                headers: JSON.stringify(Object.fromEntries(request.headers.entries())),
                url: request.url,
                method: request.method,
                block_hash: blockHash,
                block_index: parseInt(blockIndex)
            }]);
            console.log(`Inserted new block ${blockIndex} (${blockHash})`);
        }
    }

    return NextResponse.json({ ok: true, event_id: eventId }, { status: 200 });
}

// Handle other methods
export async function GET() {
    return NextResponse.json({
        status: 'Webhook endpoint active',
        accepts: 'POST requests only'
    });
}
// app/api/webhook/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/lib/webhook-processor';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const eventId = crypto.randomUUID();
    const resolvedParams = await params;

    const result = await processWebhook(request, resolvedParams.path, eventId);

    // Always return 200 to prevent webhook retries
    return NextResponse.json(result, {
        status: 200
    });
}

// Handle other methods
export async function GET() {
    return NextResponse.json({
        status: 'Webhook endpoint active',
        accepts: 'POST requests only'
    });
}
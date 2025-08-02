import { NextRequest, NextResponse } from 'next/server';
import { calculateTokenPrices } from '@/scripts/calculate-token-prices';

export async function GET(request: NextRequest) {
    try {
        // Optional authentication - allow Vercel cron jobs to run without auth
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        
        // Only require auth if CRON_SECRET is set AND this appears to be a manual request
        const isManualRequest = authHeader !== null || request.headers.get('user-agent')?.includes('curl');
        
        if (cronSecret && isManualRequest && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { 
                    error: 'Unauthorized',
                    hint: 'Use Authorization: Bearer <CRON_SECRET> header'
                }, 
                { status: 401 }
            );
        }

        console.log('🕐 Starting scheduled token price calculation...');
        const startTime = Date.now();
        
        // Run the token price calculation
        await calculateTokenPrices();
        
        const duration = Date.now() - startTime;
        console.log(`✅ Token price calculation completed in ${duration}ms`);
        
        return NextResponse.json({
            success: true,
            message: 'Token prices calculated successfully',
            duration_ms: duration,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Cron job failed:', error);
        
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    // Support both GET and POST for flexibility with different cron services
    return GET(request);
}
// app/api/pipeline/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getMartFreshness, isStagingFresh, hasRecentData } from '@/lib/transformation-pipeline';

export async function GET(request: NextRequest) {
    try {
        console.log('🔍 Checking pipeline status...');
        
        // Check various pipeline health metrics
        const [
            martFreshness,
            stagingFresh,
            recentData
        ] = await Promise.allSettled([
            getMartFreshness(),
            isStagingFresh(10), // 10 minutes threshold
            hasRecentData(5)    // 5 minutes threshold
        ]);
        
        const status = {
            timestamp: new Date().toISOString(),
            architecture: 'Dune-style: Real-time staging + On-demand marts',
            
            // Staging status
            staging: {
                isFresh: stagingFresh.status === 'fulfilled' ? stagingFresh.value : false,
                hasRecentData: recentData.status === 'fulfilled' ? recentData.value : false,
                status: stagingFresh.status === 'fulfilled' && stagingFresh.value ? 'healthy' : 'stale'
            },
            
            // Mart freshness status
            marts: {
                freshness: martFreshness.status === 'fulfilled' ? martFreshness.value : {},
                lastUpdated: martFreshness.status === 'fulfilled' 
                    ? Object.entries(martFreshness.value)
                        .map(([name, date]) => ({ name, lastUpdated: date }))
                        .sort((a, b) => {
                            if (!a.lastUpdated) return 1;
                            if (!b.lastUpdated) return -1;
                            return b.lastUpdated.getTime() - a.lastUpdated.getTime();
                        })
                    : []
            },
            
            // Health indicators
            health: {
                overall: stagingFresh.status === 'fulfilled' && stagingFresh.value ? 'healthy' : 'degraded',
                issues: [
                    ...(stagingFresh.status === 'fulfilled' && !stagingFresh.value ? ['Staging data is stale'] : []),
                    ...(recentData.status === 'fulfilled' && !recentData.value ? ['No recent webhook data'] : []),
                    ...(martFreshness.status === 'rejected' ? ['Cannot check mart freshness'] : [])
                ]
            }
        };
        
        return NextResponse.json(status);
        
    } catch (error: any) {
        console.error('Pipeline status check failed:', error);
        
        return NextResponse.json({
            timestamp: new Date().toISOString(),
            error: 'Failed to check pipeline status', 
            details: error.message,
            health: {
                overall: 'unknown',
                issues: ['Status check failed']
            }
        }, { status: 500 });
    }
}
// app/api/pipeline/trigger/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline, runStagingPipeline, runMartsPipeline, runSpecificMarts } from '@/lib/transformation-pipeline';

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const stage = searchParams.get('stage') || 'full';
        const marts = searchParams.get('marts'); // Comma-separated list of specific marts
        
        console.log(`🚀 Manual pipeline trigger requested: ${stage}`);
        
        switch (stage) {
            case 'staging':
                await runStagingPipeline();
                break;
            case 'marts':
                if (marts) {
                    const martList = marts.split(',').map(m => m.trim());
                    await runSpecificMarts(martList);
                } else {
                    await runMartsPipeline();
                }
                break;
            case 'full':
            default:
                await runFullPipeline();
                break;
        }
        
        return NextResponse.json({
            success: true,
            stage,
            marts: marts ? marts.split(',').map(m => m.trim()) : undefined,
            message: marts 
                ? `Specific marts completed: ${marts}` 
                : `${stage} pipeline completed successfully`
        });
        
    } catch (error: any) {
        console.error('Pipeline trigger failed:', error);
        
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'Pipeline trigger endpoint active',
        usage: {
            'POST /api/pipeline/trigger': 'Run full pipeline',
            'POST /api/pipeline/trigger?stage=staging': 'Run staging only',
            'POST /api/pipeline/trigger?stage=marts': 'Run all marts',
            'POST /api/pipeline/trigger?stage=marts&marts=dim_defi_swaps,fact_defi_metrics': 'Run specific marts'
        },
        architecture: 'Dune-style: Real-time staging + On-demand marts'
    });
}
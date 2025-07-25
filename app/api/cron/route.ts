import { NextRequest, NextResponse } from 'next/server';
import { cronScheduler, CRON_JOBS } from '@/lib/cron-jobs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'status':
        const status = cronScheduler.getStatus();
        return NextResponse.json({
          ...status,
          jobs: CRON_JOBS.map(job => ({
            name: job.name,
            description: job.description,
            intervalSeconds: job.interval / 1000,
            endpoint: job.apiEndpoint
          }))
        });

      case 'start':
        await cronScheduler.start();
        return NextResponse.json({ message: 'Cron scheduler started' });

      case 'stop':
        cronScheduler.stop();
        return NextResponse.json({ message: 'Cron scheduler stopped' });

      default:
        return NextResponse.json({
          message: 'Cron Job Manager',
          availableActions: ['status', 'start', 'stop'],
          usage: 'GET /api/cron?action=status'
        });
    }

  } catch (error: any) {
    console.error('Cron API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to manage cron jobs',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        await cronScheduler.start();
        return NextResponse.json({ message: 'Cron scheduler started' });

      case 'stop':
        cronScheduler.stop();
        return NextResponse.json({ message: 'Cron scheduler stopped' });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "start" or "stop"' },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('Cron API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to manage cron jobs',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const martName = 'fact_daily_activity';
  
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Starting refresh for ${martName}...`);

    // Read the SQL file content
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(process.cwd(), 'analytics/sql/marts/fact_daily_activity.sql');
    
    let createQuery: string;
    try {
      createQuery = fs.readFileSync(sqlPath, 'utf8');
    } catch (fileError) {
      console.error('Failed to read SQL file:', fileError);
      throw new Error(`Could not read SQL file at ${sqlPath}`);
    }

    const [job] = await bigquery.query({
      query: createQuery,
      jobTimeoutMs: 300000, // 5 minutes timeout for large rebuild
    });

    // Get row count from the job statistics
    const rowsAffected = (job as any).metadata?.statistics?.query?.totalBytesProcessed 
      ? parseInt((job as any).metadata.statistics.query.totalBytesProcessed) 
      : 0;

    const duration = Date.now() - startTime;

    console.log(`${martName} refreshed successfully: ${rowsAffected} bytes processed in ${duration}ms`);

    // Revalidate analytics daily API and page
    revalidatePath('/api/analytics/daily');
    revalidatePath('/analytics');

    return NextResponse.json({
      mart_name: martName,
      status: 'success',
      rows_affected: rowsAffected,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    console.error(`Failed to refresh ${martName}:`, error);

    return NextResponse.json({
      mart_name: martName,
      status: 'error',
      error: error.message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { validateApiKey } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  
  try {
    const dataset = process.env.NODE_ENV === 'test' ? 'crypto_data_test' : (process.env.BIGQUERY_DATASET || 'crypto_data');
    
    // 1. Basic BigQuery connectivity
    try {
      const queryResult = await bigquery.query({
        query: 'SELECT CURRENT_TIMESTAMP() as current_time',
        jobTimeoutMs: 5000
      });
      const rows = queryResult[0];
      checks.bigquery = {
        status: 'healthy',
        latency: `${Date.now() - startTime}ms`,
        response: rows[0]
      };
    } catch (error: any) {
      checks.bigquery = {
        status: 'unhealthy',
        error: error.message
      };
    }
    
    // 2. Dataset access
    try {
      const queryResult = await bigquery.query({
        query: `SELECT COUNT(*) as tables FROM \`${dataset}.__TABLES__\``,
        jobTimeoutMs: 5000
      });
      const rows = queryResult[0];
      checks.dataset = {
        status: 'healthy',
        dataset,
        tableCount: rows[0]?.tables || 0
      };
    } catch (error: any) {
      checks.dataset = {
        status: 'unhealthy',
        dataset,
        error: error.message
      };
    }
    
    // 3. Events table access
    try {
      const queryResult = await bigquery.query({
        query: `SELECT COUNT(*) as count FROM \`${dataset}.events\` LIMIT 1`,
        jobTimeoutMs: 5000
      });
      const rows = queryResult[0];
      checks.events = {
        status: 'healthy',
        count: rows[0]?.count || 0
      };
    } catch (error: any) {
      checks.events = {
        status: 'unhealthy',
        error: error.message
      };
    }
    
    // 4. Staging tables
    const stagingTables = ['stg_events', 'stg_transactions', 'stg_addresses'];
    checks.staging = {};
    
    for (const table of stagingTables) {
      try {
        const queryResult = await bigquery.query({
          query: `SELECT COUNT(*) as count FROM \`${dataset}.${table}\` LIMIT 1`,
          jobTimeoutMs: 3000
        });
        const rows = queryResult[0];
        checks.staging[table] = {
          status: 'healthy',
          count: rows[0]?.count || 0
        };
      } catch (error: any) {
        checks.staging[table] = {
          status: 'unhealthy',
          error: error.message
        };
      }
    }
    
    // Overall health - simplified check
    const allHealthy = checks.bigquery?.status === 'healthy' && 
                      checks.dataset?.status === 'healthy' && 
                      checks.events?.status === 'healthy';
    
    const totalTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      totalLatency: `${totalTime}ms`,
      dataset,
      checks
    }, {
      status: allHealthy ? 200 : 503
    });
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      checks
    }, { status: 500 });
  }
}
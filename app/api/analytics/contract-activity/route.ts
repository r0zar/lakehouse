import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const contract = searchParams.get('contract'); // Filter by contract
    const days = parseInt(searchParams.get('days') || '30'); // Date range

    // Sanitize inputs to prevent SQL injection
    const sanitizeString = (str: string | null): string | null => {
      if (!str) return null;
      // Remove any characters that could be used for SQL injection
      return str.replace(/[';"\\%_]/g, '').trim();
    };
    
    const sanitizedContract = sanitizeString(contract);
    
    // Build safe where clause
    let whereClause = 'WHERE 1=1';
    
    if (sanitizedContract && sanitizedContract.length >= 3 && sanitizedContract.length <= 100) {
      // Use parameterized approach for LIKE query
      whereClause += ` AND LOWER(contract_identifier) LIKE LOWER('%${sanitizedContract}%')`;
    }

    const query = `
      SELECT 
        contract_identifier,
        contract_name,
        deployer_address,
        period_start,
        period_end,
        active_days,
        total_unique_functions,
        total_transactions,
        total_unique_callers,
        total_successful_calls,
        total_failed_calls,
        success_rate_percent,
        total_contract_fees,
        avg_fee_per_call,
        total_amount_transferred,
        first_call_time,
        last_call_time,
        total_activity_duration_seconds,
        avg_daily_transactions,
        avg_daily_fees,
        top_functions,
        created_at
      FROM crypto_data.fact_contract_activity
      ${whereClause}
      ORDER BY total_transactions DESC, total_contract_fees DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows] = await bigquery.query({
      query,
      jobTimeoutMs: 60000,
    });

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM crypto_data.fact_contract_activity  
      ${whereClause}
    `;

    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });

    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT contract_identifier) as unique_contracts,
        SUM(active_days) as total_active_days,
        SUM(total_transactions) as total_transactions,
        SUM(total_unique_callers) as total_unique_callers,
        SUM(total_contract_fees) as total_fees,
        AVG(success_rate_percent) as avg_success_rate,
        MAX(period_end) as latest_period_end,
        MIN(period_start) as earliest_period_start
      FROM crypto_data.fact_contract_activity
      ${whereClause}
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 30000,
    });

    const summary = summaryRows[0] || {};

    return NextResponse.json({
      data: rows,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount,
      },
      summary: {
        unique_contracts: parseInt(summary.unique_contracts || '0'),
        total_active_days: parseInt(summary.total_active_days || '0'),
        total_transactions: parseInt(summary.total_transactions || '0'),
        total_unique_callers: parseInt(summary.total_unique_callers || '0'),
        total_fees: parseInt(summary.total_fees || '0'),
        avg_success_rate: Math.round((summary.avg_success_rate || 0) * 100) / 100,
        latest_period_end: summary.latest_period_end,
        earliest_period_start: summary.earliest_period_start,
      },
      filters: {
        days,
        contract,
        limit,
        offset,
      },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
      }
    });

  } catch (error: any) {
    console.error('Contract activity API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch contract activity data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
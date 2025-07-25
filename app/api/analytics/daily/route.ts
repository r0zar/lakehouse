import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount } from '@/lib/token-formatting';

interface DailyActivity {
  activity_date: string;
  webhook_path: string;
  total_blocks: number;
  unique_blocks: number;
  total_transactions: number;
  total_fees: number;
  successful_transactions: number;
  failed_transactions: number;
  success_rate: number | null;
  avg_fee_per_transaction: number;
  min_fee: number;
  max_fee: number;
  unique_addresses: number;
  total_operations: number;
  avg_transactions_per_block: number | null;
  avg_transactions_per_address: number | null;
  created_at: string;
}

interface DailyAnalyticsResponse {
  daily_activity: DailyActivity[];
  summary: {
    total_days: number;
    total_blocks: number;
    total_transactions: number;
    total_fees: number;
    avg_success_rate: number;
    avg_daily_transactions: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(7, parseInt(searchParams.get('days') || '30')));

    // Get daily activity data
    const dailyQuery = `
      SELECT 
        activity_date,
        webhook_path,
        total_blocks,
        unique_blocks,
        total_transactions,
        total_fees,
        successful_transactions,
        failed_transactions,
        success_rate,
        avg_fee_per_transaction,
        min_fee,
        max_fee,
        unique_addresses,
        total_operations,
        avg_transactions_per_block,
        avg_transactions_per_address,
        created_at
      FROM crypto_data.fact_daily_activity 
      WHERE activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      ORDER BY activity_date DESC
    `;

    const [dailyRows] = await bigquery.query({
      query: dailyQuery,
      jobTimeoutMs: 60000,
    });

    const daily_activity = dailyRows.map((row: any) => {
      const totalFeesAtomic = parseInt(row.total_fees || '0');
      const avgFeeAtomic = parseFloat(row.avg_fee_per_transaction || '0');
      const minFeeAtomic = parseInt(row.min_fee || '0');
      const maxFeeAtomic = parseInt(row.max_fee || '0');
      
      return {
        activity_date: row.activity_date?.value || row.activity_date,
        webhook_path: row.webhook_path,
        total_blocks: parseInt(row.total_blocks || '0'),
        unique_blocks: parseInt(row.unique_blocks || '0'),
        total_transactions: parseInt(row.total_transactions || '0'),
        successful_transactions: parseInt(row.successful_transactions || '0'),
        failed_transactions: parseInt(row.failed_transactions || '0'),
        success_rate: row.success_rate ? parseFloat(row.success_rate) : null,
        unique_addresses: parseInt(row.unique_addresses || '0'),
        total_operations: parseInt(row.total_operations || '0'),
        avg_transactions_per_block: row.avg_transactions_per_block ? parseFloat(row.avg_transactions_per_block) : null,
        avg_transactions_per_address: row.avg_transactions_per_address ? parseFloat(row.avg_transactions_per_address) : null,
        created_at: row.created_at?.value || row.created_at,
        
        // Raw atomic fees (preserved)
        atomic_total_fees: totalFeesAtomic.toString(),
        atomic_avg_fee_per_transaction: avgFeeAtomic.toString(),
        atomic_min_fee: minFeeAtomic.toString(),
        atomic_max_fee: maxFeeAtomic.toString(),
        
        // Formatted fees
        formatted_total_fees: formatStxAmount(totalFeesAtomic),
        formatted_avg_fee_per_transaction: formatStxAmount(avgFeeAtomic),
        formatted_min_fee: formatStxAmount(minFeeAtomic),
        formatted_max_fee: formatStxAmount(maxFeeAtomic),
        display_total_fees: `${formatStxAmount(totalFeesAtomic).toFixed(6)} STX`,
        display_avg_fee_per_transaction: `${formatStxAmount(avgFeeAtomic).toFixed(6)} STX`,
        display_min_fee: `${formatStxAmount(minFeeAtomic).toFixed(6)} STX`,
        display_max_fee: `${formatStxAmount(maxFeeAtomic).toFixed(6)} STX`,
        
        // Legacy fields for backwards compatibility (remove later)
        total_fees: totalFeesAtomic,
        avg_fee_per_transaction: avgFeeAtomic,
        min_fee: minFeeAtomic,
        max_fee: maxFeeAtomic
      };
    });

    // Calculate summary metrics with formatting
    const totalFeesSum = daily_activity.reduce((sum, day) => sum + (day.total_fees || 0), 0);
    
    const summary = {
      total_days: daily_activity.length,
      total_blocks: daily_activity.reduce((sum, day) => sum + day.total_blocks, 0),
      total_transactions: daily_activity.reduce((sum, day) => sum + day.total_transactions, 0),
      avg_success_rate: daily_activity.length > 0 
        ? daily_activity.reduce((sum, day) => sum + (day.success_rate || 0), 0) / daily_activity.length
        : 0,
      avg_daily_transactions: daily_activity.length > 0
        ? daily_activity.reduce((sum, day) => sum + day.total_transactions, 0) / daily_activity.length
        : 0,
      
      // Raw atomic fees (preserved)
      atomic_total_fees: totalFeesSum.toString(),
      
      // Formatted fees
      formatted_total_fees: formatStxAmount(totalFeesSum),
      display_total_fees: `${formatStxAmount(totalFeesSum).toFixed(6)} STX`,
      
      // Legacy field for backwards compatibility (remove later)
      total_fees: totalFeesSum
    };

    return NextResponse.json({
      daily_activity,
      summary,
      formatting_info: {
        note: "Daily fee amounts are formatted dynamically from atomic STX units",
        atomic_units_stored: true,
        formatting_applied_at_read_time: true
      },
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    console.error('Daily Analytics API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch daily analytics',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
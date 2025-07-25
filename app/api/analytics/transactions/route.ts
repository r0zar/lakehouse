import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount } from '@/lib/token-formatting';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const txType = searchParams.get('type'); // Filter by transaction type
    const status = searchParams.get('status'); // Filter by success/failed
    const feeCategory = searchParams.get('fee_category'); // Filter by fee category

    // Sanitize inputs to prevent SQL injection
    const sanitizeString = (str: string | null): string | null => {
      if (!str) return null;
      // Remove any characters that could be used for SQL injection
      return str.replace(/[';"\\]/g, '').trim();
    };
    
    const sanitizedTxType = sanitizeString(txType);
    const sanitizedStatus = sanitizeString(status);
    const sanitizedFeeCategory = sanitizeString(feeCategory);
    
    // Build parameterized where conditions
    const whereConditions: string[] = [];
    const validTxTypes = ['contract_call', 'token_transfer', 'smart_contract', 'coinbase', 'tenure_change'];
    const validStatuses = ['success', 'failed'];
    const validFeeCategories = ['low', 'medium', 'high'];
    
    if (sanitizedTxType && validTxTypes.includes(sanitizedTxType)) {
      whereConditions.push(`transaction_type = '${sanitizedTxType}'`);
    }
    
    if (sanitizedStatus && validStatuses.includes(sanitizedStatus)) {
      whereConditions.push(`status = '${sanitizedStatus}'`);
    }
    
    if (sanitizedFeeCategory && validFeeCategories.includes(sanitizedFeeCategory)) {
      whereConditions.push(`fee_category = '${sanitizedFeeCategory}'`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : 'WHERE 1=1';

    const query = `
      SELECT 
        tx_hash,
        block_hash,
        block_index,
        description,
        fee,
        success,
        operation_count,
        transaction_type,
        fee_per_operation,
        fee_category,
        status,
        webhook_path,
        created_at,
        updated_at
      FROM crypto_data.dim_transactions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows] = await bigquery.query({
      query,
      jobTimeoutMs: 60000,
    });

    // Format the transaction fees in each row
    const formattedRows = rows.map(row => {
      const atomicFee = row.fee ? parseInt(row.fee) : null;
      const formattedFee = atomicFee ? formatStxAmount(atomicFee) : null;
      const atomicFeePerOp = row.fee_per_operation ? parseInt(row.fee_per_operation) : null;
      const formattedFeePerOp = atomicFeePerOp ? formatStxAmount(atomicFeePerOp) : null;
      
      return {
        ...row,
        // Raw atomic fees (preserved)
        atomic_fee: atomicFee?.toString(),
        atomic_fee_per_operation: atomicFeePerOp?.toString(),
        
        // Formatted fees
        formatted_fee: formattedFee,
        formatted_fee_per_operation: formattedFeePerOp,
        display_fee: formattedFee ? `${formattedFee.toFixed(6)} STX` : null,
        display_fee_per_operation: formattedFeePerOp ? `${formattedFeePerOp.toFixed(6)} STX` : null
      };
    });

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM crypto_data.dim_transactions  
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
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN success = false THEN 1 END) as failed_transactions,
        ROUND(AVG(CASE WHEN success = true THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate_percent,
        SUM(fee) as total_fees,
        AVG(fee) as avg_fee,
        MAX(fee) as max_fee,
        MIN(fee) as min_fee,
        COUNT(DISTINCT transaction_type) as unique_transaction_types,
        AVG(operation_count) as avg_operations_per_tx
      FROM crypto_data.dim_transactions
      ${whereClause}
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 30000,
    });

    const summary = summaryRows[0] || {};
    
    // Format summary statistics
    const totalFeesAtomic = parseInt(summary.total_fees || '0');
    const avgFeeAtomic = parseFloat(summary.avg_fee || '0');
    const maxFeeAtomic = parseInt(summary.max_fee || '0');
    const minFeeAtomic = parseInt(summary.min_fee || '0');
    
    const formattedSummary = {
      total_transactions: parseInt(summary.total_transactions || '0'),
      successful_transactions: parseInt(summary.successful_transactions || '0'),
      failed_transactions: parseInt(summary.failed_transactions || '0'),
      success_rate_percent: parseFloat(summary.success_rate_percent || '0'),
      unique_transaction_types: parseInt(summary.unique_transaction_types || '0'),
      avg_operations_per_tx: Math.round(parseFloat(summary.avg_operations_per_tx || '0') * 10) / 10,
      
      // Raw atomic fees (preserved)
      atomic_total_fees: totalFeesAtomic.toString(),
      atomic_avg_fee: avgFeeAtomic.toString(),
      atomic_max_fee: maxFeeAtomic.toString(),
      atomic_min_fee: minFeeAtomic.toString(),
      
      // Formatted fees
      formatted_total_fees: formatStxAmount(totalFeesAtomic),
      formatted_avg_fee: formatStxAmount(avgFeeAtomic),
      formatted_max_fee: formatStxAmount(maxFeeAtomic),
      formatted_min_fee: formatStxAmount(minFeeAtomic),
      display_total_fees: `${formatStxAmount(totalFeesAtomic).toFixed(6)} STX`,
      display_avg_fee: `${formatStxAmount(avgFeeAtomic).toFixed(6)} STX`,
      display_max_fee: `${formatStxAmount(maxFeeAtomic).toFixed(6)} STX`,
      display_min_fee: `${formatStxAmount(minFeeAtomic).toFixed(6)} STX`
    };

    // Get transaction type breakdown
    const typeBreakdownQuery = `
      SELECT 
        transaction_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage,
        AVG(fee) as avg_fee,
        ROUND(AVG(CASE WHEN success = true THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
      FROM crypto_data.dim_transactions
      ${whereClause}
      GROUP BY transaction_type
      ORDER BY count DESC
    `;

    const [typeBreakdownRows] = await bigquery.query({
      query: typeBreakdownQuery,
      jobTimeoutMs: 30000,
    });
    
    // Format type breakdown fees
    const formattedTypeBreakdown = typeBreakdownRows.map(row => {
      const avgFeeAtomic = parseFloat(row.avg_fee || '0');
      const formattedAvgFee = formatStxAmount(avgFeeAtomic);
      
      return {
        ...row,
        atomic_avg_fee: avgFeeAtomic.toString(),
        formatted_avg_fee: formattedAvgFee,
        display_avg_fee: `${formattedAvgFee.toFixed(6)} STX`
      };
    });

    return NextResponse.json({
      data: formattedRows,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount,
      },
      summary: formattedSummary,
      transaction_types: formattedTypeBreakdown,
      filters: {
        type: txType,
        status,
        fee_category: feeCategory,
        limit,
        offset,
      },
      formatting_info: {
        note: "Transaction fees are formatted dynamically from atomic STX units",
        atomic_units_stored: true,
        formatting_applied_at_read_time: true
      },
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
      }
    });

  } catch (error: any) {
    console.error('Transaction analytics API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch transaction data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
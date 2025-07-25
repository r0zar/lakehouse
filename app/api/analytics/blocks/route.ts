import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { formatStxAmount } from '@/lib/token-formatting';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const query = `
      SELECT 
        block_hash,
        block_index,
        block_time,
        bitcoin_anchor_hash,
        bitcoin_anchor_index,
        transaction_count,
        total_fees,
        successful_transactions,
        failed_transactions,
        success_rate,
        avg_fee_per_transaction,
        unique_addresses,
        created_at,
        updated_at
      FROM crypto_data.dim_blocks
      ORDER BY block_index DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows] = await bigquery.query({
      query,
      jobTimeoutMs: 60000,
    });

    // Format the fee amounts in each row
    const formattedRows = rows.map(row => {
      const totalFeesAtomic = row.total_fees ? parseInt(row.total_fees) : null;
      const avgFeeAtomic = row.avg_fee_per_transaction ? parseFloat(row.avg_fee_per_transaction) : null;
      const formattedTotalFees = totalFeesAtomic ? formatStxAmount(totalFeesAtomic) : null;
      const formattedAvgFee = avgFeeAtomic ? formatStxAmount(avgFeeAtomic) : null;
      
      return {
        ...row,
        // Raw atomic fees (preserved)
        atomic_total_fees: totalFeesAtomic?.toString(),
        atomic_avg_fee_per_transaction: avgFeeAtomic?.toString(),
        
        // Formatted fees
        formatted_total_fees: formattedTotalFees,
        formatted_avg_fee_per_transaction: formattedAvgFee,
        display_total_fees: formattedTotalFees ? `${formattedTotalFees.toFixed(6)} STX` : null,
        display_avg_fee_per_transaction: formattedAvgFee ? `${formattedAvgFee.toFixed(6)} STX` : null
      };
    });

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM crypto_data.dim_blocks
    `;

    const [countRows] = await bigquery.query({
      query: countQuery,
      jobTimeoutMs: 30000,
    });

    const totalCount = parseInt(countRows[0]?.total_count || '0');

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_blocks,
        SUM(transaction_count) as total_transactions,
        SUM(total_fees) as total_fees_all_blocks,
        AVG(transaction_count) as avg_transactions_per_block,
        AVG(total_fees) as avg_fees_per_block,
        AVG(success_rate) as avg_success_rate,
        AVG(unique_addresses) as avg_unique_addresses_per_block,
        MAX(block_index) as latest_block_index,
        MIN(block_index) as earliest_block_index
      FROM crypto_data.dim_blocks
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 30000,
    });

    const summary = summaryRows[0] || {};
    
    // Format summary statistics
    const totalFeesAllBlocksAtomic = parseInt(summary.total_fees_all_blocks || '0');
    const avgFeesPerBlockAtomic = parseFloat(summary.avg_fees_per_block || '0');
    
    const formattedSummary = {
      total_blocks: parseInt(summary.total_blocks || '0'),
      total_transactions: parseInt(summary.total_transactions || '0'),
      avg_transactions_per_block: Math.round(parseFloat(summary.avg_transactions_per_block || '0') * 10) / 10,
      avg_success_rate: Math.round(parseFloat(summary.avg_success_rate || '0') * 100),
      avg_unique_addresses_per_block: Math.round(parseFloat(summary.avg_unique_addresses_per_block || '0') * 10) / 10,
      latest_block_index: parseInt(summary.latest_block_index || '0'),
      earliest_block_index: parseInt(summary.earliest_block_index || '0'),
      
      // Raw atomic fees (preserved)
      atomic_total_fees_all_blocks: totalFeesAllBlocksAtomic.toString(),
      atomic_avg_fees_per_block: avgFeesPerBlockAtomic.toString(),
      
      // Formatted fees
      formatted_total_fees_all_blocks: formatStxAmount(totalFeesAllBlocksAtomic),
      formatted_avg_fees_per_block: formatStxAmount(avgFeesPerBlockAtomic),
      display_total_fees_all_blocks: `${formatStxAmount(totalFeesAllBlocksAtomic).toFixed(6)} STX`,
      display_avg_fees_per_block: `${formatStxAmount(avgFeesPerBlockAtomic).toFixed(6)} STX`
    };

    return NextResponse.json({
      data: formattedRows,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount,
      },
      summary: formattedSummary,
      filters: {
        limit,
        offset,
      },
      formatting_info: {
        note: "Block fees are formatted dynamically from atomic STX units",
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
    console.error('Blocks analytics API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch blocks data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const protocolCategory = searchParams.get('protocol_category');
    const activityLevel = searchParams.get('activity_level');
    const contractSearch = searchParams.get('contract_search');

    let whereClause = 'WHERE 1=1';
    
    if (protocolCategory) {
      whereClause += ` AND protocol_category = '${protocolCategory}'`;
    }
    
    if (activityLevel) {
      whereClause += ` AND activity_level = '${activityLevel}'`;
    }
    
    if (contractSearch) {
      whereClause += ` AND (LOWER(contract_identifier) LIKE LOWER('%${contractSearch}%') OR LOWER(contract_name) LIKE LOWER('%${contractSearch}%'))`;
    }

    const query = `
      SELECT 
        contract_identifier,
        contract_deployer,
        contract_name,
        action,
        event_count,
        unique_transactions,
        unique_blocks,
        successful_transactions,
        failed_transactions,
        success_rate,
        avg_transaction_fee,
        total_fees_generated,
        protocol_category,
        activity_level,
        first_seen,
        last_seen,
        updated_at
      FROM crypto_data.dim_smart_contract_activity
      ${whereClause}
      ORDER BY event_count DESC
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
      FROM crypto_data.dim_smart_contract_activity  
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
        COUNT(DISTINCT contract_identifier) as total_contracts,
        COUNT(DISTINCT action) as total_actions,
        SUM(event_count) as total_events,
        SUM(unique_transactions) as total_transactions,
        AVG(success_rate) as avg_success_rate,
        SUM(total_fees_generated) as total_fees_all_contracts,
        COUNT(CASE WHEN activity_level = 'very_high' THEN 1 END) as very_high_activity_contracts,
        COUNT(CASE WHEN activity_level = 'high' THEN 1 END) as high_activity_contracts,
        COUNT(CASE WHEN activity_level = 'medium' THEN 1 END) as medium_activity_contracts,
        COUNT(CASE WHEN activity_level = 'low' THEN 1 END) as low_activity_contracts
      FROM crypto_data.dim_smart_contract_activity
      ${whereClause}
    `;

    const [summaryRows] = await bigquery.query({
      query: summaryQuery,
      jobTimeoutMs: 30000,
    });

    const summary = summaryRows[0] || {};

    // Get protocol category breakdown
    const protocolBreakdownQuery = `
      SELECT 
        protocol_category,
        COUNT(DISTINCT contract_identifier) as contract_count,
        SUM(event_count) as total_events,
        AVG(success_rate) as avg_success_rate,
        SUM(total_fees_generated) as total_fees
      FROM crypto_data.dim_smart_contract_activity
      ${whereClause}
      GROUP BY protocol_category
      ORDER BY total_events DESC
    `;

    const [protocolBreakdownRows] = await bigquery.query({
      query: protocolBreakdownQuery,
      jobTimeoutMs: 30000,
    });

    return NextResponse.json({
      data: rows,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount,
      },
      summary: {
        total_contracts: parseInt(summary.total_contracts || '0'),
        total_actions: parseInt(summary.total_actions || '0'),
        total_events: parseInt(summary.total_events || '0'),
        total_transactions: parseInt(summary.total_transactions || '0'),
        avg_success_rate: Math.round(parseFloat(summary.avg_success_rate || '0') * 100),
        total_fees_all_contracts: parseInt(summary.total_fees_all_contracts || '0'),
        activity_distribution: {
          very_high: parseInt(summary.very_high_activity_contracts || '0'),
          high: parseInt(summary.high_activity_contracts || '0'),
          medium: parseInt(summary.medium_activity_contracts || '0'),
          low: parseInt(summary.low_activity_contracts || '0'),
        }
      },
      protocol_breakdown: protocolBreakdownRows,
      filters: {
        protocol_category: protocolCategory,
        activity_level: activityLevel,
        contract_search: contractSearch,
        limit,
        offset,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Smart contract analytics API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch smart contract data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
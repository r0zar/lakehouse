import { NextResponse } from 'next/server'
import { bigquery } from '@/lib/bigquery'

export async function GET() {
  try {
    const dataset = process.env.BIGQUERY_DATASET || 'crypto_data_test';
    
    // Get total events count
    const [totalEventsRows] = await bigquery.query({
      query: `SELECT COUNT(*) as total FROM ${dataset}.events`,
      location: 'US'
    })
    const totalEvents = totalEventsRows[0]?.total || 0

    // Get recent events (last 24 hours)
    const [recentEventsRows] = await bigquery.query({
      query: `
        SELECT COUNT(*) as recent 
        FROM ${dataset}.events 
        WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
      `,
      location: 'US'
    })
    const recentEvents = recentEventsRows[0]?.recent || 0

    // Get last event time
    const [lastEventRows] = await bigquery.query({
      query: `
        SELECT MAX(received_at) as last_event 
        FROM ${dataset}.events
      `,
      location: 'US'
    })
    const lastEventTime = lastEventRows[0]?.last_event || null

    // Get staging table counts
    const stagingTables: Record<string, number> = {}
    const stagingTableNames = ['stg_events', 'stg_blocks', 'stg_transactions', 'stg_addresses']
    
    for (const tableName of stagingTableNames) {
      try {
        const [rows] = await bigquery.query({
          query: `SELECT COUNT(*) as count FROM ${dataset}.${tableName}`,
          location: 'US'
        })
        stagingTables[tableName] = rows[0]?.count || 0
      } catch (error) {
        // Table might not exist yet
        stagingTables[tableName] = 0
      }
    }

    return NextResponse.json({
      totalEvents: Number(totalEvents) || 0,
      recentEvents: Number(recentEvents) || 0,
      stagingTables,
      lastEventTime: lastEventTime ? (typeof lastEventTime === 'object' ? lastEventTime.value : lastEventTime) : null,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Failed to get ingestion stats:', error)
    
    return NextResponse.json({
      error: 'Failed to fetch ingestion statistics',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
import { NextResponse } from 'next/server'
import { bigquery, dataset } from '@/lib/bigquery'

export async function GET() {
  try {
    // Test basic BigQuery connection
    const [datasets] = await bigquery.getDatasets()
    
    // Test specific dataset access
    const [tables] = await dataset.getTables()
    
    return NextResponse.json({
      success: true,
      projectId: bigquery.projectId,
      availableDatasets: datasets.map(d => d.id),
      tablesInDataset: tables.map(t => t.id),
      message: 'BigQuery connection successful'
    })
    
  } catch (error: any) {
    console.error('BigQuery connection test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details || 'Connection failed'
    }, { status: 500 })
  }
}
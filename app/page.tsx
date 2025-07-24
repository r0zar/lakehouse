'use client'

import { useEffect, useState } from 'react'

interface PipelineStatus {
  timestamp: string
  architecture: string
  staging: {
    isFresh: boolean
    hasRecentData: boolean
    status: string
  }
  marts: {
    freshness: Record<string, Date | null>
    lastUpdated: Array<{
      name: string
      lastUpdated: Date | null
    }>
  }
  health: {
    overall: string
    issues: string[]
  }
}

interface IngestionStats {
  totalEvents: number
  recentEvents: number
  stagingTables: Record<string, number>
  lastEventTime: string | null
}

export default function Home() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [ingestionStats, setIngestionStats] = useState<IngestionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch pipeline status
        const statusResponse = await fetch('/api/pipeline/status')
        const status = await statusResponse.json()
        setPipelineStatus(status)

        // Fetch ingestion stats
        const statsResponse = await fetch('/api/ingestion/stats')
        const stats = await statsResponse.json()
        setIngestionStats(stats)

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data')
        setLoading(false)
      }
    }

    fetchData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading pipeline status...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Pipeline Status Error</h3>
          <p className="text-gray-600 dark:text-gray-300">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Crypto Data Lakehouse
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Real-time blockchain data ingestion pipeline status
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pipeline Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H9z" />
                </svg>
                Pipeline Status
              </h2>
            </div>
            <div className="p-6">
              <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                <code className="text-gray-800 dark:text-gray-200">
                  {JSON.stringify(pipelineStatus, null, 2)}
                </code>
              </pre>
            </div>
          </div>

          {/* Ingestion Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                <svg className="h-5 w-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Ingestion Stats
              </h2>
            </div>
            <div className="p-6">
              <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-sm overflow-x-auto">
                <code className="text-gray-800 dark:text-gray-200">
                  {JSON.stringify(ingestionStats, null, 2)}
                </code>
              </pre>
            </div>
          </div>
        </div>

        {/* Quick Health Indicators */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <div className={`text-2xl font-bold mb-2 ${
              pipelineStatus?.health.overall === 'healthy' 
                ? 'text-green-600' 
                : 'text-red-600'
            }`}>
              {pipelineStatus?.health.overall === 'healthy' ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Pipeline Health</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold mb-2 text-blue-600">
              {ingestionStats?.totalEvents || 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Total Events</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold mb-2 text-purple-600">
              {Object.keys(ingestionStats?.stagingTables || {}).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Staging Tables</div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Last updated: {pipelineStatus?.timestamp ? new Date(pipelineStatus.timestamp).toLocaleString() : 'Unknown'}
          <br />
          Auto-refreshes every 30 seconds
        </div>
      </div>
    </div>
  );
}

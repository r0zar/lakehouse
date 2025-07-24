import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { processWebhook } from '@/lib/webhook-processor'
import { dataset, bigquery } from '@/lib/bigquery'

// Mock NextRequest for testing
class TestNextRequest {
  headers: Map<string, string>
  url: string
  method: string
  private bodyData: any

  constructor(init: { body?: any, headers?: Record<string, string>, url?: string, method?: string } = {}) {
    this.headers = new Map(Object.entries(init.headers || {}))
    this.url = init.url || 'https://test.com/api/webhook/acceptance-test'
    this.method = init.method || 'POST'
    this.bodyData = init.body || {}
  }

  async json() {
    return this.bodyData
  }

  async text() {
    return JSON.stringify(this.bodyData)
  }
}

describe('processWebhook - Acceptance Tests', () => {
  const testEventIds: string[] = []

  afterAll(async () => {
    // Clean up test data - skip DELETE due to BigQuery streaming buffer limitations
    // Test data will expire naturally or can be cleaned up manually if needed
    if (testEventIds.length > 0) {
      console.log(`Test completed with ${testEventIds.length} test records (cleanup skipped due to streaming buffer)`);
    }
  })

  it('should successfully process and store a real chainhook webhook', async () => {
    // Arrange - Real chainhook data structure
    const realWebhookData = {
      apply: [{
        block_identifier: {
          hash: '0xtest_acceptance_block_hash_123',
          index: 999999
        },
        metadata: {
          bitcoin_anchor_block_identifier: {
            hash: '0xtest_bitcoin_hash',
            index: 888888
          },
          block_time: Date.now(),
          stacks_block_hash: '0xtest_stacks_hash'
        },
        transactions: [{
          transaction_identifier: {
            hash: '0xtest_tx_hash_456'
          },
          metadata: {
            description: 'test acceptance transaction',
            fee: 1000,
            success: true
          },
          operations: []
        }]
      }],
      chainhook: {
        is_streaming_blocks: false,
        predicate: {
          contract_identifier: '*',
          matches_regex: '.*',
          scope: 'print_event'
        },
        uuid: 'test-acceptance-uuid-789'
      },
      events: [],
      rollback: []
    }

    const mockRequest = new TestNextRequest({
      body: realWebhookData,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest-acceptance-test',
        'x-webhook-source': 'acceptance-test',
        'content-length': JSON.stringify(realWebhookData).length.toString()
      },
      url: 'https://test.com/api/webhook/acceptance-test',
      method: 'POST'
    }) as any

    const path = ['acceptance-test']
    const eventId = `acceptance-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    testEventIds.push(eventId)

    // Act
    const result = await processWebhook(mockRequest, path, eventId)

    // Assert
    expect(result.ok).toBe(true)
    expect(result.event_id).toBe(eventId)
    expect(result.error).toBeUndefined()

    // Verify data was actually inserted into BigQuery
    const query = `
      SELECT event_id, webhook_path, body_json, headers, url, method, received_at
      FROM crypto_data.events 
      WHERE event_id = '${eventId}'
    `
    
    const [rows] = await bigquery.query(query)
    expect(rows).toHaveLength(1)
    
    const row = rows[0]
    expect(row.event_id).toBe(eventId)
    expect(row.webhook_path).toBe('acceptance-test')
    expect(row.url).toBe('https://test.com/api/webhook/acceptance-test')
    expect(row.method).toBe('POST')
    
    // Verify JSON data is correctly stored and queryable
    // Parse the JSON strings returned by BigQuery
    const bodyJson = JSON.parse(row.body_json)
    const headers = JSON.parse(row.headers)
    
    expect(bodyJson.apply).toBeDefined()
    expect(bodyJson.apply[0].block_identifier.hash).toBe('0xtest_acceptance_block_hash_123')
    expect(bodyJson.chainhook.uuid).toBe('test-acceptance-uuid-789')
    
    // Verify headers are stored correctly
    expect(headers['content-type']).toBe('application/json')
    expect(headers['user-agent']).toBe('vitest-acceptance-test')
    expect(headers['x-webhook-source']).toBe('acceptance-test')
  }, 30000) // 30 second timeout for BigQuery operations

  it('should handle multiple webhooks and store them correctly', async () => {
    // Arrange - Multiple webhook payloads
    const webhooks = [
      {
        path: ['multi-test', 'webhook-1'],
        data: { test: 'data-1', timestamp: Date.now() }
      },
      {
        path: ['multi-test', 'webhook-2'], 
        data: { test: 'data-2', timestamp: Date.now() + 1000 }
      },
      {
        path: ['multi-test', 'webhook-3'],
        data: { test: 'data-3', timestamp: Date.now() + 2000 }
      }
    ]

    const results: any[] = []
    const eventIds: string[] = []

    // Act - Process all webhooks
    for (const webhook of webhooks) {
      const eventId = `multi-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      eventIds.push(eventId)
      testEventIds.push(eventId)

      const mockRequest = new TestNextRequest({
        body: webhook.data,
        headers: { 'content-type': 'application/json' },
        url: `https://test.com/api/webhook/${webhook.path.join('/')}`
      }) as any

      const result = await processWebhook(mockRequest, webhook.path, eventId)
      results.push(result)
    }

    // Assert - All webhooks processed successfully
    results.forEach((result, index) => {
      expect(result.ok).toBe(true)
      expect(result.event_id).toBe(eventIds[index])
    })

    // Verify all data was inserted
    const query = `
      SELECT event_id, webhook_path, body_json
      FROM crypto_data.events 
      WHERE event_id IN (${eventIds.map(id => `'${id}'`).join(', ')})
      ORDER BY received_at
    `
    
    const [rows] = await bigquery.query(query)
    expect(rows).toHaveLength(3)
    
    rows.forEach((row, index) => {
      expect(row.event_id).toBe(eventIds[index])
      expect(row.webhook_path).toBe(webhooks[index].path.join('/'))
      // Parse the JSON string returned by BigQuery
      const bodyJson = JSON.parse(row.body_json)
      expect(bodyJson.test).toBe(`data-${index + 1}`)
    })
  }, 45000) // 45 second timeout for multiple operations
})
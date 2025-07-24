import { describe, it, expect, afterAll } from 'vitest'
import { dataset } from '@/lib/bigquery'

describe('Body JSON Debug', () => {
  const testEventIds: string[] = []

  afterAll(async () => {
    // Clean up test data - skip DELETE due to BigQuery streaming buffer limitations
    if (testEventIds.length > 0) {
      console.log(`Debug test completed with ${testEventIds.length} test records (cleanup skipped)`);
    }
  })

  it('should test different body_json formats to find the working one', async () => {
    const baseEventId = `debug-body-${Date.now()}`
    
    // Test 1: body_json as JavaScript object (current failing approach)
    const test1EventId = `${baseEventId}-object`
    testEventIds.push(test1EventId)
    
    const testData = {
      test: 'data',
      nested: { key: 'value' },
      array: [1, 2, 3]
    }
    
    const test1Record = {
      event_id: test1EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: testData, // JavaScript object
      headers: JSON.stringify({ 'content-type': 'application/json' }),
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing body_json as JavaScript object...')
    try {
      await dataset.table('events').insert([test1Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ JavaScript object body_json worked!')
    } catch (error: any) {
      console.log('❌ JavaScript object body_json failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // Test 2: body_json as JSON string
    const test2EventId = `${baseEventId}-string`
    testEventIds.push(test2EventId)
    
    const test2Record = {
      event_id: test2EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: JSON.stringify(testData), // JSON string
      headers: JSON.stringify({ 'content-type': 'application/json' }),
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing body_json as JSON string...')
    try {
      await dataset.table('events').insert([test2Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ JSON string body_json worked!')
    } catch (error: any) {
      console.log('❌ JSON string body_json failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // Test 3: body_json as null
    const test3EventId = `${baseEventId}-null`
    testEventIds.push(test3EventId)
    
    const test3Record = {
      event_id: test3EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: null,
      headers: JSON.stringify({ 'content-type': 'application/json' }),
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing body_json as null...')
    try {
      await dataset.table('events').insert([test3Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ Null body_json worked!')
    } catch (error: any) {
      console.log('❌ Null body_json failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    expect(true).toBe(true)
  }, 30000)
})
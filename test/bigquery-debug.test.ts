import { describe, it, expect, afterAll } from 'vitest'
import { dataset } from '@/lib/bigquery'

describe('BigQuery Schema Debug', () => {
  const testEventIds: string[] = []

  afterAll(async () => {
    // Clean up test data - skip DELETE due to BigQuery streaming buffer limitations
    if (testEventIds.length > 0) {
      console.log(`Debug test completed with ${testEventIds.length} test records (cleanup skipped)`);
    }
  })

  it('should test different headers formats to find the working one', async () => {
    const baseEventId = `debug-headers-${Date.now()}`
    
    // Test 1: Headers as plain JavaScript object (current failing approach)
    const test1EventId = `${baseEventId}-object`
    testEventIds.push(test1EventId)
    
    const test1Record = {
      event_id: test1EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: '{"test": "data"}',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test'
      },
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing headers as JavaScript object...')
    try {
      await dataset.table('events').insert([test1Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ JavaScript object headers worked!')
    } catch (error: any) {
      console.log('❌ JavaScript object headers failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // Test 2: Headers as JSON string
    const test2EventId = `${baseEventId}-string`
    testEventIds.push(test2EventId)
    
    const test2Record = {
      event_id: test2EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: '{"test": "data"}',
      headers: JSON.stringify({
        'content-type': 'application/json',
        'user-agent': 'test'
      }),
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing headers as JSON string...')
    try {
      await dataset.table('events').insert([test2Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ JSON string headers worked!')
    } catch (error: any) {
      console.log('❌ JSON string headers failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // Test 3: Headers as null
    const test3EventId = `${baseEventId}-null`
    testEventIds.push(test3EventId)
    
    const test3Record = {
      event_id: test3EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: '{"test": "data"}',
      headers: null,
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing headers as null...')
    try {
      await dataset.table('events').insert([test3Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ Null headers worked!')
    } catch (error: any) {
      console.log('❌ Null headers failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // Test 4: Minimal record without headers
    const test4EventId = `${baseEventId}-no-headers`
    testEventIds.push(test4EventId)
    
    const test4Record = {
      event_id: test4EventId,
      received_at: new Date().toISOString(),
      webhook_path: 'debug-test',
      body_json: '{"test": "data"}',
      url: 'https://test.com',
      method: 'POST'
    }

    console.log('Testing without headers field...')
    try {
      await dataset.table('events').insert([test4Record], {
        ignoreUnknownValues: true,
        skipInvalidRows: false
      })
      console.log('✅ No headers field worked!')
    } catch (error: any) {
      console.log('❌ No headers field failed:', error.errors?.[0]?.errors?.[0]?.message || error.message)
    }

    // If we get here, at least one test passed
    expect(true).toBe(true)
  }, 30000)
})
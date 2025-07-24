import { describe, it, expect, beforeAll } from 'vitest';
import { 
  queryTestDatabase,
  insertTestWebhookData,
  clearTestData,
  generateTestEventId 
} from '../helpers/bigquery-test-utils';
import { runTransformationAsTable } from '../helpers/transformation-runner';

describe('Production Data Validation Tests', () => {
  
  describe('Schema Compatibility', () => {
    it.skip('should validate our pipeline works with current production schema', { timeout: 60000 }, async () => {
      // This test uses actual recent production data to ensure our pipeline 
      // can handle the current webhook schema and data patterns
      
      // Get recent production sample (last 50 events)
      const productionSample = await queryTestDatabase(`
        SELECT 
          event_id,
          received_at,
          webhook_path,
          body_json,
          headers
        FROM crypto_data.events 
        WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR)
        AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        LIMIT 10
      `);

      expect(productionSample.length).toBeGreaterThan(0);
      
      // Clear test environment
      await clearTestData();

      // Process each production sample through our pipeline
      for (const sample of productionSample) {
        const testEventId = generateTestEventId(`prod-validation-${sample.event_id.substring(0, 8)}`);
        
        // Insert production data with test event ID
        await insertTestWebhookData([{
          event_id: testEventId,
          received_at: sample.received_at,
          webhook_path: sample.webhook_path,
          body_json: typeof sample.body_json === 'string' ? sample.body_json : JSON.stringify(sample.body_json),
          headers: typeof sample.headers === 'string' ? sample.headers : JSON.stringify(sample.headers || {})
        }]);

        // Run our ELT pipeline
        await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
        await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
        await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
        
        await runTransformationAsTable('marts/dim_blocks.sql', 'dim_blocks');
        await runTransformationAsTable('marts/dim_transactions.sql', 'dim_transactions');
        await runTransformationAsTable('marts/fact_daily_activity.sql', 'fact_daily_activity');

        // Validate data was processed successfully
        const [blocks, transactions, addresses] = await Promise.all([
          queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_blocks WHERE event_id = '${testEventId}'`),
          queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_transactions WHERE event_id = '${testEventId}'`),
          queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_addresses WHERE event_id = '${testEventId}'`)
        ]);

        // Every production webhook should produce at least 1 block
        expect(blocks[0].count, `Failed to process block for event ${sample.event_id}`).toBeGreaterThan(0);
        
        // Transactions and addresses depend on the webhook content
        expect(transactions[0].count, `Unexpected transaction count for event ${sample.event_id}`).toBeGreaterThanOrEqual(0);
        expect(addresses[0].count, `Unexpected address count for event ${sample.event_id}`).toBeGreaterThanOrEqual(0);
      }

      console.log(`✅ Successfully validated pipeline with ${productionSample.length} production webhooks`);
    });

    it.skip('should handle all webhook paths from production', { timeout: 30000 }, async () => {
      // Validate we can handle all webhook paths currently in production
      const webhookPaths = await queryTestDatabase(`
        SELECT 
          webhook_path,
          COUNT(*) as event_count,
          COUNT(DISTINCT JSON_EXTRACT_SCALAR(body_json, '$.chainhook.uuid')) as unique_chainhooks
        FROM crypto_data.events
        WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        GROUP BY webhook_path
        ORDER BY event_count DESC
      `);

      expect(webhookPaths.length).toBeGreaterThan(0);
      
      for (const pathInfo of webhookPaths) {
        console.log(`Found webhook path: ${pathInfo.webhook_path} (${pathInfo.event_count} events, ${pathInfo.unique_chainhooks} chainhooks)`);
        
        // Validate our staging models can handle this webhook path
        const sampleForPath = await queryTestDatabase(`
          SELECT event_id, received_at, webhook_path, body_json, headers
          FROM crypto_data.events 
          WHERE webhook_path = '${pathInfo.webhook_path}'
          AND received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
          LIMIT 1
        `);

        if (sampleForPath.length > 0) {
          const testEventId = generateTestEventId(`path-test-${pathInfo.webhook_path.replace(/[^a-zA-Z0-9]/g, '-')}`);
          
          await insertTestWebhookData([{
            event_id: testEventId,
            received_at: sampleForPath[0].received_at,
            webhook_path: sampleForPath[0].webhook_path,
            body_json: typeof sampleForPath[0].body_json === 'string' ? sampleForPath[0].body_json : JSON.stringify(sampleForPath[0].body_json),
            headers: typeof sampleForPath[0].headers === 'string' ? sampleForPath[0].headers : JSON.stringify(sampleForPath[0].headers || {})
          }]);

          // Should process without errors
          await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
          
          const blocks = await queryTestDatabase(`
            SELECT COUNT(*) as count FROM crypto_data_test.stg_blocks 
            WHERE event_id = '${testEventId}' AND webhook_path = '${pathInfo.webhook_path}'
          `);
          
          expect(blocks[0].count).toBeGreaterThan(0);
        }
      }
    });

    it('should validate production data quality expectations', { timeout: 45000 }, async () => {
      // Load recent production data and validate it meets our quality expectations
      const qualityCheck = await queryTestDatabase(`
        WITH recent_data AS (
          SELECT 
            event_id,
            received_at,
            webhook_path,
            JSON_EXTRACT_SCALAR(body_json, '$.chainhook.uuid') as chainhook_uuid,
            ARRAY_LENGTH(JSON_EXTRACT_ARRAY(body_json, '$.apply')) as blocks_in_webhook,
            body_json
          FROM crypto_data.events
          WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 6 HOUR)
          AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        )
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT webhook_path) as unique_paths,
          COUNT(DISTINCT chainhook_uuid) as unique_chainhooks,
          AVG(blocks_in_webhook) as avg_blocks_per_webhook,
          MIN(blocks_in_webhook) as min_blocks,
          MAX(blocks_in_webhook) as max_blocks,
          COUNT(CASE WHEN blocks_in_webhook = 0 THEN 1 END) as empty_webhooks
        FROM recent_data
      `);

      expect(qualityCheck).toHaveLength(1);
      
      const quality = qualityCheck[0];
      
      // Production data quality expectations
      expect(quality.total_events, 'Should have recent production events').toBeGreaterThan(0);
      expect(quality.unique_paths, 'Should have at least 1 webhook path').toBeGreaterThan(0);
      expect(quality.unique_chainhooks, 'Should have at least 1 chainhook UUID').toBeGreaterThan(0);
      expect(quality.avg_blocks_per_webhook, 'Average blocks per webhook should be reasonable').toBeGreaterThan(0);
      expect(quality.min_blocks, 'Minimum blocks should be at least 1').toBeGreaterThanOrEqual(1);
      expect(quality.empty_webhooks, 'Should have no empty webhooks').toBe(0);

      console.log(`📊 Production data quality: ${quality.total_events} events, ${quality.unique_paths} paths, ${quality.unique_chainhooks} chainhooks`);
      console.log(`📊 Blocks per webhook: avg=${quality.avg_blocks_per_webhook}, min=${quality.min_blocks}, max=${quality.max_blocks}`);
    });
  });

  describe('Performance Validation', () => {
    it.skip('should process production data within acceptable time limits', { timeout: 60000 }, async () => {
      // Test processing speed with production data volume
      const startTime = Date.now();
      
      // Get a batch of recent production data
      const batchSize = 10;
      const productionBatch = await queryTestDatabase(`
        SELECT event_id, received_at, webhook_path, body_json, headers
        FROM crypto_data.events
        WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR)
        AND JSON_EXTRACT_ARRAY(body_json, '$.apply') IS NOT NULL
        LIMIT ${batchSize}
      `);

      expect(productionBatch.length).toBeGreaterThan(5);

      await clearTestData();

      // Process batch with time tracking
      const testEvents = productionBatch.map((sample, index) => ({
        event_id: generateTestEventId(`perf-test-${index}`),
        received_at: sample.received_at,
        webhook_path: sample.webhook_path,
        body_json: typeof sample.body_json === 'string' ? sample.body_json : JSON.stringify(sample.body_json),
        headers: typeof sample.headers === 'string' ? sample.headers : JSON.stringify(sample.headers || {})
      }));

      const insertStart = Date.now();
      await insertTestWebhookData(testEvents);
      const insertTime = Date.now() - insertStart;

      const transformStart = Date.now();
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/dim_blocks.sql', 'dim_blocks');
      await runTransformationAsTable('marts/dim_transactions.sql', 'dim_transactions');
      await runTransformationAsTable('marts/fact_daily_activity.sql', 'fact_daily_activity');
      const transformTime = Date.now() - transformStart;

      const totalTime = Date.now() - startTime;

      // Performance expectations
      const avgInsertTimePerEvent = insertTime / productionBatch.length;
      const avgTransformTimePerEvent = transformTime / productionBatch.length;

      expect(avgInsertTimePerEvent, 'Insert time per event should be reasonable').toBeLessThan(1000); // < 1s per event
      expect(avgTransformTimePerEvent, 'Transform time per event should be reasonable').toBeLessThan(2000); // < 2s per event
      expect(totalTime, 'Total processing time should be reasonable').toBeLessThan(90000); // < 90s total

      console.log(`⚡ Performance: ${batchSize} events processed in ${totalTime}ms`);
      console.log(`⚡ Insert: ${insertTime}ms (${avgInsertTimePerEvent.toFixed(2)}ms/event)`);
      console.log(`⚡ Transform: ${transformTime}ms (${avgTransformTimePerEvent.toFixed(2)}ms/event)`);

      // Validate all data was processed
      const finalCounts = await queryTestDatabase(`
        SELECT 
          (SELECT COUNT(*) FROM crypto_data_test.stg_blocks) as blocks,
          (SELECT COUNT(*) FROM crypto_data_test.stg_transactions) as transactions,
          (SELECT COUNT(*) FROM crypto_data_test.stg_addresses) as addresses,
          (SELECT COUNT(*) FROM crypto_data_test.dim_blocks) as dim_blocks,
          (SELECT COUNT(*) FROM crypto_data_test.dim_transactions) as dim_transactions,
          (SELECT COUNT(*) FROM crypto_data_test.fact_daily_activity) as daily_activity
      `);

      const counts = finalCounts[0];
      expect(counts.blocks, 'Should process all blocks').toBe(batchSize);
      expect(counts.dim_blocks, 'Should create dimensional blocks').toBe(batchSize);
      expect(counts.transactions, 'Should process transactions').toBeGreaterThanOrEqual(0);
      expect(counts.addresses, 'Should process addresses').toBeGreaterThanOrEqual(0);
    });
  });
});
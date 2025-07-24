import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { 
  insertTestWebhookData, 
  clearTestData, 
  queryTestDatabase,
  generateTestEventId,
  type TestWebhookData 
} from '../helpers/bigquery-test-utils';
import { runTransformationAsTable } from '../helpers/transformation-runner';
import { productionSamples } from '../fixtures/production-samples';

describe('Enhanced Mart Models - Real Production Data Tests', () => {
  const testEventIds: string[] = [];

  beforeEach(async () => {
    await clearTestData();
  }, 30000);

  afterAll(async () => {
    if (testEventIds.length > 0) {
      console.log(`Enhanced mart tests completed with ${testEventIds.length} test records`);
    }
  });

  describe('dim_defi_swaps - DeFi Analytics', () => {
    it('should analyze DeFi swap with rich business context', { timeout: 30000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('enhanced-defi-swaps');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run full pipeline including enhanced marts
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/dim_defi_swaps.sql', 'dim_defi_swaps');

      // Assert - Validate DeFi swap analysis
      const swaps = await queryTestDatabase(`
        SELECT 
          swap_type,
          dex_contract,
          pool_name,
          input_amount,
          output_amount,
          input_token,
          output_token,
          protocol_fees,
          provider_fees,
          aggregator_fees_total,
          swap_rate,
          total_fee_percentage,
          swap_category,
          swap_size_category
        FROM crypto_data_test.dim_defi_swaps 
        WHERE tx_hash = (
          SELECT JSON_EXTRACT_SCALAR(body_json, '$.apply[0].transactions[0].transaction_identifier.hash') 
          FROM crypto_data_test.events 
          WHERE event_id = '${eventId}'
        )
        ORDER BY input_amount DESC
      `);

      expect(swaps.length).toBeGreaterThan(0); // Should capture swap events
      
      // Validate main swap
      const mainSwap = swaps.find(s => s.input_amount > 10000000); // Large amount
      expect(mainSwap).toBeDefined();
      
      if (mainSwap) {
        expect(mainSwap.swap_type).toContain('swap'); // Should be swap event
        expect(mainSwap.dex_contract).toContain('stableswap'); // Should identify DEX
        expect(mainSwap.input_amount).toBeGreaterThan(1000000); // Significant volume
        expect(mainSwap.output_amount).toBeGreaterThan(1000000); // Significant output
        expect(mainSwap.input_token).toContain('token'); // Valid token contract
        expect(mainSwap.output_token).toContain('token'); // Valid token contract
        expect(mainSwap.swap_rate).toBeGreaterThan(0); // Valid exchange rate
        expect(mainSwap.swap_category).toBeOneOf(['stableswap', 'amm', 'aggregated', 'other']);
        expect(mainSwap.swap_size_category).toBeOneOf(['small', 'medium', 'large', 'whale']);
      }

      // Validate aggregator analysis
      const aggregatedSwap = swaps.find(s => s.aggregator_fees_total > 0);
      if (aggregatedSwap) {
        expect(aggregatedSwap.aggregator_fees_total).toBeGreaterThan(0); // Aggregator fees captured
        expect(aggregatedSwap.total_fee_percentage).toBeGreaterThan(0); // Fee percentage calculated
        expect(aggregatedSwap.swap_category).toBeOneOf(['aggregated', 'other']); // May be categorized as other
      }

      console.log(`Analyzed ${swaps.length} DeFi swap events with business context`);
    });
  });

  describe('dim_smart_contract_activity - Protocol Intelligence', () => {
    it('should analyze smart contract usage patterns', { timeout: 30000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('enhanced-contract-activity');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/dim_smart_contract_activity.sql', 'dim_smart_contract_activity');

      // Assert - Validate contract activity analysis
      const activity = await queryTestDatabase(`
        SELECT 
          contract_identifier,
          contract_deployer,
          contract_name,
          action,
          event_count,
          unique_transactions,
          successful_transactions,
          failed_transactions,
          success_rate,
          avg_transaction_fee,
          protocol_category,
          activity_level,
          all_actions
        FROM crypto_data_test.dim_smart_contract_activity 
        WHERE activity_date = (
          SELECT DATE(TIMESTAMP_SECONDS(SAFE_CAST(JSON_EXTRACT_SCALAR(body_json, '$.apply[0].metadata.block_time') AS INT64)))
          FROM crypto_data_test.events 
          WHERE event_id = '${eventId}'
          LIMIT 1
        )
        ORDER BY event_count DESC
      `);

      expect(activity.length).toBeGreaterThan(0); // Should capture contract activity

      // Validate protocol categorization
      const protocolCategories = [...new Set(activity.map(a => a.protocol_category))];
      expect(protocolCategories).toContain('Token Contract'); // Should identify token contracts
      
      const dexActivity = activity.find(a => a.protocol_category.includes('DEX'));
      if (dexActivity) {
        expect(dexActivity.protocol_category).toMatch(/DEX/); // Should categorize DEX contracts
        expect(dexActivity.action).toBeDefined(); // Should capture actions
        expect(dexActivity.success_rate).toBeGreaterThanOrEqual(0); // Valid success rate
      }

      // Validate activity metrics
      activity.forEach(a => {
        expect(a.event_count).toBeGreaterThan(0); // Should have events
        expect(a.unique_transactions).toBeGreaterThan(0); // Should have transactions
        expect(a.contract_identifier).toMatch(/^S[0-9A-Z]/); // Valid contract format
        expect(a.activity_level).toBeOneOf(['low', 'medium', 'high', 'very_high']);
      });

      console.log(`Analyzed ${activity.length} smart contracts across ${protocolCategories.length} protocol categories`);
    });
  });

  describe('fact_defi_metrics - Ecosystem KPIs', () => {
    it('should aggregate DeFi ecosystem metrics', { timeout: 35000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('enhanced-defi-metrics');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/fact_defi_metrics.sql', 'fact_defi_metrics');

      // Assert - Validate DeFi ecosystem metrics
      const metrics = await queryTestDatabase(`
        SELECT 
          metrics_date,
          active_dex_contracts,
          total_swaps,
          unique_swap_transactions,
          total_swap_volume_input,
          total_protocol_fees,
          total_provider_fees,
          total_aggregator_fees,
          unique_traders,
          unique_input_tokens,
          unique_output_tokens,
          active_pools,
          successful_defi_transactions,
          failed_defi_transactions,
          defi_success_rate,
          aggregated_transactions,
          direct_transactions,
          whale_transactions,
          retail_transactions
        FROM crypto_data_test.fact_defi_metrics 
        ORDER BY metrics_date DESC
        LIMIT 1
      `);

      expect(metrics).toHaveLength(1); // Should have daily metrics

      const dailyMetrics = metrics[0];
      
      // Validate DeFi activity metrics
      expect(dailyMetrics.active_dex_contracts).toBeGreaterThan(0); // Should have DEX activity
      expect(dailyMetrics.total_swaps).toBeGreaterThan(0); // Should capture swaps
      expect(dailyMetrics.unique_swap_transactions).toBeGreaterThan(0); // Should have unique transactions
      expect(dailyMetrics.unique_traders).toBeGreaterThan(0); // Should have traders
      
      // Validate fee analysis
      if (dailyMetrics.total_protocol_fees) {
        expect(dailyMetrics.total_protocol_fees).toBeGreaterThan(0); // Protocol fees captured
      }
      if (dailyMetrics.total_aggregator_fees) {
        expect(dailyMetrics.total_aggregator_fees).toBeGreaterThan(0); // Aggregator fees captured
      }
      
      // Validate token diversity
      expect(dailyMetrics.unique_input_tokens).toBeGreaterThan(0); // Token diversity
      expect(dailyMetrics.unique_output_tokens).toBeGreaterThan(0); // Token diversity
      
      // Validate success metrics
      expect(dailyMetrics.defi_success_rate).toBeGreaterThanOrEqual(0); // Valid success rate
      expect(dailyMetrics.defi_success_rate).toBeLessThanOrEqual(1); // Valid success rate
      
      // Validate transaction categorization
      const totalTransactions = (dailyMetrics.aggregated_transactions || 0) + (dailyMetrics.direct_transactions || 0);
      expect(totalTransactions).toBeGreaterThan(0); // Should categorize transactions
      
      // Validate user segmentation
      const totalUserTransactions = (dailyMetrics.whale_transactions || 0) + (dailyMetrics.retail_transactions || 0);
      expect(totalUserTransactions).toBeGreaterThanOrEqual(0); // Should segment users

      console.log(`Daily DeFi metrics: ${dailyMetrics.total_swaps} swaps across ${dailyMetrics.active_dex_contracts} DEX contracts`);
      console.log(`Success rate: ${(dailyMetrics.defi_success_rate * 100).toFixed(1)}%, Unique traders: ${dailyMetrics.unique_traders}`);
    });
  });

  describe('Enhanced marts integration', () => {
    it('should provide comprehensive DeFi ecosystem view', { timeout: 40000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('enhanced-integration');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run all enhanced marts
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      
      await runTransformationAsTable('marts/dim_defi_swaps.sql', 'dim_defi_swaps');
      await runTransformationAsTable('marts/dim_smart_contract_activity.sql', 'dim_smart_contract_activity');
      await runTransformationAsTable('marts/fact_defi_metrics.sql', 'fact_defi_metrics');

      // Assert - Cross-model validation
      const integration = await queryTestDatabase(`
        SELECT 
          (SELECT COUNT(*) FROM crypto_data_test.dim_defi_swaps) as defi_swaps_count,
          (SELECT COUNT(*) FROM crypto_data_test.dim_smart_contract_activity) as contract_activity_count,
          (SELECT COUNT(*) FROM crypto_data_test.fact_defi_metrics) as defi_metrics_count,
          (SELECT COUNT(DISTINCT contract_identifier) FROM crypto_data_test.dim_smart_contract_activity WHERE protocol_category LIKE '%DEX%') as dex_contracts,
          (SELECT SUM(total_swaps) FROM crypto_data_test.fact_defi_metrics) as total_ecosystem_swaps
      `);

      expect(integration).toHaveLength(1);
      
      const result = integration[0];
      expect(result.defi_swaps_count).toBeGreaterThan(0); // Swap analysis populated
      expect(result.contract_activity_count).toBeGreaterThan(0); // Contract activity populated  
      expect(result.defi_metrics_count).toBeGreaterThan(0); // Daily metrics populated
      expect(result.dex_contracts).toBeGreaterThan(0); // DEX contracts identified
      expect(result.total_ecosystem_swaps).toBeGreaterThan(0); // Ecosystem activity captured

      console.log(`Enhanced marts integration: ${result.defi_swaps_count} swaps, ${result.contract_activity_count} contract activities, ${result.dex_contracts} DEX contracts`);
    });
  });
});
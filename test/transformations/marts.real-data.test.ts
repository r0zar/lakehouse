import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { 
  insertTestWebhookData, 
  clearTestData, 
  queryTestDatabase,
  generateTestEventId,
  type TestWebhookData 
} from '../helpers/bigquery-test-utils';
import { runTransformationAsTable } from '../helpers/transformation-runner';
import { productionSamples, sampleMetadata } from '../fixtures/production-samples';

describe('Mart Models - Real Production Data Tests', () => {
  const testEventIds: string[] = [];

  beforeEach(async () => {
    await clearTestData();
  }, 30000); // 30 second timeout for data clearing

  afterAll(async () => {
    if (testEventIds.length > 0) {
      console.log(`Real mart tests completed with ${testEventIds.length} test records`);
    }
  });

  describe('dim_blocks with real data', () => {
    it('should create dimensional blocks from real DeFi data', { timeout: 20000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-dim-blocks');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run staging + mart pipeline
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/dim_blocks.sql', 'dim_blocks');

      // Assert - Validate dimensional model with real data
      const blocks = await queryTestDatabase(`
        SELECT 
          block_hash,
          block_index,
          block_time,
          transaction_count,
          total_fees,
          success_rate,
          avg_fee_per_transaction,
          unique_addresses,
          webhook_path,
          chainhook_uuid
        FROM crypto_data_test.dim_blocks 
        WHERE block_hash IN (
          SELECT block_hash FROM crypto_data_test.stg_blocks WHERE event_id = '${eventId}'
        )
      `);

      expect(blocks).toHaveLength(1);
      
      const block = blocks[0];
      // Real data characteristics in dimensional model
      expect(block.block_index).toBeGreaterThan(2000000);
      expect(block.transaction_count).toBe(sampleMetadata.successfulDeFiSwap.expectedTransactions);
      expect(block.total_fees).toBeGreaterThan(1000); // Real DeFi fees
      expect(block.success_rate).toBe(1.0); // Successful transaction
      expect(block.avg_fee_per_transaction).toBe(block.total_fees / block.transaction_count); // Real avg calculation
      expect(block.webhook_path).toBe('chainhooks');
      expect(block.chainhook_uuid).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should handle real failed transaction blocks in dimensional model', { timeout: 60000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-dim-blocks-failed');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.failedTransaction,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Full pipeline
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/dim_blocks.sql', 'dim_blocks');

      // Assert - Failed transactions should be reflected in metrics
      const blocks = await queryTestDatabase(`
        SELECT 
          transaction_count,
          total_fees,
          success_rate,
          successful_transactions,
          failed_transactions
        FROM crypto_data_test.dim_blocks 
        WHERE block_hash IN (
          SELECT block_hash FROM crypto_data_test.stg_blocks WHERE event_id = '${eventId}'
        )
      `);

      expect(blocks).toHaveLength(1);
      
      const block = blocks[0];
      expect(block.transaction_count).toBe(sampleMetadata.failedTransaction.expectedTransactions);
      expect(block.total_fees).toBeGreaterThan(0); // Failed transactions still have fees
      expect(block.success_rate).toBeGreaterThanOrEqual(0.0); // May have mixed success/failure
      expect(block.successful_transactions).toBeGreaterThanOrEqual(0);
      expect(block.failed_transactions).toBeGreaterThanOrEqual(1); // At least one failed
    });
  });

  describe('dim_transactions with real data', () => {
    it('should categorize real DeFi transactions correctly', { timeout: 20000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-dim-tx');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('marts/dim_transactions.sql', 'dim_transactions');

      // Assert - Real DeFi transactions should be categorized
      const transactions = await queryTestDatabase(`
        SELECT 
          tx_hash,
          description,
          fee,
          success,
          operation_count,
          transaction_type,
          fee_per_operation,
          fee_category,
          status
        FROM crypto_data_test.dim_transactions 
        WHERE tx_hash IN (
          SELECT tx_hash FROM crypto_data_test.stg_transactions WHERE event_id = '${eventId}'
        )
      `);

      expect(transactions).toHaveLength(sampleMetadata.successfulDeFiSwap.expectedTransactions);
      
      const tx = transactions[0];
      // Real DeFi transaction business logic
      expect(tx.description).toContain('invoked:');
      expect(tx.fee).toBeGreaterThan(100); // Real fees can be as low as 167 STX
      expect(tx.success).toBe(true);
      expect(tx.operation_count).toBeGreaterThanOrEqual(0); // Operations vary per transaction in real data
      
      // Business logic categorization
      expect(tx.transaction_type).toBe('other'); // Complex DeFi = 'other'
      expect(tx.fee_per_operation === null || tx.fee_per_operation > 0).toBe(true); // Can be null if 0 operations
      expect(['low', 'medium', 'high', 'very_high']).toContain(tx.fee_category);
      expect(tx.status).toBe('successful');
    });

    it('should handle real delegate-stx transaction categorization', { timeout: 30000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-dim-pox');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.poxStacking,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('marts/dim_transactions.sql', 'dim_transactions');

      // Assert - POX operations have unique characteristics
      const transactions = await queryTestDatabase(`
        SELECT 
          description,
          operation_count,
          transaction_type,
          fee_per_operation,
          status
        FROM crypto_data_test.dim_transactions 
        WHERE tx_hash IN (
          SELECT tx_hash FROM crypto_data_test.stg_transactions WHERE event_id = '${eventId}'
        )
      `);

      expect(transactions).toHaveLength(sampleMetadata.poxStacking.expectedTransactions);
      
      const tx = transactions[0];
      expect(tx.description.toLowerCase()).toContain('delegate-stx'); // Real sample is POX delegate-stx
      expect(tx.operation_count).toBeGreaterThanOrEqual(0); // Operations vary
      expect(tx.transaction_type).toBe('other'); // delegate-stx categorized as 'other'
      expect(tx.fee_per_operation === null || tx.fee_per_operation > 0).toBe(true); // Can be null or positive
      expect(tx.status).toBe('successful');
    });
  });

  describe('fact_daily_activity with real data', () => {
    it('should aggregate real daily activity metrics', { timeout: 25000 }, async () => {
      // Arrange - Use multiple real samples for daily aggregation
      const eventId1 = generateTestEventId('real-daily-1');
      const eventId2 = generateTestEventId('real-daily-2');
      testEventIds.push(eventId1, eventId2);

      const webhook1: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId1
      };

      const webhook2: TestWebhookData = {
        ...productionSamples.poxStacking,
        event_id: eventId2
      };

      await insertTestWebhookData([webhook1, webhook2]);

      // Act - Full pipeline for daily aggregation
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      await runTransformationAsTable('marts/fact_daily_activity.sql', 'fact_daily_activity');

      // Assert - Daily metrics should aggregate real data
      const dailyActivity = await queryTestDatabase(`
        SELECT 
          activity_date,
          webhook_path,
          total_blocks,
          total_transactions,
          total_fees,
          successful_transactions,
          failed_transactions,
          success_rate,
          avg_fee_per_transaction,
          unique_addresses,
          avg_transactions_per_block
        FROM crypto_data_test.fact_daily_activity
        WHERE webhook_path = 'chainhooks'
      `);

      expect(dailyActivity.length).toBeGreaterThan(0);
      
      const activity = dailyActivity[0];
      // Real daily aggregation characteristics
      expect(activity.total_blocks).toBe(2); // 2 webhook events
      expect(activity.total_transactions).toBeGreaterThanOrEqual(2); // At least one transaction from each webhook
      expect(activity.total_fees).toBeGreaterThan(1000); // Real fees
      expect(activity.successful_transactions).toBeGreaterThanOrEqual(2); // Most successful
      expect(activity.failed_transactions).toBeGreaterThanOrEqual(0);
      expect(activity.success_rate).toBeGreaterThan(0.0);
      expect(activity.avg_fee_per_transaction).toBeGreaterThan(0);
      expect(activity.avg_transactions_per_block).toBeGreaterThan(0); // Real avg
    });
  });

  describe('Integration - Full mart pipeline with real data', () => {
    it('should process complete mart pipeline with real DeFi complexity', { timeout: 45000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-full-marts');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Complete staging + marts pipeline
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');
      
      await runTransformationAsTable('marts/dim_blocks.sql', 'dim_blocks');
      await runTransformationAsTable('marts/dim_transactions.sql', 'dim_transactions');
      await runTransformationAsTable('marts/fact_daily_activity.sql', 'fact_daily_activity');

      // Assert - All mart models should work with real data complexity
      const [blocks, transactions, dailyActivity] = await Promise.all([
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.dim_blocks`),
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.dim_transactions`),
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.fact_daily_activity`)
      ]);

      expect(blocks[0].count).toBe(1);
      expect(transactions[0].count).toBe(sampleMetadata.successfulDeFiSwap.expectedTransactions); // Real production has 5 transactions
      expect(dailyActivity[0].count).toBe(1);

      // Validate cross-model relationships with real data
      const crossModelValidation = await queryTestDatabase(`
        SELECT 
          db.block_hash,
          db.transaction_count as dim_block_tx_count,
          COUNT(DISTINCT dt.tx_hash) as dim_tx_count,
          fda.total_transactions as fact_tx_count,
          fda.total_fees as fact_fees,
          db.total_fees as dim_fees
        FROM crypto_data_test.dim_blocks db
        LEFT JOIN crypto_data_test.dim_transactions dt ON db.block_hash = dt.block_hash
        LEFT JOIN crypto_data_test.fact_daily_activity fda ON DATE(db.block_time) = fda.activity_date
        GROUP BY db.block_hash, db.transaction_count, fda.total_transactions, fda.total_fees, db.total_fees
      `);

      expect(crossModelValidation).toHaveLength(1);
      
      const validation = crossModelValidation[0];
      // All models should agree on transaction counts and fees with real production data
      expect(validation.dim_block_tx_count).toBe(validation.dim_tx_count);
      expect(validation.dim_tx_count).toBe(validation.fact_tx_count);
      expect(Math.abs(validation.dim_fees - validation.fact_fees)).toBeLessThan(1); // Allow for rounding differences
    });
  });
});
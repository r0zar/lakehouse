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

describe('Staging Models - Real Production Data Tests', () => {
  const testEventIds: string[] = [];

  beforeEach(async () => {
    await clearTestData();
  }, 30000); // 30 second timeout for data clearing

  afterAll(async () => {
    if (testEventIds.length > 0) {
      console.log(`Real data tests completed with ${testEventIds.length} test records`);
    }
  });

  describe('stg_blocks with real data', () => {
    it('should handle real DeFi swap webhook structure', { timeout: 15000 }, async () => {
      // Arrange - Use real successful DeFi swap
      const eventId = generateTestEventId('real-defi-swap');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run staging transformation
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');

      // Assert - Validate real data processing
      const blocks = await queryTestDatabase(`
        SELECT 
          block_hash,
          block_index,
          block_time,
          transaction_count,
          webhook_path,
          chainhook_uuid,
          is_streaming_blocks
        FROM crypto_data_test.stg_blocks 
        WHERE event_id = '${eventId}'
      `);

      expect(blocks).toHaveLength(1);
      
      const block = blocks[0];
      // Real production data has specific characteristics
      expect(block.block_hash).toMatch(/^0x[a-f0-9]{64}$/); // Real hash format
      expect(block.block_index).toBeGreaterThan(2000000); // Real Stacks block numbers
      expect(block.transaction_count).toBeGreaterThan(0);
      expect(block.webhook_path).toBe('chainhooks'); // Real webhook path
      expect(block.chainhook_uuid).toMatch(/^[a-f0-9-]{36}$/); // Real UUID format
      expect(block.is_streaming_blocks).toBe(false); // Real production setting
    });

    it('should handle real failed transaction blocks', { timeout: 15000 }, async () => {
      // Arrange - Use real failed transaction
      const eventId = generateTestEventId('real-failed-tx');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.failedTransaction,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');

      // Assert - Should still process blocks even with failed transactions
      const blocks = await queryTestDatabase(`
        SELECT block_hash, transaction_count
        FROM crypto_data_test.stg_blocks 
        WHERE event_id = '${eventId}'
      `);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].transaction_count).toBeGreaterThan(0);
    });
  });

  describe('stg_transactions with real data', () => {
    it('should parse real DeFi swap transaction complexity', { timeout: 15000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-complex-tx');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');

      // Assert - Real DeFi transactions have complex descriptions
      const transactions = await queryTestDatabase(`
        SELECT 
          tx_hash,
          description,
          fee,
          success,
          operation_count
        FROM crypto_data_test.stg_transactions 
        WHERE event_id = '${eventId}'
      `);

      expect(transactions).toHaveLength(sampleMetadata.successfulDeFiSwap.expectedTransactions);
      
      const tx = transactions[0];
      // Real DeFi transaction characteristics
      expect(tx.description).toContain('invoked:'); // Real contract calls
      expect(tx.description).toContain('::'); // Real method calls
      expect(tx.description.length).toBeGreaterThan(50); // Complex real descriptions
      expect(tx.fee).toBeGreaterThan(100); // Real fees can be as low as 167 STX
      expect(typeof tx.success).toBe('boolean'); // Success is boolean
      expect(tx.operation_count).toBeGreaterThanOrEqual(0); // Operations vary by transaction
    });

    it('should handle real failed transaction data', { timeout: 15000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-failed-data');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.failedTransaction,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');

      // Assert - Failed transactions should be captured correctly
      const transactions = await queryTestDatabase(`
        SELECT success, fee, operation_count
        FROM crypto_data_test.stg_transactions 
        WHERE event_id = '${eventId}'
      `);

      expect(transactions.length).toBeGreaterThan(0); // Should have transactions
      // Look for at least one failed transaction in the block
      const hasFailedTransaction = transactions.some(tx => tx.success === false);
      expect(hasFailedTransaction).toBe(true); // Block should contain failed transaction
      expect(transactions[0].fee).toBeGreaterThan(0); // Failed transactions still have fees
    });

    it('should handle real POX stacking operations', { timeout: 15000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-pox-stacking');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.poxStacking,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');

      // Assert - POX operations have specific characteristics
      const transactions = await queryTestDatabase(`
        SELECT description, success, operation_count
        FROM crypto_data_test.stg_transactions 
        WHERE event_id = '${eventId}'
      `);

      expect(transactions.length).toBeGreaterThan(0);
      
      // Look for POX-related transaction in the block
      const poxTransaction = transactions.find(tx => tx.description.toLowerCase().includes('pox'));
      expect(poxTransaction).toBeDefined(); // Should find POX transaction
      expect(typeof poxTransaction!.success).toBe('boolean');
      expect(poxTransaction!.operation_count).toBeGreaterThanOrEqual(0); // POX can have 0+ operations
    });
  });

  describe('stg_addresses with real data', () => {
    it('should extract real address operations from DeFi swaps', { timeout: 15000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-address-ops');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');

      // Assert - Real DeFi swaps have multiple address operations
      const addresses = await queryTestDatabase(`
        SELECT 
          operation_type,
          address,
          contract_identifier,
          COUNT(*) as operation_count
        FROM crypto_data_test.stg_addresses 
        WHERE event_id = '${eventId}'
        AND operation_type IS NOT NULL
        GROUP BY operation_type, address, contract_identifier
        ORDER BY operation_count DESC
      `);

      expect(addresses.length).toBeGreaterThan(0);
      
      // Real DeFi swaps have both DEBIT and CREDIT operations
      const operationTypes = addresses.map(a => a.operation_type);
      expect(operationTypes).toContain('DEBIT');
      expect(operationTypes).toContain('CREDIT');
      
      // Real operations have actual addresses (some might be null for contract operations)  
      const totalOperations = addresses.reduce((sum, a) => sum + a.operation_count, 0);
      expect(totalOperations).toBeGreaterThan(0); // Should have operations from real DeFi block
    });
  });

  describe('Integration - Full pipeline with real data', () => {
    it('should process all staging models with real DeFi data', { timeout: 20000 }, async () => {
      // Arrange - Use real DeFi swap data
      const eventId = generateTestEventId('real-full-pipeline');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run all staging transformations
      await runTransformationAsTable('staging/stg_blocks.sql', 'stg_blocks');
      await runTransformationAsTable('staging/stg_transactions.sql', 'stg_transactions');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');

      // Assert - All models should process the real data successfully
      const [blocks, transactions, addresses] = await Promise.all([
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_blocks WHERE event_id = '${eventId}'`),
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_transactions WHERE event_id = '${eventId}'`),
        queryTestDatabase(`SELECT COUNT(*) as count FROM crypto_data_test.stg_addresses WHERE event_id = '${eventId}'`)
      ]);

      expect(blocks[0].count).toBe(1);
      expect(transactions[0].count).toBeGreaterThan(0); // Real blocks have transactions
      expect(addresses[0].count).toBeGreaterThan(0); // Real transactions have operations

      // Validate data relationships work with real data
      const validation = await queryTestDatabase(`
        SELECT 
          b.block_hash,
          COUNT(DISTINCT t.tx_hash) as tx_count,
          COUNT(a.operation_type) as addr_ops
        FROM crypto_data_test.stg_blocks b
        LEFT JOIN crypto_data_test.stg_transactions t ON b.block_hash = t.block_hash
        LEFT JOIN crypto_data_test.stg_addresses a ON t.tx_hash = a.tx_hash
        WHERE b.event_id = '${eventId}'
        GROUP BY b.block_hash
      `);

      expect(validation).toHaveLength(1);
      expect(validation[0].tx_count).toBeGreaterThan(0); // Real data has transactions  
      expect(validation[0].addr_ops).toBeGreaterThan(0); // Real data has operations
    });
  });
});
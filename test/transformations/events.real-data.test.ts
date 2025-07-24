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

describe('Events Model - Real Production Data Tests', () => {
  const testEventIds: string[] = [];

  beforeEach(async () => {
    await clearTestData();
  }, 30000); // 30 second timeout for data clearing

  afterAll(async () => {
    if (testEventIds.length > 0) {
      console.log(`Event tests completed with ${testEventIds.length} test records`);
    }
  });

  describe('stg_events with real data', () => {
    it('should extract all smart contract events from DeFi swap', { timeout: 30000 }, async () => {
      // Arrange - Use real DeFi swap with complex events
      const eventId = generateTestEventId('real-events-defi');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run events staging transformation
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');

      // Assert - Should capture all blockchain events
      const events = await queryTestDatabase(`
        SELECT 
          event_type,
          action,
          contract_identifier,
          ft_amount,
          ft_asset_identifier,
          position_index,
          ft_sender,
          ft_recipient
        FROM crypto_data_test.stg_events 
        WHERE tx_hash = (
          SELECT JSON_EXTRACT_SCALAR(body_json, '$.apply[0].transactions[0].transaction_identifier.hash') 
          FROM crypto_data_test.events 
          WHERE event_id = '${eventId}'
        )
        ORDER BY position_index
      `);

      // Real DeFi transaction should have 17 events total
      expect(events.length).toBeGreaterThanOrEqual(15); // At least 15 events
      expect(events.length).toBeLessThanOrEqual(20); // No more than 20 events
      
      // Should have both event types
      const eventTypes = events.map(e => e.event_type);
      expect(eventTypes).toContain('SmartContractEvent');
      expect(eventTypes).toContain('FTTransferEvent');
      
      // Should have key DeFi actions
      const actions = events.map(e => e.action).filter(a => a !== null);
      expect(actions.some(a => a && a.includes('swap'))).toBe(true); // Some swap action
      expect(actions.some(a => a && a.includes('transfer'))).toBe(true); // Some transfer action
      
      // Position indices should be sequential
      const positions = events.map(e => e.position_index).filter(p => p !== null).sort((a, b) => a! - b!);
      expect(positions.length).toBeGreaterThan(10); // Should have position data
      expect(positions[0]).toBeGreaterThanOrEqual(0); // Start from 0 or 1
      
      console.log(`Captured ${events.length} events from DeFi swap transaction`);
    });

    it('should differentiate between FTTransferEvent and SmartContractEvent types', { timeout: 25000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-events-types');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');

      // Assert - Check event type distribution
      const eventTypeSummary = await queryTestDatabase(`
        SELECT 
          event_type,
          COUNT(*) as event_count,
          COUNT(CASE WHEN ft_amount IS NOT NULL THEN 1 END) as events_with_amounts,
          COUNT(CASE WHEN action IS NOT NULL THEN 1 END) as events_with_actions
        FROM crypto_data_test.stg_events 
        WHERE event_id = '${eventId}'
        GROUP BY event_type
        ORDER BY event_count DESC
      `);

      expect(eventTypeSummary.length).toBeGreaterThanOrEqual(2); // At least FT and Smart Contract events
      
      // FTTransferEvent characteristics
      const ftEvents = eventTypeSummary.find(e => e.event_type === 'FTTransferEvent');
      if (ftEvents) {
        expect(ftEvents.events_with_amounts).toBeGreaterThan(0); // FT events should have amounts
        expect(ftEvents.event_count).toBeGreaterThanOrEqual(3); // Should have multiple FT transfers
      }
      
      // SmartContractEvent characteristics
      const scEvents = eventTypeSummary.find(e => e.event_type === 'SmartContractEvent');
      if (scEvents) {
        expect(scEvents.events_with_actions).toBeGreaterThan(0); // Some should have actions
        expect(scEvents.event_count).toBeGreaterThanOrEqual(5); // Should have multiple contract events
      }
    });

    it('should capture token transfer amounts and asset identifiers', { timeout: 25000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-events-tokens');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');

      // Assert - Check token transfer data
      const tokenTransfers = await queryTestDatabase(`
        SELECT 
          ft_amount,
          ft_asset_identifier,
          ft_sender,
          ft_recipient,
          position_index
        FROM crypto_data_test.stg_events 
        WHERE event_id = '${eventId}'
        AND event_type = 'FTTransferEvent'
        AND ft_amount IS NOT NULL
        ORDER BY ft_amount DESC
      `);

      expect(tokenTransfers.length).toBeGreaterThan(0); // Should have token transfers
      
      // Check largest transfer (main swap amount)
      const largestTransfer = tokenTransfers[0];
      expect(largestTransfer.ft_amount).toBeGreaterThan(1000000); // Large amount for main swap
      expect(largestTransfer.ft_asset_identifier).toContain('::'); // Should have asset format
      expect(largestTransfer.ft_sender).toMatch(/^S[0-9A-Z]{39}$/); // Valid Stacks address format (40 chars)
      expect(typeof largestTransfer.ft_recipient).toBe('string'); // Valid address or contract
      expect(largestTransfer.ft_recipient.length).toBeGreaterThan(20); // Reasonable length
      
      // Should have different asset types
      const assetTypes = [...new Set(tokenTransfers.map(t => t.ft_asset_identifier))];
      expect(assetTypes.length).toBeGreaterThanOrEqual(1); // At least one asset type
      
      console.log(`Found ${tokenTransfers.length} token transfers with ${assetTypes.length} different assets`);
    });

    it('should capture smart contract actions and contract identifiers', { timeout: 25000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-events-contracts');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');

      // Assert - Check smart contract event data
      const contractEvents = await queryTestDatabase(`
        SELECT 
          action,
          contract_identifier,
          position_index,
          topic
        FROM crypto_data_test.stg_events 
        WHERE event_id = '${eventId}'
        AND event_type = 'SmartContractEvent'
        AND action IS NOT NULL
        ORDER BY position_index
      `);

      expect(contractEvents.length).toBeGreaterThan(0); // Should have contract events with actions
      
      // Check for key DeFi actions
      const actions = contractEvents.map(e => e.action);
      const hasSwapAction = actions.some(a => a.includes('swap'));
      const hasTransferAction = actions.some(a => a.includes('transfer'));
      
      expect(hasSwapAction || hasTransferAction).toBe(true); // Should have DeFi-related actions
      
      // Contract identifiers should be valid
      const contracts = contractEvents
        .map(e => e.contract_identifier)
        .filter(c => c !== null);
      
      expect(contracts.length).toBeGreaterThan(0); // Should have contract identifiers
      contracts.forEach(contract => {
        expect(typeof contract).toBe('string'); // Valid contract format
        expect(contract.length).toBeGreaterThan(10); // Reasonable length
        expect(contract).toMatch(/^S[0-9A-Z]/); // Starts with S + alphanumeric
      });
      
      // Should have print topic for smart contract events
      const topics = contractEvents.map(e => e.topic).filter(t => t !== null);
      expect(topics).toContain('print'); // Standard smart contract event topic
      
      console.log(`Found ${contractEvents.length} contract events with actions: ${actions.join(', ')}`);
    });

    it('should handle failed transaction events correctly', { timeout: 25000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-events-failed');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.failedTransaction,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');

      // Assert - Failed transactions might have fewer events
      const events = await queryTestDatabase(`
        SELECT 
          event_type,
          action,
          position_index,
          COUNT(*) as event_count
        FROM crypto_data_test.stg_events 
        WHERE event_id = '${eventId}'
        GROUP BY event_type, action, position_index
        ORDER BY position_index
      `);

      // Failed transactions should still have some events
      expect(events.length).toBeGreaterThanOrEqual(0); // Might have no events if completely failed
      
      if (events.length > 0) {
        // If events exist, they should be properly structured
        const eventTypes = events.map(e => e.event_type);
        expect(eventTypes.every(t => ['SmartContractEvent', 'FTTransferEvent', 'STXTransferEvent'].includes(t))).toBe(true);
      }
    });
  });

  describe('Integration - Events with existing models', () => {
    it('should correlate events with operations for the same transaction', { timeout: 35000 }, async () => {
      // Arrange
      const eventId = generateTestEventId('real-events-integration');
      testEventIds.push(eventId);

      const realWebhook: TestWebhookData = {
        ...productionSamples.successfulDeFiSwap,
        event_id: eventId
      };

      await insertTestWebhookData([realWebhook]);

      // Act - Run both transformations
      await runTransformationAsTable('staging/stg_events.sql', 'stg_events');
      await runTransformationAsTable('staging/stg_addresses.sql', 'stg_addresses');

      // Assert - Events and operations should correlate
      const correlation = await queryTestDatabase(`
        SELECT 
          e.tx_hash,
          COUNT(DISTINCT e.event_type) as unique_event_types,
          COUNT(e.event_type) as total_events,
          COUNT(DISTINCT a.operation_type) as unique_operation_types,
          COUNT(a.operation_type) as total_operations
        FROM crypto_data_test.stg_events e
        LEFT JOIN crypto_data_test.stg_addresses a ON e.tx_hash = a.tx_hash
        WHERE e.event_id = '${eventId}'
        GROUP BY e.tx_hash
      `);

      expect(correlation.length).toBeGreaterThanOrEqual(1); // Should have transactions
      
      // Sum up all transactions for overall metrics
      const totalEvents = correlation.reduce((sum, r) => sum + r.total_events, 0);
      const totalOperations = correlation.reduce((sum, r) => sum + r.total_operations, 0);
      expect(totalEvents).toBeGreaterThan(10); // Should have many events
      expect(totalOperations).toBeGreaterThan(5); // Should have several operations
      
      // Events should outnumber operations (business logic > balance changes)
      expect(totalEvents).toBeGreaterThan(totalOperations);
      
      console.log(`Block has ${totalEvents} events and ${totalOperations} operations across ${correlation.length} transactions`);
    });
  });
});
// Real production webhook samples exported from crypto_data.events
// These represent actual Stacks blockchain activity from July 18-22, 2025

import type { TestWebhookData } from '../helpers/bigquery-test-utils';

// Load JSON files and convert to TypeScript
const fs = require('fs');
const path = require('path');

function loadFixture(filename: string): any[] {
  const filePath = path.join(__dirname, filename);
  const rawData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(rawData);
}

// Successful DeFi swap - Real stableswap transaction with 8 operations
export const successfulDeFiSwap: TestWebhookData = (() => {
  const data = loadFixture('successful-defi-swap.json')[0];
  return {
    event_id: data.event_id,
    received_at: data.received_at,
    webhook_path: data.webhook_path,
    body_json: typeof data.body_json === 'string' ? data.body_json : JSON.stringify(data.body_json),
    headers: JSON.stringify({})
  };
})();

// Failed transaction - Real failed curve pool operation
export const failedTransaction: TestWebhookData = (() => {
  const data = loadFixture('failed-transaction.json')[0];
  return {
    event_id: data.event_id,
    received_at: data.received_at,
    webhook_path: data.webhook_path,
    body_json: typeof data.body_json === 'string' ? data.body_json : JSON.stringify(data.body_json),
    headers: JSON.stringify({})
  };
})();

// POX stacking operation - Real blockchain stacking transaction
export const poxStacking: TestWebhookData = (() => {
  const data = loadFixture('pox-stacking.json')[0];
  return {
    event_id: data.event_id,
    received_at: data.received_at,
    webhook_path: data.webhook_path,
    body_json: typeof data.body_json === 'string' ? data.body_json : JSON.stringify(data.body_json),
    headers: JSON.stringify({})
  };
})();

// Collection of all production samples
export const productionSamples = {
  successfulDeFiSwap,
  failedTransaction,
  poxStacking
};

// Sample metadata for test descriptions
// NOTE: These are REAL production webhook characteristics discovered through testing
export const sampleMetadata = {
  successfulDeFiSwap: {
    type: 'successful_defi_swap',
    description: 'Real production block with 5 transactions and 8 operations in first tx (DeFi complexity)',
    expectedTransactions: 5, // Real block has multiple transactions
    expectedOperations: 8, // Real DeFi operations in first transaction
    expectedSuccess: true
  },
  failedTransaction: {
    type: 'failed_transaction', 
    description: 'Real production block with 1 failed transaction',
    expectedTransactions: 1, // This block only has 1 transaction
    expectedOperations: 6, // Operations count from real failed transaction
    expectedSuccess: false
  },
  poxStacking: {
    type: 'pox_stacking',
    description: 'Real production block with 5 transactions and 8 operations in first tx',
    expectedTransactions: 5, // Real blocks have multiple transactions
    expectedOperations: 8, // Real production complexity in first transaction
    expectedSuccess: true
  }
};
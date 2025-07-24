# Improved Testing Strategy: Real + Synthetic Data

## Current Problem
Our acceptance tests use fake JSON fixtures instead of real production webhook data, creating a gap between test and production reality.

## Proposed Solution: 3-Tier Testing

### 1. **Unit Tests** (Fast, Synthetic)
- Use minimal fake data for isolated component testing
- Focus on business logic validation
- Run in milliseconds for rapid feedback

### 2. **Integration Tests** (Medium, Real Sample) 
- Use **real production data snapshots**
- Test with actual webhook complexity
- Validate against known production patterns

### 3. **End-to-End Tests** (Slow, Full Pipeline)
- Run against live production data periodically
- Validate entire pipeline with real volume
- Catch schema changes and edge cases

## Implementation Plan

### Step 1: Create Production Data Fixtures
```bash
# Export real webhook samples to fixtures
bq query --use_legacy_sql=false --format=json \
"SELECT body_json FROM crypto_data.events LIMIT 10" \
> test/fixtures/real-production-samples.json
```

### Step 2: Hybrid Test Structure
```typescript
describe('Staging Models - Real Data Tests', () => {
  
  // Test with curated real production samples
  it('should handle real DeFi swap webhooks', async () => {
    const realWebhook = productionSamples.dexSwap;
    await insertTestWebhookData([realWebhook]);
    await runTransformation('staging/stg_transactions.sql');
    
    const results = await queryTestDatabase(`
      SELECT transaction_type, success, operation_count 
      FROM stg_transactions 
      WHERE description LIKE '%swap%'
    `);
    
    expect(results[0].transaction_type).toBe('other'); // Real complexity
    expect(results[0].operation_count).toBeGreaterThan(4); // Real operations
  });

  // Test with known edge cases from production
  it('should handle failed transactions correctly', async () => {
    const failedTx = productionSamples.failedDexSwap;
    // ... test with real failed transaction data
  });

});
```

### Step 3: Production Data Validation Tests
```typescript
describe('Production Data Validation', () => {
  
  it('should process current production data successfully', async () => {
    // Use last 100 real events from production
    const recentEvents = await queryProductionData(`
      SELECT * FROM crypto_data.events 
      WHERE received_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
      LIMIT 100
    `);
    
    // Run through our pipeline
    for (const event of recentEvents) {
      await validateWebhookProcessing(event);
    }
  });

});
```

## Benefits of Real Data Testing

### ✅ **Advantages**
1. **Catches real issues** - Tests fail when production changes
2. **Schema validation** - Ensures we handle all real fields  
3. **Edge case coverage** - Real data has scenarios we haven't imagined
4. **Performance reality** - Tests with actual data complexity
5. **Confidence boost** - If tests pass, production will work

### ⚠️ **Challenges & Solutions**

**Challenge**: Data changes over time
**Solution**: Version real data samples, update quarterly

**Challenge**: Large data size  
**Solution**: Curate representative samples (10-50 events)

**Challenge**: Sensitive information
**Solution**: Hash addresses, use data from test networks

**Challenge**: Test reliability
**Solution**: Use stable historical data, not live streams

## Recommended Test Data Sources

### 1. **Representative Samples** (5-10 each)
- Successful DeFi swaps
- Failed transactions  
- Token transfers
- POX stacking operations
- Contract deployments

### 2. **Edge Cases** (Historical)
- Very high fee transactions (3M+ STX)
- Transactions with 50+ operations  
- Multi-block webhooks
- Empty operation arrays

### 3. **Schema Variations**
- Different webhook paths
- Various contract identifiers
- Multiple chainhook UUIDs

## Implementation Steps

1. **Audit current test coverage** - What scenarios do we miss?
2. **Export production samples** - Create real data fixtures  
3. **Refactor existing tests** - Replace fake with real gradually
4. **Add validation tests** - Ensure production compatibility
5. **Monitor test results** - Track when real data breaks tests

## Example: Real vs Fake Data

### Current Fake Test Data
```json
{
  "description": "STX transfer",
  "fee": 2500,
  "operations": [
    {"type": "credit", "amount": "1000000"},
    {"type": "debit", "amount": "1000000"}
  ]
}
```

### Real Production Data  
```json
{
  "description": "invoked: SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-swap-helper-v-1-3::swap-helper-a(u17868392, u1713250005, none, (tuple (a SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc) (b SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1)), (tuple (a SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.stableswap-pool-aeusdc-usdh-v-1-2)))",
  "fee": 3000,
  "operations": [
    {"type": "DEBIT", "address": null, "amount": null},
    {"type": "CREDIT", "address": null, "amount": null},
    // ... 6 more complex operations
  ]
}
```

The real data shows the actual complexity we need to handle!

## Next Steps

Should we implement this improved testing strategy? It would give us much higher confidence that our pipeline works with real Stacks blockchain data.
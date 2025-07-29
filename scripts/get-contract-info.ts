#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { getContractInfoWithParsedAbi } from '../lib/stacks-api.ts';

loadEnvConfig(process.cwd());

const contractId = process.argv[2];

if (!contractId) {
  console.error('Usage: node get-contract-info.js <contract-id>');
  console.error('Example: node get-contract-info.js SP6P4EJF0VG8V0RB3TQQKJBHDQKEF6NVRD1KZE3C.satoshibles');
  process.exit(1);
}

async function main() {
  try {
    console.log(`Fetching contract info for: ${contractId}`);
    const contractInfo = await getContractInfoWithParsedAbi(contractId);
    
    if (contractInfo) {
      console.log(JSON.stringify(contractInfo, null, 2));
    } else {
      console.log('Contract not found or error occurred');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
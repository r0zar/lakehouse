#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { BigQuery } from '@google-cloud/bigquery';

loadEnvConfig(process.cwd());

const bigquery = new BigQuery();

interface SIP10Token {
  name: string;
  symbol: string;
  decimals: number;
  description?: string;
  total_supply?: string;
  contractId: string;
  image?: string;
  identifier: string;
  lastUpdated: string;
  contract_principal: string;
  token_uri?: string;
}

async function fetchSIP10Tokens(): Promise<SIP10Token[]> {
  console.log('Fetching SIP-010 tokens from Charisma API...');
  
  const response = await fetch('https://tokens.charisma.rocks/api/v1/sip10');
  if (!response.ok) {
    throw new Error(`Failed to fetch tokens: ${response.statusText}`);
  }
  
  const tokens: SIP10Token[] = await response.json();
  console.log(`Found ${tokens.length} SIP-010 tokens`);
  
  return tokens;
}

function parseContractId(contractId: string) {
  const parts = contractId.split('.');
  if (parts.length !== 2) {
    throw new Error(`Invalid contract ID format: ${contractId}`);
  }
  return {
    address: parts[0],
    name: parts[1],
    contractId: contractId
  };
}

async function insertContracts(tokens: SIP10Token[]) {
  console.log('Preparing contract records...');
  
  const contractRows = tokens.map(token => {
    const { address, name } = parseContractId(token.contractId);
    return {
      contract_address: address,
      contract_name: name
    };
  });

  // Remove duplicates based on contract_address + contract_name
  const uniqueContracts = contractRows.filter((contract, index, self) => 
    index === self.findIndex(c => 
      c.contract_address === contract.contract_address && 
      c.contract_name === contract.contract_name
    )
  );

  console.log(`Inserting ${uniqueContracts.length} unique contracts...`);
  
  const query = `
    INSERT INTO \`crypto_data.contracts\` (contract_address, contract_name)
    VALUES ${uniqueContracts.map(() => '(?, ?)').join(', ')}
  `;
  
  const params = uniqueContracts.flatMap(contract => [
    contract.contract_address,
    contract.contract_name
  ]);
  
  const [job] = await bigquery.createQueryJob({
    query,
    params,
    location: 'US'
  });
  
  await job.getQueryResults();
  console.log(`✓ Inserted ${uniqueContracts.length} contracts`);
}

async function insertInterfaces(tokens: SIP10Token[]) {
  console.log('Preparing interface records...');
  
  const interfaceRows = tokens.map(token => ({
    contract_id: token.contractId,
    interface: 'sip-010-ft',
    metadata: JSON.stringify({
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      description: token.description,
      total_supply: token.total_supply,
      image: token.image,
      identifier: token.identifier,
      token_uri: token.token_uri
    }),
    detected_at: new Date().toISOString(),
    is_verified: true
  }));

  console.log(`Inserting ${interfaceRows.length} SIP-010 interface records...`);
  
  const query = `
    INSERT INTO \`crypto_data.contract_interfaces\` (contract_id, interface, metadata, detected_at, is_verified)
    VALUES ${interfaceRows.map(() => '(?, ?, JSON(?), TIMESTAMP(?), ?)').join(', ')}
  `;
  
  const params = interfaceRows.flatMap(row => [
    row.contract_id,
    row.interface,
    row.metadata,
    row.detected_at,
    row.is_verified
  ]);
  
  const [job] = await bigquery.createQueryJob({
    query,
    params,
    location: 'US'
  });
  
  await job.getQueryResults();
  console.log(`✓ Inserted ${interfaceRows.length} SIP-010 interfaces`);
}

async function main() {
  try {
    const tokens = await fetchSIP10Tokens();
    
    console.log('\n--- Sample token data ---');
    console.log(JSON.stringify(tokens[0], null, 2));
    
    await insertContracts(tokens);
    await insertInterfaces(tokens);
    
    console.log('\n✅ Successfully imported all SIP-010 tokens!');
    
  } catch (error) {
    console.error('❌ Error importing tokens:', error);
    process.exit(1);
  }
}

main();
#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

loadEnvConfig(process.cwd());

interface SIP10Token {
  name: string;
  symbol: string;
  decimals: number;
  description?: string;
  total_supply?: string | number;
  contractId: string;
  image?: string;
  identifier: string;
  lastUpdated: string | number;
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

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'");
}

function escapeJSON(str: string): string {
  return str.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
}

async function insertContracts(tokens: SIP10Token[]) {
  console.log('Preparing contract records...');
  
  const contractRows = tokens.map(token => {
    const { address, name } = parseContractId(token.contractId);
    return { contract_address: address, contract_name: name };
  });

  // Remove duplicates
  const uniqueContracts = contractRows.filter((contract, index, self) => 
    index === self.findIndex(c => 
      c.contract_address === contract.contract_address && 
      c.contract_name === contract.contract_name
    )
  );

  console.log(`Inserting ${uniqueContracts.length} unique contracts...`);
  
  // Create SQL file for bulk insert
  const contractsSQL = `
INSERT INTO \`crypto_data.contracts\` (contract_address, contract_name)
VALUES
${uniqueContracts.map(contract => 
  `('${escapeString(contract.contract_address)}', '${escapeString(contract.contract_name)}')`
).join(',\n')};
  `.trim();
  
  writeFileSync('/tmp/insert_contracts.sql', contractsSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/insert_contracts.sql', { stdio: 'inherit' });
    console.log(`✓ Inserted contracts`);
  } catch (error) {
    console.error('Error inserting contracts:', error);
  }
}

async function insertInterfaces(tokens: SIP10Token[]) {
  console.log('Preparing interface records...');
  
  const interfaceRows = tokens.map(token => {
    const metadata = {
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      description: token.description,
      total_supply: token.total_supply?.toString(),
      image: token.image,
      identifier: token.identifier,
      token_uri: token.token_uri
    };
    
    return {
      contract_id: token.contractId,
      interface: 'sip-010-ft',
      metadata: JSON.stringify(metadata),
      detected_at: new Date().toISOString(),
      is_verified: true
    };
  });

  console.log(`Inserting ${interfaceRows.length} SIP-010 interface records...`);
  
  // Create SQL file for bulk insert
  const interfacesSQL = `
INSERT INTO \`crypto_data.contract_interfaces\` (contract_id, interface, metadata, detected_at, is_verified)
VALUES
${interfaceRows.map(row => 
  `('${escapeString(row.contract_id)}', '${escapeString(row.interface)}', PARSE_JSON('${escapeJSON(row.metadata)}'), TIMESTAMP('${row.detected_at}'), ${row.is_verified})`
).join(',\n')};
  `.trim();
  
  writeFileSync('/tmp/insert_interfaces.sql', interfacesSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/insert_interfaces.sql', { stdio: 'inherit' });
    console.log(`✓ Inserted SIP-010 interfaces`);
  } catch (error) {
    console.error('Error inserting interfaces:', error);
  }
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
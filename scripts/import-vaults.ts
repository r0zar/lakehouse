#!/usr/bin/env node

import { loadEnvConfig } from '@next/env';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

loadEnvConfig(process.cwd());

interface VaultData {
  contractId: string;
  name: string;
  symbol: string;
  decimals: number;
  type: string;
  protocol: string;
  fee: string;
  tokenA: {
    contractId: string;
    name: string;
    symbol: string;
  };
  tokenB: {
    contractId: string;
    name: string;
    symbol: string;
  };
  reservesA: string;
  reservesB: string;
  reservesLastUpdatedAt: number;
}

interface VaultApiResponse {
  status: string;
  data: VaultData[];
}

async function fetchVaultData(): Promise<VaultData[]> {
  console.log('Fetching vault data from Charisma API...');
  
  const response = await fetch('https://invest.charisma.rocks/api/v1/vaults?protocol=CHARISMA&type=POOL');
  if (!response.ok) {
    throw new Error(`Failed to fetch vaults: ${response.statusText}`);
  }
  
  const apiResponse: VaultApiResponse = await response.json();
  console.log(`Found ${apiResponse.data.length} vaults`);
  
  return apiResponse.data;
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

async function createVaultReservesTable() {
  console.log('Creating vault_reserves table...');
  
  try {
    execSync('bq query --use_legacy_sql=false < sql/create-vault-reserves-table.sql', { stdio: 'inherit' });
    console.log('✓ Created vault_reserves table');
  } catch (error) {
    console.error('Error creating vault_reserves table:', error);
    throw error;
  }
}

async function insertVaultInterfaces(vaults: VaultData[]) {
  console.log('Preparing vault interface records...');
  
  const interfaceRows = vaults.map(vault => {
    const metadata = {
      type: vault.type,
      protocol: vault.protocol,
      name: vault.name,
      symbol: vault.symbol,
      decimals: vault.decimals,
      fee_percentage: vault.fee,
      token_a_contract_id: vault.tokenA.contractId,
      token_b_contract_id: vault.tokenB.contractId
    };
    
    return {
      contract_id: vault.contractId,
      interface: 'vault',
      metadata: JSON.stringify(metadata),
      detected_at: new Date().toISOString(),
      is_verified: false
    };
  });

  console.log(`Inserting ${interfaceRows.length} vault interface records...`);
  
  const interfacesSQL = `
INSERT INTO \`crypto_data.contract_interfaces\` (contract_id, interface, metadata, detected_at, is_verified)
VALUES
${interfaceRows.map(row => 
  `('${escapeString(row.contract_id)}', '${escapeString(row.interface)}', PARSE_JSON('${escapeJSON(row.metadata)}'), TIMESTAMP('${row.detected_at}'), ${row.is_verified})`
).join(',\n')};
  `.trim();
  
  writeFileSync('/tmp/insert_vault_interfaces.sql', interfacesSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/insert_vault_interfaces.sql', { stdio: 'inherit' });
    console.log(`✓ Inserted vault interfaces`);
  } catch (error) {
    console.error('Error inserting vault interfaces:', error);
    throw error;
  }
}

async function insertVaultReserves(vaults: VaultData[]) {
  console.log('Preparing vault reserves records...');
  
  const reserveRows = vaults.map(vault => ({
    vault_contract_id: vault.contractId,
    reserves_a: vault.reservesA,
    reserves_b: vault.reservesB,
    reserves_updated_at: new Date(vault.reservesLastUpdatedAt).toISOString()
  }));

  console.log(`Inserting ${reserveRows.length} vault reserve records...`);
  
  const reservesSQL = `
INSERT INTO \`crypto_data.vault_reserves\` (vault_contract_id, reserves_a, reserves_b, reserves_updated_at)
VALUES
${reserveRows.map(row => 
  `('${escapeString(row.vault_contract_id)}', ${row.reserves_a}, ${row.reserves_b}, TIMESTAMP('${row.reserves_updated_at}'))`
).join(',\n')};
  `.trim();
  
  writeFileSync('/tmp/insert_vault_reserves.sql', reservesSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/insert_vault_reserves.sql', { stdio: 'inherit' });
    console.log(`✓ Inserted vault reserves`);
  } catch (error) {
    console.error('Error inserting vault reserves:', error);
    throw error;
  }
}

async function insertVaultContracts(vaults: VaultData[]) {
  console.log('Preparing vault contract records...');
  
  const contractRows = vaults.map(vault => {
    const parts = vault.contractId.split('.');
    return {
      contract_address: parts[0],
      contract_name: parts[1]
    };
  });

  // Remove duplicates
  const uniqueContracts = contractRows.filter((contract, index, self) => 
    index === self.findIndex(c => 
      c.contract_address === contract.contract_address && 
      c.contract_name === contract.contract_name
    )
  );

  if (uniqueContracts.length === 0) {
    console.log('No new vault contracts to insert');
    return;
  }

  console.log(`Inserting ${uniqueContracts.length} vault contract records...`);
  
  const contractsSQL = `
INSERT INTO \`crypto_data.contracts\` (contract_address, contract_name)
VALUES
${uniqueContracts.map(contract => 
  `('${escapeString(contract.contract_address)}', '${escapeString(contract.contract_name)}')`
).join(',\n')};
  `.trim();
  
  writeFileSync('/tmp/insert_vault_contracts.sql', contractsSQL);
  
  try {
    execSync('bq query --use_legacy_sql=false < /tmp/insert_vault_contracts.sql', { stdio: 'inherit' });
    console.log(`✓ Inserted vault contracts`);
  } catch (error) {
    console.error('Error inserting vault contracts:', error);
    // Don't throw - contracts might already exist
  }
}

async function main() {
  try {
    const vaults = await fetchVaultData();
    
    console.log('\n--- Sample vault data ---');
    console.log(JSON.stringify(vaults[0], null, 2));
    
    await createVaultReservesTable();
    await insertVaultContracts(vaults);
    await insertVaultInterfaces(vaults);
    await insertVaultReserves(vaults);
    
    console.log('\n✅ Successfully imported all vault data!');
    console.log(`\nSummary:`);
    console.log(`- ${vaults.length} vault interfaces added`);
    console.log(`- ${vaults.length} vault reserve snapshots added`);
    console.log(`- Vault contracts added to contracts table`);
    
  } catch (error) {
    console.error('❌ Error importing vaults:', error);
    process.exit(1);
  }
}

main();
#!/usr/bin/env node

/**
 * Script to check token symbols in the BigQuery sankey_links view
 * This will help us understand what tokens are currently in the dataset
 * and whether STX is included.
 */

const { BigQuery } = require('@google-cloud/bigquery');
require('dotenv').config();

async function checkTokenSymbols() {
  console.log('🔍 Checking token symbols in crypto_data.sankey_links...\n');

  // Initialize BigQuery with the same configuration as the main app
  let credentials;
  try {
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
      const credString = process.env.GOOGLE_CLOUD_CREDENTIALS.startsWith('{')
        ? process.env.GOOGLE_CLOUD_CREDENTIALS
        : Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString();
      
      credentials = JSON.parse(credString);
      
      if (credentials.private_key) {
        let privateKey = credentials.private_key
          .replace(/\\n/g, '\n')
          .replace(/\\\\/g, '\\')
          .trim();
        
        if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('\n')) {
          privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----([^-]+)-----END PRIVATE KEY-----/, 
            '-----BEGIN PRIVATE KEY-----\n$1\n-----END PRIVATE KEY-----\n');
        }
        
        if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
          const lines = privateKey.split('\n');
          const header = lines[0];
          const footer = lines[lines.length - 1] || '-----END PRIVATE KEY-----';
          const keyContent = lines.slice(1, -1).join('').replace(/\s/g, '');
          const wrappedContent = keyContent.match(/.{1,64}/g) || [];
          privateKey = [header, ...wrappedContent, footer].join('\n');
        }
        
        credentials.private_key = privateKey;
      }
    }
  } catch (error) {
    console.error('Failed to parse Google Cloud credentials:', error);
    credentials = undefined;
  }

  const bigqueryOptions = {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || credentials?.project_id
  };

  if (credentials) {
    bigqueryOptions.credentials = credentials;
  }

  const bigquery = new BigQuery(bigqueryOptions);
  const dataset = process.env.BIGQUERY_DATASET || 'crypto_data';

  try {
    // Query to get distinct token symbols and currency symbols
    const query = `
      SELECT 
        token_symbol,
        currency_symbol,
        COUNT(*) as count
      FROM \`${dataset}.sankey_links\`
      GROUP BY token_symbol, currency_symbol
      ORDER BY count DESC
      LIMIT 20
    `;

    console.log('Running query:');
    console.log(query);
    console.log('\n' + '='.repeat(60) + '\n');

    const [rows] = await bigquery.query(query);
    
    if (rows.length === 0) {
      console.log('❌ No data found in sankey_links table');
      return;
    }

    console.log('📊 Top 20 token/currency combinations by count:\n');
    console.log('Token Symbol | Currency Symbol | Count');
    console.log('-------------|-----------------|------');
    
    let stxFound = false;
    rows.forEach(row => {
      const tokenSymbol = row.token_symbol || 'NULL';
      const currencySymbol = row.currency_symbol || 'NULL';
      const count = row.count || 0;
      
      console.log(`${tokenSymbol.padEnd(12)} | ${currencySymbol.padEnd(15)} | ${count}`);
      
      if (tokenSymbol.toUpperCase() === 'STX' || currencySymbol.toUpperCase() === 'STX') {
        stxFound = true;
      }
    });

    console.log('\n' + '='.repeat(60) + '\n');
    
    // Check specifically for STX
    const stxQuery = `
      SELECT 
        token_symbol,
        currency_symbol,
        COUNT(*) as count
      FROM \`${dataset}.sankey_links\`
      WHERE UPPER(token_symbol) = 'STX' OR UPPER(currency_symbol) = 'STX'
      GROUP BY token_symbol, currency_symbol
      ORDER BY count DESC
    `;

    console.log('🔍 Checking specifically for STX...\n');
    const [stxRows] = await bigquery.query(stxQuery);
    
    if (stxRows.length > 0) {
      console.log('✅ STX found in the dataset:');
      console.log('Token Symbol | Currency Symbol | Count');
      console.log('-------------|-----------------|------');
      stxRows.forEach(row => {
        const tokenSymbol = row.token_symbol || 'NULL';
        const currencySymbol = row.currency_symbol || 'NULL';
        const count = row.count || 0;
        console.log(`${tokenSymbol.padEnd(12)} | ${currencySymbol.padEnd(15)} | ${count}`);
      });
    } else {
      console.log('❌ STX not found in the current dataset');
    }

    // Get total record count
    const countQuery = `SELECT COUNT(*) as total_records FROM \`${dataset}.sankey_links\``;
    const [countRows] = await bigquery.query(countQuery);
    const totalRecords = countRows[0]?.total_records || 0;
    
    console.log(`\n📈 Total records in sankey_links: ${totalRecords.toLocaleString()}`);

  } catch (error) {
    console.error('❌ Error running BigQuery:', error);
    
    if (error.message.includes('Not found: Table')) {
      console.log('\n💡 The sankey_links table may not exist yet. Check if the views have been created.');
    } else if (error.message.includes('Access Denied')) {
      console.log('\n💡 Access denied. Check your BigQuery credentials and project permissions.');
    }
  }
}

// Run the check
checkTokenSymbols().catch(console.error);
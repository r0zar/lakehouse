import { BigQuery } from '@google-cloud/bigquery';

// Initialize BigQuery with better error handling
let credentials;
try {
    if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        // Try base64 decode first, then regular JSON parse
        const credString = process.env.GOOGLE_CLOUD_CREDENTIALS.startsWith('{')
            ? process.env.GOOGLE_CLOUD_CREDENTIALS
            : Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString();

        credentials = JSON.parse(credString);

        // Fix private key formatting
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
    }
} catch (error) {
    console.error('Failed to parse Google Cloud credentials:', error);
}

export const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    credentials
});

export const dataset = bigquery.dataset('crypto_data');
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

        // Fix private key formatting - handle multiple newline formats
        if (credentials.private_key) {
            let privateKey = credentials.private_key
                .replace(/\\n/g, '\n')  // Replace escaped newlines
                .replace(/\\\\/g, '\\') // Replace escaped backslashes
                .trim();               // Remove extra whitespace
            
            // Additional fix for OpenSSL DECODER issues
            // Ensure proper line breaks in PEM format
            if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('\n')) {
                // If it's all on one line, fix the formatting
                privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----([^-]+)-----END PRIVATE KEY-----/, 
                    '-----BEGIN PRIVATE KEY-----\n$1\n-----END PRIVATE KEY-----\n');
            }
            
            // Ensure proper PEM line wrapping (64 characters per line for the key content)
            if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
                const lines = privateKey.split('\n');
                const header = lines[0];
                const footer = lines[lines.length - 1] || '-----END PRIVATE KEY-----';
                const keyContent = lines.slice(1, -1).join('').replace(/\s/g, '');
                
                // Wrap key content in 64-character lines
                const wrappedContent = keyContent.match(/.{1,64}/g) || [];
                privateKey = [header, ...wrappedContent, footer].join('\n');
            }
            
            credentials.private_key = privateKey;
            
            // Ensure proper PEM format
            if (!credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) {
                console.warn('Private key may not be in proper PEM format');
            }
        }
    }
} catch (error) {
    console.error('Failed to parse Google Cloud credentials:', error);
    console.error('GOOGLE_CLOUD_CREDENTIALS length:', process.env.GOOGLE_CLOUD_CREDENTIALS?.length);
    console.error('GOOGLE_CLOUD_CREDENTIALS starts with {:', process.env.GOOGLE_CLOUD_CREDENTIALS?.startsWith('{'));
    credentials = undefined;
}

// Alternative: Use Application Default Credentials if no explicit credentials
const bigqueryOptions: any = {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || credentials?.project_id
};

// Only add credentials if they were successfully parsed
if (credentials) {
    bigqueryOptions.credentials = credentials;
}

export const bigquery = new BigQuery(bigqueryOptions);

// Use the correct dataset name from your setup
export const dataset = bigquery.dataset(process.env.BIGQUERY_DATASET || 'crypto_data_test');
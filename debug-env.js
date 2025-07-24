// Debug script to check environment variables (run with: node debug-env.js)
// DO NOT commit this file with actual credentials

console.log('Environment Variables Check:')
console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT ? '✓ Set' : '✗ Missing')
console.log('GOOGLE_CLOUD_CREDENTIALS:', process.env.GOOGLE_CLOUD_CREDENTIALS ? '✓ Set' : '✗ Missing')
console.log('BIGQUERY_DATASET:', process.env.BIGQUERY_DATASET ? '✓ Set' : '✗ Missing')

if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
  try {
    const credString = process.env.GOOGLE_CLOUD_CREDENTIALS.startsWith('{')
      ? process.env.GOOGLE_CLOUD_CREDENTIALS
      : Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString()
    
    const creds = JSON.parse(credString)
    console.log('\nCredentials structure:')
    console.log('- project_id:', creds.project_id ? '✓' : '✗')
    console.log('- private_key_id:', creds.private_key_id ? '✓' : '✗')
    console.log('- private_key:', creds.private_key ? '✓ (length: ' + creds.private_key.length + ')' : '✗')
    console.log('- client_email:', creds.client_email ? '✓' : '✗')
    console.log('- type:', creds.type)
    
    if (creds.private_key) {
      console.log('\nPrivate key format check:')
      console.log('- Starts with BEGIN:', creds.private_key.includes('-----BEGIN') ? '✓' : '✗')
      console.log('- Ends with END:', creds.private_key.includes('-----END') ? '✓' : '✗')
      console.log('- Contains newlines:', creds.private_key.includes('\n') ? '✓' : '✗')
      console.log('- Contains escaped newlines:', creds.private_key.includes('\\n') ? '✓' : '✗')
    }
  } catch (error) {
    console.error('Failed to parse credentials:', error.message)
  }
}

console.log('\nTo fix credentials issues:')
console.log('1. Ensure GOOGLE_CLOUD_CREDENTIALS is properly base64 encoded')
console.log('2. Check that private key has proper PEM format with newlines')
console.log('3. Verify project ID and dataset name are correct')
console.log('4. Test connection with: curl http://localhost:3001/api/test-connection')
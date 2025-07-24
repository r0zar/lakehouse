# BigQuery Credentials Setup

The error `error:1E08010C:DECODER routines::unsupported` indicates an issue with the Google Cloud service account private key format.

## Quick Fix Options

### Option 1: Test Connection
```bash
# Test your BigQuery connection
curl http://localhost:3001/api/test-connection

# Debug environment variables
node debug-env.js
```

### Option 2: Re-encode Credentials
If you have the service account JSON file:

```bash
# Base64 encode the entire JSON file
base64 -w 0 path/to/service-account.json

# Set the environment variable
export GOOGLE_CLOUD_CREDENTIALS="<base64-encoded-json>"
```

### Option 3: Fix Private Key Format
The private key in your credentials might have escaped newlines. Ensure it looks like:

```json
{
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
}
```

**NOT:**
```json
{
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\\n-----END PRIVATE KEY-----\\n"
}
```

### Option 4: Use Application Default Credentials
If you have `gcloud` CLI configured:

```bash
# Remove explicit credentials and use ADC
unset GOOGLE_CLOUD_CREDENTIALS
gcloud auth application-default login
```

## Environment Variables Needed

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_CREDENTIALS=base64-encoded-service-account-json

# Optional (uses defaults if not set)
BIGQUERY_DATASET=crypto_data_test
GCLOUD_PROJECT=your-project-id  # fallback for project ID
```

## Verify Setup

1. **Test connection**: Visit `http://localhost:3001/api/test-connection`
2. **Check tables**: Should show your crypto data tables
3. **Run query**: Try any example query in the dashboard

## Service Account Permissions

Your service account needs:
- `BigQuery Data Viewer` - Read access to datasets/tables
- `BigQuery Job User` - Execute queries
- `BigQuery User` - Access to project

## Common Issues

1. **Wrong dataset name**: Update `BIGQUERY_DATASET` environment variable
2. **Missing tables**: Ensure your crypto data marts exist
3. **Network issues**: Check if BigQuery API is enabled
4. **Quota limits**: Verify BigQuery quotas aren't exceeded

## Demo Mode

If credentials are failing, the dashboard includes a demo mode with sample data to test the interface.
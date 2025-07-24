-- Setup Gemini Pro model in BigQuery for natural language to SQL generation
-- Run this in BigQuery console to enable AI features

-- Create the Gemini Pro model (requires appropriate permissions)
CREATE OR REPLACE MODEL `crypto_data_test.gemini_pro`
REMOTE WITH CONNECTION `projects/YOUR_PROJECT_ID/locations/us/connections/gemini-connection`
OPTIONS (
  ENDPOINT = 'gemini-pro'
);

-- Alternative: Use the built-in Gemini model if available
-- This should work if Gemini in BigQuery is enabled for your project
-- No additional setup required, just use ML.GENERATE_TEXT with the built-in model
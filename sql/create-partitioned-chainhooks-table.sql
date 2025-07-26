-- Create partitioned chainhooks table for efficient webhook storage
-- Partitioned by received_at timestamp for optimal query performance

CREATE TABLE IF NOT EXISTS `crypto_data.chainhooks` (
  event_id STRING NOT NULL,
  received_at TIMESTAMP NOT NULL,
  webhook_path STRING,
  body_json JSON,
  headers JSON,
  url STRING,
  method STRING
)
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
OPTIONS (
  description="Chainhook webhook data partitioned by date for efficient querying",
  partition_expiration_days=365
);

-- Test table version
CREATE TABLE IF NOT EXISTS `crypto_data_test.chainhooks` (
  event_id STRING NOT NULL,
  received_at TIMESTAMP NOT NULL,
  webhook_path STRING,
  body_json JSON,
  headers JSON,
  url STRING,
  method STRING
)
PARTITION BY DATE(received_at)
CLUSTER BY webhook_path
OPTIONS (
  description="Test chainhook webhook data partitioned by date",
  partition_expiration_days=30
);
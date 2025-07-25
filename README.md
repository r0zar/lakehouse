# Crypto Data Lakehouse 🏗️

A real-time blockchain analytics platform inspired by Dune Analytics architecture. Built with Next.js, BigQuery, and designed for high-throughput blockchain data processing.

## 🏛️ Architecture Overview

**Dune-Style Analytics Pipeline:**
- **Real-time Staging**: Webhook-driven data ingestion with immediate staging table updates
- **On-demand Marts**: Business intelligence tables generated only when queried
- **Smart Caching**: Intelligent freshness tracking to minimize unnecessary recomputation
- **Scalable Design**: Handles high-frequency blockchain events with optimized BigQuery operations

## 🚀 Features

### For Users
- **Interactive Dashboard**: Query blockchain data with natural language or SQL
- **Real-time Updates**: Live data streaming from blockchain networks
- **Visual Analytics**: Automatic chart generation for query results  
- **Query Intelligence**: Smart mart detection and on-demand refreshing
- **Data Freshness**: Visual indicators showing when data was last updated

### For Operators
- **Health Monitoring**: Comprehensive system health checks and metrics
- **Debug Tools**: Secured API endpoints for troubleshooting and maintenance
- **Pipeline Control**: Manual trigger capabilities for staging and mart pipelines
- **Performance Tracking**: Built-in latency and throughput monitoring
- **Security**: API key authentication for all admin operations

## 📊 Current Data Scale

- **Events**: 29,000+ blockchain events ingested
- **Staging Tables**: 600K+ processed records across multiple tables
- **Marts**: 2 active business intelligence tables
- **Real-time Throughput**: ~26 events per 5-minute window

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Google Cloud BigQuery
- **Data Pipeline**: Custom transformation engine with SQL-based analytics
- **Deployment**: Vercel with environment-based configuration
- **Monitoring**: Built-in health checks and debug endpoints

## 🔧 Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Google Cloud Project with BigQuery enabled
- Service account with BigQuery permissions

### Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Configure required variables
GOOGLE_CLOUD_CREDENTIALS="your-service-account-json"
GOOGLE_CLOUD_PROJECT="your-gcp-project-id" 
BIGQUERY_DATASET="your-dataset-name"
DEBUG_API_KEY="your-secure-api-key"
```

### Development
```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Access dashboard
open http://localhost:3000
```

### Production Deployment
```bash
# Deploy to Vercel
vercel --prod

# Configure environment variables in Vercel dashboard:
# - GOOGLE_CLOUD_CREDENTIALS
# - GOOGLE_CLOUD_PROJECT  
# - BIGQUERY_DATASET
# - DEBUG_API_KEY
```

## 📚 API Documentation

### Public Endpoints
- `GET /api/pipeline/status` - System health and pipeline status
- `GET /api/ingestion/stats` - Data ingestion statistics
- `POST /api/execute-query` - Execute SQL queries with smart mart handling

### Admin Endpoints (Require `x-api-key` header)
- `GET /api/debug/dataset` - Environment and dataset configuration
- `GET /api/debug/query-test?type=events|staging|recent|marts` - Test BigQuery connectivity
- `POST /api/debug/pipeline-trigger` - Manually trigger pipeline operations
- `GET /api/health` - Comprehensive system health check

### Usage Examples
```bash
# Check system status
curl https://your-domain.com/api/pipeline/status

# Test database connectivity (admin)
curl -H "x-api-key: your-key" \
  "https://your-domain.com/api/debug/query-test?type=events"

# Trigger staging pipeline (admin)
curl -X POST -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"action":"staging"}' \
  https://your-domain.com/api/debug/pipeline-trigger
```

## 🎯 Query Examples

### Natural Language Queries
- "Show me daily transaction volumes for the last 30 days"
- "What are the top DeFi protocols by swap volume?"
- "Find the largest transactions from the past week"

### SQL Queries  
```sql
-- Daily activity overview
SELECT activity_date, total_transactions, success_rate 
FROM fact_daily_activity 
WHERE activity_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
ORDER BY activity_date DESC;

-- DeFi protocol analysis
SELECT dex_contract, COUNT(*) as swaps, SUM(input_amount) as volume
FROM dim_defi_swaps 
WHERE DATE(block_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY dex_contract 
ORDER BY volume DESC;
```

## 🔍 Monitoring & Operations

### System Health Indicators
- **Pipeline Status**: Real-time staging pipeline health
- **Data Freshness**: Last update timestamps for all tables
- **Query Performance**: Response times and success rates
- **BigQuery Integration**: Connection status and quota usage

### Common Operations
```bash
# Check overall system health
curl -H "x-api-key: $API_KEY" https://your-domain.com/api/health

# View pipeline configuration
curl -H "x-api-key: $API_KEY" https://your-domain.com/api/debug/dataset

# Force refresh staging data
curl -X POST -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"staging"}' \
  https://your-domain.com/api/debug/pipeline-trigger
```

### Troubleshooting

**Pipeline showing as "stale":**
- Check BigQuery dataset permissions
- Verify `BIGQUERY_DATASET` environment variable
- Review recent webhook activity

**Query timeouts:**
- Queries involving marts may trigger on-demand refresh (30s+ expected)
- Check BigQuery quotas and concurrent job limits
- Consider optimizing SQL for large datasets

**Authentication errors:**
- Verify service account has BigQuery Data Viewer and Job User roles
- Check `GOOGLE_CLOUD_CREDENTIALS` format in environment variables
- Ensure service account key hasn't expired

## 📈 Architecture Deep Dive

### Data Flow
1. **Ingestion**: Blockchain events → Webhook endpoints → Raw events table
2. **Staging**: Real-time transformation → Cleaned staging tables (stg_*)
3. **Marts**: On-demand aggregation → Business intelligence tables (dim_*, fact_*)
4. **Query**: Smart detection → Selective mart refresh → Results

### Pipeline Separation
- **Staging Pipeline**: Runs on every webhook, optimized for speed
- **Marts Pipeline**: Triggered by query analysis, optimized for accuracy
- **Hybrid Approach**: Balances real-time updates with computational efficiency

### Performance Optimizations
- **Incremental Processing**: Only processes new/changed data
- **Smart Caching**: Tracks table freshness to avoid unnecessary computation
- **Query Optimization**: Automatic table selection based on query analysis
- **Parallel Processing**: Concurrent BigQuery operations where possible

## 🔐 Security

- **API Key Authentication**: All admin endpoints require valid `x-api-key` header
- **Environment Isolation**: Separate configurations for development/production
- **SQL Injection Protection**: Parameterized queries and input validation
- **Read-Only Queries**: User queries restricted to SELECT operations only
- **Service Account**: Minimal BigQuery permissions (Data Viewer + Job User)

## 🤝 Contributing

### Development Setup
```bash
git clone <repository-url>
cd lakehouse
pnpm install
cp .env.example .env.local
# Configure environment variables
pnpm dev
```

### Code Style
- TypeScript for type safety
- ESLint for code quality (disabled during builds)
- Prettier for formatting
- Follow existing patterns for API routes and components

### Testing
```bash
# Run type checking
pnpm tsc --noEmit

# Test BigQuery connectivity
curl -H "x-api-key: $DEBUG_API_KEY" localhost:3000/api/health
```

## 📄 License

Private project - All rights reserved.

## 📞 Support

For technical issues or feature requests, please contact the development team or file an issue in the project repository.

---

**Built with ❤️ for real-time blockchain analytics**
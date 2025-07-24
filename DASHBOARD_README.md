# Crypto Analytics Dashboard

A Dune Analytics-inspired dashboard for querying and visualizing blockchain data using natural language or SQL.

## Features

### 🤖 Natural Language Queries
Ask questions in plain English and get intelligent SQL queries:
- "Show me daily transaction volume for the last 30 days"
- "What are the top 5 DeFi protocols by swap volume?"
- "Compare failed vs successful transactions this week"

### 📊 SQL Query Interface
Write custom SQL queries directly against your BigQuery crypto data marts:
- Full access to all staging and mart tables
- Syntax highlighting and validation
- Real-time query execution

### 📈 Pre-built Examples
Ready-to-use queries organized by category:
- **Overview**: Daily activity metrics and transaction summaries
- **DeFi**: Swap analysis, protocol rankings, volume trends
- **Fees**: Transaction cost analysis and fee trends
- **Analysis**: Whale activity, failed transactions, patterns

## Available Data Tables

### Fact Tables
- `fact_daily_activity`: Daily transaction and block metrics
- `fact_defi_metrics`: Daily DeFi protocol activity and KPIs

### Dimension Tables  
- `dim_defi_swaps`: Individual swap transactions with details
- `dim_transactions`: Transaction-level data with success rates
- `dim_blocks`: Block information and metadata

### Staging Tables
- `stg_events`: Raw smart contract events
- `stg_transactions`: Raw transaction data
- `stg_blocks`: Raw block data
- `stg_addresses`: Address operations and balances

## Usage

1. **Navigate to the Dashboard**: Click "Open Dashboard" from the homepage
2. **Choose Query Mode**: 
   - **Natural Language**: Ask questions in plain English
   - **SQL Query**: Write custom BigQuery SQL
3. **Execute**: Click "Ask AI" or "Run Query" 
4. **Visualize**: View results in chart or table format
5. **Explore**: Try example queries or copy/modify existing ones

## Natural Language Examples

The AI understands various query patterns:

**Time-based queries:**
- "daily transaction volume"
- "weekly DeFi activity" 
- "monthly fee trends"

**Comparison queries:**
- "top protocols by volume"
- "failed vs successful transactions"
- "largest transactions this week"

**Trend analysis:**
- "show trends over time"
- "transaction patterns"
- "whale activity analysis"

## Technical Details

- **Framework**: Next.js 15 with React 19
- **Styling**: Tailwind CSS 4
- **Database**: Google BigQuery with crypto data marts
- **AI**: Intelligent SQL generation with pattern matching
- **Charts**: Auto-generated visualizations from query results

## Development

```bash
# Start development server
npm run dev

# Build for production  
npm run build

# Run tests
npm test
```

## Next Steps

- [ ] Implement full Gemini AI integration for more sophisticated NL2SQL
- [ ] Add Looker Studio dashboard embedding for advanced visualizations
- [ ] Create saved dashboard functionality
- [ ] Add real-time data streaming capabilities
- [ ] Implement user authentication and personalization
# API Documentation

## Token Prices API

### GET `/api/token-prices`

Retrieves current token prices from the database with optional filtering and pagination.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | string | - | Filter by specific token contract ID |
| `limit` | number | 100 | Number of results to return (1-1000) |
| `minPrice` | number | 0 | Minimum USD price filter |

#### Response Format

```json
{
  "prices": [
    {
      "token_contract_id": "string",
      "sbtc_price": "number",
      "usd_price": "number", 
      "price_source": "string",
      "iterations_to_converge": "number",
      "final_convergence_percent": "number",
      "calculated_at": "ISO 8601 timestamp"
    }
  ],
  "summary": {
    "total_tokens": "number",
    "min_price": "number",
    "max_price": "number", 
    "avg_price": "number",
    "last_updated": "ISO 8601 timestamp"
  },
  "query_params": {
    "token_filter": "string|null",
    "limit": "number",
    "min_price": "number"
  }
}
```

#### Example Requests

**Get all token prices (default limit 100):**
```
GET /api/token-prices
```

**Get specific token price:**
```
GET /api/token-prices?token=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.charisma-token
```

**Get top 10 most valuable tokens:**
```
GET /api/token-prices?limit=10&minPrice=1
```

**Get tokens worth at least $0.01:**
```
GET /api/token-prices?minPrice=0.01&limit=500
```

---

## Token Price History API

### GET `/api/token-prices/history`

Retrieves historical time-series price data for a specific token with configurable time intervals and date ranges.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | string | **required** | Token contract ID to get history for |
| `start` | string | - | Start date (ISO 8601 format, e.g., "2024-01-01") |
| `end` | string | - | End date (ISO 8601 format, e.g., "2024-12-31") |
| `interval` | string | "hour" | Time aggregation: "hour", "day", or "week" |
| `limit` | number | 1000 | Maximum number of data points (1-10000) |

*Note: If no start/end dates provided, returns last 30 days of data.*

#### Response Format

```json
{
  "price_history": [
    {
      "timestamp": "string (ISO 8601)",
      "sbtc_price": "number",
      "usd_price": "number",
      "min_usd_price": "number",
      "max_usd_price": "number", 
      "data_points": "number"
    }
  ],
  "summary": {
    "token_contract_id": "string",
    "total_days": "number",
    "data_range": {
      "start": "ISO 8601 timestamp",
      "end": "ISO 8601 timestamp"
    },
    "price_statistics": {
      "all_time_min": "number",
      "all_time_max": "number",
      "average_price": "number"
    },
    "total_data_points": "number"
  },
  "query_params": {
    "token": "string",
    "start_date": "string|null",
    "end_date": "string|null", 
    "interval": "string",
    "limit": "number"
  }
}
```

#### Example Requests

**Get hourly price history for last 30 days:**
```
GET /api/token-prices/history?token=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.charisma-token
```

**Get daily price history for specific date range:**
```
GET /api/token-prices/history?token=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.charisma-token&start=2024-01-01&end=2024-12-31&interval=day
```

**Get weekly price history (last 52 weeks):**
```
GET /api/token-prices/history?token=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.charisma-token&interval=week&limit=52
```

---

## Token Price Calculation (Cron)

### GET/POST `/api/cron/calculate-token-prices`

Internal endpoint for calculating and storing updated token prices using TVL-weighted iterative algorithm.

#### Authentication

Requires `Authorization: Bearer {CRON_SECRET}` header.

#### Response Format

```json
{
  "success": true,
  "message": "Token prices calculated successfully",
  "duration_ms": "number",
  "timestamp": "ISO 8601 timestamp"
}
```

#### Scheduling

Automatically runs hourly via Vercel Cron at the top of each hour (`0 * * * *`).

---

## Network Data API

### GET `/api/network-data`

Retrieves network visualization data including nodes, links, and metadata for the 3D force graph.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 500 | Number of transactions to analyze (10-100000) |
| `minValue` | number | 0 | Minimum transaction value filter |
| `asset` | string | - | Filter by token symbol or contract ID |
| `address` | string | - | Filter transactions to/from specific address |

#### Response Format

```json
{
  "nodes": [
    {
      "id": "string",
      "name": "string",
      "category": "Contract|Wallet",
      "value": "number",
      "val": 4,
      "dominantToken": "string",
      "tokenFlows": {
        "TOKEN_SYMBOL": {
          "inbound": "number",
          "outbound": "number", 
          "total": "number"
        }
      },
      "latestTransaction": "ISO 8601 timestamp",
      "earliestTransaction": "ISO 8601 timestamp"
    }
  ],
  "links": [
    {
      "source": "string",
      "target": "string", 
      "value": "number",
      "token_symbol": "string",
      "received_at": "ISO 8601 timestamp"
    }
  ],
  "dateRange": {
    "oldest": "ISO 8601 timestamp",
    "newest": "ISO 8601 timestamp",
    "count": "number"
  }
}
```

#### Example Requests

**Get network data for CHARISMA token:**
```
GET /api/network-data?asset=CHARISMA&limit=1000
```

**Get high-value transactions (>$100):**
```
GET /api/network-data?minValue=100&limit=2000
```

**Get transactions for specific address:**
```
GET /api/network-data?address=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R
```

---

## Error Responses

All endpoints return structured error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing/invalid auth for cron endpoints)
- `500` - Internal Server Error

---

## Rate Limits

- Network Data API: Suitable for real-time visualization updates
- Token Prices API: Cached data, efficient for frequent requests
- Cron endpoints: Internal use only, protected by authentication
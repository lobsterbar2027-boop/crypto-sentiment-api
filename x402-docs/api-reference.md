# API Reference

Complete documentation for the X402 Crypto Sentiment API.

**Base URL**: `https://crypto-sentiment-api-production.up.railway.app`

## Authentication

This API uses the **x402 protocol** for payment-based authentication. Instead of API keys, you pay $0.03 USDC per query on the Base network.

See [x402 Protocol Guide](x402-protocol.md) for details.

---

## Endpoints

### Get Payment Requirements

Get x402 payment information for the API.

**Request**
```http
GET /
```

**Response** - 402 Payment Required
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "30000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x48365516b2d74a3dfa621289e76507940466480f",
    "resource": "https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC",
    "description": "Real-time crypto sentiment analysis",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60,
    "outputSchema": {
      "input": {
        "type": "http",
        "method": "GET"
      },
      "output": {
        "coin": { "type": "string" },
        "signal": { "type": "string", "enum": ["STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL"] },
        "score": { "type": "number" },
        "positive": { "type": "number" },
        "negative": { "type": "number" },
        "neutral": { "type": "number" },
        "mentions": { "type": "number" },
        "trend": { "type": "string" },
        "sources": { "type": "array" },
        "timestamp": { "type": "string" },
        "cost": { "type": "string" }
      }
    }
  }]
}
```

---

### Get Sentiment Analysis

Get real-time sentiment analysis for a cryptocurrency.

**Request**
```http
GET /v1/sentiment/:coin
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `coin` | string | Coin symbol (e.g., BTC, ETH, SOL) |

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `X-Payment` | Yes | Base64-encoded payment data from x402 transaction |

**Example Request**
```bash
curl -X GET "https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC" \
  -H "X-Payment: eyJ0cmFuc2FjdGlvbkhhc2giOiIweGFiYzEyMy4uLiJ9"
```

**Response** - 200 OK
```json
{
  "coin": "BTC",
  "signal": "STRONG BUY",
  "score": 0.234,
  "positive": 65,
  "negative": 15,
  "neutral": 20,
  "mentions": 147,
  "trend": "up",
  "sources": ["reddit"],
  "timestamp": "2024-12-15T10:30:00.000Z",
  "cost": "0.03 USDC"
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Cryptocurrency symbol analyzed |
| `signal` | string | Trading signal: STRONG BUY, BUY, NEUTRAL, SELL, STRONG SELL |
| `score` | number | Composite sentiment score (-1 to 1) |
| `positive` | number | Percentage of positive mentions (0-100) |
| `negative` | number | Percentage of negative mentions (0-100) |
| `neutral` | number | Percentage of neutral mentions (0-100) |
| `mentions` | number | Total number of mentions analyzed |
| `trend` | string | Overall trend: "up" or "down" |
| `sources` | array | Data sources used (currently ["reddit"]) |
| `timestamp` | string | ISO 8601 timestamp of analysis |
| `cost` | string | Cost of this query |

**Sentiment Score Interpretation**

| Score Range | Signal | Meaning |
|-------------|--------|---------|
| > 0.15 | STRONG BUY | Very positive sentiment |
| 0.05 to 0.15 | BUY | Positive sentiment |
| -0.05 to 0.05 | NEUTRAL | Mixed/neutral sentiment |
| -0.15 to -0.05 | SELL | Negative sentiment |
| < -0.15 | STRONG SELL | Very negative sentiment |

**Supported Coins**

BTC, ETH, SOL, DOGE, ADA, XRP, DOT, MATIC, LINK, UNI

---

### Get API Info

Get API documentation and details.

**Request**
```http
GET /info
```

**Response** - 200 OK
```json
{
  "name": "CryptoSentiment API",
  "version": "1.4.0",
  "status": "Production Ready",
  "pricing": "$0.03 USDC per query via x402",
  "endpoints": {
    "root": "GET / - x402 payment requirements (returns 402)",
    "sentiment": "GET /v1/sentiment/:coin - Real-time crypto sentiment analysis (requires payment)",
    "info": "GET /info - API documentation (this page)",
    "health": "GET /health - API health status"
  },
  "x402": {
    "facilitator": "https://facilitator.coinbase.com",
    "network": "base",
    "currency": "USDC",
    "amount": "0.03",
    "recipient": "0x48365516b2d74a3dfa621289e76507940466480f",
    "usdcContract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  "features": [
    "x402 protocol compliant",
    "x402scan compatible with outputSchema",
    "Real payment verification via Coinbase facilitator",
    "On-chain verification fallback",
    "Rate limiting (100 req/min)",
    "Replay attack prevention",
    "Payment tracking and logging"
  ],
  "supportedCoins": ["BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "DOT", "MATIC", "LINK", "UNI"]
}
```

---

### Health Check

Check if the API is operational.

**Request**
```http
GET /health
```

**Response** - 200 OK
```json
{
  "status": "healthy",
  "service": "crypto-sentiment-api",
  "version": "1.4.0",
  "uptime": 3600,
  "totalPayments": 1247,
  "x402": "enabled",
  "x402compliant": true,
  "x402scanCompliant": true
}
```

---

## Error Responses

### 402 Payment Required

Returned when `X-Payment` header is missing.

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{ ... }]
}
```

### 400 Bad Request

Payment data is invalid or malformed.

```json
{
  "error": "Payment verification failed",
  "message": "Invalid payment data format"
}
```

### 403 Forbidden

Payment verification failed or payment already used.

```json
{
  "error": "Payment already used",
  "message": "This payment has already been redeemed"
}
```

Or:

```json
{
  "error": "Payment verification failed",
  "message": "Could not verify payment with facilitator"
}
```

### 429 Too Many Requests

Rate limit exceeded (100 requests per minute).

```json
{
  "error": "Too many requests, please slow down"
}
```

### 500 Internal Server Error

Analysis failed.

```json
{
  "error": "Analysis failed",
  "message": "Error details here"
}
```

---

## Rate Limits

- **Limit**: 100 requests per minute
- **Window**: Rolling 60-second window
- **Applies to**: All endpoints (including free endpoints)

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1702656000
```

---

## Data Sources

Currently scraping from:
- r/CryptoCurrency
- r/Bitcoin
- r/ethereum
- r/CryptoMarkets

Analysis includes:
- Post titles and content
- Recent hot posts (last 100)
- VADER sentiment analysis
- Weighted by post scores

---

## Payment Verification

The API uses a two-tier verification system:

1. **Primary**: Coinbase facilitator verification
   - Fastest verification
   - Recommended method

2. **Fallback**: On-chain verification
   - Direct Base network query
   - Used if facilitator is unavailable

Both methods verify:
- Transaction confirmation
- Correct recipient address
- Payment amount (minimum $0.03 USDC)
- Transaction uniqueness (prevents replay attacks)

---

## Example Implementations

See [Integration Guides](integrations/) for complete examples:
- [JavaScript/Node.js](integrations/nodejs.md)
- [Python](integrations/python.md)
- [Virtuals Protocol Agents](integrations/virtuals-protocol.md)
- [LangChain AI Agents](integrations/langchain.md)

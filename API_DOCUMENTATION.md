# GenVox API Documentation

## Overview

GenVox is a real-time crypto sentiment analysis API built for AI agents using the x402 protocol. Returns actionable BUY/SELL/NEUTRAL signals based on Reddit social sentiment.

**Base URL:** `https://crypto-sentiment-api-production.up.railway.app`  
**Protocol:** x402 on Base Network  
**Payment:** 0.03 USDC per query

---

## Authentication

GenVox uses the x402 protocol for authentication and payment. No API keys required.

### Payment Flow

1. Client makes request to endpoint
2. Server returns `402 Payment Required` with payment details
3. Client creates payment payload (0.03 USDC on Base)
4. Client retries request with `X-Payment` header containing signed payment
5. Server verifies payment and returns data

---

## Endpoints

### `GET /v1/sentiment/{COIN}`

Returns sentiment analysis for a specific cryptocurrency.

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `COIN` | string | path | Yes | Cryptocurrency symbol (BTC, ETH, SOL, etc.) |

#### Supported Coins

- `BTC` - Bitcoin
- `ETH` - Ethereum
- `SOL` - Solana
- `DOGE` - Dogecoin
- `ADA` - Cardano
- `XRP` - Ripple
- `DOT` - Polkadot
- `MATIC` - Polygon
- `LINK` - Chainlink
- `UNI` - Uniswap

#### Request Headers

```
X-Payment: <x402-payment-payload>
```

#### Example Request

```bash
curl -X GET \
  https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: <payment-payload>"
```

#### Response Schema

**Status Code:** `200 OK`

```json
{
  "coin": "string",
  "signal": "string",
  "score": "number",
  "sentiment": {
    "positive": "number",
    "negative": "number",
    "neutral": "number"
  },
  "mentions": "number",
  "trend": "string",
  "timestamp": "string"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Cryptocurrency symbol (e.g., "BTC") |
| `signal` | string | Trading signal: "STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL" |
| `score` | number | Sentiment score from -1.0 (very bearish) to +1.0 (very bullish) |
| `sentiment.positive` | number | Percentage of positive mentions (0-100) |
| `sentiment.negative` | number | Percentage of negative mentions (0-100) |
| `sentiment.neutral` | number | Percentage of neutral mentions (0-100) |
| `mentions` | number | Total Reddit posts analyzed |
| `trend` | string | Price trend direction: "up", "down", "sideways" |
| `timestamp` | string | ISO 8601 timestamp of analysis |

#### Signal Mapping

| Score Range | Signal | Meaning |
|-------------|--------|---------|
| 0.15 to 1.0 | STRONG BUY | Very bullish sentiment across Reddit |
| 0.05 to 0.15 | BUY | Positive sentiment detected |
| -0.05 to 0.05 | NEUTRAL | Mixed or unclear sentiment |
| -0.15 to -0.05 | SELL | Negative sentiment detected |
| -1.0 to -0.15 | STRONG SELL | Very bearish sentiment across Reddit |

#### Example Response

```json
{
  "coin": "BTC",
  "signal": "STRONG BUY",
  "score": 0.234,
  "sentiment": {
    "positive": 65,
    "negative": 15,
    "neutral": 20
  },
  "mentions": 147,
  "trend": "up",
  "timestamp": "2025-12-22T18:30:00Z"
}
```

---

## x402 Integration Guide

### For AI Agents

#### 1. Install x402 SDK

**JavaScript:**
```bash
npm install @x402/core @x402/evm @x402/fetch
```

**Python:**
```bash
pip install x402-client
```

#### 2. Create Payment Signer

**JavaScript:**
```javascript
import { PrivateKeySigner } from '@x402/evm';

const signer = new PrivateKeySigner({
  privateKey: process.env.PRIVATE_KEY,
  network: 'base',
  token: 'USDC'
});
```

**Python:**
```python
from x402 import PrivateKeySigner

signer = PrivateKeySigner(
    private_key=os.getenv('PRIVATE_KEY'),
    network='base',
    token='USDC'
)
```

#### 3. Make Request with Payment

**JavaScript:**
```javascript
import { x402Fetch } from '@x402/fetch';

const response = await x402Fetch(
  'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC',
  {
    signer: signer,
    maxAmount: '0.03' // USDC
  }
);

const data = await response.json();
console.log(data.signal); // "STRONG BUY"
```

**Python:**
```python
from x402 import x402_request

response = x402_request(
    url='https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC',
    signer=signer,
    max_amount='0.03'
)

data = response.json()
print(data['signal'])  # "STRONG BUY"
```

#### 4. Handle Response

```javascript
if (data.signal === 'STRONG BUY' && data.score > 0.2) {
  // Execute buy order
  await tradingBot.buy(data.coin);
} else if (data.signal === 'STRONG SELL') {
  // Execute sell order
  await tradingBot.sell(data.coin);
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Request successful, sentiment data returned |
| 402 | Payment Required | Initial response with payment details |
| 400 | Bad Request | Invalid coin symbol or malformed request |
| 403 | Payment Invalid | Payment verification failed |
| 404 | Not Found | Coin not supported |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error, retry later |

### Error Response Format

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

### Common Errors

**Invalid Coin Symbol:**
```json
{
  "error": {
    "code": "INVALID_COIN",
    "message": "Coin symbol not supported",
    "details": {
      "supported_coins": ["BTC", "ETH", "SOL", ...]
    }
  }
}
```

**Payment Verification Failed:**
```json
{
  "error": {
    "code": "PAYMENT_INVALID",
    "message": "Payment signature verification failed",
    "details": {
      "required_amount": "0.03",
      "received_amount": "0.02"
    }
  }
}
```

---

## Rate Limits

- **100 requests per minute** per wallet address
- **1,000 requests per hour** per wallet address
- No daily limit

Rate limit headers included in response:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

---

## Data Sources

GenVox analyzes sentiment from:
- **r/CryptoCurrency** (8M+ members)
- **r/Bitcoin** (6M+ members)
- **r/Ethereum** (2M+ members)
- Coin-specific subreddits

### Data Freshness

- Sentiment data updated **every hour**
- Covers **last 24 hours** of activity
- Minimum **50 mentions** required for signal

---

## Performance

### Response Times

- **Average:** 150ms
- **95th percentile:** 200ms
- **99th percentile:** 300ms

### Uptime

- **Target:** 99.9%
- **Current:** 99.95% (last 30 days)
- **Status page:** https://status.genvox.io (coming soon)

---

## Use Cases

### Trading Bots

Monitor sentiment for multiple coins and execute trades based on signals:

```javascript
const coins = ['BTC', 'ETH', 'SOL'];

for (const coin of coins) {
  const sentiment = await getSentiment(coin);
  
  if (sentiment.signal === 'STRONG BUY' && sentiment.score > 0.2) {
    await executeBuy(coin, sentiment.score);
  }
}
```

### Portfolio Rebalancing

Adjust holdings based on sentiment shifts:

```python
portfolio = ['BTC', 'ETH', 'ADA']

for coin in portfolio:
    sentiment = get_sentiment(coin)
    
    if sentiment['signal'] == 'STRONG SELL':
        reduce_position(coin, percentage=0.3)
    elif sentiment['signal'] == 'STRONG BUY':
        increase_position(coin, percentage=0.2)
```

### Alert System

Trigger notifications on extreme sentiment:

```javascript
setInterval(async () => {
  const btc = await getSentiment('BTC');
  
  if (Math.abs(btc.score) > 0.3) {
    await sendAlert({
      coin: 'BTC',
      signal: btc.signal,
      score: btc.score,
      mentions: btc.mentions
    });
  }
}, 3600000); // Check every hour
```

---

## Testing

### Try on x402scan

Visit [x402scan](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650) to test the API with a web interface.

### Example Test Request

```bash
# 1. Get payment requirements
curl -X GET \
  https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC

# Response: 402 Payment Required with payment details

# 2. Create payment and retry (use x402 SDK)
# See integration guide above
```

---

## Support

### Issues & Bugs

Report issues on [GitHub](https://github.com/lobsterbar2027-boop/crypto-sentiment-api/issues)

### Questions

- **Twitter/X:** [@BreakTheCubicle](https://x.com/BreakTheCubicle)
- **Email:** support@genvox.io
- **Discord:** x402 Foundation server

### Service Status

Monitor API status at:
- **x402scan:** https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650
- **GitHub:** https://github.com/lobsterbar2027-boop/crypto-sentiment-api

---

## Changelog

### v1.0.0 (December 2025)

- Initial release
- 10 supported coins
- x402 payment integration
- Reddit sentiment analysis
- Sub-200ms response times

---

## License

Proprietary - For x402 protocol use only

---

## Additional Resources

- **Website:** https://genvox.io
- **GitHub:** https://github.com/lobsterbar2027-boop/crypto-sentiment-api
- **x402 Protocol:** https://x402.org
- **Base Network:** https://base.org

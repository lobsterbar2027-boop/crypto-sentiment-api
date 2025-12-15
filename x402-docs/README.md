# X402 Crypto Sentiment API

**Pay-per-call crypto sentiment analysis using the x402 protocol**

Get real-time sentiment analysis for cryptocurrencies by paying $0.03 USDC per query. Built with the x402 protocol for seamless micro-payments on Base.

## Why X402?

- **🪙 True Micro-Payments**: Pay only $0.03 USDC per query (no subscriptions)
- **⚡ Instant Access**: No API keys, no sign-ups, just pay and use
- **🤖 Agent-Friendly**: Perfect for autonomous AI agents with crypto wallets
- **📊 Real Sentiment Data**: Aggregated from Reddit crypto communities
- **🔒 Secure**: Payment verification via Coinbase facilitator + on-chain fallback

## Quick Start

### Option 1: Using x402scan (Easiest)

1. Go to [x402scan.com](https://x402scan.com)
2. Find "Crypto Sentiment API"
3. Click and pay $0.03 USDC to get instant sentiment for BTC, ETH, SOL, etc.

### Option 2: Direct API Call

```bash
# Get payment requirements first
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC

# Returns 402 Payment Required with payment details
```

Response:
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
    "description": "Real-time crypto sentiment analysis for BTC"
  }]
}
```

Then make payment and include in header:
```bash
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: BASE64_ENCODED_PAYMENT_DATA"
```

## What You Get

Each query returns:

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

### Signal Types
- **STRONG BUY**: Sentiment score > 0.15
- **BUY**: Sentiment score > 0.05
- **NEUTRAL**: Sentiment score between -0.05 and 0.05
- **SELL**: Sentiment score < -0.05
- **STRONG SELL**: Sentiment score < -0.15

## Supported Coins

BTC, ETH, SOL, DOGE, ADA, XRP, DOT, MATIC, LINK, UNI

## API Endpoints

| Endpoint | Method | Cost | Description |
|----------|--------|------|-------------|
| `/` | GET | Free | Get x402 payment info |
| `/info` | GET | Free | API documentation |
| `/health` | GET | Free | Health check |
| `/v1/sentiment/:coin` | GET | $0.03 | Get sentiment for coin |

## For Developers

- [Quick Start Guide](quickstart.md) - Get started in 5 minutes
- [x402 Protocol Guide](x402-protocol.md) - Understanding x402 payments
- [Integration Examples](integrations/) - Code for AI agents
- [API Reference](api-reference.md) - Complete endpoint docs

## Use Cases

- **Trading Bots**: Get real-time sentiment signals for trading decisions
- **AI Agents**: Autonomous agents can pay and query without human intervention
- **Portfolio Tools**: Monitor sentiment across multiple coins
- **Research**: Analyze crypto community sentiment trends

## Technical Details

- **Base URL**: `https://crypto-sentiment-api-production.up.railway.app`
- **Network**: Base (Ethereum L2)
- **Payment Token**: USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Cost**: $0.03 USDC per query
- **Rate Limit**: 100 requests per minute
- **Data Source**: Reddit (r/CryptoCurrency, r/Bitcoin, r/ethereum, r/CryptoMarkets)

## Support

- **GitHub**: [crypto-sentiment-api](https://github.com/lobsterbar2027-boop/crypto-sentiment-api)
- **x402scan**: Find us on [x402scan.com](https://x402scan.com)
- **Issues**: Open an issue on GitHub

## How It Works

1. Your agent/app makes a request to `/v1/sentiment/BTC`
2. API returns 402 with payment requirements
3. Your agent pays $0.03 USDC on Base to the specified address
4. Payment is verified via Coinbase facilitator
5. API returns sentiment analysis
6. Payment is logged to prevent replay attacks

[Get Started →](quickstart.md)

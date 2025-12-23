# 🪙 GenVox Crypto Sentiment API

> Real-time crypto sentiment analysis powered by Reddit social data. Built for AI agents using the x402 protocol.

[![x402 Protocol](https://img.shields.io/badge/x402-protocol-00D9FF)](https://x402.org)
[![Base Network](https://img.shields.io/badge/Base-Network-0052FF)](https://base.org)
[![Price](https://img.shields.io/badge/Price-$0.03%20USDC-FFD93D)](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650)

**Live API:** `https://crypto-sentiment-api-production.up.railway.app`  
**Website:** [genvox.io](https://genvox.io)  
**x402scan:** [View on x402scan](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650)

---

## 🎯 What is GenVox?

GenVox analyzes real-time sentiment from Reddit's cryptocurrency communities to generate actionable **BUY/SELL/NEUTRAL** trading signals. Perfect for AI trading bots, portfolio managers, and autonomous agents.

### Key Features

- 🚀 **Sub-200ms Response Time** - Lightning fast for real-time trading
- 💰 **$0.03 Per Query** - Micro-payments via x402 protocol on Base
- 🤖 **Agent-First Design** - No API keys, no signup, instant access
- 📊 **10+ Supported Coins** - BTC, ETH, SOL, DOGE, ADA, XRP, DOT, MATIC, LINK, UNI
- 🔄 **Real-Time Data** - Sentiment updated every hour from Reddit
- 📈 **Confidence Scores** - 0-1 scale showing signal strength
- 🔒 **Secure Payments** - USDC on Base L2 (low gas fees)

---

## 🚀 Quick Start
## 📖 Documentation
   
   - **[API Documentation](./API_DOCUMENTATION.md)** - Complete API reference
   - **[Quickstart Guide](./QUICKSTART.md)** - Get started in 5 minutes
   - **[Code Examples](./examples/)** - Working JavaScript & Python examples

### For AI Agents

```bash
curl -X GET https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: <x402-payment-proof>"
```

### Example Response

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
  "timestamp": "2025-12-19T21:45:00Z"
}
```

---

## 📖 API Documentation

### Endpoint

```
GET /v1/sentiment/{COIN}
```

**Supported Coins:**
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

### Request Headers

```
X-Payment: <x402-payment-proof>
```

The payment proof should be a valid x402 protocol payment of **0.03 USDC** on Base network.

### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `coin` | string | Coin symbol (e.g., "BTC") |
| `signal` | string | Trading signal: "STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL" |
| `score` | number | Sentiment score from -1 (very negative) to +1 (very positive) |
| `sentiment.positive` | number | Percentage of positive mentions |
| `sentiment.negative` | number | Percentage of negative mentions |
| `sentiment.neutral` | number | Percentage of neutral mentions |
| `mentions` | number | Total Reddit posts analyzed |
| `trend` | string | Price trend direction: "up", "down", "sideways" |
| `timestamp` | string | ISO 8601 timestamp of analysis |

### Signal Mapping

| Score Range | Signal | Meaning |
|-------------|--------|---------|
| `0.15 to 1.0` | STRONG BUY | Very bullish sentiment |
| `0.05 to 0.15` | BUY | Bullish sentiment |
| `-0.05 to 0.05` | NEUTRAL | Mixed or unclear sentiment |
| `-0.15 to -0.05` | SELL | Bearish sentiment |
| `-1.0 to -0.15` | STRONG SELL | Very bearish sentiment |

---

## 💻 Code Examples

### JavaScript (Node.js)

```javascript
const axios = require('axios');

async function getCryptoSentiment(coin) {
  const response = await axios.get(
    `https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/${coin}`,
    {
      headers: {
        'X-Payment': '<your-x402-payment-proof>'
      }
    }
  );
  
  return response.data;
}

// Usage
getCryptoSentiment('BTC').then(data => {
  console.log(`Signal: ${data.signal}`);
  console.log(`Score: ${data.score}`);
  console.log(`Mentions: ${data.mentions}`);
});
```

### Python

```python
import requests

def get_crypto_sentiment(coin):
    url = f"https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/{coin}"
    headers = {
        "X-Payment": "<your-x402-payment-proof>"
    }
    
    response = requests.get(url, headers=headers)
    return response.json()

# Usage
data = get_crypto_sentiment("ETH")
print(f"Signal: {data['signal']}")
print(f"Score: {data['score']}")
print(f"Trend: {data['trend']}")
```

### cURL

```bash
# Get Bitcoin sentiment
curl -X GET \
  https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: <your-x402-payment-proof>"

# Get Ethereum sentiment
curl -X GET \
  https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/ETH \
  -H "X-Payment: <your-x402-payment-proof>"
```

---

## 🤖 For AI Agent Developers

### Using with x402 Protocol

1. **Set up x402 client** - Follow [x402 documentation](https://docs.x402.org)
2. **Fund your agent's wallet** - Add USDC on Base network
3. **Make payment** - Agent pays 0.03 USDC per query
4. **Receive payment proof** - x402 returns proof-of-payment
5. **Call API** - Include proof in `X-Payment` header
6. **Get sentiment data** - Use for trading decisions

### Integration Example (Pseudocode)

```javascript
// Your AI trading bot
async function makeTradeDecision(coin) {
  // 1. Pay via x402
  const paymentProof = await x402.pay({
    amount: "0.03",
    currency: "USDC",
    recipient: "crypto-sentiment-api-production.up.railway.app"
  });
  
  // 2. Call GenVox API
  const sentiment = await fetch(`/v1/sentiment/${coin}`, {
    headers: { 'X-Payment': paymentProof }
  });
  
  // 3. Make decision
  if (sentiment.signal === "STRONG BUY" && sentiment.score > 0.2) {
    return executeBuy(coin);
  } else if (sentiment.signal === "STRONG SELL") {
    return executeSell(coin);
  }
  
  return "HOLD";
}
```

---

## 🔗 Use Cases

### Trading Bots
Real-time sentiment signals for automated trading strategies. Combine with price data and technical indicators for informed decisions.

### Portfolio Managers
Monitor sentiment across multiple assets. Rebalance portfolios based on community sentiment shifts.

### Research & Analytics
Track sentiment trends over time. Analyze correlation between Reddit sentiment and price movements.

### Alert Systems
Trigger notifications when sentiment for specific coins reaches extreme levels (strong buy/sell signals).

---

## 🛠️ Technical Details

### Data Sources
- **r/CryptoCurrency** - 8M+ members, most active crypto community
- **r/Bitcoin** - 6M+ members, Bitcoin-specific discussions
- **r/Ethereum** - 2M+ members, Ethereum ecosystem
- **Coin-specific subreddits** - Targeted community analysis

### Sentiment Analysis
- **VADER Algorithm** - Specialized for social media text
- **Upvote Weighting** - Highly upvoted posts carry more weight
- **Comment Analysis** - Includes comment sentiment, not just posts
- **Noise Filtering** - Removes spam, bots, and low-quality content

### Update Frequency
- Sentiment data refreshed **every hour**
- Covers approximately **last 24 hours** of Reddit activity
- Minimum **50 mentions** required for reliable signal

### Infrastructure
- **Hosted on:** Railway.app
- **Database:** PostgreSQL (caching layer)
- **CDN:** Cloudflare (for global low-latency)
- **Blockchain:** Base L2 (for x402 payments)

---

## 💰 Pricing

| Query Type | Price | Payment Method |
|------------|-------|----------------|
| Single Sentiment Query | $0.03 USDC | x402 protocol on Base |

**No subscriptions. No rate limits. Pay per use.**

### Why $0.03?

- **Affordable for high-frequency trading** - 1000 queries = $30
- **Sustainable for data costs** - Reddit API, compute, storage
- **Fair for both sides** - Agents get value, developers get paid

---

## 🌐 Links & Resources

- **Website:** [genvox.io](https://genvox.io)
- **x402scan Listing:** [View API](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650)
- **x402 Protocol:** [x402.org](https://x402.org)
- **Base Network:** [base.org](https://base.org)
- **Twitter/X:** [@BreakTheCubicle](https://x.com/BreakTheCubicle)
- **YouTube Series:** "Break the Cubicle" (https://www.youtube.com/@breakthecubicle)

---

## 📊 Stats

*Updated automatically on x402scan*

- **Total Queries:** View on [x402scan](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650)
- **Active Users:** See live data
- **Uptime:** 99.9%+
- **Average Response Time:** <200ms

---

## 🤝 Support

### For Developers

- **Issues:** [GitHub Issues](https://github.com/lobsterbar2027-boop/crypto-sentiment-api/issues)
- **Email:** support@genvox.io
- **Twitter:** [@BreakTheCubicle](https://x.com/BreakTheCubicle)

### For AI Agents

If your agent is experiencing issues:
1. Verify payment proof is valid
2. Check you're using correct endpoint URL
3. Ensure coin symbol is supported (uppercase: BTC, ETH, etc.)
4. Payment must be exactly 0.03 USDC on Base network

---

## 🚧 Roadmap

### Coming Soon

- [ ] Historical sentiment data API
- [ ] Sentiment trends (1h, 24h, 7d comparisons)
- [ ] Multi-coin batch queries (single payment)
- [ ] Webhook notifications for extreme sentiment
- [ ] Discord & Telegram data sources
- [ ] Sentiment heatmaps by timeframe
- [ ] Custom coin support (submit request)

### Future Considerations

- GraphQL endpoint
- WebSocket for real-time updates
- Token-based access (alternative to x402)
- Sentiment prediction models (ML)

---

## 📜 License

**Proprietary** - For x402 protocol use only

This API is provided as-is for AI agents via the x402 protocol. Commercial use outside x402 requires permission.

---

## 🎬 About

GenVox is part of the **Break the Cubicle** project - documenting the journey of building for the AI agent economy.


**First API built in 4 hours. Now serving real AI agents. Building in public.**

---

## 🌟 Star This Repo

If you're using GenVox or building your own x402 APIs, star this repo to show support!

---

<div align="center">

**🤖 Built for the Agent Economy**

[Try on x402scan](https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650) • [Visit Website](https://genvox.io) • [Follow Journey](https://x.com/BreakTheCubicle)

</div>

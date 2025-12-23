# GenVox Quickstart Guide

Get started with GenVox Sentiment API in under 5 minutes.

---

## Prerequisites

- Wallet with USDC on Base network
- Private key for signing payments
- Node.js 18+ or Python 3.8+

---

## Quick Start (JavaScript)

### 1. Install Dependencies

```bash
npm install @x402/core @x402/evm @x402/fetch
```

### 2. Set Environment Variables

```bash
export PRIVATE_KEY="your_private_key_here"
export WALLET_ADDRESS="your_wallet_address"
```

### 3. Make Your First Request

```javascript
// quickstart.js
import { PrivateKeySigner } from '@x402/evm';
import { x402Fetch } from '@x402/fetch';

// Create payment signer
const signer = new PrivateKeySigner({
  privateKey: process.env.PRIVATE_KEY,
  network: 'base',
  token: 'USDC'
});

// Get Bitcoin sentiment
async function getSentiment(coin) {
  const response = await x402Fetch(
    `https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/${coin}`,
    {
      signer: signer,
      maxAmount: '0.03' // 0.03 USDC per query
    }
  );
  
  return await response.json();
}

// Use it
const btc = await getSentiment('BTC');
console.log(`Signal: ${btc.signal}`);
console.log(`Score: ${btc.score}`);
console.log(`Positive: ${btc.sentiment.positive}%`);
```

### 4. Run It

```bash
node quickstart.js
```

**Expected Output:**
```
Signal: STRONG BUY
Score: 0.234
Positive: 65%
```

---

## Quick Start (Python)

### 1. Install Dependencies

```bash
pip install x402-client requests
```

### 2. Set Environment Variables

```bash
export PRIVATE_KEY="your_private_key_here"
```

### 3. Make Your First Request

```python
# quickstart.py
import os
from x402 import PrivateKeySigner, x402_request

# Create payment signer
signer = PrivateKeySigner(
    private_key=os.getenv('PRIVATE_KEY'),
    network='base',
    token='USDC'
)

# Get Bitcoin sentiment
def get_sentiment(coin):
    response = x402_request(
        url=f'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/{coin}',
        signer=signer,
        max_amount='0.03'
    )
    return response.json()

# Use it
btc = get_sentiment('BTC')
print(f"Signal: {btc['signal']}")
print(f"Score: {btc['score']}")
print(f"Positive: {btc['sentiment']['positive']}%")
```

### 4. Run It

```bash
python quickstart.py
```

---

## Try Without Code

Test the API instantly on x402scan:

1. Visit: https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650
2. Connect wallet (must have USDC on Base)
3. Click "Try API"
4. Select coin (BTC, ETH, etc.)
5. Get instant sentiment analysis

---

## Building a Trading Bot

### Simple Bot Example

```javascript
// trading-bot.js
import { getSentiment } from './quickstart.js';

async function tradingLoop() {
  const coins = ['BTC', 'ETH', 'SOL'];
  
  for (const coin of coins) {
    const sentiment = await getSentiment(coin);
    
    // Strong buy signal
    if (sentiment.signal === 'STRONG BUY' && sentiment.score > 0.2) {
      console.log(`🚀 BUY ${coin} - Score: ${sentiment.score}`);
      // await executeBuy(coin);
    }
    
    // Strong sell signal
    else if (sentiment.signal === 'STRONG SELL' && sentiment.score < -0.2) {
      console.log(`📉 SELL ${coin} - Score: ${sentiment.score}`);
      // await executeSell(coin);
    }
    
    // Neutral
    else {
      console.log(`⏸️  HOLD ${coin} - Score: ${sentiment.score}`);
    }
  }
}

// Run every hour
setInterval(tradingLoop, 3600000);
tradingLoop(); // Run immediately
```

---

## Common Use Cases

### 1. Multi-Coin Monitor

```javascript
const portfolio = ['BTC', 'ETH', 'SOL', 'ADA'];

async function monitorPortfolio() {
  const results = await Promise.all(
    portfolio.map(coin => getSentiment(coin))
  );
  
  const bullish = results.filter(r => r.score > 0.15);
  const bearish = results.filter(r => r.score < -0.15);
  
  console.log(`Bullish: ${bullish.length}/${portfolio.length}`);
  console.log(`Bearish: ${bearish.length}/${portfolio.length}`);
}
```

### 2. Alert System

```javascript
async function checkAlerts() {
  const btc = await getSentiment('BTC');
  
  // Alert on extreme sentiment
  if (Math.abs(btc.score) > 0.3) {
    await sendEmail({
      subject: `ALERT: ${btc.coin} ${btc.signal}`,
      body: `Score: ${btc.score}, Mentions: ${btc.mentions}`
    });
  }
}
```

### 3. Historical Tracking

```javascript
const history = [];

async function trackSentiment() {
  const btc = await getSentiment('BTC');
  
  history.push({
    timestamp: new Date(),
    signal: btc.signal,
    score: btc.score,
    mentions: btc.mentions
  });
  
  // Keep last 7 days
  if (history.length > 168) { // 24 * 7
    history.shift();
  }
  
  console.log(`Avg score (7d): ${calculateAverage(history)}`);
}
```

---

## Troubleshooting

### "Payment verification failed"

**Problem:** Your payment wasn't accepted

**Solutions:**
- Ensure you have USDC on Base network
- Check you're paying exactly 0.03 USDC
- Verify your private key is correct
- Make sure wallet has gas for transaction

### "Coin not supported"

**Problem:** Invalid coin symbol

**Solutions:**
- Use uppercase: `BTC` not `btc`
- Check supported coins list in documentation
- Verify spelling (e.g., `MATIC` not `POLYGON`)

### "Rate limit exceeded"

**Problem:** Too many requests

**Solutions:**
- Limit to 100 requests/minute
- Add delay between requests
- Use Promise.all() for bulk requests efficiently

---

## Next Steps

1. **Read Full Docs:** [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
2. **See Examples:** [examples/](./examples/)
3. **Join Community:** [x402 Discord](https://discord.gg/x402)
4. **Follow Updates:** [@BreakTheCubicle](https://x.com/BreakTheCubicle)

---

## Need Help?

- **GitHub Issues:** https://github.com/lobsterbar2027-boop/crypto-sentiment-api/issues
- **Email:** support@genvox.io
- **Twitter:** @BreakTheCubicle

---

## Cost Calculator

| Usage | Calls/Day | Cost/Day | Cost/Month |
|-------|-----------|----------|------------|
| Hobby | 10 | $0.30 | $9 |
| Active Bot | 100 | $3.00 | $90 |
| Trading System | 500 | $15.00 | $450 |
| Enterprise | 2,000 | $60.00 | $1,800 |

**No hidden fees. No subscriptions. Just pay per use.**

# Quick Start Guide

Get crypto sentiment data in 5 minutes using x402 protocol.

## Option 1: Use x402scan (Easiest - No Code!)

Perfect for testing or one-off queries.

1. **Go to x402scan**: Visit [x402scan.com](https://x402scan.com)
2. **Find the API**: Search for "Crypto Sentiment"
3. **Connect Wallet**: Connect your wallet with USDC on Base
4. **Pay & Query**: Click to pay $0.03 USDC and get instant sentiment data

Done! ✅

---

## Option 2: Use cURL (For Developers)

### Step 1: Check API is Running

```bash
curl https://crypto-sentiment-api-production.up.railway.app/health
```

You should see:
```json
{
  "status": "healthy",
  "service": "crypto-sentiment-api",
  "version": "1.4.0",
  "x402": "enabled"
}
```

### Step 2: Request Payment Info

```bash
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC
```

You'll get a 402 response with payment details:
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "network": "base",
    "maxAmountRequired": "30000",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x48365516b2d74a3dfa621289e76507940466480f"
  }]
}
```

### Step 3: Make Payment

Send 0.03 USDC on Base network to the address from `payTo`.

You can use:
- **MetaMask**: Switch to Base, send USDC
- **Rainbow Wallet**: Built-in Base support
- **Any Base-compatible wallet**

### Step 4: Retry With Payment Proof

```bash
# Create payment data JSON
echo '{
  "transactionHash": "0xYOUR_TX_HASH",
  "from": "0xYOUR_ADDRESS",
  "amount": "30000",
  "timestamp": 1702656000000
}' | base64

# Use the base64 output as X-Payment header
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: YOUR_BASE64_PAYMENT_DATA"
```

### Step 5: Get Your Data

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

---

## Option 3: JavaScript/Node.js

### Install Dependencies

```bash
npm install ethers node-fetch
```

### Create a Simple Script

```javascript
// sentiment.js
const fetch = require('node-fetch');
const { ethers } = require('ethers');

async function getSentiment(coin, privateKey) {
  const apiUrl = `https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/${coin}`;
  
  // 1. Get payment info
  const req1 = await fetch(apiUrl);
  const paymentInfo = await req1.json();
  const payment = paymentInfo.accepts[0];
  
  console.log(`💰 Need to pay ${payment.maxAmountRequired / 1000000} USDC`);
  
  // 2. Setup wallet
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(privateKey, provider);
  
  // 3. Send USDC
  const usdc = new ethers.Contract(
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ['function transfer(address to, uint256 amount) returns (bool)'],
    wallet
  );
  
  console.log('💸 Sending payment...');
  const tx = await usdc.transfer(payment.payTo, payment.maxAmountRequired);
  await tx.wait();
  console.log('✅ Payment confirmed!');
  
  // 4. Create payment proof
  const paymentData = {
    transactionHash: tx.hash,
    from: wallet.address,
    amount: payment.maxAmountRequired,
    timestamp: Date.now()
  };
  
  const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');
  
  // 5. Get sentiment
  const req2 = await fetch(apiUrl, {
    headers: { 'X-Payment': paymentHeader }
  });
  
  return await req2.json();
}

// Usage
const privateKey = process.env.PRIVATE_KEY;
getSentiment('BTC', privateKey)
  .then(sentiment => {
    console.log('\n📊 Sentiment Result:');
    console.log(`   ${sentiment.coin}: ${sentiment.signal}`);
    console.log(`   Score: ${sentiment.score}`);
    console.log(`   Positive: ${sentiment.positive}%`);
    console.log(`   Negative: ${sentiment.negative}%`);
    console.log(`   Mentions: ${sentiment.mentions}`);
  })
  .catch(console.error);
```

### Run It

```bash
export PRIVATE_KEY="0x..."
node sentiment.js
```

---

## Option 4: Python

### Install Dependencies

```bash
pip install web3 requests
```

### Create a Script

```python
# sentiment.py
import requests
import json
import base64
from web3 import Web3

def get_sentiment(coin, private_key):
    api_url = f'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/{coin}'
    
    # 1. Get payment info
    response = requests.get(api_url)
    payment_info = response.json()
    payment = payment_info['accepts'][0]
    
    print(f"💰 Need to pay {int(payment['maxAmountRequired']) / 1000000} USDC")
    
    # 2. Setup Web3
    w3 = Web3(Web3.HTTPProvider('https://mainnet.base.org'))
    account = w3.eth.account.from_key(private_key)
    
    # 3. Send USDC (you'll need to implement this with proper ABI)
    # For brevity, assuming tx_hash is returned
    tx_hash = send_usdc_payment(w3, account, payment)
    print('✅ Payment confirmed!')
    
    # 4. Create payment proof
    payment_data = {
        'transactionHash': tx_hash,
        'from': account.address,
        'amount': payment['maxAmountRequired'],
        'timestamp': int(time.time() * 1000)
    }
    
    payment_header = base64.b64encode(
        json.dumps(payment_data).encode()
    ).decode()
    
    # 5. Get sentiment
    response = requests.get(
        api_url,
        headers={'X-Payment': payment_header}
    )
    
    return response.json()

# Usage
sentiment = get_sentiment('BTC', 'YOUR_PRIVATE_KEY')
print(f"\n📊 {sentiment['coin']}: {sentiment['signal']}")
print(f"   Score: {sentiment['score']}")
print(f"   Mentions: {sentiment['mentions']}")
```

---

## Understanding the Response

```json
{
  "coin": "BTC",                    // Coin analyzed
  "signal": "STRONG BUY",          // Trading signal
  "score": 0.234,                  // Sentiment score (-1 to 1)
  "positive": 65,                  // % positive mentions
  "negative": 15,                  // % negative mentions
  "neutral": 20,                   // % neutral mentions
  "mentions": 147,                 // Total mentions found
  "trend": "up",                   // Overall trend
  "sources": ["reddit"],           // Data sources
  "timestamp": "2024-12-15...",    // Analysis time
  "cost": "0.03 USDC"             // Query cost
}
```

### Signal Meanings

| Signal | Score Range | Action |
|--------|-------------|--------|
| **STRONG BUY** | > 0.15 | Very bullish |
| **BUY** | 0.05 to 0.15 | Bullish |
| **NEUTRAL** | -0.05 to 0.05 | Hold |
| **SELL** | -0.15 to -0.05 | Bearish |
| **STRONG SELL** | < -0.15 | Very bearish |

---

## Supported Coins

Currently supported: **BTC, ETH, SOL, DOGE, ADA, XRP, DOT, MATIC, LINK, UNI**

Try any of these:
```bash
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/ETH
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/SOL
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/DOGE
```

---

## Cost

- **Per Query**: $0.03 USDC
- **Gas Fee**: ~$0.001 (on Base network)
- **Total**: ~$0.031 per query

Much cheaper than Ethereum mainnet! ⚡

---

## Need Help?

**Quick Links:**
- [Full API Reference](api-reference.md) - All endpoints and details
- [x402 Protocol Guide](x402-protocol.md) - How x402 works
- [Integration Examples](integrations/) - More code examples
- [GitHub](https://github.com/lobsterbar2027-boop/crypto-sentiment-api) - Source code

**Having Issues?**
- Check API health: `curl https://crypto-sentiment-api-production.up.railway.app/health`
- Verify you have USDC on Base network
- Make sure transaction is confirmed before retrying
- Each transaction can only be used once (no replay)

---

## Next Steps

- Read [API Reference](api-reference.md) for all features
- See [Virtuals Protocol Integration](integrations/virtuals-protocol.md) for AI agents
- Check [x402 Protocol Guide](x402-protocol.md) to understand payments
- Build something cool! 🚀

# Understanding the x402 Protocol

The x402 protocol enables **pay-per-call APIs** using cryptocurrency micropayments. Instead of API keys or subscriptions, you pay for each request you make.

## Why x402?

**Traditional APIs:**
- Require sign-up and API keys
- Monthly subscriptions or prepaid credits
- Human intervention needed

**x402 APIs:**
- No sign-up required
- Pay exactly what you use ($0.03 per call)
- Perfect for autonomous AI agents
- Instant access

## How It Works

### Step 1: Request Without Payment

```bash
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC
```

### Step 2: Receive Payment Requirements (402)

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
    "resource": "https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC"
  }]
}
```

### Step 3: Make Payment on Base Network

Send 0.03 USDC to the address specified in `payTo`:
- **Network**: Base (Ethereum L2)
- **Token**: USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Amount**: 0.03 USDC (30000 in micro-units)
- **To**: `0x48365516b2d74a3dfa621289e76507940466480f`

### Step 4: Create Payment Header

After your transaction is confirmed, create the payment data:

```javascript
const paymentData = {
  transactionHash: "0xabc123...",  // Your Base transaction hash
  from: "0xyouraddress...",         // Your wallet address
  amount: "30000",                  // Amount in micro-USDC
  timestamp: Date.now()
};

const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');
```

### Step 5: Retry Request With Payment

```bash
curl https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC \
  -H "X-Payment: eyJ0cmFuc2FjdGlvbkhhc2giOiIweGFiYzEyMy4uLiJ9"
```

### Step 6: Get Your Data

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

## Easy Way: Use x402scan

Instead of manually handling payments, use [x402scan.com](https://x402scan.com):

1. Go to x402scan.com
2. Find "Crypto Sentiment API"
3. Connect your wallet
4. Click to pay and receive data instantly

x402scan handles all the payment verification for you!

## For Developers

### JavaScript/TypeScript Example

```javascript
const fetch = require('node-fetch');
const { ethers } = require('ethers');

async function getSentiment(coin) {
  const apiUrl = `https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/${coin}`;
  
  // Step 1: Get payment requirements
  const req1 = await fetch(apiUrl);
  const paymentInfo = await req1.json();
  
  // Step 2: Make payment on Base
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const walletWithProvider = wallet.connect(provider);
  
  const usdcContract = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const usdcAbi = ['function transfer(address to, uint amount) returns (bool)'];
  const usdc = new ethers.Contract(usdcContract, usdcAbi, walletWithProvider);
  
  const tx = await usdc.transfer(
    paymentInfo.accepts[0].payTo,
    paymentInfo.accepts[0].maxAmountRequired
  );
  
  await tx.wait(); // Wait for confirmation
  
  // Step 3: Create payment header
  const paymentData = {
    transactionHash: tx.hash,
    from: wallet.address,
    amount: paymentInfo.accepts[0].maxAmountRequired,
    timestamp: Date.now()
  };
  
  const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');
  
  // Step 4: Get sentiment data
  const req2 = await fetch(apiUrl, {
    headers: {
      'X-Payment': paymentHeader
    }
  });
  
  return await req2.json();
}

// Usage
getSentiment('BTC').then(console.log);
```

### Python Example

```python
import requests
import base64
import json
from web3 import Web3

def get_sentiment(coin):
    api_url = f'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/{coin}'
    
    # Step 1: Get payment requirements
    response = requests.get(api_url)
    payment_info = response.json()
    
    # Step 2: Make payment on Base (pseudocode)
    # You would use web3.py or similar to send USDC
    tx_hash = send_usdc_payment(
        to=payment_info['accepts'][0]['payTo'],
        amount=payment_info['accepts'][0]['maxAmountRequired']
    )
    
    # Step 3: Create payment header
    payment_data = {
        'transactionHash': tx_hash,
        'from': 'your_wallet_address',
        'amount': payment_info['accepts'][0]['maxAmountRequired'],
        'timestamp': int(time.time() * 1000)
    }
    
    payment_header = base64.b64encode(
        json.dumps(payment_data).encode()
    ).decode()
    
    # Step 4: Get sentiment data
    response = requests.get(
        api_url,
        headers={'X-Payment': payment_header}
    )
    
    return response.json()
```

## Payment Verification

The API verifies your payment using:

1. **Coinbase Facilitator** (Primary)
   - Fast verification
   - Recommended method
   - `https://facilitator.coinbase.com/verify`

2. **On-chain Verification** (Fallback)
   - Direct Base network query
   - Used if facilitator unavailable
   - Checks transaction status and recipient

## Security Features

- **Replay Attack Prevention**: Each transaction can only be used once
- **Double-spend Protection**: Payments are logged and checked
- **Amount Verification**: Ensures correct payment amount
- **Recipient Verification**: Confirms payment went to correct address
- **Network Verification**: Only accepts Base network transactions

## Cost Breakdown

- **Per Query**: $0.03 USDC
- **Gas Fees**: ~$0.001 on Base (paid separately)
- **Total Cost**: ~$0.031 per query

Gas fees are minimal on Base compared to Ethereum mainnet!

## Benefits for AI Agents

x402 is perfect for autonomous agents:
- No human API key management
- Agents can pay from their own wallets
- Usage scales with actual needs
- No monthly bills or credit card required

## Network Details

- **Chain**: Base (Ethereum L2)
- **Chain ID**: 8453
- **RPC**: `https://mainnet.base.org`
- **USDC Contract**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Block Explorer**: https://basescan.org

## Common Issues

### "Payment already used"
Each transaction can only be used once. Make a new payment for each request.

### "Payment verification failed"
- Check transaction is confirmed on Base
- Verify you sent to correct address
- Ensure amount is correct (0.03 USDC)

### "Transaction not found"
Wait a few seconds for Base network confirmation before retrying.

## Learn More

- [x402 Protocol Specification](https://x402.org)
- [x402scan - API Discovery](https://x402scan.com)
- [Base Network Documentation](https://docs.base.org)
- [USDC on Base](https://www.circle.com/en/usdc-on-base)

# Virtuals Protocol Integration

Integrate X402 Crypto Sentiment API into your Virtuals Protocol agent.

## Overview

This guide shows how to add sentiment analysis to your Virtuals agent using the x402 pay-per-call protocol. Your agent can autonomously pay for sentiment data using its own wallet.

## Prerequisites

- Virtuals Protocol agent with wallet
- USDC on Base network (~$1 for testing)
- Node.js 18+

## Installation

```bash
npm install ethers node-fetch
```

## Basic Integration

### 1. Create Sentiment Service

```javascript
// services/x402SentimentService.js
const fetch = require('node-fetch');
const { ethers } = require('ethers');

class X402SentimentService {
  constructor(privateKey, rpcUrl = 'https://mainnet.base.org') {
    this.apiUrl = 'https://crypto-sentiment-api-production.up.railway.app';
    this.wallet = new ethers.Wallet(privateKey);
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.walletWithProvider = this.wallet.connect(this.provider);
    
    // USDC contract on Base
    this.usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    this.usdcAbi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)'
    ];
    this.usdc = new ethers.Contract(
      this.usdcAddress,
      this.usdcAbi,
      this.walletWithProvider
    );
  }

  async getSentiment(coin) {
    try {
      const endpoint = `${this.apiUrl}/v1/sentiment/${coin.toUpperCase()}`;
      
      // Step 1: Get payment requirements
      console.log(`📊 Requesting sentiment for ${coin}...`);
      const paymentReq = await fetch(endpoint);
      const paymentInfo = await paymentReq.json();
      
      if (paymentReq.status !== 402) {
        throw new Error('Expected 402 Payment Required response');
      }
      
      const paymentDetails = paymentInfo.accepts[0];
      console.log(`💰 Payment required: ${paymentDetails.maxAmountRequired / 1000000} USDC`);
      
      // Step 2: Check balance
      const balance = await this.usdc.balanceOf(this.wallet.address);
      if (balance < BigInt(paymentDetails.maxAmountRequired)) {
        throw new Error(`Insufficient USDC balance. Need ${paymentDetails.maxAmountRequired}, have ${balance}`);
      }
      
      // Step 3: Make payment
      console.log('💸 Sending payment...');
      const tx = await this.usdc.transfer(
        paymentDetails.payTo,
        paymentDetails.maxAmountRequired
      );
      
      console.log(`⏳ Waiting for confirmation... (tx: ${tx.hash.slice(0, 10)}...)`);
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error('Payment transaction failed');
      }
      
      console.log('✅ Payment confirmed!');
      
      // Step 4: Create payment proof
      const paymentData = {
        transactionHash: tx.hash,
        from: this.wallet.address,
        amount: paymentDetails.maxAmountRequired,
        timestamp: Date.now()
      };
      
      const paymentHeader = Buffer.from(JSON.stringify(paymentData)).toString('base64');
      
      // Step 5: Get sentiment with payment proof
      console.log('📥 Fetching sentiment data...');
      const sentimentReq = await fetch(endpoint, {
        headers: {
          'X-Payment': paymentHeader
        }
      });
      
      if (!sentimentReq.ok) {
        const error = await sentimentReq.json();
        throw new Error(`Sentiment request failed: ${error.message}`);
      }
      
      const sentiment = await sentimentReq.json();
      console.log(`✅ Sentiment retrieved: ${sentiment.signal}`);
      
      return sentiment;
      
    } catch (error) {
      console.error('❌ Sentiment fetch error:', error.message);
      throw error;
    }
  }

  interpretSignal(sentiment) {
    const { signal, score, positive, negative } = sentiment;
    
    return {
      action: this.signalToAction(signal),
      confidence: this.calculateConfidence(positive, negative, sentiment.mentions),
      reasoning: this.generateReasoning(sentiment)
    };
  }

  signalToAction(signal) {
    const mapping = {
      'STRONG BUY': 'BUY',
      'BUY': 'BUY',
      'NEUTRAL': 'HOLD',
      'SELL': 'SELL',
      'STRONG SELL': 'SELL'
    };
    return mapping[signal] || 'HOLD';
  }

  calculateConfidence(positive, negative, mentions) {
    // Higher confidence with more mentions and clear sentiment
    const mentionScore = Math.min(mentions / 100, 1);
    const clarityScore = Math.abs(positive - negative) / 100;
    return ((mentionScore + clarityScore) / 2).toFixed(2);
  }

  generateReasoning(sentiment) {
    return `${sentiment.coin} shows ${sentiment.signal} signal with ${sentiment.mentions} mentions. ` +
           `Sentiment breakdown: ${sentiment.positive}% positive, ${sentiment.negative}% negative. ` +
           `Trend: ${sentiment.trend}.`;
  }
}

module.exports = X402SentimentService;
```

### 2. Use in Your Agent

```javascript
// agent.js
const X402SentimentService = require('./services/x402SentimentService');

class VirtualsAgent {
  constructor(config) {
    this.sentimentService = new X402SentimentService(config.privateKey);
    this.tradingThreshold = config.tradingThreshold || 0.6;
  }

  async analyzeCoin(coin) {
    try {
      // Get sentiment (automatically handles payment)
      const sentiment = await this.sentimentService.getSentiment(coin);
      
      // Interpret results
      const analysis = this.sentimentService.interpretSignal(sentiment);
      
      console.log(`\n🤖 Agent Analysis for ${coin}:`);
      console.log(`   Signal: ${sentiment.signal}`);
      console.log(`   Score: ${sentiment.score}`);
      console.log(`   Action: ${analysis.action}`);
      console.log(`   Confidence: ${analysis.confidence}`);
      console.log(`   Reasoning: ${analysis.reasoning}`);
      
      return {
        coin,
        sentiment,
        analysis,
        shouldTrade: this.shouldTrade(sentiment, analysis)
      };
      
    } catch (error) {
      console.error(`Failed to analyze ${coin}:`, error.message);
      return null;
    }
  }

  shouldTrade(sentiment, analysis) {
    // Only trade on strong signals with high confidence
    if (sentiment.signal === 'STRONG BUY' && analysis.confidence > 0.7) {
      return { trade: true, action: 'BUY', reason: 'Strong bullish sentiment' };
    }
    
    if (sentiment.signal === 'STRONG SELL' && analysis.confidence > 0.7) {
      return { trade: true, action: 'SELL', reason: 'Strong bearish sentiment' };
    }
    
    return { trade: false, action: 'HOLD', reason: 'Signal not strong enough' };
  }

  async monitorMultiple(coins) {
    console.log(`\n📊 Monitoring ${coins.length} coins...`);
    
    const results = [];
    
    for (const coin of coins) {
      const analysis = await this.analyzeCoin(coin);
      if (analysis) {
        results.push(analysis);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }

  async runContinuous(coins, intervalMinutes = 15) {
    console.log(`🤖 Agent started - monitoring ${coins.join(', ')}`);
    console.log(`⏰ Update interval: ${intervalMinutes} minutes\n`);
    
    while (true) {
      try {
        const results = await this.monitorMultiple(coins);
        
        // Find trading opportunities
        const opportunities = results.filter(r => r.shouldTrade.trade);
        
        if (opportunities.length > 0) {
          console.log(`\n🚨 TRADING OPPORTUNITIES:`);
          opportunities.forEach(opp => {
            console.log(`   ${opp.coin}: ${opp.shouldTrade.action} - ${opp.shouldTrade.reason}`);
          });
        } else {
          console.log(`\n✅ No trading opportunities at this time`);
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
        
      } catch (error) {
        console.error('Agent error:', error);
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min on error
      }
    }
  }
}

module.exports = VirtualsAgent;
```

### 3. Run Your Agent

```javascript
// main.js
require('dotenv').config();
const VirtualsAgent = require('./agent');

const agent = new VirtualsAgent({
  privateKey: process.env.AGENT_PRIVATE_KEY, // Agent's wallet private key
  tradingThreshold: 0.6
});

// Single coin analysis
async function testSingle() {
  const result = await agent.analyzeCoin('BTC');
  console.log('Result:', result);
}

// Monitor multiple coins
async function testMultiple() {
  const results = await agent.monitorMultiple(['BTC', 'ETH', 'SOL']);
  console.log('Results:', results);
}

// Run continuously
async function runAgent() {
  await agent.runContinuous(['BTC', 'ETH', 'SOL'], 15); // Check every 15 minutes
}

// Choose your mode
runAgent();
```

## Environment Setup

Create `.env` file:

```bash
# Your agent's wallet private key (needs USDC on Base)
AGENT_PRIVATE_KEY=0x...

# Optional: Custom Base RPC
BASE_RPC_URL=https://mainnet.base.org
```

## Cost Management

Each sentiment query costs $0.03 USDC + ~$0.001 gas:

```javascript
// Calculate daily cost
const coinsToMonitor = 3;
const checksPerDay = (24 * 60) / 15; // Every 15 minutes
const costPerQuery = 0.03;
const dailyCost = coinsToMonitor * checksPerDay * costPerQuery;

console.log(`Daily cost: $${dailyCost.toFixed(2)}`);
// For 3 coins every 15 mins: $8.64/day
```

## Best Practices

1. **Cache Results**: Don't query the same coin too frequently
2. **Batch Timing**: Analyze all coins in one cycle, not continuously
3. **Error Handling**: Handle payment failures gracefully
4. **Balance Monitoring**: Check USDC balance before trading
5. **Rate Limiting**: Respect the 100 req/min limit

## Error Handling

```javascript
async function getSentimentSafe(coin) {
  try {
    return await sentimentService.getSentiment(coin);
  } catch (error) {
    if (error.message.includes('Insufficient USDC')) {
      console.error('❌ Need to fund agent wallet with USDC');
      // Notify admin, pause trading, etc.
    } else if (error.message.includes('Payment already used')) {
      console.warn('⚠️ Payment reuse detected, retrying...');
      // Automatic retry with new payment
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
    return null;
  }
}
```

## Testing

```javascript
// test.js
const X402SentimentService = require('./services/x402SentimentService');

async function test() {
  const service = new X402SentimentService(process.env.AGENT_PRIVATE_KEY);
  
  console.log('Testing X402 Sentiment Service...\n');
  
  // Test single query
  const sentiment = await service.getSentiment('BTC');
  console.log('Sentiment:', sentiment);
  
  // Test interpretation
  const analysis = service.interpretSignal(sentiment);
  console.log('Analysis:', analysis);
}

test().catch(console.error);
```

## Wallet Funding

Your agent needs USDC on Base:

1. Bridge USDC to Base via [bridge.base.org](https://bridge.base.org)
2. Or buy USDC directly on Base via exchanges
3. Send to your agent's wallet address

Minimum recommended: $10 USDC for ~300 queries

## Production Considerations

- Use secure key management (not .env in production)
- Implement balance monitoring and auto-funding
- Add logging for all payments and decisions
- Set up alerts for low balance or errors
- Consider using multi-sig for large amounts

## Support

Need help? 
- GitHub Issues: [crypto-sentiment-api](https://github.com/lobsterbar2027-boop/crypto-sentiment-api/issues)
- Check the API is healthy: `curl https://crypto-sentiment-api-production.up.railway.app/health`

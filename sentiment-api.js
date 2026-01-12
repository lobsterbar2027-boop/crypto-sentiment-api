const express = require('express');
const cors = require('cors');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

// ✅ IMPORT OFFICIAL x402 SDK
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const { HTTPFacilitatorClient } = require('@x402/core/server');

const app = express();
const sentiment = new Sentiment();

app.use(cors());
app.use(express.json());

// ✅ KEEP YOUR PAYMENT TRACKING
const paymentsDB = [];

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down' }
});

// ============================================================================
// ✅ CONFIGURE x402 SDK - MAINNET WITH CDP AUTHENTICATION
// ============================================================================

const payTo = process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f';

// ✅ CDP Facilitator with Authentication
const facilitatorClient = new HTTPFacilitatorClient({
  url: 'https://api.cdp.coinbase.com/platform/v2/x402',
  // CDP Authentication
  apiKeyName: process.env.CDP_API_KEY_NAME,
  privateKey: process.env.CDP_API_KEY_PRIVATE_KEY
});

// ✅ MAINNET: Base
const server = new x402ResourceServer(facilitatorClient)
  .register('eip155:8453', new ExactEvmScheme());  // Base mainnet

const paymentConfig = {
  'GET /v1/sentiment/:coin': {
    accepts: [
      {
        scheme: 'exact',
        price: '$0.03',
        network: 'eip155:8453',  // Base mainnet
        payTo,
      },
    ],
    description: 'Real-time crypto sentiment analysis - Social media & Reddit sentiment for BTC, ETH, SOL and other cryptocurrencies',
    mimeType: 'application/json',
  },
};

// Custom middleware to track payments after x402 verification
const trackPayment = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    if (data.coin && data.signal && res.statusCode === 200) {
      const paymentRecord = {
        id: req.headers['x-payment'] ? 
          Buffer.from(req.headers['x-payment'], 'base64').toString().slice(0, 20) : 
          Date.now().toString(),
        timestamp: new Date().toISOString(),
        amount: '0.03',
        coin: data.coin,
        from: 'verified'
      };
      
      paymentsDB.push(paymentRecord);
      
      const logLine = `${paymentRecord.timestamp},${paymentRecord.amount},${paymentRecord.coin},${paymentRecord.from}\n`;
      try {
        fs.appendFileSync('payments.log', logLine);
      } catch (e) {
        console.error('Failed to write payment log:', e);
      }
      
      console.log('✅ PAYMENT TRACKED:', paymentRecord);
    }
    
    return originalJson(data);
  };
  
  next();
};

// ✅ APPLY x402 PAYMENT MIDDLEWARE + YOUR TRACKING
app.use(paymentMiddleware(paymentConfig, server));
app.use('/v1/sentiment/:coin', trackPayment);

// ============================================================================
// YOUR ORIGINAL SENTIMENT ANALYSIS FUNCTIONS - UNCHANGED
// ============================================================================

async function fetchRedditData(coin) {
  try {
    const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'CryptoMarkets'];
    const mentions = [];
    
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=100`;
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CryptoSentimentBot/1.0' }
      });
      
      if (!response.ok) {
        console.log(`Reddit fetch failed for r/${sub}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      const posts = data.data.children;
      
      posts.forEach(post => {
        const title = post.data.title.toUpperCase();
        const selftext = (post.data.selftext || '').toUpperCase();
        const combinedText = title + ' ' + selftext;
        
        if (combinedText.includes(coin.toUpperCase()) || 
            combinedText.includes(`$${coin.toUpperCase()}`)) {
          mentions.push({
            text: post.data.title + ' ' + (post.data.selftext || ''),
            score: post.data.score,
            subreddit: sub
          });
        }
      });
    }
    
    return mentions;
  } catch (error) {
    console.error('Reddit fetch error:', error);
    return [];
  }
}

function analyzeSentiments(texts) {
  if (texts.length === 0) {
    return {
      vaderAvg: 0,
      positive: 33,
      negative: 33,
      neutral: 34,
      totalMentions: 0
    };
  }
  
  let totalVader = 0;
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  texts.forEach(item => {
    const vaderScore = vader.SentimentIntensityAnalyzer.polarity_scores(item.text);
    totalVader += vaderScore.compound;
    
    if (vaderScore.compound > 0.05) positive++;
    else if (vaderScore.compound < -0.05) negative++;
    else neutral++;
  });
  
  const count = texts.length;
  
  return {
    vaderAvg: totalVader / count,
    positive: Math.round((positive / count) * 100),
    negative: Math.round((negative / count) * 100),
    neutral: Math.round((neutral / count) * 100),
    totalMentions: count
  };
}

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/', (req, res) => {
  return res.status(402).json({
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',  // Mainnet
      maxAmountRequired: '30000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // USDC on Base mainnet
      payTo: payTo,
      resource: 'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC',
      description: 'Real-time crypto sentiment analysis - Social media & Reddit sentiment for BTC, ETH, SOL and other cryptocurrencies',
      mimeType: 'application/json',
      maxTimeoutSeconds: 60,
      outputSchema: {
        input: {
          type: "http",
          method: "GET"
        },
        output: {
          coin: { type: "string" },
          signal: { type: "string", enum: ["STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL"] },
          score: { type: "number" },
          positive: { type: "number" },
          negative: { type: "number" },
          neutral: { type: "number" },
          mentions: { type: "number" },
          trend: { type: "string" },
          sources: { type: "array" },
          timestamp: { type: "string" },
          cost: { type: "string" }
        }
      },
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    }]
  });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '2.0.0-mainnet',
    status: 'Production - Accepting Real Payments',
    pricing: '$0.03 USDC per query via x402',
    environment: 'MAINNET',
    endpoints: {
      root: 'GET / - x402 payment requirements (returns 402)',
      sentiment: 'GET /v1/sentiment/:coin - Real-time crypto sentiment analysis (requires payment)',
      info: 'GET /info - API documentation (this page)',
      health: 'GET /health - API health status',
      admin: 'GET /admin/payments - Payment history (requires X-Admin-Key)'
    },
    x402: {
      sdk: 'official',
      facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
      network: 'eip155:8453',
      networkName: 'Base Mainnet',
      currency: 'USDC',
      amount: '0.03',
      recipient: payTo,
      usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    },
    features: [
      'x402 protocol v2 compliant',
      'Official x402 SDK integration',
      'CDP facilitator with authentication',
      'x402scan compatible',
      'Real USDC payments on Base mainnet',
      'Rate limiting (100 req/min)',
      'Payment tracking and logging'
    ],
    supportedCoins: ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'MATIC', 'LINK', 'UNI'],
    documentation: 'https://docs.cdp.coinbase.com/x402'
  });
});

app.get('/v1/sentiment/:coin', limiter, async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    console.log(`🔍 Analyzing sentiment for ${coin}...`);
    console.log('✅ Payment verified by x402 SDK (MAINNET)');
    
    const redditData = await fetchRedditData(coin);
    const analysis = analyzeSentiments(redditData);
    const compositeScore = analysis.vaderAvg;
    
    let signal = 'NEUTRAL';
    if (compositeScore > 0.15) signal = 'STRONG BUY';
    else if (compositeScore > 0.05) signal = 'BUY';
    else if (compositeScore < -0.15) signal = 'STRONG SELL';
    else if (compositeScore < -0.05) signal = 'SELL';
    
    const trend = compositeScore > 0 ? 'up' : 'down';
    
    const response = {
      coin,
      signal,
      score: parseFloat(compositeScore.toFixed(3)),
      positive: analysis.positive,
      negative: analysis.negative,
      neutral: analysis.neutral,
      mentions: analysis.totalMentions,
      trend,
      sources: ['reddit'],
      timestamp: new Date().toISOString(),
      cost: '0.03 USDC',
      network: 'Base Mainnet'
    };
    
    console.log(`✅ Sentiment analysis complete for ${coin}: ${signal}`);
    res.json(response);
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

app.get('/admin/payments', (req, res) => {
  const apiKey = req.headers['x-admin-key'];
  
  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const totalRevenue = paymentsDB.length * 0.03;
  
  res.json({
    totalPayments: paymentsDB.length,
    totalRevenue: `$${totalRevenue.toFixed(2)} USDC`,
    recentPayments: paymentsDB.slice(-50),
    status: 'operational',
    environment: 'mainnet'
  });
});

app.get('/health', (req, res) => {
  const cdpConfigured = !!(process.env.CDP_API_KEY_NAME && process.env.CDP_API_KEY_PRIVATE_KEY);
  
  res.json({ 
    status: 'healthy', 
    service: 'crypto-sentiment-api',
    version: '2.0.0-mainnet',
    environment: 'MAINNET',
    uptime: Math.floor(process.uptime()),
    totalPayments: paymentsDB.length,
    x402: {
      enabled: true,
      compliant: true,
      sdk: 'official',
      version: 2,
      facilitator: 'https://api.cdp.coinbase.com/platform/v2/x402',
      network: 'eip155:8453',
      networkName: 'Base Mainnet',
      cdpAuthenticated: cdpConfigured
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const cdpConfigured = !!(process.env.CDP_API_KEY_NAME && process.env.CDP_API_KEY_PRIVATE_KEY);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 CryptoSentiment API - MAINNET PRODUCTION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🌐 Environment: MAINNET (Base)`);
  console.log(`💰 x402 SDK: Official v2.0 with CDP`);
  console.log(`🔗 Facilitator: https://api.cdp.coinbase.com/platform/v2/x402`);
  console.log(`💵 Accepting REAL USDC payments!`);
  console.log(`📊 Payments: ${paymentsDB.length} processed`);
  console.log(`\n⚙️  Configuration:`);
  console.log(`   Network: eip155:8453 (Base Mainnet)`);
  console.log(`   Wallet: ${payTo}`);
  console.log(`   Price: $0.03 USDC per query`);
  console.log(`   CDP Authenticated: ${cdpConfigured ? '✅ YES' : '❌ NO'}`);
  
  if (!cdpConfigured) {
    console.log(`\n⚠️  WARNING: CDP credentials not configured!`);
    console.log(`   Set CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY`);
  } else {
    console.log(`\n✅ READY FOR MAINNET PAYMENTS!`);
    console.log(`   CDP authentication configured`);
    console.log(`   Real USDC payments enabled`);
  }
  
  console.log(`${'='.repeat(70)}\n`);
});

module.exports = app;

// CRITICAL: Polyfill for Node.js 18 - must be at the very top
import { webcrypto } from 'crypto';
globalThis.crypto = webcrypto;

import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 v2 imports - Using Carson's exact pattern for CDP facilitator
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { createFacilitatorConfig } from '@coinbase/x402';

const app = express();
const sentiment = new Sentiment();
const PORT = process.env.PORT || 3000;

// Trust proxy (required for Railway)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Configuration - MAINNET ONLY
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const NETWORK = 'eip155:8453'; // Base Mainnet
const NETWORK_NAME = 'Base Mainnet';

console.log('🔄 Initializing x402 v2 (MAINNET)...');
console.log('   Wallet:', WALLET_ADDRESS);
console.log('   Network:', NETWORK, `(${NETWORK_NAME})`);

// Validate environment variables
if (!WALLET_ADDRESS) {
  throw new Error('❌ WALLET_ADDRESS environment variable is required');
}

if (!process.env.CDP_API_KEY_ID) {
  throw new Error('❌ CDP_API_KEY_ID environment variable is required. Get it from https://portal.cdp.coinbase.com');
}

if (!process.env.CDP_API_KEY_SECRET) {
  throw new Error('❌ CDP_API_KEY_SECRET environment variable is required. Get it from https://portal.cdp.coinbase.com');
}

console.log('   CDP Key ID:', process.env.CDP_API_KEY_ID.substring(0, 20) + '...');
console.log('   Facilitator: Coinbase CDP');

// Create facilitator client using Carson's exact pattern
const facilitatorClient = new HTTPFacilitatorClient(createFacilitatorConfig());

// Create resource server and register the EVM scheme
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

console.log('✅ x402 v2 configured for MAINNET');

// Payment tracking
const paymentLog = [];

// Crypto subreddit mapping
const CRYPTO_SUBREDDITS = {
  BTC: ['bitcoin', 'Bitcoin'],
  ETH: ['ethereum', 'ethtrader'],
  SOL: ['solana'],
  DOGE: ['dogecoin'],
  XRP: ['XRP', 'Ripple'],
  ADA: ['cardano'],
  MATIC: ['maticnetwork', 'polygonnetwork'],
  DOT: ['polkadot'],
  LINK: ['Chainlink'],
  AVAX: ['Avax'],
  DEFAULT: ['CryptoCurrency', 'CryptoMarkets']
};

// Helper: Analyze sentiment
function analyzeSentiment(text) {
  const sentimentResult = sentiment.analyze(text);
  const vaderResult = vaderSentiment.SentimentIntensityAnalyzer.polarity_scores(text);

  const score = (sentimentResult.comparative + vaderResult.compound) / 2;
  let label;
  if (score > 0.2) label = 'bullish';
  else if (score < -0.2) label = 'bearish';
  else label = 'neutral';

  return {
    score: parseFloat(score.toFixed(4)),
    label,
    confidence: Math.abs(score)
  };
}

// Helper: Fetch Reddit posts with better error handling
async function fetchRedditPosts(coin) {
  const subreddits = CRYPTO_SUBREDDITS[coin.toUpperCase()] || CRYPTO_SUBREDDITS.DEFAULT;
  const allPosts = [];
  
  console.log(`🔍 Fetching Reddit posts for ${coin} from subreddits:`, subreddits);

  for (const subreddit of subreddits) {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;
    console.log(`   Fetching: ${url}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      console.log(`   Response status for r/${subreddit}: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ❌ Error response: ${errorText.substring(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const posts = data.data?.children || [];
      console.log(`   ✅ Got ${posts.length} posts from r/${subreddit}`);

      for (const post of posts) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        
        allPosts.push({
          title: p.title,
          selftext: p.selftext?.substring(0, 500) || '',
          score: p.score,
          subreddit: subreddit
        });
      }
    } catch (error) {
      console.log(`   ❌ Fetch error for r/${subreddit}:`, error.message);
    }
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Also search for the coin
  const searchUrl = `https://www.reddit.com/search.json?q=${coin}+cryptocurrency&sort=hot&limit=25&t=week`;
  console.log(`   Searching: ${searchUrl}`);
  
  try {
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    console.log(`   Search response status: ${searchResponse.status}`);

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const searchPosts = searchData.data?.children || [];
      console.log(`   ✅ Got ${searchPosts.length} posts from search`);

      for (const post of searchPosts) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        
        const isDuplicate = allPosts.some(existing => 
          existing.title === p.title && existing.score === p.score
        );
        
        if (!isDuplicate) {
          allPosts.push({
            title: p.title,
            selftext: p.selftext?.substring(0, 500) || '',
            score: p.score,
            subreddit: p.subreddit
          });
        }
      }
    } else {
      const errorText = await searchResponse.text();
      console.log(`   ❌ Search error: ${errorText.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Search fetch error:`, error.message);
  }

  console.log(`📊 Total posts collected: ${allPosts.length}`);
  return allPosts;
}

// FREE ROUTES - Before payment middleware
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.1.0',
    environment: 'MAINNET',
    network: `${NETWORK_NAME} (${NETWORK})`,
    facilitator: 'Coinbase CDP',
    wallet: WALLET_ADDRESS,
    price: '0.03 USDC per query',
    source: 'Reddit',
    paymentsReceived: paymentLog.length,
    totalRevenue: `$${(paymentLog.length * 0.03).toFixed(2)}`
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '2.1.0',
    description: 'AI-powered Reddit sentiment analysis for cryptocurrencies',
    environment: 'MAINNET',
    network: `${NETWORK_NAME} (${NETWORK})`,
    dataSource: 'Reddit (r/bitcoin, r/ethereum, r/CryptoCurrency, etc.)',
    x402: {
      version: 'v2',
      enabled: true,
      price: '$0.03 USDC per query',
      network: NETWORK_NAME,
      facilitator: 'Coinbase CDP'
    },
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
    endpoints: {
      'GET /v1/sentiment/:coin': {
        description: 'Get Reddit sentiment analysis for a cryptocurrency',
        price: '$0.03 USDC',
        example: '/v1/sentiment/BTC',
        protected: true,
        paymentRequired: '⚠️ REAL USDC (Base Mainnet)'
      },
      'GET /health': {
        description: 'Health check',
        protected: false
      }
    }
  });
});

// x402 Payment Middleware - MAINNET with CDP facilitator
// Using wildcard pattern instead of :coin parameter
console.log('🔧 Applying payment middleware for route: GET /v1/sentiment/*');

app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/*': {
        accepts: {
          scheme: 'exact',
          price: '$0.03',
          network: NETWORK,
          payTo: WALLET_ADDRESS,
        },
        description: 'Get AI-powered Reddit sentiment analysis for any cryptocurrency',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

console.log('✅ Payment middleware applied');

// PROTECTED ROUTE - Only executes after payment is verified
app.get('/v1/sentiment/:coin', async (req, res) => {
  console.log(`\n📊 Processing request for ${req.params.coin}`);
  console.log(`   Payment header present: ${!!req.headers['x-payment'] || !!req.headers['payment']}`);

  try {
    const coin = req.params.coin.toUpperCase();
    const posts = await fetchRedditPosts(coin);
    
    console.log(`   Analyzing ${posts.length} posts...`);

    let overallSentiment = { score: 0, count: 0 };
    const analyzedPosts = [];
    
    posts.slice(0, 20).forEach(post => {
      const text = `${post.title} ${post.selftext}`;
      const result = analyzeSentiment(text);
      overallSentiment.score += result.score;
      overallSentiment.count++;
      
      analyzedPosts.push({
        title: post.title.substring(0, 100),
        subreddit: post.subreddit,
        sentiment: result.label,
        score: result.score
      });
    });

    const avgScore = overallSentiment.count > 0
      ? overallSentiment.score / overallSentiment.count
      : 0;

    let overallLabel;
    if (avgScore > 0.2) overallLabel = 'bullish';
    else if (avgScore < -0.2) overallLabel = 'bearish';
    else overallLabel = 'neutral';

    // Log payment
    const paymentRecord = {
      timestamp: new Date().toISOString(),
      amount: '0.03',
      coin,
      network: NETWORK_NAME
    };
    paymentLog.push(paymentRecord);
    console.log('💰 Request processed:', paymentRecord);

    res.json({
      coin,
      timestamp: new Date().toISOString(),
      source: 'Reddit',
      overall: {
        sentiment: overallLabel,
        score: parseFloat(avgScore.toFixed(4)),
        confidence: Math.min(Math.abs(avgScore) * 2, 1),
        postsAnalyzed: overallSentiment.count
      },
      samplePosts: analyzedPosts.slice(0, 5),
      payment: {
        network: NETWORK_NAME,
        amount: '0.03 USDC',
        status: 'confirmed'
      }
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment', details: error.message });
  }
});

// Admin endpoint
app.get('/admin/payments', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    totalPayments: paymentLog.length,
    totalRevenue: `$${(paymentLog.length * 0.03).toFixed(2)} USDC`,
    network: NETWORK_NAME,
    payments: paymentLog
  });
});

// Start server
console.log('\n======================================================================');
console.log('🚀 CryptoSentiment API - x402 v2 MAINNET');
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🌐 Network: ${NETWORK} (${NETWORK_NAME})`);
console.log(`🔗 Facilitator: Coinbase CDP`);
console.log(`📊 Data Source: Reddit`);
console.log(`💵 Price: $0.03 USDC (REAL MONEY)`);
console.log('======================================================================');
console.log('⚠️  WARNING: This server charges REAL USDC on Base Mainnet');
console.log('======================================================================\n');

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
});

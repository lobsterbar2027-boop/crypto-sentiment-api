// Node 18 crypto polyfill - MUST be at the top
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Crypto Sentiment API with x402 Payment Protocol v2
// Actually scrapes Reddit for sentiment analysis
import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { createFacilitatorConfig } from '@coinbase/x402';

config();

const app = express();
const sentiment = new Sentiment();
const PORT = process.env.PORT || 4021;

// Your wallet address to receive payments
const payTo = process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f';

// Validate CDP credentials
if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  console.error('❌ CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables are required');
  console.error('   Get them from: https://portal.cdp.coinbase.com/projects');
  process.exit(1);
}

// Base Mainnet (CAIP-2 format)
const NETWORK = 'eip155:8453';

// Crypto-specific subreddits for better sentiment
const CRYPTO_SUBREDDITS = {
  BTC: ['bitcoin', 'BitcoinMarkets'],
  ETH: ['ethereum', 'ethtrader', 'ethfinance'],
  SOL: ['solana'],
  DOGE: ['dogecoin'],
  XRP: ['Ripple', 'XRP'],
  ADA: ['cardano'],
  AVAX: ['Avax'],
  MATIC: ['maticnetwork', '0xPolygon'],
  LINK: ['Chainlink'],
  DOT: ['dot', 'Polkadot'],
  SHIB: ['SHIBArmy'],
  LTC: ['litecoin'],
};

// Create facilitator client using CDP config
const facilitatorClient = new HTTPFacilitatorClient(createFacilitatorConfig());

// Create resource server and register EVM scheme for Base Mainnet
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Trust proxy for Railway deployments
app.set('trust proxy', 1);

console.log('============================================');
console.log('🚀 Crypto Sentiment API with x402 v2 Paywall');
console.log('============================================');
console.log('💰 Receiving wallet:', payTo);
console.log('🌐 Network: Base Mainnet (eip155:8453)');
console.log('🔗 Facilitator: CDP (Coinbase)');
console.log('💵 Price: $0.03 USDC per request');
console.log('📊 Data Source: Reddit');
console.log('============================================');

// ============================================
// REDDIT SCRAPING FUNCTIONS
// ============================================
async function fetchRedditPosts(subreddit, limit = 25) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CryptoSentimentAPI/2.1.0',
      },
    });

    if (!response.ok) {
      console.log(`   Reddit returned ${response.status} for r/${subreddit}`);
      return [];
    }

    const data = await response.json();
    return data.data.children.map((child) => ({
      title: child.data.title,
      selftext: child.data.selftext || '',
      score: child.data.score,
      numComments: child.data.num_comments,
      created: child.data.created_utc,
      subreddit: child.data.subreddit,
    }));
  } catch (error) {
    console.log(`   Error fetching r/${subreddit}:`, error.message);
    return [];
  }
}

async function searchReddit(query, limit = 25) {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CryptoSentimentAPI/2.1.0',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data.children.map((child) => ({
      title: child.data.title,
      selftext: child.data.selftext || '',
      score: child.data.score,
      numComments: child.data.num_comments,
      created: child.data.created_utc,
      subreddit: child.data.subreddit,
    }));
  } catch (error) {
    console.log(`   Error searching Reddit:`, error.message);
    return [];
  }
}

function analyzeSentiment(posts) {
  if (posts.length === 0) {
    return {
      sentiment: 'neutral',
      score: 0,
      confidence: 0,
      postsAnalyzed: 0,
      breakdown: { positive: 0, negative: 0, neutral: 0 },
    };
  }

  let totalScore = 0;
  let breakdown = { positive: 0, negative: 0, neutral: 0 };
  const analyzedPosts = [];

  for (const post of posts) {
    const text = `${post.title} ${post.selftext}`;
    const result = sentiment.analyze(text);

    // Weight by engagement (upvotes + comments)
    const engagement = Math.log(post.score + post.numComments + 1);
    const weightedScore = result.comparative * engagement;

    totalScore += weightedScore;

    if (result.comparative > 0.05) {
      breakdown.positive++;
    } else if (result.comparative < -0.05) {
      breakdown.negative++;
    } else {
      breakdown.neutral++;
    }

    analyzedPosts.push({
      title: post.title.substring(0, 100),
      subreddit: post.subreddit,
      sentimentScore: result.comparative.toFixed(3),
      engagement: post.score,
    });
  }

  const avgScore = totalScore / posts.length;
  const normalizedScore = Math.max(-1, Math.min(1, avgScore));

  // Determine sentiment label
  let sentimentLabel;
  if (normalizedScore > 0.3) sentimentLabel = 'very bullish';
  else if (normalizedScore > 0.1) sentimentLabel = 'bullish';
  else if (normalizedScore < -0.3) sentimentLabel = 'very bearish';
  else if (normalizedScore < -0.1) sentimentLabel = 'bearish';
  else sentimentLabel = 'neutral';

  // Calculate confidence based on sample size and agreement
  const maxCategory = Math.max(breakdown.positive, breakdown.negative, breakdown.neutral);
  const agreement = maxCategory / posts.length;
  const sampleSizeBonus = Math.min(posts.length / 50, 1) * 0.3;
  const confidence = Math.min((agreement * 0.7 + sampleSizeBonus), 0.95);

  return {
    sentiment: sentimentLabel,
    score: parseFloat(normalizedScore.toFixed(3)),
    confidence: parseFloat(confidence.toFixed(2)),
    postsAnalyzed: posts.length,
    breakdown,
    topPosts: analyzedPosts.slice(0, 5),
  };
}

// ============================================
// x402 v2 PAYMENT MIDDLEWARE
// ============================================
app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/:coin': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
            payTo,
          },
        ],
        description: 'Get AI-powered Reddit sentiment analysis for any cryptocurrency',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

// ============================================
// HOMEPAGE
// ============================================
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crypto Sentiment API - x402 Powered</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #e0e0e0; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2.5rem; margin-bottom: 10px; background: linear-gradient(90deg, #00d4ff, #0099ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 25px; margin-bottom: 20px; }
    .badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; margin-bottom: 15px; }
    .price { font-size: 1.5rem; color: #00d4ff; font-weight: bold; }
    .endpoint { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin: 15px 0; font-family: monospace; }
    .method { color: #4ade80; font-weight: bold; }
    .path { color: #fbbf24; }
    .coins { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
    .coin { background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; font-size: 0.9rem; }
    .try-btn { display: inline-block; background: linear-gradient(90deg, #0066ff, #00d4ff); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; }
    .try-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,102,255,0.4); }
    a { color: #00d4ff; }
    footer { text-align: center; margin-top: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔮 Crypto Sentiment API</h1>
    <p class="subtitle">Real-time Reddit sentiment analysis • x402 Protocol v2</p>
    
    <div class="card">
      <span class="badge">Base Mainnet • USDC</span>
      <p class="price">$0.03 per request</p>
      <p style="margin-top: 10px; color: #aaa;">Pay-per-use with your crypto wallet. No accounts, no subscriptions.</p>
      
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/v1/sentiment/:coin</span>
      </div>
      
      <p>Supported cryptocurrencies:</p>
      <div class="coins">
        ${Object.keys(CRYPTO_SUBREDDITS).map(coin => `<span class="coin">${coin}</span>`).join('\n        ')}
      </div>
      
      <a href="/v1/sentiment/BTC" class="try-btn">Try it → Pay $0.03</a>
    </div>
    
    <div class="card">
      <h3>How it works</h3>
      <ol style="margin-top: 15px; padding-left: 20px; line-height: 1.8;">
        <li>Click an endpoint or make an API request</li>
        <li>Connect your wallet (MetaMask, Coinbase, etc.)</li>
        <li>Sign the payment authorization</li>
        <li>Get real-time Reddit sentiment analysis!</li>
      </ol>
    </div>
    
    <div class="card">
      <h3>What you get</h3>
      <ul style="margin-top: 15px; padding-left: 20px; line-height: 1.8;">
        <li>Sentiment from coin-specific subreddits (r/bitcoin, r/ethereum, etc.)</li>
        <li>Engagement-weighted sentiment scoring</li>
        <li>Confidence levels based on sample size</li>
        <li>Top posts driving the sentiment</li>
      </ul>
    </div>
    
    <div class="card">
      <h3>Free Endpoints</h3>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/health</span> - Health check
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/api</span> - API info (JSON)
      </div>
    </div>
    
    <footer>
      Powered by <a href="https://x402.org" target="_blank">x402 Protocol</a> • 
      Built on <a href="https://base.org" target="_blank">Base</a>
    </footer>
  </div>
</body>
</html>
  `);
});

// ============================================
// PROTECTED ENDPOINT - Requires x402 Payment
// Actually scrapes Reddit!
// ============================================
app.get('/v1/sentiment/:coin', async (req, res) => {
  const coin = req.params.coin.toUpperCase();
  console.log(`💰 Paid request received for ${coin} sentiment`);

  // Fetch from coin-specific subreddits
  const subreddits = CRYPTO_SUBREDDITS[coin] || [];
  const subredditsScanned = [];
  let allPosts = [];

  // Fetch from dedicated subreddits
  for (const sub of subreddits) {
    console.log(`   Fetching r/${sub}...`);
    const posts = await fetchRedditPosts(sub, 25);
    allPosts = allPosts.concat(posts);
    if (posts.length > 0) {
      subredditsScanned.push(`r/${sub}`);
    }
  }

  // Also search Reddit for the coin name
  console.log(`   Searching Reddit for "${coin}"...`);
  const searchPosts = await searchReddit(`${coin} crypto`, 25);
  allPosts = allPosts.concat(searchPosts);

  // Also check r/cryptocurrency
  console.log(`   Fetching r/cryptocurrency...`);
  const cryptoPosts = await fetchRedditPosts('cryptocurrency', 50);
  const relevantPosts = cryptoPosts.filter(
    (p) =>
      p.title.toUpperCase().includes(coin) ||
      p.selftext.toUpperCase().includes(coin)
  );
  allPosts = allPosts.concat(relevantPosts);
  if (relevantPosts.length > 0) {
    subredditsScanned.push('r/cryptocurrency');
  }

  console.log(`   Total posts collected: ${allPosts.length}`);

  // Analyze sentiment
  const analysis = analyzeSentiment(allPosts);

  const response = {
    coin,
    timestamp: new Date().toISOString(),
    source: 'Reddit',
    overall: {
      sentiment: analysis.sentiment,
      score: analysis.score,
      confidence: analysis.confidence,
      postsAnalyzed: analysis.postsAnalyzed,
    },
    breakdown: analysis.breakdown,
    topPosts: analysis.topPosts,
    subredditsScanned,
    payment: {
      network: 'Base Mainnet',
      amount: '$0.03 USDC',
      status: 'confirmed',
    },
  };

  console.log(`   Sentiment: ${analysis.sentiment} (score: ${analysis.score})`);
  res.json(response);
});

// ============================================
// FREE ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    dataSource: 'Reddit',
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Crypto Sentiment API',
    version: '2.1.0',
    dataSource: 'Reddit (real-time scraping)',
    payment: {
      protocol: 'x402',
      network: 'Base Mainnet',
      price: '$0.03 USDC',
    },
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
    endpoints: {
      '/v1/sentiment/:coin': {
        method: 'GET',
        description: 'Get real-time Reddit sentiment analysis',
        price: '$0.03 USDC',
        example: '/v1/sentiment/BTC',
        protected: true,
      },
      '/health': {
        method: 'GET',
        description: 'Health check',
        protected: false,
      },
      '/api': {
        method: 'GET',
        description: 'API information',
        protected: false,
      },
    },
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`\n🌐 Server running on port ${PORT}`);
  console.log(`📍 Homepage: http://localhost:${PORT}`);
  console.log(`💳 Paid endpoint: http://localhost:${PORT}/v1/sentiment/BTC`);
});

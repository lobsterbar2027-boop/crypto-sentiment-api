// Crypto Sentiment API with x402 Payment Protocol v2
// Note: This file is loaded by bootstrap.js which applies the crypto polyfill first

import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import vaderSentiment from 'vader-sentiment';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { createFacilitatorConfig } from '@coinbase/x402';

config();

const app = express();
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

// Crypto-specific subreddits
const CRYPTO_SUBREDDITS = {
  BTC: ['bitcoin', 'BitcoinMarkets', 'CryptoCurrency'],
  ETH: ['ethereum', 'ethtrader', 'ethfinance', 'CryptoCurrency'],
  SOL: ['solana', 'CryptoCurrency'],
  DOGE: ['dogecoin', 'CryptoCurrency'],
  XRP: ['Ripple', 'XRP', 'CryptoCurrency'],
  ADA: ['cardano', 'CryptoCurrency'],
  AVAX: ['Avax', 'CryptoCurrency'],
  MATIC: ['maticnetwork', '0xPolygon', 'CryptoCurrency'],
  LINK: ['Chainlink', 'CryptoCurrency'],
  DOT: ['dot', 'Polkadot', 'CryptoCurrency'],
  SHIB: ['SHIBArmy', 'CryptoCurrency'],
  LTC: ['litecoin', 'CryptoCurrency'],
};

// Full coin names for better search
const COIN_NAMES = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  DOGE: 'Dogecoin',
  XRP: 'Ripple',
  ADA: 'Cardano',
  AVAX: 'Avalanche',
  MATIC: 'Polygon',
  LINK: 'Chainlink',
  DOT: 'Polkadot',
  SHIB: 'Shiba',
  LTC: 'Litecoin',
};

// Create facilitator client using CDP config
const facilitatorClient = new HTTPFacilitatorClient(createFacilitatorConfig());

// Create resource server and register EVM scheme for Base Mainnet
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

// Paywall UI configuration (shows wallet connect modal for MetaMask, Coinbase, Phantom, etc.)
const paywallConfig = {
  appName: 'Crypto Sentiment API',
};

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
console.log('🧠 Sentiment: VADER');
console.log('============================================');

// ============================================
// IMPROVED REDDIT SCRAPING
// ============================================

// Better headers to avoid Reddit blocking
function getRedditHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

// Fetch from subreddit with retries
async function fetchSubreddit(subreddit, limit = 50) {
  const urls = [
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
    `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}&raw_json=1`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: getRedditHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        console.log(`   Rate limited on r/${subreddit}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (!response.ok) {
        console.log(`   r/${subreddit} returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (!data?.data?.children) {
        continue;
      }

      const posts = data.data.children
        .filter(child => child.kind === 't3')
        .map(child => ({
          title: child.data.title || '',
          selftext: child.data.selftext || '',
          score: child.data.score || 0,
          numComments: child.data.num_comments || 0,
          created: child.data.created_utc,
          subreddit: child.data.subreddit,
          url: child.data.url,
        }));

      if (posts.length > 0) {
        console.log(`   ✓ r/${subreddit}: ${posts.length} posts`);
        return posts;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`   r/${subreddit} timed out`);
      } else {
        console.log(`   r/${subreddit} error: ${error.message}`);
      }
    }
  }

  return [];
}

// Search Reddit
async function searchReddit(query, limit = 50) {
  const urls = [
    `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&limit=${limit}&raw_json=1`,
    `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}&raw_json=1`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: getRedditHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      
      if (!data?.data?.children) continue;

      const posts = data.data.children
        .filter(child => child.kind === 't3')
        .map(child => ({
          title: child.data.title || '',
          selftext: child.data.selftext || '',
          score: child.data.score || 0,
          numComments: child.data.num_comments || 0,
          created: child.data.created_utc,
          subreddit: child.data.subreddit,
        }));

      if (posts.length > 0) {
        console.log(`   ✓ Search "${query}": ${posts.length} posts`);
        return posts;
      }
    } catch (error) {
      console.log(`   Search error: ${error.message}`);
    }
  }

  return [];
}

// VADER sentiment analysis (better for social media)
function analyzeWithVader(posts, coin) {
  if (posts.length === 0) {
    return {
      sentiment: 'neutral',
      score: 0,
      confidence: 0,
      postsAnalyzed: 0,
      breakdown: { positive: 0, negative: 0, neutral: 0 },
      topPosts: [],
    };
  }

  // Filter posts that mention the coin
  const coinName = COIN_NAMES[coin] || coin;
  const relevantPosts = posts.filter(post => {
    const text = `${post.title} ${post.selftext}`.toUpperCase();
    return text.includes(coin) || text.includes(coinName.toUpperCase());
  });

  // If no relevant posts, use all posts from coin-specific subreddits
  const postsToAnalyze = relevantPosts.length > 0 ? relevantPosts : posts;

  let totalScore = 0;
  let totalWeight = 0;
  const breakdown = { positive: 0, negative: 0, neutral: 0 };
  const analyzedPosts = [];

  for (const post of postsToAnalyze) {
    const text = `${post.title} ${post.selftext}`.substring(0, 1000);
    const intensity = vaderSentiment.SentimentIntensityAnalyzer.polarity_scores(text);

    // Weight by engagement
    const engagement = Math.log10(Math.max(post.score, 1) + Math.max(post.numComments, 1) + 1);
    const weight = engagement;

    totalScore += intensity.compound * weight;
    totalWeight += weight;

    // Categorize
    if (intensity.compound >= 0.05) {
      breakdown.positive++;
    } else if (intensity.compound <= -0.05) {
      breakdown.negative++;
    } else {
      breakdown.neutral++;
    }

    analyzedPosts.push({
      title: post.title.substring(0, 120),
      subreddit: post.subreddit,
      score: intensity.compound.toFixed(3),
      engagement: post.score,
    });
  }

  // Calculate weighted average
  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const normalizedScore = Math.max(-1, Math.min(1, avgScore));

  // Determine sentiment label
  let sentimentLabel;
  if (normalizedScore >= 0.5) sentimentLabel = 'very bullish';
  else if (normalizedScore >= 0.15) sentimentLabel = 'bullish';
  else if (normalizedScore <= -0.5) sentimentLabel = 'very bearish';
  else if (normalizedScore <= -0.15) sentimentLabel = 'bearish';
  else sentimentLabel = 'neutral';

  // Confidence based on sample size and agreement
  const total = breakdown.positive + breakdown.negative + breakdown.neutral;
  const maxCategory = Math.max(breakdown.positive, breakdown.negative, breakdown.neutral);
  const agreement = total > 0 ? maxCategory / total : 0;
  const sampleBonus = Math.min(total / 30, 1) * 0.25;
  const confidence = Math.min(agreement * 0.75 + sampleBonus, 0.95);

  // Sort by engagement for top posts
  analyzedPosts.sort((a, b) => b.engagement - a.engagement);

  return {
    sentiment: sentimentLabel,
    score: parseFloat(normalizedScore.toFixed(3)),
    confidence: parseFloat(confidence.toFixed(2)),
    postsAnalyzed: postsToAnalyze.length,
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
        description: 'Get real-time Reddit sentiment analysis for any cryptocurrency',
        mimeType: 'application/json',
      },
    },
    resourceServer,
    paywallConfig,
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
        <li>VADER sentiment analysis (optimized for social media)</li>
        <li>Engagement-weighted scoring</li>
        <li>Multiple subreddits per coin</li>
        <li>Top posts driving sentiment</li>
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
// ============================================
app.get('/v1/sentiment/:coin', async (req, res) => {
  const coin = req.params.coin.toUpperCase();
  const coinName = COIN_NAMES[coin] || coin;
  
  console.log(`\n💰 Processing request for ${coin} (${coinName}) sentiment`);

  const subreddits = CRYPTO_SUBREDDITS[coin] || ['CryptoCurrency'];
  const subredditsScanned = [];
  let allPosts = [];

  // Fetch from each subreddit
  for (const sub of subreddits) {
    // Add small delay between requests to avoid rate limiting
    if (allPosts.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const posts = await fetchSubreddit(sub, 50);
    if (posts.length > 0) {
      allPosts = allPosts.concat(posts);
      subredditsScanned.push(`r/${sub}`);
    }
  }

  // Also search for the coin
  await new Promise(resolve => setTimeout(resolve, 500));
  const searchPosts = await searchReddit(`${coinName} crypto cryptocurrency`, 50);
  allPosts = allPosts.concat(searchPosts);

  // Search by ticker too
  await new Promise(resolve => setTimeout(resolve, 500));
  const tickerPosts = await searchReddit(`$${coin} crypto`, 30);
  allPosts = allPosts.concat(tickerPosts);

  // Deduplicate by title
  const seen = new Set();
  allPosts = allPosts.filter(post => {
    const key = post.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`   Total unique posts: ${allPosts.length}`);

  // Analyze sentiment with VADER
  const analysis = analyzeWithVader(allPosts, coin);

  const response = {
    coin,
    name: coinName,
    timestamp: new Date().toISOString(),
    source: 'Reddit',
    analyzer: 'VADER',
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

  console.log(`   Result: ${analysis.sentiment} (score: ${analysis.score}, confidence: ${analysis.confidence})`);
  res.json(response);
});

// ============================================
// FREE ENDPOINTS
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.2.0',
    dataSource: 'Reddit',
    analyzer: 'VADER',
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Crypto Sentiment API',
    version: '2.2.0',
    dataSource: 'Reddit (real-time)',
    analyzer: 'VADER (optimized for social media)',
    payment: {
      protocol: 'x402 v2',
      network: 'Base Mainnet (eip155:8453)',
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

export default app;

// Crypto Sentiment API with x402 Payment Protocol v2
// Note: This file is loaded by bootstrap.js which applies the crypto polyfill first

import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import vaderSentiment from 'vader-sentiment';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { facilitator } from '@coinbase/x402';
import { createPaywall } from '@x402/paywall';
import { evmPaywall } from '@x402/paywall/evm';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';

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

// Create facilitator client using CDP facilitator
const facilitatorClient = new HTTPFacilitatorClient(facilitator);

// Create resource server and register EVM scheme for Base Mainnet
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

// Build paywall UI for wallet connection with GenVox branding
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: 'GenVox Crypto Sentiment',
    appLogo: 'https://genvox.io/logo.png',
    testnet: false, // Base Mainnet
  })
  .build();

// Enable CORS with exposed headers for x402
app.use(cors({
  origin: '*',
  exposedHeaders: ['X-Payment', 'x-payment', 'Payment-Required', 'payment-required'],
}));
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
  // Rotate user agents to reduce blocking
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  
  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
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

// Base URL for discovery (custom domain)
const BASE_URL = process.env.BASE_URL || 'https://api.genvox.io';

// List of all supported coins for discovery
const SUPPORTED_COINS = Object.keys(CRYPTO_SUBREDDITS);

// USDC contract on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Bazaar schema for x402scan dropdown
const bazaarSchema = {
  input: { coin: 'BTC' },
  output: {
    coin: 'BTC',
    name: 'Bitcoin',
    summary: '📈 Bitcoin sentiment is BULLISH (score: 0.234) with 73% confidence',
    signal: 'BULLISH',
    score: 0.234,
    confidencePercent: '73%',
    postsAnalyzed: 156,
  },
  schema: {
    type: 'object',
    properties: {
      coin: {
        type: 'string',
        enum: SUPPORTED_COINS,
        description: 'Cryptocurrency ticker symbol (BTC, ETH, SOL, etc.)',
      },
    },
    required: ['coin'],
  },
};

// Main payment middleware with bazaar extension for x402scan
app.use(
  paymentMiddleware(
    {
      'POST /v1/sentiment': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
            payTo,
          },
        ],
        description: 'Real-time crypto sentiment analysis - Reddit sentiment for BTC, ETH, SOL and 9 other cryptocurrencies. Returns sentiment score, confidence, and top posts.',
        mimeType: 'application/json',
        extensions: {
          ...declareDiscoveryExtension(bazaarSchema),
        },
      },
      'GET /v1/sentiment': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
            payTo,
          },
        ],
        description: 'Real-time crypto sentiment analysis - Reddit sentiment for BTC, ETH, SOL and 9 other cryptocurrencies. Returns sentiment score, confidence, and top posts.',
        mimeType: 'application/json',
        extensions: {
          ...declareDiscoveryExtension(bazaarSchema),
        },
      },
      // Keep GET with param for backwards compatibility
      'GET /v1/sentiment/*': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
            payTo,
          },
        ],
        description: 'Real-time crypto sentiment analysis - Reddit sentiment for BTC, ETH, SOL and 9 other cryptocurrencies. Returns sentiment score, confidence, and top posts.',
        mimeType: 'application/json',
      },
    },
    resourceServer,
    undefined,
    paywall,
  ),
);

// ============================================
// x402 DISCOVERY DOCUMENT
// ============================================
app.get('/.well-known/x402', (req, res) => {
  // Single endpoint - coin selected via dropdown in x402scan
  res.json({
    version: 1,
    resources: [
      `${BASE_URL}/v1/sentiment`
    ],
    instructions: `# GenVox Crypto Sentiment API

Real-time cryptocurrency sentiment analysis powered by Reddit data and VADER sentiment analysis.

## How to Use
Select a coin from the dropdown and click Fetch. Supported coins:
${SUPPORTED_COINS.map(coin => `- **${coin}** (${COIN_NAMES[coin]})`).join('\n')}

## Pricing
- **$0.03 USDC** per query
- **Network:** Base Mainnet
- **Payment:** Gasless EIP-3009 signatures

## What You Get
- Human-readable sentiment summary with emoji signal
- Numerical sentiment score (-1 to +1)
- Confidence percentage
- Breakdown of positive/neutral/negative posts
- Top posts driving sentiment

## Support
- Twitter: [@BreakTheCubicle](https://x.com/BreakTheCubicle)
- GitHub: [crypto-sentiment-api](https://github.com/lobsterbar2027-boop/crypto-sentiment-api)
`,
  });
});

// ============================================
// HOMEPAGE - GENVOX LANDING PAGE
// ============================================
app.get('/', (req, res) => {
  const supportedCoins = Object.keys(CRYPTO_SUBREDDITS).map(coin => 
    `<span class="coin">${coin}</span>`
  ).join('');
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GenVox - Crypto Sentiment API</title>
  <meta name="description" content="Real-time crypto sentiment analysis API. Pay $0.03 per query with USDC on Base. No subscriptions.">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --cyan: #00D9FF;
      --orange: #FF6B4A;
      --yellow: #FFD93D;
      --green: #00FF88;
      --red: #FF4757;
      --black: #0a0a0a;
    }
    body {
      font-family: 'Space Mono', monospace;
      background: var(--black);
      color: white;
      min-height: 100vh;
      line-height: 1.6;
    }
    .bg-gradient {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;
      background: 
        radial-gradient(circle at 20% 50%, var(--cyan) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, var(--orange) 0%, transparent 50%);
      opacity: 0.05;
      animation: gradientShift 20s ease infinite;
    }
    @keyframes gradientShift {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(10%, 10%); }
    }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 50px;
      padding-top: 20px;
    }
    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-bottom: 20px;
    }
    .logo {
      width: 70px;
      height: 70px;
      animation: float 3s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }
    .logo-text {
      font-family: 'Orbitron', sans-serif;
      font-size: 3rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--cyan), var(--yellow), var(--green));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      font-size: 1.4rem;
      color: var(--cyan);
      font-weight: 700;
      margin-bottom: 10px;
    }
    .subline {
      color: rgba(255, 255, 255, 0.6);
    }

    /* Cards */
    .card {
      background: rgba(26, 26, 26, 0.8);
      border: 2px solid var(--cyan);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 25px;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--green));
    }
    .card-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.3rem;
      color: var(--yellow);
      margin-bottom: 20px;
      text-transform: uppercase;
    }

    /* Badges */
    .badge-row {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 700;
      background: rgba(0, 217, 255, 0.1);
      border: 1px solid var(--cyan);
      color: var(--cyan);
    }
    .badge-price {
      background: rgba(0, 255, 136, 0.1);
      border-color: var(--green);
      color: var(--green);
      font-size: 1.1rem;
    }

    /* CTA Section */
    .cta-section {
      text-align: center;
      padding: 30px;
      background: linear-gradient(135deg, rgba(0, 217, 255, 0.1), rgba(0, 255, 136, 0.1));
      border-radius: 12px;
      margin: 30px 0;
    }
    .cta-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.5rem;
      color: white;
      margin-bottom: 15px;
    }
    .cta-subtitle {
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 20px;
    }

    /* Buttons */
    .btn {
      padding: 16px 40px;
      font-size: 1.1rem;
      font-weight: 700;
      text-transform: uppercase;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'Orbitron', sans-serif;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
      margin: 10px;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--cyan), var(--green));
      color: var(--black);
      box-shadow: 0 0 30px rgba(0, 217, 255, 0.5);
    }
    .btn-primary:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 50px rgba(0, 217, 255, 0.8);
    }
    .btn-secondary {
      background: transparent;
      color: var(--yellow);
      border: 2px solid var(--yellow);
    }
    .btn-secondary:hover {
      background: var(--yellow);
      color: var(--black);
    }

    /* Coins */
    .coins {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 20px 0;
    }
    .coin {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      font-size: 0.9rem;
      transition: all 0.3s;
    }
    .coin:hover {
      background: rgba(0, 217, 255, 0.2);
      border-color: var(--cyan);
    }

    /* Example Response */
    .example-response {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      padding: 20px;
      font-size: 0.85rem;
      overflow-x: auto;
      margin-top: 20px;
    }
    .response-header {
      color: var(--cyan);
      margin-bottom: 10px;
      font-weight: 700;
    }
    .key { color: var(--cyan); }
    .string { color: var(--yellow); }
    .number { color: var(--orange); }

    /* Endpoint */
    .endpoint {
      background: rgba(0, 0, 0, 0.4);
      padding: 15px 20px;
      border-radius: 8px;
      margin: 15px 0;
      font-family: 'Space Mono', monospace;
      border-left: 3px solid var(--cyan);
    }
    .method { color: var(--green); font-weight: 700; }
    .path { color: var(--yellow); }

    /* Steps */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .step {
      text-align: center;
      padding: 25px 20px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .step-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.5rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--orange), var(--yellow));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .step-title {
      color: var(--cyan);
      font-weight: 700;
      margin: 10px 0;
    }
    .step-desc {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;
    }

    /* Footer */
    footer {
      text-align: center;
      margin-top: 50px;
      padding: 30px;
      border-top: 1px solid rgba(0, 217, 255, 0.2);
    }
    .footer-links {
      display: flex;
      gap: 25px;
      justify-content: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .footer-links a {
      color: var(--cyan);
      text-decoration: none;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.9rem;
      transition: color 0.3s;
    }
    .footer-links a:hover { color: var(--yellow); }
    .copyright {
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.85rem;
    }

    /* Stats */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat {
      text-align: center;
      padding: 20px;
    }
    .stat-value {
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      font-weight: 900;
      color: var(--cyan);
    }
    .stat-label {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.85rem;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="bg-gradient"></div>
  
  <div class="container">
    <header class="header">
      <div class="logo-container">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300D9FF'/%3E%3Cstop offset='50%25' style='stop-color:%23FFD93D'/%3E%3Cstop offset='100%25' style='stop-color:%2300FF88'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='none' stroke='url(%23g)' stroke-width='4'/%3E%3Ctext x='50' y='65' font-family='Arial' font-size='45' font-weight='bold' fill='url(%23g)' text-anchor='middle'%3E🔮%3C/text%3E%3C/svg%3E" alt="GenVox" class="logo">
        <div class="logo-text">GENVOX</div>
      </div>
      <p class="tagline">Crypto Sentiment API</p>
      <p class="subline">Real-time Reddit analysis • x402 Protocol • Base Network</p>
    </header>

    <!-- Main CTA -->
    <div class="cta-section">
      <div class="cta-title">🚀 Try It Now</div>
      <p class="cta-subtitle">Pay $0.03 USDC per query. No subscriptions. No API keys.</p>
      <a href="https://www.x402scan.com/server/5aec2eb2-473d-43e1-b9a6-6fed42b04212" class="btn btn-primary" target="_blank">
        Launch on x402scan →
      </a>
      <a href="https://github.com/lobsterbar2027-boop/crypto-sentiment-api" class="btn btn-secondary" target="_blank">
        View Docs
      </a>
    </div>

    <!-- Pricing Card -->
    <div class="card">
      <div class="badge-row">
        <span class="badge">⛓️ Base Mainnet</span>
        <span class="badge">💎 USDC</span>
        <span class="badge badge-price">💰 $0.03 / query</span>
      </div>
      
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/v1/sentiment/{coin}</span>
      </div>

      <p style="color: rgba(255,255,255,0.8); margin: 20px 0;">Supported cryptocurrencies:</p>
      <div class="coins">
        ${supportedCoins}
      </div>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat">
        <div class="stat-value">$0.03</div>
        <div class="stat-label">Per Query</div>
      </div>
      <div class="stat">
        <div class="stat-value">12</div>
        <div class="stat-label">Coins</div>
      </div>
      <div class="stat">
        <div class="stat-value">&lt;5s</div>
        <div class="stat-label">Response</div>
      </div>
      <div class="stat">
        <div class="stat-value">100%</div>
        <div class="stat-label">On-chain</div>
      </div>
    </div>

    <!-- How It Works -->
    <div class="card">
      <div class="card-title">⚡ How It Works</div>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-title">Visit x402scan</div>
          <div class="step-desc">Click "Launch on x402scan" above</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-title">Connect Wallet</div>
          <div class="step-desc">MetaMask, Coinbase, or any wallet</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-title">Pay $0.03</div>
          <div class="step-desc">Sign gasless USDC authorization</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-title">Get Data</div>
          <div class="step-desc">Instant sentiment analysis!</div>
        </div>
      </div>
    </div>

    <!-- Example Response -->
    <div class="card">
      <div class="card-title">📊 Example Response</div>
      <p style="color: rgba(255,255,255,0.7); margin-bottom: 15px;">What you get for $0.03:</p>
      <div class="example-response">
        <div class="response-header">GET /v1/sentiment/BTC</div>
<pre style="margin: 0; color: #e0e0e0;">{
  <span class="key">"coin"</span>: <span class="string">"BTC"</span>,
  <span class="key">"name"</span>: <span class="string">"Bitcoin"</span>,
  
  <span class="key">"summary"</span>: <span class="string">"📈 Bitcoin sentiment is BULLISH (score: 0.234) with 73% confidence based on 156 Reddit posts."</span>,
  <span class="key">"signal"</span>: <span class="string">"BULLISH"</span>,
  
  <span class="key">"score"</span>: <span class="number">0.234</span>,
  <span class="key">"scoreExplanation"</span>: <span class="string">"Moderate positive sentiment"</span>,
  <span class="key">"confidence"</span>: <span class="number">0.73</span>,
  <span class="key">"confidencePercent"</span>: <span class="string">"73%"</span>,
  <span class="key">"postsAnalyzed"</span>: <span class="number">156</span>,
  
  <span class="key">"positivePercent"</span>: <span class="string">"61%"</span>,
  <span class="key">"neutralPercent"</span>: <span class="string">"27%"</span>,
  <span class="key">"negativePercent"</span>: <span class="string">"12%"</span>,
  
  <span class="key">"topPosts"</span>: [...],
  <span class="key">"subredditsScanned"</span>: [<span class="string">"r/bitcoin"</span>, <span class="string">"r/BitcoinMarkets"</span>, ...]
}</pre>
      </div>
    </div>

    <!-- What You Get -->
    <div class="card">
      <div class="card-title">✨ What You Get</div>
      <ul style="padding-left: 25px; line-height: 2.2; color: rgba(255,255,255,0.85);">
        <li><span style="color: var(--green)">✓</span> Human-readable summary with emoji signal</li>
        <li><span style="color: var(--green)">✓</span> VADER sentiment analysis (optimized for social media)</li>
        <li><span style="color: var(--green)">✓</span> Confidence scores based on post volume</li>
        <li><span style="color: var(--green)">✓</span> Percentage breakdown (positive/neutral/negative)</li>
        <li><span style="color: var(--green)">✓</span> Top posts driving sentiment</li>
        <li><span style="color: var(--green)">✓</span> Multi-subreddit coverage</li>
      </ul>
    </div>

    <!-- Free Endpoints -->
    <div class="card">
      <div class="card-title">🆓 Free Endpoints</div>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/health</span> — Health check
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/api</span> — API info (JSON)
      </div>
    </div>

    <!-- For Developers -->
    <div class="card">
      <div class="card-title">👨‍💻 For Developers</div>
      <p style="color: rgba(255,255,255,0.8); margin-bottom: 15px;">Integrate with your trading bots, AI agents, or apps:</p>
      <div class="example-response">
<pre style="margin: 0; color: #e0e0e0;"><span style="color: var(--cyan)">// Using x402 client SDK</span>
import { createX402Client } from '@x402/client';

const client = createX402Client({
  wallet: yourWallet,
  network: 'base'
});

const sentiment = await client.fetch(
  'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/ETH'
);

console.log(sentiment.signal); <span style="color: var(--cyan)">// "BULLISH"</span></pre>
      </div>
      <p style="color: rgba(255,255,255,0.6); margin-top: 15px; font-size: 0.9rem;">
        See <a href="https://github.com/lobsterbar2027-boop/crypto-sentiment-api" style="color: var(--cyan);">GitHub</a> for full integration examples.
      </p>
    </div>

    <footer>
      <div class="footer-links">
        <a href="https://x.com/BreakTheCubicle" target="_blank">Twitter</a>
        <a href="https://github.com/lobsterbar2027-boop/crypto-sentiment-api" target="_blank">GitHub</a>
        <a href="https://www.x402scan.com/server/5aec2eb2-473d-43e1-b9a6-6fed42b04212" target="_blank">x402scan</a>
        <a href="https://x402.org" target="_blank">x402 Protocol</a>
        <a href="https://base.org" target="_blank">Base</a>
      </div>
      <p class="copyright">© 2026 GenVox • Built with x402 on Base</p>
    </footer>
  </div>
</body>
</html>
  `);
});
// ============================================
// PROTECTED ENDPOINT - Requires x402 Payment
// ============================================

// Shared function to get sentiment (used by both POST and GET)
async function getSentiment(coin) {
  const coinUpper = coin.toUpperCase();
  const coinName = COIN_NAMES[coinUpper] || coinUpper;
  
  console.log(`\n💰 Processing request for ${coinUpper} (${coinName}) sentiment`);

  const subreddits = CRYPTO_SUBREDDITS[coinUpper] || ['CryptoCurrency'];
  const subredditsScanned = [];
  let allPosts = [];

  // Fetch from each subreddit
  for (const sub of subreddits) {
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
  const tickerPosts = await searchReddit(`$${coinUpper} crypto`, 30);
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

  // Handle case where no posts were found
  if (allPosts.length === 0) {
    console.log(`   ⚠️ No posts found for ${coinUpper}`);
    return {
      coin: coinUpper,
      name: coinName,
      timestamp: new Date().toISOString(),
      summary: `Unable to fetch Reddit data for ${coinName}. Reddit may be rate-limiting requests. Try again in a few minutes.`,
      signal: 'UNAVAILABLE',
      score: null,
      confidence: null,
      postsAnalyzed: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      source: 'Reddit',
      analyzer: 'VADER',
      subredditsScanned: [],
      topPosts: [],
      paymentNetwork: 'Base Mainnet',
      paymentAmount: '$0.03 USDC',
      paymentStatus: 'confirmed',
      note: 'Reddit data temporarily unavailable. Please try again in a few minutes.',
    };
  }

  // Analyze sentiment with VADER
  const analysis = analyzeWithVader(allPosts, coinUpper);
  
  const signalEmoji = {
    'very bullish': '🚀',
    'bullish': '📈',
    'neutral': '➡️',
    'bearish': '📉',
    'very bearish': '💥',
  };
  
  const emoji = signalEmoji[analysis.sentiment] || '📊';
  const confidencePercent = Math.round(analysis.confidence * 100);
  const summary = `${emoji} ${coinName} sentiment is ${analysis.sentiment.toUpperCase()} (score: ${analysis.score.toFixed(3)}) with ${confidencePercent}% confidence based on ${analysis.postsAnalyzed} Reddit posts.`;

  const response = {
    coin: coinUpper,
    name: coinName,
    timestamp: new Date().toISOString(),
    summary,
    signal: analysis.sentiment.toUpperCase().replace(' ', '_'),
    score: analysis.score,
    scoreExplanation: analysis.score > 0.3 ? 'Strong positive sentiment' : 
                      analysis.score > 0.1 ? 'Moderate positive sentiment' :
                      analysis.score > -0.1 ? 'Mixed/neutral sentiment' :
                      analysis.score > -0.3 ? 'Moderate negative sentiment' : 'Strong negative sentiment',
    confidence: analysis.confidence,
    confidencePercent: `${confidencePercent}%`,
    postsAnalyzed: analysis.postsAnalyzed,
    positiveCount: analysis.breakdown.positive,
    positivePercent: analysis.postsAnalyzed > 0 ? `${Math.round((analysis.breakdown.positive / analysis.postsAnalyzed) * 100)}%` : '0%',
    neutralCount: analysis.breakdown.neutral,
    neutralPercent: analysis.postsAnalyzed > 0 ? `${Math.round((analysis.breakdown.neutral / analysis.postsAnalyzed) * 100)}%` : '0%',
    negativeCount: analysis.breakdown.negative,
    negativePercent: analysis.postsAnalyzed > 0 ? `${Math.round((analysis.breakdown.negative / analysis.postsAnalyzed) * 100)}%` : '0%',
    source: 'Reddit',
    analyzer: 'VADER (Valence Aware Dictionary and sEntiment Reasoner)',
    subredditsScanned,
    topPosts: analysis.topPosts.map((post, i) => ({
      rank: i + 1,
      title: post.title,
      sentiment: post.score > 0.05 ? 'positive' : post.score < -0.05 ? 'negative' : 'neutral',
      sentimentScore: post.score,
      subreddit: `r/${post.subreddit}`,
      engagement: post.engagement,
    })),
    paymentNetwork: 'Base Mainnet',
    paymentAmount: '$0.03 USDC',
    paymentStatus: 'confirmed',
  };

  console.log(`   Result: ${analysis.sentiment} (score: ${analysis.score}, confidence: ${analysis.confidence})`);
  return response;
}

// POST /v1/sentiment - x402scan sends coin in body
app.post('/v1/sentiment', async (req, res) => {
  // Log everything to debug x402scan input
  console.log('\n📥 POST /v1/sentiment received:');
  console.log('   Body:', JSON.stringify(req.body));
  console.log('   Query:', JSON.stringify(req.query));
  console.log('   Headers content-type:', req.headers['content-type']);
  
  // Try multiple ways to get the coin parameter
  let coin = 'BTC'; // default
  
  // Check body (most likely)
  if (req.body?.coin) {
    coin = req.body.coin;
    console.log('   Found coin in body:', coin);
  } 
  // Check if body is the coin directly (string)
  else if (typeof req.body === 'string') {
    coin = req.body;
    console.log('   Found coin as body string:', coin);
  }
  // Check query params
  else if (req.query?.coin) {
    coin = req.query.coin;
    console.log('   Found coin in query:', coin);
  }
  // Check for nested input object (some APIs use this)
  else if (req.body?.input?.coin) {
    coin = req.body.input.coin;
    console.log('   Found coin in body.input:', coin);
  }
  else {
    console.log('   No coin found, using default BTC');
  }
  
  const result = await getSentiment(coin);
  res.json(result);
});

// GET /v1/sentiment - for x402scan testing (defaults to BTC)
app.get('/v1/sentiment', async (req, res) => {
  console.log('\n📥 GET /v1/sentiment received:');
  console.log('   Query:', JSON.stringify(req.query));
  
  const coin = req.query?.coin || 'BTC';
  console.log('   Using coin:', coin);
  
  const result = await getSentiment(coin);
  res.json(result);
});

// GET /v1/sentiment/:coin - backwards compatible URL-based access
app.get('/v1/sentiment/:coin', async (req, res) => {
  const coin = req.params.coin;
  const result = await getSentiment(coin);
  res.json(result);
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

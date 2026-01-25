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
      'GET /v1/sentiment/*': {
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
    undefined, // paywallConfig (using custom paywall)
    paywall,   // custom paywall provider with wallet UI
  ),
);

// ============================================
// HOMEPAGE WITH GENVOX STYLING
// ============================================
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GenVox - Crypto Sentiment API</title>
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
      width: 60px;
      height: 60px;
      animation: float 3s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }
    .logo-text {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.5rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--cyan), var(--yellow), var(--green));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      font-size: 1.2rem;
      color: var(--cyan);
      font-weight: 700;
    }
    .subline {
      color: rgba(255, 255, 255, 0.6);
      margin-top: 10px;
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
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--green));
    }
    .card:hover {
      box-shadow: 0 0 30px rgba(0, 217, 255, 0.2);
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

    /* Wallet Info */
    .wallet-info {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      background: rgba(255, 71, 87, 0.1);
      border: 1px solid var(--red);
    }
    .wallet-info.connected {
      background: rgba(0, 255, 136, 0.1);
      border-color: var(--green);
    }
    .wallet-status {
      font-weight: 700;
    }
    .wallet-address {
      font-family: 'Space Mono', monospace;
      font-size: 0.9rem;
      color: var(--cyan);
    }

    /* Form Elements */
    .form-row {
      display: flex;
      gap: 15px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 20px;
    }
    select {
      padding: 14px 20px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.5);
      border: 2px solid rgba(0, 217, 255, 0.3);
      color: white;
      font-family: 'Space Mono', monospace;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.3s;
    }
    select:hover, select:focus {
      border-color: var(--cyan);
      outline: none;
    }

    /* Buttons */
    .btn {
      padding: 14px 28px;
      font-size: 1rem;
      font-weight: 700;
      text-transform: uppercase;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'Orbitron', sans-serif;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--cyan), var(--green));
      color: var(--black);
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.4);
    }
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-3px);
      box-shadow: 0 0 40px rgba(0, 217, 255, 0.6);
    }
    .btn-secondary {
      background: transparent;
      color: var(--yellow);
      border: 2px solid var(--yellow);
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--yellow);
      color: var(--black);
    }
    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none !important;
    }

    /* Status Messages */
    #status {
      margin-top: 20px;
      padding: 15px 20px;
      border-radius: 8px;
      display: none;
      font-weight: 700;
    }
    #status.info {
      display: block;
      background: rgba(0, 217, 255, 0.1);
      border: 1px solid var(--cyan);
      color: var(--cyan);
    }
    #status.success {
      display: block;
      background: rgba(0, 255, 136, 0.1);
      border: 1px solid var(--green);
      color: var(--green);
    }
    #status.error {
      display: block;
      background: rgba(255, 71, 87, 0.1);
      border: 1px solid var(--red);
      color: var(--red);
    }

    /* Results */
    #result {
      margin-top: 20px;
      padding: 20px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      display: none;
      font-family: 'Space Mono', monospace;
      font-size: 0.9rem;
      white-space: pre-wrap;
      max-height: 400px;
      overflow-y: auto;
      color: #e0e0e0;
    }

    /* Endpoint Display */
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

    /* How It Works */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .step {
      text-align: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .step-number {
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      font-weight: 900;
      background: linear-gradient(135deg, var(--orange), var(--yellow));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }
    .step-title {
      color: var(--cyan);
      font-weight: 700;
      margin-bottom: 8px;
    }
    .step-desc {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;
      line-height: 1.5;
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

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-top-color: var(--cyan);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="bg-gradient"></div>
  
  <div class="container">
    <header class="header">
      <div class="logo-container">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300D9FF'/%3E%3Cstop offset='50%25' style='stop-color:%23FFD93D'/%3E%3Cstop offset='100%25' style='stop-color:%2300FF88'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='50' cy='50' r='45' fill='none' stroke='url(%23g)' stroke-width='4'/%3E%3Ctext x='50' y='62' font-family='Arial' font-size='40' font-weight='bold' fill='url(%23g)' text-anchor='middle'%3E🔮%3C/text%3E%3C/svg%3E" alt="GenVox" class="logo">
        <div class="logo-text">GENVOX</div>
      </div>
      <p class="tagline">Crypto Sentiment API</p>
      <p class="subline">Real-time Reddit analysis • x402 Protocol • Base Network</p>
    </header>

    <div class="card">
      <div class="badge-row">
        <span class="badge">⛓️ Base Mainnet</span>
        <span class="badge">💎 USDC</span>
        <span class="badge badge-price">💰 $0.03 / query</span>
      </div>
      
      <div id="walletInfo" class="wallet-info">
        <span id="walletStatus" class="wallet-status">🔴 Wallet not connected</span>
        <span id="walletAddress" class="wallet-address"></span>
      </div>

      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/v1/sentiment/:coin</span>
      </div>

      <p style="color: rgba(255,255,255,0.7); margin: 15px 0;">Select a cryptocurrency and pay with your wallet:</p>
      
      <div class="form-row">
        <select id="coinSelect">
          ${Object.keys(CRYPTO_SUBREDDITS).map(coin => '<option value="' + coin + '">' + coin + ' - ' + (COIN_NAMES[coin] || coin) + '</option>').join('')}
        </select>
        <button id="connectBtn" class="btn btn-secondary">Connect Wallet</button>
        <button id="payBtn" class="btn btn-primary" disabled>Pay $0.03 → Get Sentiment</button>
      </div>

      <div id="status"></div>
      <pre id="result"></pre>
    </div>

    <div class="card">
      <div class="card-title">⚡ How It Works</div>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-title">Connect</div>
          <div class="step-desc">Link your MetaMask or Coinbase Wallet</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-title">Select</div>
          <div class="step-desc">Choose a crypto to analyze</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-title">Pay</div>
          <div class="step-desc">Sign $0.03 USDC authorization</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-title">Analyze</div>
          <div class="step-desc">Get instant Reddit sentiment</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 What You Get</div>
      <ul style="padding-left: 25px; line-height: 2; color: rgba(255,255,255,0.8);">
        <li><span style="color: var(--green)">✓</span> VADER sentiment analysis (social media optimized)</li>
        <li><span style="color: var(--green)">✓</span> Engagement-weighted scoring</li>
        <li><span style="color: var(--green)">✓</span> Multi-subreddit coverage</li>
        <li><span style="color: var(--green)">✓</span> Top posts driving sentiment</li>
        <li><span style="color: var(--green)">✓</span> Confidence scores</li>
      </ul>
    </div>

    <div class="card">
      <div class="card-title">🆓 Free Endpoints</div>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/health</span> — Health check
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/api</span> — API info (JSON)
      </div>
    </div>

    <footer>
      <div class="footer-links">
        <a href="https://x.com/BreakTheCubicle" target="_blank">Twitter</a>
        <a href="https://github.com/lobsterbar2027-boop/crypto-sentiment-api" target="_blank">GitHub</a>
        <a href="https://www.x402scan.com/server/cd7fc186-0e68-4025-a005-2febc32b0650" target="_blank">x402scan</a>
        <a href="https://x402.org" target="_blank">x402 Protocol</a>
        <a href="https://base.org" target="_blank">Base</a>
      </div>
      <p class="copyright">© 2026 GenVox • Built with x402 on Base</p>
    </footer>
  </div>

  <script>
    // State
    let userAddress = null;
    
    // DOM elements
    const connectBtn = document.getElementById('connectBtn');
    const payBtn = document.getElementById('payBtn');
    const coinSelect = document.getElementById('coinSelect');
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const walletInfo = document.getElementById('walletInfo');
    const walletStatus = document.getElementById('walletStatus');
    const walletAddress = document.getElementById('walletAddress');
    
    // Base Mainnet chain ID
    const BASE_CHAIN_ID = '0x2105';
    
    function setStatus(message, type = 'info') {
      status.innerHTML = message;
      status.className = type;
    }
    
    function hasWallet() {
      return typeof window.ethereum !== 'undefined';
    }
    
    async function connectWallet() {
      if (!hasWallet()) {
        setStatus('⚠️ Please install MetaMask or Coinbase Wallet!', 'error');
        return;
      }
      
      try {
        setStatus('<span class="spinner"></span> Connecting wallet...', 'info');
        
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== BASE_CHAIN_ID) {
          setStatus('<span class="spinner"></span> Switching to Base network...', 'info');
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: BASE_CHAIN_ID }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: BASE_CHAIN_ID,
                  chainName: 'Base',
                  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org'],
                }],
              });
            } else {
              throw switchError;
            }
          }
        }
        
        walletInfo.className = 'wallet-info connected';
        walletStatus.textContent = '🟢 Connected';
        walletAddress.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        connectBtn.textContent = 'Connected ✓';
        connectBtn.disabled = true;
        payBtn.disabled = false;
        setStatus('✅ Wallet connected! Ready to query.', 'success');
        
      } catch (error) {
        console.error('Wallet connection error:', error);
        setStatus('❌ Connection failed: ' + error.message, 'error');
      }
    }
    
    function generateNonce() {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    async function payAndGetSentiment() {
      const coin = coinSelect.value;
      
      try {
        payBtn.disabled = true;
        setStatus('<span class="spinner"></span> Fetching payment requirements...', 'info');
        result.style.display = 'none';
        
        const initialResponse = await fetch('/v1/sentiment/' + coin);
        
        if (initialResponse.ok) {
          const data = await initialResponse.json();
          result.textContent = JSON.stringify(data, null, 2);
          result.style.display = 'block';
          setStatus('✅ Data retrieved!', 'success');
          payBtn.disabled = false;
          return;
        }
        
        if (initialResponse.status !== 402) {
          throw new Error('Unexpected response: ' + initialResponse.status);
        }
        
        const paymentRequiredHeader = initialResponse.headers.get('X-Payment') || 
                                      initialResponse.headers.get('x-payment') ||
                                      initialResponse.headers.get('Payment-Required') ||
                                      initialResponse.headers.get('payment-required');
        
        if (!paymentRequiredHeader) {
          throw new Error('No payment requirements in response');
        }
        
        const requirements = JSON.parse(atob(paymentRequiredHeader));
        const accepts = requirements.accepts[0];
        if (!accepts) {
          throw new Error('No accepted payment methods');
        }
        
        setStatus('<span class="spinner"></span> Preparing payment...', 'info');
        
        const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        const payTo = accepts.payTo;
        const amount = accepts.amount;
        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600;
        const nonce = generateNonce();
        
        const typedData = {
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' }
            ],
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' }
            ]
          },
          primaryType: 'TransferWithAuthorization',
          domain: {
            name: accepts.extra?.name || 'USD Coin',
            version: accepts.extra?.version || '2',
            chainId: 8453,
            verifyingContract: accepts.asset || USDC_ADDRESS
          },
          message: {
            from: userAddress,
            to: payTo,
            value: amount,
            validAfter: validAfter,
            validBefore: validBefore,
            nonce: nonce
          }
        };
        
        setStatus('🔐 Please sign the payment in your wallet...', 'info');
        
        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [userAddress, JSON.stringify(typedData)]
        });
        
        setStatus('<span class="spinner"></span> Payment signed! Fetching data...', 'info');
        
        const paymentPayload = {
          x402Version: 2,
          scheme: 'exact',
          network: accepts.network,
          payload: {
            signature: signature,
            authorization: {
              from: userAddress,
              to: payTo,
              value: amount,
              validAfter: validAfter,
              validBefore: validBefore,
              nonce: nonce
            }
          }
        };
        
        const paymentHeader = btoa(JSON.stringify(paymentPayload));
        
        const paidResponse = await fetch('/v1/sentiment/' + coin, {
          headers: { 'X-Payment': paymentHeader }
        });
        
        if (!paidResponse.ok) {
          const errorText = await paidResponse.text();
          throw new Error('Payment failed: ' + paidResponse.status + ' - ' + errorText);
        }
        
        const data = await paidResponse.json();
        result.textContent = JSON.stringify(data, null, 2);
        result.style.display = 'block';
        setStatus('🎉 Success! Here is your ' + coin + ' sentiment analysis:', 'success');
        
      } catch (error) {
        console.error('Payment error:', error);
        setStatus('❌ Error: ' + error.message, 'error');
      } finally {
        payBtn.disabled = false;
      }
    }
    
    connectBtn.addEventListener('click', connectWallet);
    payBtn.addEventListener('click', payAndGetSentiment);
    
    if (hasWallet() && window.ethereum.selectedAddress) {
      userAddress = window.ethereum.selectedAddress;
      walletInfo.className = 'wallet-info connected';
      walletStatus.textContent = '🟢 Connected';
      walletAddress.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
      connectBtn.textContent = 'Connected ✓';
      connectBtn.disabled = true;
      payBtn.disabled = false;
    }
    
    if (hasWallet()) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          userAddress = null;
          walletInfo.className = 'wallet-info';
          walletStatus.textContent = '🔴 Wallet not connected';
          walletAddress.textContent = '';
          connectBtn.textContent = 'Connect Wallet';
          connectBtn.disabled = false;
          payBtn.disabled = true;
        } else {
          userAddress = accounts[0];
          walletAddress.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        }
      });
    }
  </script>
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

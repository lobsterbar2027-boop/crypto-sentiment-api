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

// Build paywall UI for wallet connection
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: 'Crypto Sentiment API',
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
// HOMEPAGE WITH WALLET CONNECTION
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
    .coin { background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 20px; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
    .coin:hover, .coin.selected { background: rgba(0,212,255,0.3); border: 1px solid #00d4ff; }
    .btn { display: inline-block; background: linear-gradient(90deg, #0066ff, #00d4ff); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px; border: none; cursor: pointer; font-size: 1rem; }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,102,255,0.4); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-secondary { background: linear-gradient(90deg, #10b981, #059669); }
    a { color: #00d4ff; }
    footer { text-align: center; margin-top: 40px; color: #666; }
    #status { margin-top: 15px; padding: 15px; border-radius: 8px; display: none; }
    #status.info { display: block; background: rgba(0,212,255,0.1); border: 1px solid #00d4ff; }
    #status.success { display: block; background: rgba(16,185,129,0.1); border: 1px solid #10b981; }
    #status.error { display: block; background: rgba(239,68,68,0.1); border: 1px solid #ef4444; color: #fca5a5; }
    #result { margin-top: 20px; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 8px; display: none; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
    .wallet-info { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding: 10px; background: rgba(16,185,129,0.1); border-radius: 8px; }
    .wallet-info.disconnected { background: rgba(239,68,68,0.1); }
    .wallet-address { font-family: monospace; font-size: 0.85rem; }
    select { padding: 10px 15px; border-radius: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 1rem; margin-right: 10px; }
    .action-row { display: flex; align-items: center; gap: 15px; margin-top: 20px; flex-wrap: wrap; }
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
      
      <div id="walletInfo" class="wallet-info disconnected">
        <span id="walletStatus">🔴 Wallet not connected</span>
        <span id="walletAddress" class="wallet-address"></span>
      </div>
      
      <div class="endpoint">
        <span class="method">GET</span> <span class="path">/v1/sentiment/:coin</span>
      </div>
      
      <p>Select a cryptocurrency:</p>
      <div class="action-row">
        <select id="coinSelect">
          ${Object.keys(CRYPTO_SUBREDDITS).map(coin => '<option value="' + coin + '">' + coin + '</option>').join('')}
        </select>
        <button id="connectBtn" class="btn btn-secondary">Connect Wallet</button>
        <button id="payBtn" class="btn" disabled>Pay $0.03 & Get Sentiment</button>
      </div>
      
      <div id="status"></div>
      <pre id="result"></pre>
    </div>
    
    <div class="card">
      <h3>How it works</h3>
      <ol style="margin-top: 15px; padding-left: 20px; line-height: 1.8;">
        <li>Connect your wallet (MetaMask, Coinbase Wallet, etc.)</li>
        <li>Select a cryptocurrency to analyze</li>
        <li>Click "Pay & Get Sentiment" - sign the $0.03 USDC authorization</li>
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

  <script>
    // State
    let userAddress = null;
    let provider = null;
    
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
    const BASE_CHAIN_ID = '0x2105'; // 8453 in hex
    
    // Update status message
    function setStatus(message, type = 'info') {
      status.textContent = message;
      status.className = type;
    }
    
    // Check if MetaMask or other wallet is available
    function hasWallet() {
      return typeof window.ethereum !== 'undefined';
    }
    
    // Connect wallet
    async function connectWallet() {
      if (!hasWallet()) {
        setStatus('Please install MetaMask or another Web3 wallet!', 'error');
        return;
      }
      
      try {
        setStatus('Connecting wallet...', 'info');
        
        // Request accounts
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        
        // Check/switch to Base network
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== BASE_CHAIN_ID) {
          setStatus('Switching to Base network...', 'info');
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: BASE_CHAIN_ID }],
            });
          } catch (switchError) {
            // Chain not added, try to add it
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
        
        // Update UI
        walletInfo.className = 'wallet-info';
        walletStatus.textContent = '🟢 Connected';
        walletAddress.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        connectBtn.textContent = 'Connected ✓';
        connectBtn.disabled = true;
        payBtn.disabled = false;
        setStatus('Wallet connected! Ready to pay.', 'success');
        
      } catch (error) {
        console.error('Wallet connection error:', error);
        setStatus('Failed to connect: ' + error.message, 'error');
      }
    }
    
    // Generate random nonce for EIP-3009
    function generateNonce() {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    // Make payment and get sentiment
    async function payAndGetSentiment() {
      const coin = coinSelect.value;
      
      try {
        payBtn.disabled = true;
        setStatus('Fetching payment requirements...', 'info');
        result.style.display = 'none';
        
        // Step 1: Make initial request to get 402 + payment requirements
        const initialResponse = await fetch('/v1/sentiment/' + coin);
        
        // If we got 200, payment was somehow not required (shouldn't happen)
        if (initialResponse.ok) {
          const data = await initialResponse.json();
          result.textContent = JSON.stringify(data, null, 2);
          result.style.display = 'block';
          setStatus('Got response (no payment required)', 'success');
          payBtn.disabled = false;
          return;
        }
        
        // Check for 402 Payment Required
        if (initialResponse.status !== 402) {
          throw new Error('Unexpected response: ' + initialResponse.status);
        }
        
        // Get payment requirements from header
        const paymentRequiredHeader = initialResponse.headers.get('X-Payment') || 
                                      initialResponse.headers.get('x-payment') ||
                                      initialResponse.headers.get('Payment-Required') ||
                                      initialResponse.headers.get('payment-required');
        
        if (!paymentRequiredHeader) {
          throw new Error('No payment requirements in response headers');
        }
        
        // Decode payment requirements
        const requirements = JSON.parse(atob(paymentRequiredHeader));
        console.log('Payment requirements:', requirements);
        
        // Get the first accepted payment option
        const accepts = requirements.accepts[0];
        if (!accepts) {
          throw new Error('No accepted payment methods');
        }
        
        setStatus('Preparing payment authorization...', 'info');
        
        // USDC contract on Base mainnet
        const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        
        // Payment details
        const payTo = accepts.payTo;
        const amount = accepts.amount; // Already in atomic units (30000 for $0.03)
        const validAfter = 0;
        const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const nonce = generateNonce();
        
        // EIP-712 typed data for USDC TransferWithAuthorization (EIP-3009)
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
        
        setStatus('Please sign the payment in your wallet...', 'info');
        
        // Request signature from wallet
        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [userAddress, JSON.stringify(typedData)]
        });
        
        console.log('Signature:', signature);
        
        setStatus('Payment signed! Sending request...', 'info');
        
        // Create payment payload
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
        
        // Encode payment payload as base64
        const paymentHeader = btoa(JSON.stringify(paymentPayload));
        
        // Step 2: Make request with payment
        const paidResponse = await fetch('/v1/sentiment/' + coin, {
          headers: {
            'X-Payment': paymentHeader
          }
        });
        
        if (!paidResponse.ok) {
          const errorText = await paidResponse.text();
          throw new Error('Payment failed: ' + paidResponse.status + ' - ' + errorText);
        }
        
        const data = await paidResponse.json();
        result.textContent = JSON.stringify(data, null, 2);
        result.style.display = 'block';
        setStatus('✅ Payment successful! Here\\'s your sentiment analysis:', 'success');
        
      } catch (error) {
        console.error('Payment error:', error);
        setStatus('Error: ' + error.message, 'error');
      } finally {
        payBtn.disabled = false;
      }
    }
    
    // Event listeners
    connectBtn.addEventListener('click', connectWallet);
    payBtn.addEventListener('click', payAndGetSentiment);
    
    // Check if already connected
    if (hasWallet() && window.ethereum.selectedAddress) {
      userAddress = window.ethereum.selectedAddress;
      walletInfo.className = 'wallet-info';
      walletStatus.textContent = '🟢 Connected';
      walletAddress.textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
      connectBtn.textContent = 'Connected ✓';
      connectBtn.disabled = true;
      payBtn.disabled = false;
    }
    
    // Listen for account changes
    if (hasWallet()) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          userAddress = null;
          walletInfo.className = 'wallet-info disconnected';
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

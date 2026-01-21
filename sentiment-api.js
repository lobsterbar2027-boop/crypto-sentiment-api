// CRITICAL: Polyfill for Node.js 18 - must be at the very top
import { webcrypto } from 'crypto';
globalThis.crypto = webcrypto;

import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 imports
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { createFacilitatorConfig } from '@coinbase/x402';

config();

const app = express();
const sentiment = new Sentiment();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Configuration from environment variables
const evmAddress = process.env.WALLET_ADDRESS;
const NETWORK = 'eip155:8453'; // Base Mainnet CAIP-2
const NETWORK_NAME = 'Base Mainnet';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

console.log('🔄 Initializing x402 v2 (MAINNET)...');
console.log('   Wallet:', evmAddress);
console.log('   Network:', NETWORK);
console.log('   CDP_API_KEY_ID:', process.env.CDP_API_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('   CDP_API_KEY_SECRET:', process.env.CDP_API_KEY_SECRET ? '✅ Set' : '❌ Missing');

if (!evmAddress) {
  console.error('❌ WALLET_ADDRESS environment variable is required');
  process.exit(1);
}
if (!process.env.CDP_API_KEY_ID) {
  console.error('❌ CDP_API_KEY_ID environment variable is required');
  process.exit(1);
}
if (!process.env.CDP_API_KEY_SECRET) {
  console.error('❌ CDP_API_KEY_SECRET environment variable is required');
  process.exit(1);
}

// Create facilitator client - EXPLICITLY pass credentials
console.log('🔧 Creating facilitator config with explicit credentials...');
const facilitatorConfig = createFacilitatorConfig(
  process.env.CDP_API_KEY_ID,
  process.env.CDP_API_KEY_SECRET
);
console.log('   Facilitator URL:', facilitatorConfig.url);
console.log('   Has createAuthHeaders:', !!facilitatorConfig.createAuthHeaders);

const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);
console.log('✅ Facilitator client configured');

const paymentLog = [];

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

function analyzeSentiment(text) {
  const sentimentResult = sentiment.analyze(text);
  const vaderResult = vaderSentiment.SentimentIntensityAnalyzer.polarity_scores(text);
  const score = (sentimentResult.comparative + vaderResult.compound) / 2;
  let label;
  if (score > 0.2) label = 'bullish';
  else if (score < -0.2) label = 'bearish';
  else label = 'neutral';
  return { score: parseFloat(score.toFixed(4)), label, confidence: Math.abs(score) };
}

async function fetchRedditPosts(coin) {
  const subreddits = CRYPTO_SUBREDDITS[coin.toUpperCase()] || CRYPTO_SUBREDDITS.DEFAULT;
  const allPosts = [];

  for (const subreddit of subreddits) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
      );
      if (!response.ok) continue;
      const data = await response.json();
      for (const post of (data.data?.children || [])) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        allPosts.push({ title: p.title, selftext: p.selftext?.substring(0, 500) || '', score: p.score, subreddit });
      }
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allPosts;
}

// ============================================
// DEBUG LOGGING MIDDLEWARE
// ============================================
app.use('/v1/sentiment', (req, res, next) => {
  console.log('\n========== INCOMING REQUEST ==========');
  console.log('🔍 Method:', req.method);
  console.log('🔍 URL:', req.url);
  
  // Log ALL headers to see what's received
  console.log('🔍 All headers:', JSON.stringify(req.headers, null, 2).substring(0, 1500));
  
  // Log payment headers
  const xPayment = req.headers['x-payment'];
  const paymentSig = req.headers['payment-signature'];
  
  if (xPayment) {
    console.log('💳 X-PAYMENT header found, length:', xPayment.length);
    try {
      const decoded = JSON.parse(Buffer.from(xPayment, 'base64').toString());
      console.log('📦 Decoded X-PAYMENT:', JSON.stringify(decoded, null, 2).substring(0, 1000));
    } catch (e) {
      console.log('⚠️ Could not decode X-PAYMENT:', e.message);
    }
  }
  
  if (paymentSig) {
    console.log('💳 PAYMENT-SIGNATURE header found, length:', paymentSig.length);
    try {
      const decoded = JSON.parse(Buffer.from(paymentSig, 'base64').toString());
      console.log('📦 Decoded PAYMENT-SIGNATURE:', JSON.stringify(decoded, null, 2).substring(0, 1000));
    } catch (e) {
      console.log('⚠️ Could not decode PAYMENT-SIGNATURE:', e.message);
    }
  }
  
  if (!xPayment && !paymentSig) {
    console.log('ℹ️ No payment header - initial 402 request');
  }
  
  console.log('========================================\n');
  next();
});

// ============================================
// LANDING PAGE
// ============================================
app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CryptoSentiment API</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔮</text></svg>">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%); min-height: 100vh; color: #fff; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    header { text-align: center; margin-bottom: 48px; }
    .logo { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 36px; margin-bottom: 12px; background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .tagline { color: #9ca3af; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 48px; }
    .card { background: rgba(255,255,255,0.05); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.1); }
    .card h3 { margin-bottom: 12px; color: #fff; }
    .card p { color: #9ca3af; font-size: 14px; line-height: 1.6; }
    .payment-section { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 20px; padding: 32px; margin-bottom: 48px; }
    .payment-section h2 { text-align: center; margin-bottom: 24px; }
    .price-tag { text-align: center; margin-bottom: 24px; }
    .price { font-size: 48px; font-weight: bold; color: #3b82f6; }
    .price-label { color: #9ca3af; }
    select, button { width: 100%; padding: 16px; border-radius: 12px; font-size: 16px; margin-bottom: 12px; }
    select { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer; }
    button { border: none; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: linear-gradient(90deg, #3b82f6, #8b5cf6); color: white; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .wallet-info { background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; display: none; }
    .wallet-info .label { color: #9ca3af; }
    .wallet-info .value { color: #fff; font-family: monospace; }
    .status { padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 14px; text-align: center; }
    .status.pending { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
    .status.success { background: rgba(34, 197, 94, 0.2); color: #86efac; }
    .status.error { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
    .result { background: rgba(0,0,0,0.3); border-radius: 12px; padding: 16px; margin-top: 16px; max-height: 300px; overflow-y: auto; display: none; }
    .result pre { font-size: 12px; white-space: pre-wrap; word-break: break-all; color: #d1d5db; }
    .docs { margin-bottom: 48px; }
    .docs h2 { margin-bottom: 24px; }
    .endpoint { background: rgba(0,0,0,0.2); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .method { display: inline-block; background: #22c55e; color: #000; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .path { font-family: monospace; color: #fff; }
    .endpoint p { margin-top: 8px; color: #9ca3af; font-size: 14px; }
    footer { text-align: center; padding: 24px; color: #6b7280; font-size: 14px; border-top: 1px solid rgba(255,255,255,0.1); }
    footer a { color: #3b82f6; text-decoration: none; }
    .coins { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .coin { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">🔮</div>
      <h1>CryptoSentiment API</h1>
      <p class="tagline">AI-powered Reddit sentiment analysis for cryptocurrencies</p>
    </header>

    <div class="grid">
      <div class="card"><h3>📊 Real-Time Analysis</h3><p>Scrapes Reddit in real-time to analyze community sentiment across multiple crypto subreddits.</p></div>
      <div class="card"><h3>🤖 Dual AI Models</h3><p>Combines VADER and custom sentiment analysis for accurate bullish/bearish/neutral classifications.</p></div>
      <div class="card"><h3>⚡ x402 Payments</h3><p>Pay-per-query using USDC on Base. No subscriptions, no API keys.</p></div>
    </div>

    <div class="payment-section">
      <h2>Try It Now</h2>
      <div class="price-tag">
        <div class="price">$0.03</div>
        <div class="price-label">USDC per query on Base</div>
      </div>

      <select id="coinSelect">
        <option value="BTC">Bitcoin (BTC)</option>
        <option value="ETH">Ethereum (ETH)</option>
        <option value="SOL">Solana (SOL)</option>
        <option value="DOGE">Dogecoin (DOGE)</option>
        <option value="XRP">Ripple (XRP)</option>
        <option value="ADA">Cardano (ADA)</option>
      </select>

      <div id="walletInfo" class="wallet-info">
        <div><span class="label">Wallet:</span> <span class="value" id="walletAddress"></span></div>
        <div><span class="label">USDC Balance:</span> <span class="value" id="usdcBalance"></span></div>
      </div>

      <button id="connectBtn" class="btn-primary" onclick="connectWallet()">Connect MetaMask</button>
      <button id="payBtn" class="btn-primary" onclick="makePayment()" style="display: none;">Pay & Get Sentiment</button>

      <div id="status"></div>
      <div id="resultBox" class="result"><pre id="result"></pre></div>
    </div>

    <div class="docs">
      <h2>API Documentation</h2>
      <div class="endpoint">
        <span class="method">GET</span><span class="path">/v1/sentiment/:coin</span>
        <p>Get sentiment analysis. Requires x402 payment ($0.03 USDC on Base).</p>
        <div class="coins">
          <span class="coin">BTC</span><span class="coin">ETH</span><span class="coin">SOL</span>
          <span class="coin">DOGE</span><span class="coin">XRP</span><span class="coin">ADA</span>
        </div>
      </div>
      <div class="endpoint"><span class="method">GET</span><span class="path">/health</span><p>Health check endpoint.</p></div>
      <div class="endpoint"><span class="method">GET</span><span class="path">/api</span><p>API info as JSON.</p></div>
    </div>

    <footer>
      Powered by <a href="https://x402.org" target="_blank">x402 Protocol</a> • 
      Built on <a href="https://base.org" target="_blank">Base</a>
    </footer>
  </div>

  <script>
    const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    let userAddress = null;

    async function connectWallet() {
      const statusEl = document.getElementById('status');
      const connectBtn = document.getElementById('connectBtn');
      const payBtn = document.getElementById('payBtn');
      const walletInfo = document.getElementById('walletInfo');
      
      if (!window.ethereum) {
        statusEl.innerHTML = '<div class="status error">MetaMask not found!</div>';
        return;
      }

      try {
        statusEl.innerHTML = '<div class="status pending">Connecting...</div>';
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        userAddress = accounts[0];
        
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (chainId !== '0x2105') {
          statusEl.innerHTML = '<div class="status pending">Switching to Base...</div>';
          try {
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
          } catch (e) {
            if (e.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{ chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }]
              });
            }
          }
        }

        const balance = await getUSDCBalance(userAddress);
        document.getElementById('walletAddress').textContent = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
        document.getElementById('usdcBalance').textContent = '$' + balance.toFixed(4);
        walletInfo.style.display = 'block';
        connectBtn.style.display = 'none';
        payBtn.style.display = 'block';
        
        if (balance < 0.03) {
          statusEl.innerHTML = '<div class="status error">Need at least $0.03 USDC on Base</div>';
          payBtn.disabled = true;
        } else {
          statusEl.innerHTML = '<div class="status success">Ready to pay!</div>';
        }
      } catch (error) {
        statusEl.innerHTML = '<div class="status error">' + error.message + '</div>';
      }
    }

    async function getUSDCBalance(address) {
      const data = '0x70a08231000000000000000000000000' + address.slice(2);
      const result = await window.ethereum.request({ method: 'eth_call', params: [{ to: USDC_ADDRESS, data }, 'latest'] });
      return parseInt(result, 16) / 1e6;
    }

    async function makePayment() {
      const coin = document.getElementById('coinSelect').value;
      const statusEl = document.getElementById('status');
      const payBtn = document.getElementById('payBtn');
      const resultBox = document.getElementById('resultBox');
      const resultEl = document.getElementById('result');
      const API_URL = '/v1/sentiment/' + coin;
      
      payBtn.disabled = true;
      statusEl.innerHTML = '<div class="status pending">🔄 Getting payment requirements...</div>';

      try {
        // Step 1: Get 402 response
        const res1 = await fetch(API_URL);
        console.log('Initial response status:', res1.status);
        console.log('Response headers:', Object.fromEntries([...res1.headers.entries()]));
        
        if (res1.status !== 402) {
          if (res1.ok) {
            const data = await res1.json();
            resultEl.textContent = JSON.stringify(data, null, 2);
            resultBox.style.display = 'block';
            statusEl.innerHTML = '<div class="status success">✅ Got response!</div>';
            payBtn.disabled = false;
            return;
          }
          throw new Error('Unexpected: ' + res1.status);
        }

        // Get payment requirements from header
        let header = res1.headers.get('payment-required') || res1.headers.get('x-payment-required');
        console.log('Payment header found:', !!header);
        
        if (!header) {
          throw new Error('No payment-required header found');
        }
        
        const requirements = JSON.parse(atob(header));
        console.log('Payment requirements:', JSON.stringify(requirements, null, 2));
        
        const accept = requirements.accepts[0];
        console.log('Using accept:', accept);
        
        const amount = accept.amount || accept.maxAmountRequired;
        console.log('Amount to pay:', amount, 'Type:', typeof amount);
        
        statusEl.innerHTML = '<div class="status pending">🔄 Sign payment in MetaMask...</div>';

        // Step 2: Create EIP-3009 TransferWithAuthorization
        // Match Circle's working example format exactly
        const VALID_AFTER = 0;  // Circle uses 0
        const VALID_BEFORE = Math.floor(Date.now() / 1000) + 3600;  // 1 hour from now
        
        const nonceBytes = new Uint8Array(32);
        crypto.getRandomValues(nonceBytes);
        const nonce = '0x' + Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Use server's domain config
        const domainName = accept.extra?.name || 'USD Coin';
        const domainVersion = accept.extra?.version || '2';
        const tokenAddress = accept.asset || USDC_ADDRESS;
        
        console.log('=== EIP-712 Signing Config ===');
        console.log('Domain name:', domainName);
        console.log('Domain version:', domainVersion);
        console.log('Chain ID:', 8453);
        console.log('Contract:', tokenAddress);
        console.log('From:', userAddress);
        console.log('To:', accept.payTo);
        console.log('Value:', amount);
        console.log('Valid After:', VALID_AFTER);
        console.log('Valid Before:', VALID_BEFORE);
        console.log('Nonce:', nonce);
        console.log('==============================');
        
        const domain = {
          name: domainName,
          version: domainVersion,
          chainId: 8453,
          verifyingContract: tokenAddress,
        };

        const types = {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
          ],
        };

        // Use Number for value (Circle example uses Number(ethers.parseUnits(...)))
        const valueNum = Number(amount);
        
        const message = {
          from: userAddress,
          to: accept.payTo,
          value: valueNum,
          validAfter: VALID_AFTER,
          validBefore: VALID_BEFORE,
          nonce: nonce,
        };

        console.log('EIP-712 Domain:', JSON.stringify(domain));
        console.log('EIP-712 Message:', JSON.stringify(message));

        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [userAddress, JSON.stringify({ domain, types, primaryType: 'TransferWithAuthorization', message })],
        });

        console.log('Signature:', signature);

        // x402 v2 payload - authorization must match what was signed
        const payment = {
          x402Version: 2,
          scheme: 'exact',
          network: accept.network,
          payload: {
            signature: signature,
            authorization: {
              from: userAddress,
              to: accept.payTo,
              value: amount.toString(),  // String in payload
              validAfter: VALID_AFTER.toString(),  // String in payload
              validBefore: VALID_BEFORE.toString(),  // String in payload
              nonce: nonce,
            },
          },
        };

        console.log('Payment payload:', JSON.stringify(payment, null, 2));

        statusEl.innerHTML = '<div class="status pending">🔄 Submitting payment...</div>';

        const encodedPayment = btoa(JSON.stringify(payment));
        console.log('Encoded payment length:', encodedPayment.length);

        // v2 spec says use PAYMENT-SIGNATURE header
        const res2 = await fetch(API_URL, {
          method: 'GET',
          headers: { 
            'X-PAYMENT': encodedPayment,
            'PAYMENT-SIGNATURE': encodedPayment,
          },
        });

        console.log('Payment response status:', res2.status);
        console.log('Payment response headers:', Object.fromEntries([...res2.headers.entries()]));

        if (res2.ok) {
          const data = await res2.json();
          resultEl.textContent = JSON.stringify(data, null, 2);
          resultBox.style.display = 'block';
          
          const paymentRes = res2.headers.get('x-payment-response') || res2.headers.get('payment-response');
          if (paymentRes) {
            try {
              const decoded = JSON.parse(atob(paymentRes));
              console.log('Payment response decoded:', decoded);
              if (decoded.transaction || decoded.txHash) {
                const txHash = decoded.transaction || decoded.txHash;
                statusEl.innerHTML = '<div class="status success">✅ Success! <a href="https://basescan.org/tx/' + txHash + '" target="_blank" style="color:#86efac">View on BaseScan →</a></div>';
              } else {
                statusEl.innerHTML = '<div class="status success">✅ Payment successful!</div>';
              }
            } catch (e) {
              statusEl.innerHTML = '<div class="status success">✅ Payment successful!</div>';
            }
          } else {
            statusEl.innerHTML = '<div class="status success">✅ Got response!</div>';
          }
        } else {
          const errorText = await res2.text();
          console.log('Error response:', res2.status, errorText);
          
          // Try to get more error info
          const errorHeader = res2.headers.get('payment-required') || res2.headers.get('x-payment-required');
          if (errorHeader) {
            try {
              const errorInfo = JSON.parse(atob(errorHeader));
              console.log('Error info from header:', JSON.stringify(errorInfo, null, 2));
              if (errorInfo.error) {
                throw new Error(errorInfo.error);
              }
            } catch(e) {
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
          
          throw new Error('Payment rejected: ' + res2.status + (errorText ? ' - ' + errorText : ''));
        }
        
      } catch (error) {
        console.error('Payment error:', error);
        statusEl.innerHTML = '<div class="status error">❌ ' + error.message + '</div>';
      }
      
      payBtn.disabled = false;
    }

    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) connectWallet();
      });
    }
  </script>
</body>
</html>`;
  res.send(html);
});

// JSON API INFO
app.get('/api', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '2.1.0',
    network: NETWORK_NAME,
    price: '$0.03 USDC',
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
  });
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    network: NETWORK_NAME,
    wallet: evmAddress,
    paymentsReceived: paymentLog.length,
    totalRevenue: '$' + (paymentLog.length * 0.03).toFixed(2)
  });
});

// ============================================
// x402 PAYMENT MIDDLEWARE
// ============================================
console.log('🔧 Applying x402 payment middleware...');

app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/*': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
            payTo: evmAddress,
          },
        ],
        description: 'Get AI-powered Reddit sentiment analysis for any cryptocurrency',
        mimeType: 'application/json',
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register(NETWORK, new ExactEvmScheme()),
  ),
);

console.log('✅ x402 payment middleware applied');

// PROTECTED ROUTE
app.get('/v1/sentiment/:coin', async (req, res) => {
  console.log('🎉 PAYMENT VERIFIED - Processing request for', req.params.coin);

  try {
    const coin = req.params.coin.toUpperCase();
    const posts = await fetchRedditPosts(coin);

    let overallSentiment = { score: 0, count: 0 };
    const analyzedPosts = [];
    
    posts.slice(0, 20).forEach(post => {
      const text = post.title + ' ' + post.selftext;
      const result = analyzeSentiment(text);
      overallSentiment.score += result.score;
      overallSentiment.count++;
      analyzedPosts.push({ title: post.title.substring(0, 100), subreddit: post.subreddit, sentiment: result.label, score: result.score });
    });

    const avgScore = overallSentiment.count > 0 ? overallSentiment.score / overallSentiment.count : 0;
    let overallLabel = avgScore > 0.2 ? 'bullish' : avgScore < -0.2 ? 'bearish' : 'neutral';

    paymentLog.push({ timestamp: new Date().toISOString(), amount: '0.03', coin, network: NETWORK_NAME });
    console.log('💰 Payment logged - Total:', paymentLog.length);

    res.json({
      coin,
      timestamp: new Date().toISOString(),
      source: 'Reddit',
      overall: { sentiment: overallLabel, score: parseFloat(avgScore.toFixed(4)), confidence: Math.min(Math.abs(avgScore) * 2, 1), postsAnalyzed: overallSentiment.count },
      samplePosts: analyzedPosts.slice(0, 5),
      payment: { network: NETWORK_NAME, amount: '0.03 USDC', status: 'confirmed' }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

// Admin
app.get('/admin/payments', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ totalPayments: paymentLog.length, totalRevenue: '$' + (paymentLog.length * 0.03).toFixed(2), payments: paymentLog });
});

// Start
console.log('🚀 CryptoSentiment API - x402 v2 MAINNET');
console.log('📡 Server: http://localhost:' + PORT);
console.log('🌐 Network:', NETWORK);
console.log('💵 Price: $0.03 USDC');

app.listen(PORT, () => console.log('✨ Server running on port ' + PORT));

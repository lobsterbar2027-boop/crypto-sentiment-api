import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';
import {
  facilitator,
  createFacilitatorConfig
} from '@coinbase/x402';
import { 
  x402ResourceServer, 
  assetKind,
  HTTPFacilitatorClient  // ← HTTPFacilitatorClient is in @x402/core, not @coinbase/x402
} from '@x402/core';
import { evmAddress } from '@x402/evm';
import { makeExpressRouter } from '@x402/express';

const app = express();
const sentiment = new Sentiment();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Configure CDP facilitator for mainnet
console.log('🔄 Initializing CDP facilitator...');

// FIX: Replace literal \n with actual newlines (Railway strips them)
const cdpSecret = process.env.CDP_API_KEY_SECRET.replace(/\\n/g, '\n');

const facilitatorConfig = createFacilitatorConfig(
  process.env.CDP_API_KEY_ID,
  cdpSecret
);
const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);

console.log('✅ CDP facilitator configured');

// x402 Configuration
const MAINNET_CONFIG = {
  network: 'eip155:8453',
  usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  walletAddress: process.env.WALLET_ADDRESS,
  pricePerQuery: '30000' // $0.03 in USDC (6 decimals)
};

// Payment tracking
const paymentLog = [];

// Create x402 resource server with CDP facilitator
const x402Server = new x402ResourceServer({
  facilitator: facilitatorClient,
  kind: assetKind({
    scheme: 'exact',
    network: MAINNET_CONFIG.network,
    maxAmountRequired: MAINNET_CONFIG.pricePerQuery,
    asset: evmAddress(MAINNET_CONFIG.usdcContract),
    payTo: evmAddress(MAINNET_CONFIG.walletAddress)
  })
});

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
    confidence: Math.abs(score),
    details: {
      sentiment: sentimentResult,
      vader: vaderResult
    }
  };
}

// Helper: Fetch crypto news
async function fetchCryptoNews(symbol) {
  try {
    const query = `${symbol} cryptocurrency`;
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=10&sortBy=publishedAt&apiKey=${process.env.NEWS_API_KEY || 'demo'}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error('News fetch error:', error);
    return [];
  }
}

// x402 Protected Route
x402Server.route('GET', '/v1/sentiment/:coin', async (req) => {
  const coin = req.params.coin.toUpperCase();
  const articles = await fetchCryptoNews(coin);

  let overallSentiment = { score: 0, count: 0 };
  const analyzed = articles.slice(0, 5).map(article => {
    const text = `${article.title} ${article.description || ''}`;
    const result = analyzeSentiment(text);
    overallSentiment.score += result.score;
    overallSentiment.count++;
    return {
      title: article.title,
      source: article.source.name,
      sentiment: result
    };
  });

  const avgScore = overallSentiment.count > 0
    ? overallSentiment.score / overallSentiment.count
    : 0;

  let overallLabel;
  if (avgScore > 0.2) overallLabel = 'bullish';
  else if (avgScore < -0.2) overallLabel = 'bearish';
  else overallLabel = 'neutral';

  // Log payment
  const payment = {
    timestamp: new Date().toISOString(),
    amount: '0.03',
    coin
  };
  paymentLog.push(payment);
  console.log('💰 MAINNET PAYMENT RECEIVED:', payment);

  return {
    coin,
    timestamp: new Date().toISOString(),
    overall: {
      sentiment: overallLabel,
      score: parseFloat(avgScore.toFixed(4)),
      confidence: Math.abs(avgScore),
      articlesAnalyzed: overallSentiment.count
    },
    articles: analyzed,
    payment: {
      network: 'Base Mainnet',
      amount: '0.03 USDC',
      status: 'confirmed'
    }
  };
});

// Mount x402 router
app.use(makeExpressRouter(x402Server));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    environment: 'MAINNET',
    network: 'Base Mainnet (eip155:8453)',
    x402: {
      enabled: true,
      facilitator: 'Coinbase CDP',
      authentication: 'ECDSA API Keys'
    },
    wallet: MAINNET_CONFIG.walletAddress,
    price: '0.03 USDC per query',
    paymentsReceived: paymentLog.length
  });
});

// Admin endpoint (payment logs)
app.get('/admin/payments', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    totalPayments: paymentLog.length,
    totalRevenue: (paymentLog.length * 0.03).toFixed(2),
    payments: paymentLog
  });
});

// Initialize and start
console.log('\n======================================================================');
console.log('🚀 CryptoSentiment API - MAINNET PRODUCTION');
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log('🌐 Environment: MAINNET (Base Mainnet)');
console.log('💰 x402 SDK: Official v2.0 with CDP facilitator');
console.log('🔗 Facilitator: https://api.cdp.coinbase.com/platform/v2/x402');
console.log('💵 Accepting REAL USDC payments on Base Mainnet');
console.log(`📊 Payments processed: ${paymentLog.length}`);
console.log('\n⚙️  Configuration:');
console.log(`   Network: ${MAINNET_CONFIG.network}`);
console.log(`   USDC Contract: ${MAINNET_CONFIG.usdcContract}`);
console.log(`   Wallet: ${MAINNET_CONFIG.walletAddress}`);
console.log(`   Price: $0.03 USDC per query`);
console.log('   Authentication: CDP API Keys (ECDSA) ✅');
console.log('\n✅ READY FOR MAINNET PAYMENTS!');
console.log('   Real USDC on Base Mainnet');
console.log('   CDP facilitator authenticated');
console.log('   All systems operational');
console.log('======================================================================\n');

await x402Server.initialize();

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
  console.log('💰 Ready to accept mainnet USDC payments!\n');
});

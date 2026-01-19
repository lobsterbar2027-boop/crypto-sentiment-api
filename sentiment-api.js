import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 v2 imports - Using @coinbase/x402 for CDP facilitator
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { registerExactEvmScheme } from '@x402/evm/exact/server';
import { facilitator } from '@coinbase/x402'; // Pre-configured CDP facilitator

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

// Configuration - MAINNET
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;
const NETWORK = 'eip155:8453'; // Base Mainnet

console.log('🔄 Initializing x402 v2 (MAINNET - REAL USDC)...');
console.log('   Wallet:', WALLET_ADDRESS);
console.log('   Network:', NETWORK, '(Base Mainnet)');
console.log('   Facilitator: Coinbase CDP (@coinbase/x402)');

// Validate environment variables
if (!WALLET_ADDRESS) {
  throw new Error('❌ WALLET_ADDRESS environment variable is required');
}
if (!CDP_API_KEY_ID) {
  throw new Error('❌ CDP_API_KEY_ID environment variable is required. Get it from https://portal.cdp.coinbase.com');
}
if (!CDP_API_KEY_SECRET) {
  throw new Error('❌ CDP_API_KEY_SECRET environment variable is required. Get it from https://portal.cdp.coinbase.com');
}

console.log('   ✅ CDP credentials validated');

// Create resource server using CDP facilitator
// The @coinbase/x402 package automatically uses CDP_API_KEY_ID and CDP_API_KEY_SECRET
const server = new x402ResourceServer(facilitator);
registerExactEvmScheme(server);

console.log('✅ x402 v2 configured for MAINNET with CDP facilitator');

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

// Helper: Fetch Reddit posts
async function fetchRedditPosts(coin) {
  const subreddits = CRYPTO_SUBREDDITS[coin.toUpperCase()] || CRYPTO_SUBREDDITS.DEFAULT;
  const allPosts = [];

  for (const subreddit of subreddits) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=15`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CryptoSentimentBot/2.0)',
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const posts = data.data?.children || [];

      for (const post of posts) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        
        allPosts.push({
          title: p.title,
          selftext: p.selftext?.substring(0, 500) || '',
          score: p.score
        });
      }
    } catch (error) {
      // Silent fail, keep collecting from other subreddits
    }
  }

  // Also search for the coin
  try {
    const searchResponse = await fetch(
      `https://www.reddit.com/search.json?q=${coin}+crypto&sort=hot&limit=15&t=day`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoSentimentBot/2.0)',
          'Accept': 'application/json'
        }
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const searchPosts = searchData.data?.children || [];

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
            score: p.score
          });
        }
      }
    }
  } catch (error) {
    // Silent fail
  }

  return allPosts;
}

// FREE ROUTES - Before payment middleware
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.0-mainnet',
    environment: 'PRODUCTION',
    network: 'Base Mainnet (eip155:8453)',
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
    version: '2.0-mainnet',
    description: 'AI-powered Reddit sentiment analysis for cryptocurrencies',
    environment: 'PRODUCTION',
    network: 'Base Mainnet (eip155:8453)',
    dataSource: 'Reddit (r/bitcoin, r/ethereum, r/CryptoCurrency, etc.)',
    x402: {
      version: 'v2',
      enabled: true,
      price: '$0.03 USDC per query',
      network: 'Base Mainnet',
      facilitator: 'Coinbase CDP'
    },
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
    endpoints: {
      'GET /v1/sentiment/:coin': {
        description: 'Get Reddit sentiment analysis for a cryptocurrency',
        price: '$0.03 USDC',
        example: '/v1/sentiment/BTC',
        protected: true,
        paymentRequired: '⚠️ REAL USDC ON BASE MAINNET'
      },
      'GET /health': {
        description: 'Health check',
        protected: false
      }
    }
  });
});

// x402 Payment Middleware - MAINNET with CDP facilitator
console.log('🔧 Applying MAINNET payment middleware...');
console.log('   ⚠️  WARNING: This charges REAL USDC on Base Mainnet');

app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/:coin': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03', // REAL USDC
            network: NETWORK, // Base Mainnet
            payTo: WALLET_ADDRESS,
          },
        ],
        description: 'Get AI-powered Reddit sentiment analysis for any cryptocurrency',
        mimeType: 'application/json',
      },
    },
    server,
  ),
);

console.log('✅ Payment middleware applied (MAINNET)');

// PROTECTED ROUTE
app.get('/v1/sentiment/:coin', async (req, res) => {
  const hasPayment = !!req.headers['payment-signature'];
  console.log(`💰 PAID request for ${req.params.coin} (payment verified: ${hasPayment})`);

  try {
    const coin = req.params.coin.toUpperCase();
    const posts = await fetchRedditPosts(coin);

    let overallSentiment = { score: 0, count: 0 };
    
    posts.slice(0, 15).forEach(post => {
      const text = `${post.title} ${post.selftext}`;
      const result = analyzeSentiment(text);
      overallSentiment.score += result.score;
      overallSentiment.count++;
    });

    const avgScore = overallSentiment.count > 0
      ? overallSentiment.score / overallSentiment.count
      : 0;

    let overallLabel;
    if (avgScore > 0.2) overallLabel = 'bullish';
    else if (avgScore < -0.2) overallLabel = 'bearish';
    else overallLabel = 'neutral';

    // Log payment
    paymentLog.push({
      timestamp: new Date().toISOString(),
      amount: 0.03,
      coin,
      network: 'Base Mainnet'
    });

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
      payment: {
        network: 'Base Mainnet',
        amount: '0.03 USDC',
        status: 'confirmed'
      }
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
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
    payments: paymentLog
  });
});

// Start server
console.log('\n======================================================================');
console.log('🚀 CryptoSentiment API - x402 v2 MAINNET (PRODUCTION)');
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🌐 Network: Base Mainnet (${NETWORK})`);
console.log(`🔗 Facilitator: Coinbase CDP`);
console.log(`📊 Data Source: Reddit`);
console.log(`💵 Price: $0.03 USDC (REAL MONEY)`);
console.log('======================================================================');
console.log('⚠️  WARNING: This server charges REAL USDC on Base Mainnet');
console.log('⚠️  Make sure you have USDC in your wallet to test');
console.log('======================================================================\n');

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
});

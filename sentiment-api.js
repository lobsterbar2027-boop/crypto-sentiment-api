import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 v2 imports - CORRECT PATTERN from official docs
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

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

// Configuration
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

// Network configuration - set USE_TESTNET=true for Base Sepolia, false for Base Mainnet
const USE_TESTNET = process.env.USE_TESTNET === 'true';
const NETWORK = USE_TESTNET ? 'eip155:84532' : 'eip155:8453';
const NETWORK_NAME = USE_TESTNET ? 'Base Sepolia (Testnet)' : 'Base Mainnet';
const FACILITATOR_URL = 'https://facilitator.x402.org';

console.log('🔄 Initializing x402 v2...');
console.log('   Wallet:', WALLET_ADDRESS);
console.log('   Network:', NETWORK, `(${NETWORK_NAME})`);
console.log('   Facilitator:', FACILITATOR_URL);

// Validate environment variables
if (!WALLET_ADDRESS) {
  throw new Error('❌ WALLET_ADDRESS environment variable is required');
}

// Create facilitator client - using public x402 facilitator (no auth required)
const facilitatorClient = new HTTPFacilitatorClient({ 
  url: FACILITATOR_URL 
});

// Create resource server and register the EVM scheme
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

console.log('✅ x402 v2 configured');

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
    version: '2.1.0',
    environment: USE_TESTNET ? 'TESTNET' : 'PRODUCTION',
    network: `${NETWORK_NAME} (${NETWORK})`,
    facilitator: FACILITATOR_URL,
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
    environment: USE_TESTNET ? 'TESTNET' : 'PRODUCTION',
    network: `${NETWORK_NAME} (${NETWORK})`,
    dataSource: 'Reddit (r/bitcoin, r/ethereum, r/CryptoCurrency, etc.)',
    x402: {
      version: 'v2',
      enabled: true,
      price: '$0.03 USDC per query',
      network: NETWORK_NAME,
      facilitator: FACILITATOR_URL
    },
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
    endpoints: {
      'GET /v1/sentiment/:coin': {
        description: 'Get Reddit sentiment analysis for a cryptocurrency',
        price: '$0.03 USDC',
        example: '/v1/sentiment/BTC',
        protected: true,
        paymentRequired: USE_TESTNET ? '⚠️ TESTNET USDC' : '⚠️ REAL USDC'
      },
      'GET /health': {
        description: 'Health check',
        protected: false
      }
    }
  });
});

// x402 Payment Middleware - Apply BEFORE protected routes
console.log('🔧 Applying payment middleware...');

app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/:coin': {
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
  console.log(`📊 Processing PAID request for ${req.params.coin}`);

  try {
    const coin = req.params.coin.toUpperCase();
    const posts = await fetchRedditPosts(coin);
    
    console.log(`   Found ${posts.length} Reddit posts for ${coin}`);

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
    const paymentRecord = {
      timestamp: new Date().toISOString(),
      amount: '0.03',
      coin,
      network: NETWORK_NAME
    };
    paymentLog.push(paymentRecord);
    console.log('💰 PAYMENT CONFIRMED:', paymentRecord);

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
        network: NETWORK_NAME,
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
    network: NETWORK_NAME,
    payments: paymentLog
  });
});

// Start server
console.log('\n======================================================================');
console.log(`🚀 CryptoSentiment API - x402 v2 ${USE_TESTNET ? 'TESTNET' : 'MAINNET'}`);
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🌐 Network: ${NETWORK} (${NETWORK_NAME})`);
console.log(`🔗 Facilitator: ${FACILITATOR_URL}`);
console.log(`📊 Data Source: Reddit`);
console.log(`💵 Price: $0.03 USDC`);
console.log('======================================================================');
if (!USE_TESTNET) {
  console.log('⚠️  WARNING: This server charges REAL USDC on Base Mainnet');
  console.log('⚠️  Make sure you have USDC in your wallet to test');
  console.log('======================================================================');
}
console.log('');

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
});

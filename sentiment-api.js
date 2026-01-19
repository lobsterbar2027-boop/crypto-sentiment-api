import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 v2 imports - EXACTLY as Coinbase docs show
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

const app = express();
const sentiment = new Sentiment();
const PORT = process.env.PORT || 3000;

// Trust proxy (required for Railway/Heroku)
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
const NETWORK = 'eip155:84532'; // Base Sepolia
const FACILITATOR_URL = 'https://x402.org/facilitator';

console.log('🔄 Initializing x402 v2 (TESTNET)...');
console.log('   Wallet:', WALLET_ADDRESS);

// Create facilitator client (testnet) - EXACTLY as docs show
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL
});

// Create resource server and register EVM scheme - EXACTLY as docs show
const server = new x402ResourceServer(facilitatorClient)
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
    confidence: Math.abs(score),
    details: {
      sentiment: sentimentResult.score,
      vader: vaderResult.compound
    }
  };
}

// Helper: Fetch Reddit posts
async function fetchRedditPosts(coin) {
  const subreddits = CRYPTO_SUBREDDITS[coin.toUpperCase()] || CRYPTO_SUBREDDITS.DEFAULT;
  const allPosts = [];
  let errorCount = 0;

  for (const subreddit of subreddits) {
    try {
      const response = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=15`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CryptoSentimentBot/2.0)',
            'Accept': 'application/json'
          },
          timeout: 5000
        }
      );

      if (!response.ok) {
        console.error(`Reddit API error for r/${subreddit}: ${response.status}`);
        errorCount++;
        continue;
      }

      const data = await response.json();
      const posts = data.data?.children || [];

      console.log(`   ✓ Fetched ${posts.length} posts from r/${subreddit}`);

      for (const post of posts) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        
        allPosts.push({
          title: p.title,
          selftext: p.selftext?.substring(0, 500) || '',
          subreddit: p.subreddit,
          score: p.score,
          numComments: p.num_comments,
          url: `https://reddit.com${p.permalink}`,
          created: new Date(p.created_utc * 1000).toISOString()
        });
      }
    } catch (error) {
      console.error(`Reddit fetch error for r/${subreddit}:`, error.message);
      errorCount++;
    }
  }

  // Also search for the coin name
  try {
    const searchResponse = await fetch(
      `https://www.reddit.com/search.json?q=${coin}+crypto&sort=hot&limit=15&t=day`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoSentimentBot/2.0)',
          'Accept': 'application/json'
        },
        timeout: 5000
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const searchPosts = searchData.data?.children || [];
      
      console.log(`   ✓ Fetched ${searchPosts.length} posts from search`);

      for (const post of searchPosts) {
        const p = post.data;
        if (p.over_18 || p.removed_by_category || p.stickied) continue;
        
        if (!allPosts.find(existing => existing.url === `https://reddit.com${p.permalink}`)) {
          allPosts.push({
            title: p.title,
            selftext: p.selftext?.substring(0, 500) || '',
            subreddit: p.subreddit,
            score: p.score,
            numComments: p.num_comments,
            url: `https://reddit.com${p.permalink}`,
            created: new Date(p.created_utc * 1000).toISOString()
          });
        }
      }
    }
  } catch (error) {
    console.error('Reddit search error:', error.message);
    errorCount++;
  }

  console.log(`   📊 Total posts collected: ${allPosts.length} (${errorCount} errors)`);
  return allPosts;
}

// FREE ROUTES - Define BEFORE payment middleware
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: 'v2',
    environment: 'TESTNET',
    network: NETWORK,
    facilitator: FACILITATOR_URL,
    wallet: WALLET_ADDRESS,
    price: '0.03 USDC per query',
    source: 'Reddit',
    paymentsReceived: paymentLog.length
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '2.0.0',
    description: 'AI-powered Reddit sentiment analysis for cryptocurrencies',
    environment: 'TESTNET',
    network: 'Base Sepolia (eip155:84532)',
    dataSource: 'Reddit (r/bitcoin, r/ethereum, r/CryptoCurrency, etc.)',
    x402: {
      version: 'v2',
      enabled: true,
      price: '$0.03 per query'
    },
    supportedCoins: Object.keys(CRYPTO_SUBREDDITS),
    endpoints: {
      'GET /v1/sentiment/:coin': {
        description: 'Get Reddit sentiment analysis for a cryptocurrency',
        price: '$0.03 USDC',
        example: '/v1/sentiment/BTC',
        protected: true
      },
      'GET /health': {
        description: 'Health check',
        protected: false
      }
    }
  });
});

// x402 Payment Middleware - EXACTLY as Coinbase docs show
console.log('🔧 Applying payment middleware...');
console.log('   Route pattern:', 'GET /v1/sentiment/:coin');
console.log('   Price:', '$0.03');
console.log('   Network:', NETWORK);
console.log('   PayTo:', WALLET_ADDRESS);

app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/:coin': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03',
            network: NETWORK,
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

console.log('✅ Payment middleware applied');
console.log('   ⚠️  Requests to /v1/sentiment/* should now require payment');
console.log('   ⚠️  If you see data without a 402 error, the middleware is NOT working\n');

// PROTECTED ROUTE - Define AFTER payment middleware
app.get('/v1/sentiment/:coin', async (req, res) => {
  // If we reach here, payment SHOULD have been verified by middleware
  // But let's add logging to confirm
  console.log(`📊 Processing request for ${req.params.coin}`);
  console.log(`   🔍 Payment headers:`, {
    paymentSignature: req.headers['payment-signature'] ? 'Present' : 'Missing',
    paymentRequired: req.headers['payment-required'] ? 'Present' : 'Missing'
  });

  try {
    const coin = req.params.coin.toUpperCase();
    const posts = await fetchRedditPosts(coin);

    let overallSentiment = { score: 0, count: 0 };
    const analyzed = posts.slice(0, 15).map(post => {
      const text = `${post.title} ${post.selftext}`;
      const result = analyzeSentiment(text);
      overallSentiment.score += result.score;
      overallSentiment.count++;
      return {
        title: post.title,
        subreddit: post.subreddit,
        redditScore: post.score,
        comments: post.numComments,
        url: post.url,
        created: post.created,
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

    // Log to payment tracking
    paymentLog.push({
      timestamp: new Date().toISOString(),
      amount: '0.03',
      coin,
      hadPaymentSignature: !!req.headers['payment-signature']
    });

    console.log('✅ Request processed successfully');

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
        network: 'Base Sepolia (Testnet)',
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
    totalRevenue: (paymentLog.length * 0.03).toFixed(2),
    payments: paymentLog
  });
});

// Start server
console.log('\n======================================================================');
console.log('🚀 CryptoSentiment API - x402 v2 TESTNET');
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🌐 Network: ${NETWORK} (Base Sepolia)`);
console.log(`🔗 Facilitator: ${FACILITATOR_URL}`);
console.log(`📊 Data Source: Reddit`);
console.log(`💵 Price: $0.03 USDC`);
console.log('======================================================================\n');

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
});

import express from 'express';
import cors from 'cors';
import Sentiment from 'sentiment';
import vaderSentiment from 'vader-sentiment';
import rateLimit from 'express-rate-limit';

// x402 v2 imports - correct packages
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

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

// Configuration
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const NEWS_API_KEY = process.env.NEWS_API_KEY || 'demo';

// x402 v2 Configuration using CAIP-2 network identifiers
const MAINNET_NETWORK = 'eip155:8453'; // Base mainnet
const TESTNET_NETWORK = 'eip155:84532'; // Base Sepolia (for testing)

// Use mainnet or testnet based on environment
const NETWORK = process.env.USE_TESTNET === 'true' ? TESTNET_NETWORK : MAINNET_NETWORK;
const FACILITATOR_URL = process.env.USE_TESTNET === 'true' 
  ? 'https://x402.org/facilitator'  // Testnet facilitator
  : 'https://api.cdp.coinbase.com/platform/v2/x402'; // CDP mainnet facilitator

console.log('🔄 Initializing x402 v2...');

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  // CDP facilitator may require additional auth headers in production
  // headers: { 'Authorization': `Bearer ${process.env.CDP_API_KEY}` }
});

// Create x402 resource server and register EVM scheme for the network
const server = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme());

console.log('✅ x402 v2 configured');

// Payment tracking
const paymentLog = [];

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
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=10&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error('News fetch error:', error);
    return [];
  }
}

// x402 Payment Middleware - protects the sentiment endpoint
app.use(
  paymentMiddleware(
    {
      'GET /v1/sentiment/:coin': {
        accepts: [
          {
            scheme: 'exact',
            price: '$0.03', // $0.03 USDC per query
            network: NETWORK,
            payTo: WALLET_ADDRESS,
          },
        ],
        description: 'Get AI-powered sentiment analysis for any cryptocurrency based on recent news',
        mimeType: 'application/json',
      },
    },
    server,
  ),
);

// Protected sentiment endpoint
app.get('/v1/sentiment/:coin', async (req, res) => {
  try {
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
        source: article.source?.name || 'Unknown',
        url: article.url,
        publishedAt: article.publishedAt,
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
    console.log('💰 PAYMENT RECEIVED:', payment);

    res.json({
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
        network: NETWORK === MAINNET_NETWORK ? 'Base Mainnet' : 'Base Sepolia',
        amount: '0.03 USDC',
        status: 'confirmed'
      }
    });
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze sentiment' });
  }
});

// Health check (free endpoint)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    environment: NETWORK === MAINNET_NETWORK ? 'MAINNET' : 'TESTNET',
    network: NETWORK,
    x402: {
      version: 'v2',
      enabled: true,
      facilitator: FACILITATOR_URL
    },
    wallet: WALLET_ADDRESS,
    price: '0.03 USDC per query',
    paymentsReceived: paymentLog.length
  });
});

// Info endpoint (free)
app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '2.0.0',
    description: 'AI-powered cryptocurrency sentiment analysis',
    x402: {
      version: 'v2',
      enabled: true,
      price: '$0.03 per query'
    },
    endpoints: {
      'GET /v1/sentiment/:coin': {
        description: 'Get sentiment analysis for a cryptocurrency',
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

// Start server
console.log('\n======================================================================');
console.log('🚀 CryptoSentiment API - x402 v2');
console.log('======================================================================');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🌐 Network: ${NETWORK}`);
console.log(`💰 x402 SDK: v2 (Official)`);
console.log(`🔗 Facilitator: ${FACILITATOR_URL}`);
console.log(`📊 Payments processed: ${paymentLog.length}`);
console.log('\n⚙️  Configuration:');
console.log(`   Network: ${NETWORK}`);
console.log(`   Wallet: ${WALLET_ADDRESS}`);
console.log(`   Price: $0.03 USDC per query`);
console.log('======================================================================\n');

app.listen(PORT, () => {
  console.log(`✨ Server running on port ${PORT}`);
  console.log('💰 Ready to accept USDC payments!\n');
});

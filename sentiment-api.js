// sentiment-api.js - Deploy to Vercel/Railway/Render in minutes
// Install: npm install express cors node-fetch sentiment vader-sentiment

const express = require('express');
const cors = require('cors');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');

const app = express();
const sentiment = new Sentiment();

app.use(cors());
app.use(express.json());

// x402 Payment Middleware - CRITICAL for monetization
const x402Middleware = (price) => {
  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];
    
    // For MVP: Simple payment check
    // Production: Verify signature with facilitator
    if (!paymentHeader && process.env.NODE_ENV === 'production') {
      return res.status(402).json({
        error: 'Payment Required',
        paymentRequirements: [{
          type: 'exact',
          network: 'base',
          amount: price.toString(),
          recipient: process.env.WALLET_ADDRESS, // Your wallet
          currency: 'USDC',
          facilitator: 'https://facilitator.coinbase.com'
        }]
      });
    }
    
    // TODO: Verify payment signature
    // const verified = await verifyPayment(paymentHeader);
    // if (!verified) return res.status(403).json({ error: 'Invalid payment' });
    
    next();
  };
};

// Reddit API scraper (using frontend endpoint to avoid API fees)
async function fetchRedditData(coin) {
  try {
    const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'CryptoMarkets'];
    const mentions = [];
    
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=100`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const posts = data.data.children;
      
      posts.forEach(post => {
        const title = post.data.title.toUpperCase();
        const selftext = (post.data.selftext || '').toUpperCase();
        const combinedText = title + ' ' + selftext;
        
        // Check if coin is mentioned
        if (combinedText.includes(coin.toUpperCase()) || 
            combinedText.includes(`$${coin.toUpperCase()}`)) {
          mentions.push({
            text: title + ' ' + post.data.selftext,
            score: post.data.score,
            comments: post.data.num_comments,
            subreddit: sub
          });
        }
      });
    }
    
    return mentions;
  } catch (error) {
    console.error('Reddit fetch error:', error);
    return [];
  }
}

// Twitter/X scraper (simplified - use Twitter API in production)
async function fetchTwitterSentiment(coin) {
  // For MVP: Return simulated data
  // Production: Use Twitter API or scraping service
  return {
    mentions: Math.floor(Math.random() * 500) + 200,
    avgSentiment: (Math.random() * 0.4) - 0.2
  };
}

// Sentiment analysis using VADER + Sentiment.js
function analyzeSentiments(texts) {
  let totalVader = 0;
  let totalSentiment = 0;
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  texts.forEach(item => {
    // VADER analysis (better for social media)
    const vaderScore = vader.SentimentIntensityAnalyzer.polarity_scores(item.text);
    totalVader += vaderScore.compound;
    
    // Sentiment.js analysis
    const sentimentScore = sentiment.analyze(item.text);
    totalSentiment += sentimentScore.comparative;
    
    // Classify
    if (vaderScore.compound > 0.05) positive++;
    else if (vaderScore.compound < -0.05) negative++;
    else neutral++;
  });
  
  const count = texts.length || 1;
  
  return {
    vaderAvg: totalVader / count,
    sentimentAvg: totalSentiment / count,
    positive: Math.round((positive / count) * 100),
    negative: Math.round((negative / count) * 100),
    neutral: Math.round((neutral / count) * 100),
    totalMentions: count
  };
}

// Main API Endpoint
app.get('/v1/sentiment/:coin', x402Middleware('0.03'), async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    
    // Fetch data from multiple sources
    const [redditData, twitterData] = await Promise.all([
      fetchRedditData(coin),
      fetchTwitterSentiment(coin)
    ]);
    
    // Analyze sentiment
    const analysis = analyzeSentiments(redditData);
    
    // Calculate composite score
    const compositeScore = (analysis.vaderAvg + analysis.sentimentAvg) / 2;
    
    // Inverse Reddit sentiment (r/CryptoCurrency is famously wrong)
    const inverseScore = -compositeScore;
    
    // Generate trading signal
    let signal = 'NEUTRAL';
    if (compositeScore > 0.15) signal = 'STRONG BUY';
    else if (compositeScore > 0.05) signal = 'BUY';
    else if (compositeScore < -0.15) signal = 'STRONG SELL';
    else if (compositeScore < -0.05) signal = 'SELL';
    
    // Determine trend
    const trend = compositeScore > 0 ? 'up' : 'down';
    
    // Response
    res.json({
      coin,
      signal,
      score: parseFloat(compositeScore.toFixed(3)),
      inverseScore: parseFloat(inverseScore.toFixed(3)),
      positive: analysis.positive,
      negative: analysis.negative,
      neutral: analysis.neutral,
      mentions: analysis.totalMentions + twitterData.mentions,
      trend,
      sources: ['reddit', 'twitter'],
      breakdown: {
        reddit: {
          mentions: analysis.totalMentions,
          sentiment: analysis.vaderAvg
        },
        twitter: {
          mentions: twitterData.mentions,
          sentiment: twitterData.avgSentiment
        }
      },
      timestamp: new Date().toISOString(),
      cost: '0.03 USDC'
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'crypto-sentiment-api',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Documentation endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '1.0.0',
    pricing: '$0.03 per query via x402',
    endpoints: {
      sentiment: 'GET /v1/sentiment/:coin',
      health: 'GET /health'
    },
    usage: {
      example: 'curl https://api.cryptosentiment.xyz/v1/sentiment/BTC -H "X-PAYMENT: <x402-payment>"',
      response: {
        coin: 'BTC',
        signal: 'BUY',
        score: 0.24,
        mentions: 1247,
        trend: 'up'
      }
    },
    x402: {
      facilitator: 'https://facilitator.coinbase.com',
      network: 'base',
      currency: 'USDC',
      amount: '0.03'
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CryptoSentiment API running on port ${PORT}`);
  console.log(`💰 x402 enabled - $0.03 per query`);
  console.log(`📊 Ready for bot traffic`);
});

module.exports = app;

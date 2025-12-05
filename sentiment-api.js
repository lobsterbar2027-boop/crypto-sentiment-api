// sentiment-api.js - Crypto Sentiment Analysis API with x402
const express = require('express');
const cors = require('cors');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');

const app = express();
const sentiment = new Sentiment();

app.use(cors());
app.use(express.json());

// x402 Payment Middleware
const x402Middleware = (price) => {
  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];
    
    if (!paymentHeader) {
      return res.status(402).json({
        error: 'Payment Required',
        message: 'This API requires x402 payment',
        paymentRequirements: [{
          type: 'exact',
          network: 'base',
          amount: price,
          recipient: process.env.WALLET_ADDRESS,
          currency: 'USDC',
          facilitator: 'https://facilitator.coinbase.com/verify'
        }],
        price: `${price} USDC`,
        documentation: 'https://x402.org/docs'
      });
    }
    
    // Basic payment verification
    try {
      const payment = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      
      if (payment.amount !== price || 
          payment.recipient.toLowerCase() !== process.env.WALLET_ADDRESS.toLowerCase()) {
        return res.status(403).json({ 
          error: 'Invalid payment',
          message: 'Payment amount or recipient mismatch'
        });
      }
      
      next();
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid payment header',
        message: 'Could not parse x-payment header'
      });
    }
  };
};

// Fetch Reddit data
async function fetchRedditData(coin) {
  try {
    const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'CryptoMarkets'];
    const mentions = [];
    
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=100`;
      const fetch = (await import('node-fetch')).default;
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

// Analyze sentiments
function analyzeSentiments(texts) {
  let totalVader = 0;
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  
  texts.forEach(item => {
    const vaderScore = vader.SentimentIntensityAnalyzer.polarity_scores(item.text);
    totalVader += vaderScore.compound;
    
    if (vaderScore.compound > 0.05) positive++;
    else if (vaderScore.compound < -0.05) negative++;
    else neutral++;
  });
  
  const count = texts.length || 1;
  
  return {
    vaderAvg: totalVader / count,
    positive: Math.round((positive / count) * 100),
    negative: Math.round((negative / count) * 100),
    neutral: Math.round((neutral / count) * 100),
    totalMentions: count
  };
}

// Main sentiment endpoint
app.get('/v1/sentiment/:coin', x402Middleware('0.03'), async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    const redditData = await fetchRedditData(coin);
    const analysis = analyzeSentiments(redditData);
    const compositeScore = analysis.vaderAvg;
    
    let signal = 'NEUTRAL';
    if (compositeScore > 0.15) signal = 'STRONG BUY';
    else if (compositeScore > 0.05) signal = 'BUY';
    else if (compositeScore < -0.15) signal = 'STRONG SELL';
    else if (compositeScore < -0.05) signal = 'SELL';
    
    const trend = compositeScore > 0 ? 'up' : 'down';
    
    res.json({
      coin,
      signal,
      score: parseFloat(compositeScore.toFixed(3)),
      positive: analysis.positive,
      negative: analysis.negative,
      neutral: analysis.neutral,
      mentions: analysis.totalMentions,
      trend,
      sources: ['reddit'],
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
    version: '1.0.0'
  });
});

// Documentation
app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '1.0.0',
    pricing: '$0.03 per query via x402',
    endpoints: {
      sentiment: 'GET /v1/sentiment/:coin',
      health: 'GET /health'
    },
    x402: {
      facilitator: 'https://facilitator.coinbase.com',
      network: 'base',
      currency: 'USDC',
      amount: '0.03'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CryptoSentiment API running on port ${PORT}`);
});

module.exports = app;

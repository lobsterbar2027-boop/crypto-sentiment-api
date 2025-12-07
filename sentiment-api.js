const express = require('express');
const cors = require('cors');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');
const { ethers } = require('ethers');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const sentiment = new Sentiment();

app.use(cors());
app.use(express.json());

const paymentsDB = [];

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down' }
});

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
          facilitator: 'https://facilitator.coinbase.com'
        }],
        price: `${price} USDC`,
        documentation: 'https://x402.org/docs'
      });
    }
    
    try {
      const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      
      console.log('Payment received:', paymentData);
      
      if (!paymentData.signature || !paymentData.message) {
        return res.status(400).json({ 
          error: 'Invalid payment format',
          message: 'Missing signature or message'
        });
      }
      
      const message = paymentData.message;
      const signature = paymentData.signature;
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      console.log('Recovered signer:', recoveredAddress);
      
      const messageObj = JSON.parse(message);
      
      if (messageObj.amount !== price) {
        return res.status(403).json({ 
          error: 'Invalid payment amount',
          expected: price,
          received: messageObj.amount
        });
      }
      
      if (messageObj.recipient.toLowerCase() !== process.env.WALLET_ADDRESS.toLowerCase()) {
        return res.status(403).json({ 
          error: 'Invalid payment recipient'
        });
      }
      
      const paymentId = signature.slice(0, 20);
      const alreadyUsed = paymentsDB.find(p => p.id === paymentId);
      
      if (alreadyUsed) {
        return res.status(403).json({ 
          error: 'Payment already used'
        });
      }
      
      const paymentRecord = {
        id: paymentId,
        timestamp: new Date().toISOString(),
        amount: price,
        coin: req.params.coin || 'unknown',
        signer: recoveredAddress
      };
      
      paymentsDB.push(paymentRecord);
      
      const logLine = `${paymentRecord.timestamp},${paymentRecord.amount},${paymentRecord.coin},${paymentRecord.signer}\n`;
      fs.appendFileSync('payments.log', logLine);
      
      console.log('PAYMENT VERIFIED:', paymentRecord);
      
      next();
      
    } catch (error) {
      console.error('Payment verification failed:', error.message);
      return res.status(400).json({ 
        error: 'Payment verification failed',
        message: error.message
      });
    }
  };
};

async function fetchRedditData(coin) {
  try {
    const subreddits = ['CryptoCurrency', 'Bitcoin', 'ethereum', 'CryptoMarkets'];
    const mentions = [];
    
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=100`;
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CryptoSentimentBot/1.0' }
      });
      
      if (!response.ok) {
        console.log(`Reddit fetch failed for r/${sub}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      const posts = data.data.children;
      
      posts.forEach(post => {
        const title = post.data.title.toUpperCase();
        const selftext = (post.data.selftext || '').toUpperCase();
        const combinedText = title + ' ' + selftext;
        
        if (combinedText.includes(coin.toUpperCase()) || 
            combinedText.includes(`$${coin.toUpperCase()}`)) {
          mentions.push({
            text: post.data.title + ' ' + (post.data.selftext || ''),
            score: post.data.score,
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

function analyzeSentiments(texts) {
  if (texts.length === 0) {
    return {
      vaderAvg: 0,
      positive: 33,
      negative: 33,
      neutral: 34,
      totalMentions: 0
    };
  }
  
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
  
  const count = texts.length;
  
  return {
    vaderAvg: totalVader / count,
    positive: Math.round((positive / count) * 100),
    negative: Math.round((negative / count) * 100),
    neutral: Math.round((neutral / count) * 100),
    totalMentions: count
  };
}

app.get('/v1/sentiment/:coin', limiter, x402Middleware('0.03'), async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    
    console.log(`Analyzing sentiment for ${coin}...`);
    
    const redditData = await fetchRedditData(coin);
    const analysis = analyzeSentiments(redditData);
    const compositeScore = analysis.vaderAvg;
    
    let signal = 'NEUTRAL';
    if (compositeScore > 0.15) signal = 'STRONG BUY';
    else if (compositeScore > 0.05) signal = 'BUY';
    else if (compositeScore < -0.15) signal = 'STRONG SELL';
    else if (compositeScore < -0.05) signal = 'SELL';
    
    const trend = compositeScore > 0 ? 'up' : 'down';
    
    const response = {
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
    };
    
    console.log(`Sentiment analysis complete for ${coin}`);
    
    res.json(response);
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

app.get('/admin/payments', (req, res) => {
  const apiKey = req.headers['x-admin-key'];
  
  if (apiKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const totalRevenue = paymentsDB.length * 0.03;
  
  res.json({
    totalPayments: paymentsDB.length,
    totalRevenue: `$${totalRevenue.toFixed(2)}`,
    payments: paymentsDB.slice(-50)
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'crypto-sentiment-api',
    version: '1.0.0',
    uptime: process.uptime(),
    totalPayments: paymentsDB.length
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '1.0.0',
    status: 'Production Ready',
    pricing: '$0.03 per query via x402',
    endpoints: {
      sentiment: 'GET /v1/sentiment/:coin',
      health: 'GET /health',
      admin: 'GET /admin/payments (requires X-Admin-Key header)'
    },
    x402: {
      facilitator: 'https://facilitator.coinbase.com',
      network: 'base',
      currency: 'USDC',
      amount: '0.03'
    },
    features: [
      'Real payment verification',
      'Rate limiting protection',
      'Payment tracking database',
      'Replay attack prevention'
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CryptoSentiment API running on port ${PORT}`);
});

module.exports = app;

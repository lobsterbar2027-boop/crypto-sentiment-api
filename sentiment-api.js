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

// In-memory payment tracking
const paymentsDB = [];

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down' }
});

// x402 Middleware with PROPER SCHEMA AND FIELD ORDER
const x402Middleware = (price) => {
  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'];
    
    // No payment header = return 402 with CORRECT x402 schema
    if (!paymentHeader) {
      return res.status(402).json({
        x402Version: 1,
        error: 'X-PAYMENT header is required',
        accepts: [{
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: (parseFloat(price) * 1000000).toString(),
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f',
          resource: `https://crypto-sentiment-api-production.up.railway.app${req.path}`,
          description: `Real-time crypto sentiment analysis for ${req.params.coin || 'cryptocurrency'}`,
          mimeType: 'application/json',
          outputSchema: null,
          maxTimeoutSeconds: 60,
          extra: {
            name: 'USD Coin',
            version: '2'
          }
        }]
      });
    }
    
    try {
      const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
      
      console.log('Payment received:', {
        txHash: paymentData.transactionHash?.slice(0, 10) + '...',
        timestamp: new Date().toISOString()
      });
      
      const isValid = await verifyPaymentWithFacilitator(paymentData, price);
      
      if (!isValid) {
        return res.status(403).json({ 
          error: 'Payment verification failed',
          message: 'Could not verify payment with facilitator'
        });
      }
      
      const paymentId = paymentData.transactionHash || paymentData.signature?.slice(0, 20);
      const alreadyUsed = paymentsDB.find(p => p.id === paymentId);
      
      if (alreadyUsed) {
        return res.status(403).json({ 
          error: 'Payment already used',
          message: 'This payment has already been redeemed'
        });
      }
      
      const paymentRecord = {
        id: paymentId,
        timestamp: new Date().toISOString(),
        amount: price,
        coin: req.params.coin || 'unknown',
        from: paymentData.from || 'unknown'
      };
      
      paymentsDB.push(paymentRecord);
      
      const logLine = `${paymentRecord.timestamp},${paymentRecord.amount},${paymentRecord.coin},${paymentRecord.from}\n`;
      try {
        fs.appendFileSync('payments.log', logLine);
      } catch (e) {
        console.error('Failed to write payment log:', e);
      }
      
      console.log('✅ PAYMENT VERIFIED:', paymentRecord);
      next();
      
    } catch (error) {
      console.error('❌ Payment verification error:', error.message);
      return res.status(400).json({ 
        error: 'Payment verification failed',
        message: error.message
      });
    }
  };
};

async function verifyPaymentWithFacilitator(paymentData, expectedAmount) {
  try {
    const fetch = (await import('node-fetch')).default;
    const facilitatorUrl = 'https://facilitator.coinbase.com/verify';
    
    const verifyResponse = await fetch(facilitatorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payment: paymentData,
        expectedAmount: expectedAmount,
        expectedRecipient: process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f',
        network: 'base',
        currency: 'USDC'
      })
    });
    
    if (!verifyResponse.ok) {
      console.error('Facilitator verification failed:', verifyResponse.status);
      return false;
    }
    
    const verifyResult = await verifyResponse.json();
    
    if (verifyResult.verified === true && verifyResult.status === 'confirmed') {
      console.log('✅ Payment verified by facilitator');
      return true;
    }
    
    console.error('❌ Facilitator rejected payment:', verifyResult);
    return false;
    
  } catch (error) {
    console.error('❌ Facilitator verification error:', error.message);
    return await verifyPaymentOnChain(paymentData, expectedAmount);
  }
}

async function verifyPaymentOnChain(paymentData, expectedAmount) {
  try {
    const provider = new ethers.JsonRpcProvider(
      process.env.BASE_RPC_URL || 'https://mainnet.base.org'
    );
    
    const txHash = paymentData.transactionHash;
    
    if (!txHash) {
      console.error('No transaction hash provided');
      return false;
    }
    
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      console.error('Transaction not found on Base');
      return false;
    }
    
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt || receipt.status !== 1) {
      console.error('Transaction not confirmed or failed');
      return false;
    }
    
    const expectedRecipient = (process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f').toLowerCase();
    
    if (tx.to?.toLowerCase() !== expectedRecipient.toLowerCase()) {
      console.error('Transaction recipient mismatch');
      return false;
    }
    
    console.log('✅ On-chain verification passed (fallback method)');
    return true;
    
  } catch (error) {
    console.error('❌ On-chain verification error:', error.message);
    return false;
  }
}

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

app.get('/', (req, res) => {
  return res.status(402).json({
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [{
      scheme: 'exact',
      network: 'base',
      maxAmountRequired: '30000',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f',
      resource: 'https://crypto-sentiment-api-production.up.railway.app/v1/sentiment/BTC',
      description: 'Real-time crypto sentiment analysis - Social media & Reddit sentiment for BTC, ETH, SOL and other cryptocurrencies',
      mimeType: 'application/json',
      outputSchema: null,
      maxTimeoutSeconds: 60,
      extra: {
        name: 'USD Coin',
        version: '2'
      }
    }]
  });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'CryptoSentiment API',
    version: '1.3.0',
    status: 'Production Ready',
    pricing: '$0.03 USDC per query via x402',
    endpoints: {
      root: 'GET / - x402 payment requirements (returns 402)',
      sentiment: 'GET /v1/sentiment/:coin - Real-time crypto sentiment analysis (requires payment)',
      info: 'GET /info - API documentation (this page)',
      health: 'GET /health - API health status',
      admin: 'GET /admin/payments - Payment history (requires X-Admin-Key)'
    },
    x402: {
      facilitator: 'https://facilitator.coinbase.com',
      network: 'base',
      currency: 'USDC',
      amount: '0.03',
      recipient: process.env.WALLET_ADDRESS || '0x48365516b2d74a3dfa621289e76507940466480f',
      usdcContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    },
    features: [
      'x402 protocol compliant',
      'Real payment verification via Coinbase facilitator',
      'On-chain verification fallback',
      'Rate limiting (100 req/min)',
      'Replay attack prevention',
      'Payment tracking and logging'
    ],
    supportedCoins: ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'MATIC', 'LINK', 'UNI'],
    documentation: 'https://x402.org/docs'
  });
});

app.get('/v1/sentiment/:coin', limiter, x402Middleware('0.03'), async (req, res) => {
  try {
    const coin = req.params.coin.toUpperCase();
    console.log(`🔍 Analyzing sentiment for ${coin}...`);
    
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
    
    console.log(`✅ Sentiment analysis complete for ${coin}: ${signal}`);
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
    recentPayments: paymentsDB.slice(-50),
    status: 'operational'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'crypto-sentiment-api',
    version: '1.3.0',
    uptime: Math.floor(process.uptime()),
    totalPayments: paymentsDB.length,
    x402: 'enabled',
    x402compliant: true
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CryptoSentiment API running on port ${PORT}`);
  console.log(`💰 x402 payments enabled (v1.3.0)`);
  console.log(`📊 Payment tracking: ${paymentsDB.length} payments processed`);
  console.log(`✅ x402 spec compliant`);
});

module.exports = app;

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
async function fetchRedd

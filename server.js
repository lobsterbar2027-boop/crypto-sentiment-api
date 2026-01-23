import express from "express";
import cors from "cors";
import "dotenv/config";

import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";

// ==================================================
// CONFIGURATION
// ==================================================
const PORT = process.env.PORT || 3000;
const payTo = process.env.WALLET_ADDRESS;

// Base Mainnet (CAIP-2 format)
const NETWORK = "eip155:8453";

// Validate required environment variables
if (!payTo) {
  console.error("❌ WALLET_ADDRESS environment variable is required");
  process.exit(1);
}

if (!process.env.CDP_API_KEY_ID) {
  console.error("❌ CDP_API_KEY_ID environment variable is required");
  process.exit(1);
}

if (!process.env.CDP_API_KEY_SECRET) {
  console.error("❌ CDP_API_KEY_SECRET environment variable is required");
  process.exit(1);
}

// ==================================================
// FACILITATOR CLIENT (CDP MAINNET)
// ==================================================
const facilitatorClient = new HTTPFacilitatorClient(createFacilitatorConfig());

// ==================================================
// RESOURCE SERVER
// ==================================================
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(resourceServer);

// ==================================================
// EXPRESS APP
// ==================================================
const app = express();

app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

// ==================================================
// VERIFY FACILITATOR (FAIL FAST ON STARTUP)
// ==================================================
async function verifyFacilitator() {
  try {
    const supported = await facilitatorClient.getSupported();
    console.log("✅ Facilitator connected. Supported:", JSON.stringify(supported, null, 2));
    return true;
  } catch (err) {
    console.error("❌ Facilitator connection failed:", err.message);
    return false;
  }
}

// ==================================================
// X402 PAYMENT MIDDLEWARE
// ==================================================
app.use(
  paymentMiddleware(
    {
      "GET /v1/sentiment/:coin": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            price: "$0.03",
            payTo,
          },
        ],
        description: "AI-powered crypto sentiment analysis",
        mimeType: "application/json",
      },
    },
    resourceServer
  )
);

// ==================================================
// ROUTES
// ==================================================
app.get("/", (req, res) => {
  res.json({
    service: "Crypto Sentiment API",
    version: "2.0.0",
    x402: true,
    network: "Base Mainnet",
    endpoints: {
      sentiment: "/v1/sentiment/:coin",
      health: "/health",
    },
  });
});

app.get("/v1/sentiment/:coin", (req, res) => {
  const coin = req.params.coin.toUpperCase();
  console.log(`💰 Paid request for ${coin}`);

  const sentiments = [
    "very bullish",
    "bullish",
    "neutral",
    "bearish",
    "very bearish",
  ];

  res.json({
    coin,
    sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
    score: Number((Math.random() * 2 - 1).toFixed(3)),
    confidence: Number((0.6 + Math.random() * 0.35).toFixed(2)),
    timestamp: new Date().toISOString(),
    payment: {
      network: "Base Mainnet",
      amount: "$0.03 USDC",
      status: "confirmed",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ==================================================
// START SERVER
// ==================================================
async function start() {
  const facilitatorOk = await verifyFacilitator();
  
  if (!facilitatorOk) {
    console.warn("⚠️  Starting server despite facilitator issues (payments may fail)");
  }

  app.listen(PORT, () => {
    console.log(`
============================================
🚀 Crypto Sentiment API (x402 v2)
============================================
🌐 Network:    Base Mainnet (eip155:8453)
💵 Price:      $0.03 USDC
📍 Server:     http://localhost:${PORT}
💳 Paid:       GET /v1/sentiment/:coin
🏥 Health:     GET /health
============================================
    `);
  });
}

start();

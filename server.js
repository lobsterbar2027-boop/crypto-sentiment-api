import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";

// ==================================================
// APP SETUP
// ==================================================
const app = express();
const PORT = process.env.PORT || 3000;
const payTo = process.env.WALLET_ADDRESS;
const NETWORK = "eip155:8453";

if (!payTo) {
  console.error("❌ WALLET_ADDRESS missing");
  process.exit(1);
}

// ==================================================
// FACILITATOR (AUTHENTICATED)
// ==================================================
const facilitatorClient = new HTTPFacilitatorClient(
  createFacilitatorConfig()
);

// ==================================================
// RESOURCE SERVER
// ==================================================
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

// ==================================================
// MIDDLEWARE
// ==================================================
app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

// ==================================================
// VERIFY FACILITATOR SUPPORT (FAIL FAST)
// ==================================================
try {
  const supported = await facilitatorClient.getSupported();
  console.log("✅ Facilitator supports:", supported);
} catch (err) {
  console.error("❌ Facilitator auth failed", err);
  process.exit(1);
}

// ==================================================
// x402 PAYMENT MIDDLEWARE
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
            payTo
          }
        ],
        description: "AI-powered crypto sentiment analysis",
        mimeType: "application/json"
      }
    },
    server
  )
);

// ==================================================
// ROUTES
// ==================================================
app.get("/", (_, res) => {
  res.send("🔮 Crypto Sentiment API (x402 enabled)");
});

app.get("/v1/sentiment/:coin", (req, res) => {
  const coin = req.params.coin.toUpperCase();
  console.log(`💰 Paid request for ${coin}`);

  const sentiments = [
    "very bullish",
    "bullish",
    "neutral",
    "bearish",
    "very bearish"
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
      status: "confirmed"
    }
  });
});

app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

// ==================================================
// START SERVER
// ==================================================
app.listen(PORT, () => {
  console.log(`
============================================
🚀 Crypto Sentiment API (x402 v2)
============================================
🌐 Network: Base Mainnet (eip155:8453)
💵 Price: $0.03 USDC
📍 Server: http://localhost:${PORT}
💳 Paid endpoint: /v1/sentiment/BTC
============================================
`);
});

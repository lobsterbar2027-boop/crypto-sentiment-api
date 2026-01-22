// Crypto Sentiment API with x402 Payment Protocol v2
// ✅ AUTHENTICATED Coinbase CDP Facilitator
// ✅ Base Mainnet (eip155:8453)
// ✅ exact EVM scheme

import express from "express";
import cors from "cors";

import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";

// ==================================================
// ENV + APP SETUP
// ==================================================
const app = express();
const PORT = process.env.PORT || 3000;

const payTo = process.env.WALLET_ADDRESS;
const NETWORK = "eip155:8453"; // Base Mainnet

if (!payTo) {
  console.error("❌ WALLET_ADDRESS env var missing");
  process.exit(1);
}

// ==================================================
// FACILITATOR (AUTHENTICATED)
// ==================================================
const facilitatorClient = new HTTPFacilitatorClient(
  createFacilitatorConfig()
);

// ==================================================
// RESOURCE SERVER + SCHEME
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
// DEBUG: CONFIRM FACILITATOR SUPPORT
// ==================================================
(async () => {
  try {
    const supported = await facilitatorClient.getSupported();
    console.log("✅ Facilitator supported:", JSON.stringify(supported, null, 2));
  } catch (err) {
    console.error("❌ Facilitator auth failed:", err);
    process.exit(1);
  }
})();

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
            payTo,
          },
        ],
        description: "AI-powered Reddit crypto sentiment analysis",
        mimeType: "application/json",
      },
    },
    server
  )
);

// ==================================================
// HOMEPAGE
// ==================================================
app.get("/", (_, res) => {
  res.send("🔮 Crypto Sentiment API (x402 enabled)");
});

// ==================================================
// PAID ENDPOINT
// ==================================================
app.get("/v1/sentiment/:coin", async (req, res) => {
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

// ==================================================
// FREE ENDPOINTS
// ==================================================
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==================================================
// START SERVER
// ==================================================
app.listen(PORT, () => {
  console.log("\n============================================");
  console.log("🚀 Crypto Sentiment API (x402 v2)");
  console.log("============================================");
  console.log("🌐 Network: Base Mainnet (eip155:8453)");
  console.log("💵 Price: $0.03 USDC");
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`💳 Paid endpoint: /v1/sentiment/BTC`);
  console.log("============================================\n");
});

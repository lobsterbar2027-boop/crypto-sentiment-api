import express from "express";
import "dotenv/config";

import {
  createX402Middleware,
  exact
} from "@coinbase/x402/express";

const app = express();

app.use(
  createX402Middleware({
    facilitatorUrl: process.env.FACILITATOR_URL,
    chainId: Number(process.env.CHAIN_ID),
    paymentScheme: exact({
      amount: "1000000000000000", // 0.001 ETH
      asset: "ETH"
    })
  })
);

app.get("/paid", (req, res) => {
  res.json({
    success: true,
    message: "Payment received via x402 ⚡"
  });
});

app.get("/", (req, res) => {
  res.send("x402 server running");
});

app.listen(3000, () => {
  console.log("x402 server running on port 3000");
});

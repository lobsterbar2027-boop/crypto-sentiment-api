import express from "express";
import "dotenv/config";

import { createFacilitatorConfig } from "@coinbase/x402";
import { createExpressMiddleware } from "@x402/http/express";
import { exact } from "@x402/core";

const app = express();

// x402 Express middleware
app.use(
  createExpressMiddleware({
    facilitator: createFacilitatorConfig(),
    routes: [
      {
        method: "GET",
        path: "/paid",
        paymentRequirements: exact({
          asset: "ETH",
          amount: "1000000000000000" // 0.001 ETH
        })
      }
    ]
  })
);

app.get("/", (req, res) => {
  res.send("x402 v2 server running");
});

app.get("/paid", (req, res) => {
  res.json({
    success: true,
    message: "Payment verified & settled via x402 v2"
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

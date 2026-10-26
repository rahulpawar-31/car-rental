import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors";
import express from "express";

// Tiny budget so the limiter trips within the test. Set before the router (and its limiter)
// loads; node --test runs each file in its own process, so this doesn't leak elsewhere.
process.env.JWT_SECRET = "test-secret";
process.env.AUTH_RATE_LIMIT_MAX = "2";

const { default: authRoutes } = await import("../src/routes/auth.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");

describe("auth rate limiting vs validation", () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/auth", authRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("counts requests that fail validation, so malformed spam can't dodge the limiter", async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      statuses.push(res.status);
    }

    assert.deepEqual(statuses, [400, 400, 429]);
  });
});

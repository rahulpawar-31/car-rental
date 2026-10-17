import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { authAttemptLimiter, otpRequestLimiter } from "../src/middleware/rateLimit.middleware.js";
import authRoutes from "../src/routes/auth.routes.js";

async function post(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "POST" }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("auth rate limiters", () => {
  // The limiters are module singletons with in-memory stores, so clear the loopback
  // client between tests to keep them independent.
  afterEach(() => {
    for (const key of ["127.0.0.1", "::ffff:127.0.0.1", "::1"]) {
      authAttemptLimiter.resetKey(key);
      otpRequestLimiter.resetKey(key);
    }
  });

  it("authAttemptLimiter blocks after 10 failed attempts but not before", async () => {
    const app = express();
    app.post("/fail", authAttemptLimiter, (_req, res) => res.status(401).json({}));
    await withServer(app, async (port) => {
      for (let i = 0; i < 10; i++) assert.equal(await post(port, "/fail"), 401);
      assert.equal(await post(port, "/fail"), 429);
    });
  });

  it("authAttemptLimiter does not count successful requests", async () => {
    const app = express();
    app.post("/ok", authAttemptLimiter, (_req, res) => res.json({}));
    await withServer(app, async (port) => {
      for (let i = 0; i < 15; i++) assert.equal(await post(port, "/ok"), 200);
    });
  });

  it("otpRequestLimiter counts every request and blocks after 5", async () => {
    const app = express();
    app.post("/otp", otpRequestLimiter, (_req, res) => res.json({}));
    await withServer(app, async (port) => {
      for (let i = 0; i < 5; i++) assert.equal(await post(port, "/otp"), 200);
      assert.equal(await post(port, "/otp"), 429);
    });
  });

  it("is wired onto the sensitive auth routes", () => {
    const limiterFor = (path) => {
      const layer = authRoutes.stack.find((l) => l.route?.path === path && l.route.methods.post);
      return layer.route.stack.map((s) => s.handle);
    };
    assert.ok(limiterFor("/login").includes(authAttemptLimiter));
    assert.ok(limiterFor("/verify-otp").includes(authAttemptLimiter));
    assert.ok(limiterFor("/reset-password").includes(authAttemptLimiter));
    assert.ok(limiterFor("/forgot-password").includes(otpRequestLimiter));
  });
});

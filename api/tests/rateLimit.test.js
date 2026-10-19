import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import authRouter from "../src/routes/auth.routes.js";
import { authLimiter, otpAccountLimiter, createAuthLimiter, createOtpAccountLimiter } from "../src/middleware/rateLimit.middleware.js";

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn((path, body) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      })
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function appWith(...middleware) {
  const app = express();
  app.use(express.json());
  app.post("/x", ...middleware, (req, res) => res.json({ success: true }));
  return app;
}

describe("createAuthLimiter", () => {
  it("returns 429 with the standard error shape once the limit is exceeded", async () => {
    await withServer(appWith(createAuthLimiter({ max: 2 })), async (post) => {
      assert.equal((await post("/x")).status, 200);
      assert.equal((await post("/x")).status, 200);
      const blocked = await post("/x");
      assert.equal(blocked.status, 429);
      const json = await blocked.json();
      assert.equal(json.success, false);
      assert.equal(typeof json.message, "string");
    });
  });
});

describe("createOtpAccountLimiter", () => {
  it("limits per email, so another email is unaffected and casing doesn't reset the count", async () => {
    await withServer(appWith(createOtpAccountLimiter({ max: 1 })), async (post) => {
      assert.equal((await post("/x", { email: "a@example.com" })).status, 200);
      assert.equal((await post("/x", { email: "A@Example.com" })).status, 429);
      assert.equal((await post("/x", { email: "b@example.com" })).status, 200);
    });
  });
});

describe("auth routes", () => {
  const handlers = (path) =>
    authRouter.stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack.map((s) => s.handle);

  for (const path of ["/login", "/forgot-password", "/verify-otp", "/reset-password"]) {
    it(`run the strict auth limiter first on POST ${path}`, () => {
      assert.equal(handlers(path)[0], authLimiter);
    });
  }

  it("also limits verify-otp per account", () => {
    assert.ok(handlers("/verify-otp").includes(otpAccountLimiter));
  });

  it("leave routes outside the sensitive set without the strict limiter", () => {
    assert.ok(!handlers("/refresh-token").includes(authLimiter));
    assert.ok(!handlers("/register").includes(authLimiter));
  });
});

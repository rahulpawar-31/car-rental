import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import app from "../src/app.js";

describe("app", () => {
  it("exports a configured Express app without binding a port or connecting to a database", () => {
    // Importing src/app.js must be side-effect-free with respect to networking/DB so it
    // can be exercised in isolation (e.g. with a real HTTP request, as below) without a
    // live MongoDB instance. The old src/server.js called app.listen(...) and awaited a
    // real DB connection at module-load time, which made this kind of test impossible.
    assert.equal(typeof app, "function");
    assert.equal(typeof app.listen, "function");
    assert.equal(typeof app.use, "function");
  });

  it("responds to GET /api/health over a real HTTP request", async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const body = await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/api/health`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve({ status: res.statusCode, json: JSON.parse(data) });
              } catch (err) {
                reject(err);
              }
            });
          })
          .on("error", reject);
      });

      assert.equal(body.status, 200);
      assert.equal(body.json.success, true);
      assert.equal(body.json.message, "DriveEase API is running");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("returns a 404 AppError JSON body for an unknown route (notFound + errorHandler wired up)", async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
      const body = await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/api/v1/does-not-exist`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                resolve({ status: res.statusCode, json: JSON.parse(data) });
              } catch (err) {
                reject(err);
              }
            });
          })
          .on("error", reject);
      });

      assert.equal(body.status, 404);
      assert.equal(body.json.success, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  describe("JSON body parsing", () => {
    async function withServer(fn) {
      const server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        await fn(`http://127.0.0.1:${server.address().port}`);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }

    it("rejects a JSON body over the 100kb global limit with a 413", async () => {
      await withServer(async (base) => {
        const res = await fetch(`${base}/api/v1/does-not-exist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pad: "x".repeat(150 * 1024) }),
        });
        assert.equal(res.status, 413);
      });
    });

    it("still captures req.rawBody so a correctly signed Razorpay webhook verifies", async () => {
      const prev = process.env.RAZORPAY_WEBHOOK_SECRET;
      process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
      try {
        await withServer(async (base) => {
          // Not payment.captured, so the handler never touches the database.
          const body = JSON.stringify({ event: "order.paid", payload: {} });
          const signature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest("hex");

          const signed = await fetch(`${base}/api/v1/payments/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature },
            body,
          });
          assert.equal(signed.status, 200);
          assert.deepEqual(await signed.json(), { received: true });

          const forged = await fetch(`${base}/api/v1/payments/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Razorpay-Signature": "0".repeat(64) },
            body,
          });
          assert.equal(forged.status, 400);
        });
      } finally {
        if (prev === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
        else process.env.RAZORPAY_WEBHOOK_SECRET = prev;
      }
    });
  });
});

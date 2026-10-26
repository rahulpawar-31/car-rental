import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";

process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";

const { default: app } = await import("../src/app.js");

async function post(path, body, headers = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("request body limit", () => {
  it("rejects a JSON body over 100kb with 413", async () => {
    const res = await post("/api/v1/nope", JSON.stringify({ blob: "x".repeat(200 * 1024) }));
    assert.equal(res.status, 413);
  });

  it("still accepts a normal-sized JSON body (reaches routing, so 404 for an unknown route)", async () => {
    const res = await post("/api/v1/nope", JSON.stringify({ a: 1 }));
    assert.equal(res.status, 404);
  });

  it("still captures rawBody so the Razorpay webhook signature verifies", async () => {
    const body = JSON.stringify({ event: "ignored.event", payload: {} });
    const signature = crypto.createHmac("sha256", "whsec_test").update(body).digest("hex");
    const res = await post("/api/v1/payments/webhook", body, { "x-razorpay-signature": signature });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
  });

  it("rejects a webhook with a forged signature with 400", async () => {
    const body = JSON.stringify({ event: "ignored.event", payload: {} });
    const res = await post("/api/v1/payments/webhook", body, { "x-razorpay-signature": "0".repeat(64) });
    assert.equal(res.status, 400);
  });
});

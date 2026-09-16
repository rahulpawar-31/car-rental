import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyHmacSignature } from "../src/services/razorpay.js";

function hmac(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

describe("verifyHmacSignature", () => {
  it("returns true when the signature matches the HMAC of the data with the secret", () => {
    const signature = hmac("order_1|pay_1", "shh");
    assert.equal(verifyHmacSignature("order_1|pay_1", "shh", signature), true);
  });

  it("returns false when the signature was computed with a different secret", () => {
    const signature = hmac("order_1|pay_1", "wrong-secret");
    assert.equal(verifyHmacSignature("order_1|pay_1", "shh", signature), false);
  });

  it("returns false when the data doesn't match what was signed", () => {
    const signature = hmac("order_1|pay_1", "shh");
    assert.equal(verifyHmacSignature("order_1|pay_2", "shh", signature), false);
  });

  it("returns false rather than throwing when the signature has a different length than a real digest", () => {
    assert.equal(verifyHmacSignature("order_1|pay_1", "shh", "too-short"), false);
  });

  it("returns false for a missing signature", () => {
    assert.equal(verifyHmacSignature("order_1|pay_1", "shh", undefined), false);
  });
});

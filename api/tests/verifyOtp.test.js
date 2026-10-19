import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-secret";

const { verifyOtp } = await import("../src/controllers/auth.controller.js");
const { default: User } = await import("../src/model/user.model.js");

// A single-document stand-in for the users collection. Each operator below runs
// synchronously, as one Mongo write would, so interleaved requests can't see a stale counter.
let doc;

function matches(filter) {
  if (filter.email && doc.email !== filter.email) return false;
  if (filter._id && doc._id !== filter._id) return false;
  if (filter.otp !== undefined) {
    if (filter.otp?.$ne === null ? doc.otp == null : doc.otp !== filter.otp) return false;
  }
  if (filter.otpExpiry?.$gt && !(doc.otpExpiry > filter.otpExpiry.$gt)) return false;
  if (filter.otpAttempts?.$lt !== undefined && !(doc.otpAttempts < filter.otpAttempts.$lt)) return false;
  return true;
}

function apply(update) {
  if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
  if (update.$set) Object.assign(doc, update.$set);
}

function res() {
  return { body: undefined, json(b) { this.body = b; } };
}

const guess = (otp) => verifyOtp({ body: { email: "a@x.com", otp } }, res());

describe("verifyOtp", () => {
  beforeEach(() => {
    doc = { _id: "u1", email: "a@x.com", otp: "123456", otpExpiry: new Date(Date.now() + 60_000), otpAttempts: 0 };
    mock.method(User, "findOneAndUpdate", (filter, update) => {
      const found = matches(filter);
      const before = { ...doc };
      if (found) apply(update);
      const result = found ? { ...(update.$inc ? doc : before) } : null;
      return { select: async () => result, then: (ok, fail) => Promise.resolve(result).then(ok, fail) };
    });
    mock.method(User, "updateOne", async (filter, update) => {
      if (matches(filter)) apply(update);
    });
  });
  afterEach(() => mock.restoreAll());

  it("returns a reset token for the correct OTP and consumes it", async () => {
    const r = res();
    await verifyOtp({ body: { email: "a@x.com", otp: "123456" } }, r);
    assert.ok(r.body.data.resetToken);
    assert.equal(doc.otp, undefined);
    await assert.rejects(guess("123456"), { statusCode: 400 });
  });

  it("burns the OTP after 5 wrong guesses, so the correct code no longer works", async () => {
    for (let i = 0; i < 5; i++) await assert.rejects(guess("000000"), { statusCode: 400 });
    assert.equal(doc.otp, undefined);
    await assert.rejects(guess("123456"), { statusCode: 400 });
  });

  it("gives a correct guess no chance once 5 parallel wrong guesses have used the budget", async () => {
    const wrong = Array.from({ length: 5 }, (_, i) => guess(`00000${i}`));
    const results = await Promise.allSettled([...wrong, guess("123456")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 0);
    assert.equal(doc.otp, undefined);
  });

  it("lets only one of two parallel correct guesses mint a token", async () => {
    const results = await Promise.allSettled([guess("123456"), guess("123456")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  });

  it("rejects an expired OTP", async () => {
    doc.otpExpiry = new Date(Date.now() - 1000);
    await assert.rejects(guess("123456"), { statusCode: 400 });
  });
});

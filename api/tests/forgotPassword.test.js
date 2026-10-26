import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

process.env.JWT_SECRET = "test-secret";

const { forgotPassword } = await import("../src/controllers/auth.controller.js");
const { default: User } = await import("../src/model/user.model.js");

afterEach(() => mock.restoreAll());

function res() {
  return { statusCode: 200, body: undefined, json(b) { this.body = b; return this; } };
}

describe("forgotPassword", () => {
  it("answers identically whether or not the account exists", async () => {
    mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => {} }));
    const known = { name: "Jane", save: mock.fn(async () => {}) };

    mock.method(User, "findOne", async () => known);
    const knownRes = res();
    await forgotPassword({ body: { email: "jane@example.com" } }, knownRes);

    mock.restoreAll();
    mock.method(User, "findOne", async () => null);
    const unknownRes = res();
    await forgotPassword({ body: { email: "nobody@example.com" } }, unknownRes);

    assert.deepEqual(knownRes.body, unknownRes.body);
    assert.equal(knownRes.statusCode, unknownRes.statusCode);
  });

  it("still issues and saves an OTP for an existing account", async () => {
    const sendMail = mock.fn(async () => {});
    mock.method(nodemailer, "createTransport", () => ({ sendMail }));
    const user = { name: "Jane", save: mock.fn(async () => {}) };
    mock.method(User, "findOne", async () => user);

    await forgotPassword({ body: { email: "jane@example.com" } }, res());

    assert.match(user.otp, /^\d{6}$/);
    assert.equal(user.otpAttempts, 0);
    assert.ok(user.otpExpiry > new Date());
    assert.equal(user.save.mock.callCount(), 1);
    assert.equal(sendMail.mock.callCount(), 1);
  });
});

import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";

process.env.JWT_SECRET = "test-secret";
// The limiters are covered by rateLimit.test.js; keep them out of the way here.
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.OTP_REQUEST_RATE_LIMIT_MAX = "1000";

const { default: User } = await import("../src/model/user.model.js");
const { default: authRoutes } = await import("../src/routes/auth.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { registerBody, loginBody, refreshTokenBody, forgotPasswordBody, verifyOtpBody, resetPasswordBody } = await import(
  "../src/validation/auth.validation.js"
);

const messages = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, "expected the input to be rejected");
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, true, result.error?.issues.map((i) => i.message).join("; "));
  return result.data;
};

describe("auth schemas", () => {
  it("accepts the payloads the web client sends, normalising email and dropping a blank phone", () => {
    const registered = parse(registerBody, { name: "Rahul", email: " Rahul@Example.COM ", phone: "", password: "password1" });
    assert.deepEqual({ ...registered }, { name: "Rahul", email: "rahul@example.com", password: "password1", phone: undefined });
    assert.deepEqual(parse(loginBody, { email: "A@B.com", password: "x" }), { email: "a@b.com", password: "x" });
    assert.deepEqual(parse(forgotPasswordBody, { email: "a@b.com" }), { email: "a@b.com" });
    assert.deepEqual(parse(verifyOtpBody, { email: "a@b.com", otp: "123456" }), { email: "a@b.com", otp: "123456" });
    assert.deepEqual(parse(resetPasswordBody, { resetToken: "a.b.c", password: "newpassword" }), {
      resetToken: "a.b.c",
      password: "newpassword",
    });
    assert.equal(parse(refreshTokenBody, {}).refreshToken, undefined);
  });

  it("strips unknown keys, so a client can't smuggle a role into register", () => {
    const data = parse(registerBody, { name: "R", email: "a@b.com", password: "password1", role: "admin", isVerified: true });
    assert.equal("role" in data, false);
    assert.equal("isVerified" in data, false);
  });

  describe("register", () => {
    const ok = { name: "R", email: "a@b.com", password: "password1" };

    it("requires a valid email, a name and an 8+ character password", () => {
      assert.deepEqual(messages(registerBody, { ...ok, email: "nope" }), ["email: email is not a valid email address"]);
      assert.deepEqual(messages(registerBody, { ...ok, name: "  " }), ["name: name is required"]);
      assert.deepEqual(messages(registerBody, { ...ok, password: "short" }), ["password: password must be at least 8 characters"]);
      assert.deepEqual(messages(registerBody, {}), ["name: name is required", "email: email is required", "password: password is required"]);
    });

    it("rejects operator objects and non-strings", () => {
      assert.ok(messages(registerBody, { ...ok, email: { $ne: null } }).length > 0);
      assert.ok(messages(registerBody, { ...ok, password: 12345678 }).length > 0);
      assert.ok(messages(registerBody, { ...ok, name: ["a"] }).length > 0);
    });

    it("keeps passwords exactly as typed, spaces included", () => {
      assert.equal(parse(registerBody, { ...ok, password: "  spaced pw  " }).password, "  spaced pw  ");
    });

    it("caps password length", () => {
      assert.deepEqual(messages(registerBody, { ...ok, password: "x".repeat(129) }), ["password: password must be at most 128 characters"]);
    });
  });

  describe("login / forgot-password / verify-otp", () => {
    it("only require presence, so a malformed email gets the same generic outcome as an unknown one", () => {
      assert.equal(parse(loginBody, { email: "not-an-email", password: "x" }).email, "not-an-email");
      assert.equal(parse(forgotPasswordBody, { email: "not-an-email" }).email, "not-an-email");
    });

    it("don't apply the password policy at login", () => {
      assert.equal(parse(loginBody, { email: "a@b.com", password: "x" }).password, "x");
    });

    it("reject missing fields and operator objects", () => {
      assert.deepEqual(messages(loginBody, {}), ["email: email is required", "password: password is required"]);
      assert.ok(messages(loginBody, { email: { $ne: null }, password: "x" }).length > 0);
      assert.ok(messages(loginBody, { email: "a@b.com", password: { $ne: null } }).length > 0);
      assert.ok(messages(forgotPasswordBody, { email: { $gt: "" } }).length > 0);
    });
  });

  describe("verify-otp", () => {
    it("requires a 6-digit string", () => {
      for (const otp of ["12345", "1234567", "12345a", "", " 123456", 123456, { $ne: null }]) {
        assert.ok(messages(verifyOtpBody, { email: "a@b.com", otp }).length > 0, JSON.stringify(otp));
      }
      assert.deepEqual(messages(verifyOtpBody, { email: "a@b.com", otp: 123456 }), ["otp: otp must be a 6-digit code"]);
    });
  });

  describe("reset-password", () => {
    it("requires a token and an 8+ character password", () => {
      assert.deepEqual(messages(resetPasswordBody, { password: "newpassword" }), ["resetToken: resetToken is required"]);
      assert.deepEqual(messages(resetPasswordBody, { resetToken: "a.b.c", password: "x" }), ["password: password must be at least 8 characters"]);
    });
  });

  describe("refresh-token", () => {
    it("treats blank/null as absent (the cookie is the normal source)", () => {
      assert.equal(parse(refreshTokenBody, { refreshToken: "" }).refreshToken, undefined);
      assert.equal(parse(refreshTokenBody, { refreshToken: null }).refreshToken, undefined);
    });

    it("rejects a non-string token", () => {
      assert.deepEqual(messages(refreshTokenBody, { refreshToken: { $ne: 1 } }), ["refreshToken: refreshToken must be a string"]);
    });
  });
});

describe("auth routes (over HTTP, no database)", () => {
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

  afterEach(() => mock.restoreAll());

  const post = async (path, body) => {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  // Stubs a User query that ends in .select(): resolves to `result`.
  const userQuery = (method, result) => mock.method(User, method, () => ({ select: async () => result }));

  it("POST /auth/login returns 400 with field errors before any database call", async () => {
    const findOne = mock.method(User, "findOne", () => assert.fail("must not query"));

    const res = await post("/auth/login", { email: { $ne: null }, password: "x" });

    assert.equal(res.status, 400);
    assert.equal(res.json.success, false);
    assert.equal(res.json.errors[0].field, "email");
    assert.equal(findOne.mock.callCount(), 0);
  });

  it("POST /auth/login passes a valid body through, looking the user up by normalised email", async () => {
    const findOne = userQuery("findOne", null);

    const res = await post("/auth/login", { email: "  Someone@Example.com ", password: "whatever" });

    assert.equal(res.status, 401);
    assert.equal(res.json.message, "Invalid email or password");
    assert.deepEqual(findOne.mock.calls[0].arguments[0], { email: "someone@example.com" });
  });

  it("POST /auth/login treats a malformed email like an unknown one (same generic 401)", async () => {
    userQuery("findOne", null);
    const res = await post("/auth/login", { email: "not-an-email", password: "whatever" });
    assert.equal(res.status, 401);
    assert.equal(res.json.message, "Invalid email or password");
  });

  it("POST /auth/register rejects bad input before touching the database", async () => {
    const findOne = mock.method(User, "findOne", () => assert.fail("must not query"));

    assert.equal((await post("/auth/register", { name: "R", email: "nope", password: "password1" })).status, 400);
    assert.equal((await post("/auth/register", { name: "R", email: "a@b.com", password: "short" })).status, 400);
    assert.equal((await post("/auth/register", {})).status, 400);
    assert.equal(findOne.mock.callCount(), 0);
  });

  it("POST /auth/register passes a valid body through (existing email still 409s)", async () => {
    const findOne = mock.method(User, "findOne", async () => ({ _id: "existing" }));

    const res = await post("/auth/register", { name: "R", email: "A@B.com", phone: "", password: "password1" });

    assert.equal(res.status, 409);
    assert.equal(res.json.message, "Email already in use");
    assert.deepEqual(findOne.mock.calls[0].arguments[0], { email: "a@b.com" });
  });

  it("POST /auth/forgot-password answers a malformed email with the same generic 200 as an unknown one", async () => {
    mock.method(User, "findOne", async () => null);

    const unknown = await post("/auth/forgot-password", { email: "nobody@example.com" });
    const malformed = await post("/auth/forgot-password", { email: "not-an-email" });

    assert.equal(unknown.status, 200);
    assert.deepEqual(malformed, unknown);
    assert.equal((await post("/auth/forgot-password", {})).status, 400);
  });

  it("POST /auth/verify-otp rejects a malformed otp without consuming an attempt", async () => {
    const reserve = mock.method(User, "findOneAndUpdate", () => assert.fail("must not query"));

    const res = await post("/auth/verify-otp", { email: "a@b.com", otp: "12" });

    assert.equal(res.status, 400);
    assert.equal(res.json.message, "otp must be a 6-digit code");
    assert.equal(reserve.mock.callCount(), 0);
  });

  it("POST /auth/verify-otp with a well-formed but wrong otp keeps the generic message", async () => {
    userQuery("findOneAndUpdate", null);

    const res = await post("/auth/verify-otp", { email: "a@b.com", otp: "123456" });

    assert.equal(res.status, 400);
    assert.equal(res.json.message, "Invalid or expired OTP");
  });

  it("POST /auth/reset-password rejects a weak password, and a bad token still gets the controller's error", async () => {
    const weak = await post("/auth/reset-password", { resetToken: "a.b.c", password: "short" });
    assert.equal(weak.status, 400);
    assert.equal(weak.json.message, "password must be at least 8 characters");

    const badToken = await post("/auth/reset-password", { resetToken: "a.b.c", password: "newpassword" });
    assert.equal(badToken.status, 400);
    assert.equal(badToken.json.message, "Invalid or expired reset token");
  });

  it("POST /auth/refresh-token rejects a non-string token but still 401s when none is sent", async () => {
    assert.equal((await post("/auth/refresh-token", { refreshToken: { $ne: 1 } })).status, 400);

    const none = await post("/auth/refresh-token", {});
    assert.equal(none.status, 401);
    assert.equal(none.json.message, "Refresh token required");

    const noBody = await post("/auth/refresh-token");
    assert.equal(noBody.status, 401);
  });
});

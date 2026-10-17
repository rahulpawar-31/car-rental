import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { protect, optionalAuth } = await import("../src/middleware/auth.middleware.js");
const { default: User } = await import("../src/model/user.model.js");

function tokenFor(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
}

function stubUser(user) {
  mock.method(User, "findById", () => ({ select: async () => user }));
}

const liveUser = { _id: "u1", isActive: true, changedPasswordAfter: () => false };
const staleUser = { _id: "u1", isActive: true, changedPasswordAfter: () => true };

describe("auth middleware", () => {
  beforeEach(() => mock.restoreAll());
  afterEach(() => mock.restoreAll());

  describe("protect", () => {
    it("rejects a token issued before the last password change", async () => {
      stubUser(staleUser);
      const req = { headers: { authorization: `Bearer ${tokenFor({ id: "u1", role: "user" })}` } };
      await assert.rejects(() => protect(req, {}, () => {}), /Password was recently changed/);
    });

    it("rejects password-reset tokens", async () => {
      stubUser(liveUser);
      const req = { headers: { authorization: `Bearer ${tokenFor({ id: "u1", role: "reset" })}` } };
      await assert.rejects(() => protect(req, {}, () => {}), /Invalid or expired token/);
    });
  });

  describe("optionalAuth", () => {
    it("attaches the user for a valid token", async () => {
      stubUser(liveUser);
      const req = { headers: { authorization: `Bearer ${tokenFor({ id: "u1", role: "user" })}` } };
      let called = false;
      await optionalAuth(req, {}, () => { called = true; });
      assert.equal(req.user, liveUser);
      assert.equal(called, true);
    });

    it("treats a token issued before the last password change as anonymous", async () => {
      stubUser(staleUser);
      const req = { headers: { authorization: `Bearer ${tokenFor({ id: "u1", role: "user" })}` } };
      let called = false;
      await optionalAuth(req, {}, () => { called = true; });
      assert.equal(req.user, undefined);
      assert.equal(called, true);
    });

    it("treats a deactivated user, a reset token and a missing token as anonymous", async () => {
      for (const [user, payload] of [
        [{ ...liveUser, isActive: false }, { id: "u1", role: "user" }],
        [liveUser, { id: "u1", role: "reset" }],
      ]) {
        mock.restoreAll();
        stubUser(user);
        const req = { headers: { authorization: `Bearer ${tokenFor(payload)}` } };
        await optionalAuth(req, {}, () => {});
        assert.equal(req.user, undefined);
      }
      const req = { headers: {} };
      await optionalAuth(req, {}, () => {});
      assert.equal(req.user, undefined);
    });
  });
});

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { protect, optionalAuth } = await import("../src/middleware/auth.middleware.js");
const { default: User } = await import("../src/model/user.model.js");

const NOW = Math.floor(Date.now() / 1000);

function tokenIssuedAt(iat, payload = { id: "u1", role: "user" }) {
  return jwt.sign({ ...payload, iat }, process.env.JWT_SECRET);
}

function fakeUser({ passwordChangedAt, isActive = true } = {}) {
  return new User({ _id: "64b000000000000000000001", isActive, passwordChangedAt });
}

function stubFindById(user) {
  // Behaves like a mongoose Query: awaitable directly, or via .select(...) first. Without
  // .select("+passwordChangedAt") the real model omits that field (select: false).
  mock.method(User, "findById", () => {
    const withoutHiddenField = fakeUser({ isActive: user?.isActive });
    return {
      select: async () => user,
      then: (resolve, reject) => Promise.resolve(withoutHiddenField).then(resolve, reject),
    };
  });
}

function reqWithToken(token) {
  return { headers: { authorization: `Bearer ${token}` }, cookies: {} };
}

describe("optionalAuth", () => {
  beforeEach(() => mock.restoreAll());
  afterEach(() => mock.restoreAll());

  it("attaches the user for a valid token", async () => {
    const user = fakeUser();
    stubFindById(user);
    const req = reqWithToken(tokenIssuedAt(NOW));
    let called = false;
    await optionalAuth(req, {}, () => (called = true));
    assert.equal(called, true);
    assert.equal(req.user, user);
  });

  it("treats a token issued before a password change as anonymous", async () => {
    stubFindById(fakeUser({ passwordChangedAt: new Date((NOW + 60) * 1000) }));
    const req = reqWithToken(tokenIssuedAt(NOW - 3600));
    let called = false;
    await optionalAuth(req, {}, () => (called = true));
    assert.equal(called, true);
    assert.equal(req.user, undefined);
  });

  it("treats an inactive user, a reset token and a missing token as anonymous", async () => {
    stubFindById(fakeUser({ isActive: false }));
    const inactive = reqWithToken(tokenIssuedAt(NOW));
    await optionalAuth(inactive, {}, () => {});
    assert.equal(inactive.user, undefined);

    mock.restoreAll();
    stubFindById(fakeUser());
    const reset = reqWithToken(tokenIssuedAt(NOW, { id: "u1", role: "reset" }));
    await optionalAuth(reset, {}, () => {});
    assert.equal(reset.user, undefined);

    const none = { headers: {}, cookies: {} };
    await optionalAuth(none, {}, () => {});
    assert.equal(none.user, undefined);
  });
});

describe("protect", () => {
  beforeEach(() => mock.restoreAll());
  afterEach(() => mock.restoreAll());

  it("rejects a token issued before a password change", async () => {
    stubFindById(fakeUser({ passwordChangedAt: new Date((NOW + 60) * 1000) }));
    await assert.rejects(
      protect(reqWithToken(tokenIssuedAt(NOW - 3600)), {}, () => {}),
      { statusCode: 401 }
    );
  });

  it("attaches the user for a valid token", async () => {
    const user = fakeUser();
    stubFindById(user);
    const req = reqWithToken(tokenIssuedAt(NOW));
    await protect(req, {}, () => {});
    assert.equal(req.user, user);
  });
});

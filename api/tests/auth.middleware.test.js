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

let selectArgs;

function stubFindById(user) {
  selectArgs = undefined;
  // Behaves like a mongoose Query: awaitable directly, or via .select(...) first. Without
  // .select("+passwordChangedAt") the real model omits that field (select: false).
  mock.method(User, "findById", () => {
    const withoutHiddenField = fakeUser({ isActive: user?.isActive });
    return {
      select: async (fields) => {
        selectArgs = fields;
        return user;
      },
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
    assert.equal(selectArgs, "+passwordChangedAt");
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

describe("optionalAuth with bad credentials", () => {
  beforeEach(() => mock.restoreAll());
  afterEach(() => mock.restoreAll());

  it("treats malformed, wrongly signed and expired tokens, and a deleted user, as anonymous", async () => {
    stubFindById(fakeUser());
    const bad = [
      "not-a-jwt",
      jwt.sign({ id: "u1", role: "user" }, "wrong-secret"),
      jwt.sign({ id: "u1", role: "user", iat: NOW - 7200, exp: NOW - 3600 }, process.env.JWT_SECRET),
    ];
    for (const token of bad) {
      const req = reqWithToken(token);
      let called = false;
      await optionalAuth(req, {}, () => (called = true));
      assert.equal(called, true);
      assert.equal(req.user, undefined);
    }

    mock.restoreAll();
    stubFindById(null);
    const gone = reqWithToken(tokenIssuedAt(NOW));
    await optionalAuth(gone, {}, () => {});
    assert.equal(gone.user, undefined);
  });

  it("skips the user lookup when there is no token", async () => {
    const findById = mock.method(User, "findById", () => {
      throw new Error("should not be called");
    });
    await optionalAuth({ headers: {}, cookies: {} }, {}, () => {});
    assert.equal(findById.mock.callCount(), 0);
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

  it("rejects a reset-role token, a bad signature, an expired token, a deleted user and a missing token", async () => {
    stubFindById(fakeUser());
    const rejected = [
      tokenIssuedAt(NOW, { id: "u1", role: "reset" }),
      jwt.sign({ id: "u1", role: "user" }, "wrong-secret"),
      jwt.sign({ id: "u1", role: "user", iat: NOW - 7200, exp: NOW - 3600 }, process.env.JWT_SECRET),
    ];
    for (const token of rejected) {
      await assert.rejects(protect(reqWithToken(token), {}, () => {}));
    }

    mock.restoreAll();
    stubFindById(null);
    await assert.rejects(protect(reqWithToken(tokenIssuedAt(NOW)), {}, () => {}), { statusCode: 401 });
    await assert.rejects(protect({ headers: {}, cookies: {} }, {}, () => {}), { statusCode: 401 });
  });
});

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { verifyOtp, resetPassword } = await import("../src/controllers/auth.controller.js");
const { default: User } = await import("../src/model/user.model.js");

// A single-document stand-in for the users collection. Each operator runs synchronously, as one
// Mongo write would, so parallel requests can't both see the same grant.
let doc;
let saved;

function matches(filter) {
  if (filter._id && doc._id !== filter._id) return false;
  if (filter.email && doc.email !== filter.email) return false;
  if (filter.otp !== undefined) {
    if (filter.otp?.$ne === null ? doc.otp == null : doc.otp !== filter.otp) return false;
  }
  if (filter.otpExpiry?.$gt && !(doc.otpExpiry > filter.otpExpiry.$gt)) return false;
  if (filter.otpAttempts?.$lt !== undefined && !(doc.otpAttempts < filter.otpAttempts.$lt)) return false;
  if (filter.passwordResetToken !== undefined && doc.passwordResetToken !== filter.passwordResetToken) return false;
  if (filter.passwordResetExpiry?.$gt && !(doc.passwordResetExpiry > filter.passwordResetExpiry.$gt)) return false;
  return true;
}

function apply(update) {
  if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
  if (update.$set) Object.assign(doc, update.$set);
}

const res = () => ({ body: undefined, cleared: [], json(b) { this.body = b; }, clearCookie(n) { this.cleared.push(n); } });

async function issueToken() {
  const r = res();
  await verifyOtp({ body: { email: "a@x.com", otp: "123456" } }, r);
  return r.body.data.resetToken;
}

const reset = (resetToken, password = "newpassword") => {
  const r = res();
  return resetPassword({ body: { resetToken, password } }, r).then(() => r);
};

function freshOtp() {
  Object.assign(doc, { otp: "123456", otpExpiry: new Date(Date.now() + 60_000), otpAttempts: 0 });
}

beforeEach(() => {
  doc = { _id: "u1", email: "a@x.com", otp: "123456", otpExpiry: new Date(Date.now() + 60_000), otpAttempts: 0 };
  saved = [];
  mock.method(User, "findOneAndUpdate", (filter, update) => {
    const found = matches(filter);
    const before = { ...doc };
    if (found) apply(update);
    const result = found ? { ...(update.$inc ? doc : before) } : null;
    if (result && !update.$inc) {
      // The reset path reads back a document it can set the password on and save.
      result.save = async function () {
        saved.push({ password: this.password, passwordChangedAt: this.passwordChangedAt, refreshToken: this.refreshToken });
      };
    }
    return { select: async () => result, then: (ok, fail) => Promise.resolve(result).then(ok, fail) };
  });
  mock.method(User, "updateOne", async (filter, update) => {
    if (matches(filter)) apply(update);
  });
});
afterEach(() => mock.restoreAll());

describe("resetPassword grants", () => {
  it("resets the password once and revokes sessions", async () => {
    const token = await issueToken();

    const r = await reset(token);

    assert.equal(r.body.success, true);
    assert.deepEqual(r.cleared.sort(), ["accessToken", "refreshToken"]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].password, "newpassword");
    assert.ok(saved[0].passwordChangedAt instanceof Date);
    assert.equal(saved[0].refreshToken, undefined);
  });

  it("rejects the same token a second time, even in the same second", async () => {
    const token = await issueToken();

    await reset(token, "passwordA1");
    await assert.rejects(reset(token, "passwordB2"), { statusCode: 400 });

    assert.deepEqual(saved.map((s) => s.password), ["passwordA1"]);
  });

  it("lets only one of two parallel requests with the same token change the password", async () => {
    const token = await issueToken();

    const results = await Promise.allSettled([reset(token, "passwordA1"), reset(token, "passwordB2")]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.statusCode, 400);
    assert.equal(saved.length, 1);
  });

  it("invalidates an older token when a newer one is issued", async () => {
    const older = await issueToken();
    freshOtp();
    const newer = await issueToken();

    await assert.rejects(reset(older), { statusCode: 400 });
    assert.equal(saved.length, 0);
    await reset(newer);
    assert.equal(saved.length, 1);
  });

  it("rejects an expired grant even with a valid signature", async () => {
    const token = await issueToken();
    doc.passwordResetExpiry = new Date(Date.now() - 1000);

    await assert.rejects(reset(token), { statusCode: 400 });
    assert.equal(saved.length, 0);
  });

  it("rejects a validly signed reset token that has no grant", async () => {
    const forged = jwt.sign({ id: "u1", role: "reset" }, process.env.JWT_SECRET, { expiresIn: "10m" });

    await assert.rejects(reset(forged), { statusCode: 400 });
    assert.equal(saved.length, 0);
  });

  it("rejects a token that is not a reset token", async () => {
    const access = jwt.sign({ id: "u1", role: "user", jti: "x" }, process.env.JWT_SECRET, { expiresIn: "10m" });

    await assert.rejects(reset(access), { statusCode: 400 });
  });

  it("gives every issued token its own grant", async () => {
    const first = jwt.decode(await issueToken()).jti;
    freshOtp();
    const second = jwt.decode(await issueToken()).jti;

    assert.match(first, /^[0-9a-f]{32}$/);
    assert.notEqual(first, second);
    assert.equal(doc.passwordResetToken, second);
  });
});

describe("changing the password while logged in spends an outstanding reset grant", () => {
  it("unsets the grant in the same write that changes the password", async () => {
    const user = User.hydrate({
      _id: "64b000000000000000000001",
      name: "A",
      email: "a@x.com",
      password: "old-hash",
      passwordResetToken: "grant-1",
      passwordResetExpiry: new Date(Date.now() + 60_000),
    });
    mock.method(user, "comparePassword", async () => true);
    mock.method(User, "findById", () => ({ select: async () => user }));
    let update;
    mock.method(User.collection, "updateOne", async (_filter, u) => {
      update = u;
      return { matchedCount: 1, modifiedCount: 1 };
    });

    const { changePassword } = await import("../src/controllers/user.controller.js");
    const r = res();
    await changePassword({ user: { _id: user._id }, body: { currentPassword: "old", newPassword: "brand-new-password" } }, r);

    assert.ok("passwordResetToken" in update.$unset, JSON.stringify(update));
    assert.ok("passwordResetExpiry" in update.$unset);
    assert.ok(update.$set.password.startsWith("$2"));
    assert.ok(update.$set.passwordChangedAt);
  });
});

import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { default: User } = await import("../src/model/user.model.js");
const { default: Booking } = await import("../src/model/booking.model.js");
const { default: Review } = await import("../src/model/review.model.js");
const { default: Payment } = await import("../src/model/payment.model.js");
const { default: Coupon } = await import("../src/model/coupon.model.js");
const { default: userRoutes } = await import("../src/routes/user.routes.js");
const { default: contactRoutes } = await import("../src/routes/contact.routes.js");
const { default: adminRoutes } = await import("../src/routes/admin.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const user = await import("../src/validation/user.validation.js");
const contact = await import("../src/validation/contact.validation.js");
const admin = await import("../src/validation/admin.validation.js");

const ID = "64b000000000000000000001";

const issues = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, "expected the input to be rejected");
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, true, result.error?.issues.map((i) => i.message).join("; "));
  return result.data;
};

const coupon = {
  code: "SAVE10", description: "Ten off", type: "percentage", value: 10,
  minBookingAmount: 0, perUserLimit: 1, startDate: "2026-01-01", endDate: "2026-12-31",
};

describe("user schemas", () => {
  it("accepts the Profile page payloads", () => {
    const data = parse(user.updateProfileBody, {
      name: "Rahul", phone: "", address: { street: "", city: "Pune", state: "MH", country: "India", zipCode: "411001" },
    });
    assert.equal(data.phone, "", '"" is kept so a field can be cleared');
    assert.equal(data.address.street, "");
    parse(user.changePasswordBody, { currentPassword: "old", newPassword: "newpassword" });
    parse(user.drivingLicenseBody, { number: "MH12 2020", expiryDate: "2030-01-01" });
  });

  it("profile: drops fields it doesn't own, so role/isActive can't be set from here", () => {
    const data = parse(user.updateProfileBody, { name: "R", role: "admin", isActive: false });
    assert.deepEqual({ ...data }, { name: "R" });
  });

  it("profile: a name, if sent, must not be blank; address must be an object", () => {
    assert.deepEqual(issues(user.updateProfileBody, { name: "  " }), ["name: name is required"]);
    assert.ok(issues(user.updateProfileBody, { address: "x" }).length > 0);
    assert.ok(issues(user.updateProfileBody, { name: { $ne: null } }).length > 0);
  });

  it("change-password: new password needs 8+ characters; the current one is only checked for presence", () => {
    assert.deepEqual(issues(user.changePasswordBody, { currentPassword: "x", newPassword: "short" }), [
      "newPassword: newPassword must be at least 8 characters",
    ]);
    assert.deepEqual(issues(user.changePasswordBody, { newPassword: "newpassword" }), ["currentPassword: currentPassword is required"]);
    assert.equal(parse(user.changePasswordBody, { currentPassword: "x", newPassword: "  spaced pw  " }).newPassword, "  spaced pw  ");
  });

  it("driving licence: both fields optional, blank clears, a bad date is rejected", () => {
    assert.deepEqual({ ...parse(user.drivingLicenseBody, {}) }, {});
    assert.equal(parse(user.drivingLicenseBody, { number: "", expiryDate: "" }).expiryDate, "");
    assert.deepEqual(issues(user.drivingLicenseBody, { expiryDate: "not-a-date" }), ["expiryDate: expiryDate is not a valid date"]);
  });

  it("saved car / location need valid ids", () => {
    assert.deepEqual(issues(user.savedCarParams, { carId: "nope" }), ["carId: carId is not a valid id"]);
    assert.deepEqual(issues(user.savedLocationParams, { locationId: { $ne: 1 } }).length > 0, true);
  });
});

describe("contact schema", () => {
  const ok = { name: "A", email: "a@b.com", subject: "Hello", message: "Hi there" };

  it("accepts a normal submission", () => {
    assert.deepEqual({ ...parse(contact.submitContactBody, ok) }, ok);
  });

  it("requires every field and a valid email", () => {
    assert.deepEqual(issues(contact.submitContactBody, {}).map((m) => m.split(":")[0]), ["name", "email", "subject", "message"]);
    assert.deepEqual(issues(contact.submitContactBody, { ...ok, email: "nope" }), ["email: email is not a valid email address"]);
  });

  it("rejects a multi-line subject, which would end up in an email header", () => {
    assert.deepEqual(issues(contact.submitContactBody, { ...ok, subject: "Hi\r\nBcc: victim@example.com" }), ["subject: subject must be a single line"]);
  });

  it("caps field lengths", () => {
    assert.ok(issues(contact.submitContactBody, { ...ok, message: "x".repeat(5001) })[0].startsWith("message:"));
    assert.ok(issues(contact.submitContactBody, { ...ok, name: "x".repeat(101) })[0].startsWith("name:"));
    assert.ok(issues(contact.submitContactBody, { ...ok, subject: "x".repeat(201) })[0].startsWith("subject:"));
  });
});

describe("admin list schemas", () => {
  it("default to 20 rows per page, as the controllers always did", () => {
    for (const schema of [admin.listUsersQuery, admin.listAdminBookingsQuery, admin.listAdminPaymentsQuery, admin.listAdminReviewsQuery]) {
      assert.deepEqual({ ...parse(schema, {}) }, { page: 1, limit: 20 });
    }
  });

  it("allow the page sizes the admin UI asks for (50, 200) and cap at 200", () => {
    assert.equal(parse(admin.listAdminBookingsQuery, { limit: "200", status: "confirmed" }).limit, 200);
    assert.equal(parse(admin.listAdminPaymentsQuery, { limit: "50" }).limit, 50);
    assert.deepEqual(issues(admin.listAdminBookingsQuery, { limit: "201" }), ["limit: limit must be at most 200"]);
    assert.ok(issues(admin.listUsersQuery, { page: "0" }).length > 0);
  });

  it("keep active as the string the controller compares with", () => {
    assert.equal(parse(admin.listUsersQuery, { active: "false" }).active, "false");
    assert.ok(issues(admin.listUsersQuery, { active: "maybe" }).length > 0);
    assert.equal(parse(admin.listCouponsQuery, { active: "true" }).active, "true");
  });

  it("restrict enum filters and reject object-valued ones", () => {
    assert.ok(issues(admin.listUsersQuery, { role: "superuser" })[0].startsWith("role: role must be one of"));
    assert.ok(issues(admin.listUsersQuery, { role: { $ne: "x" } }).length > 0);
    assert.ok(issues(admin.listAdminBookingsQuery, { status: "teleported" }).length > 0);
    assert.ok(issues(admin.listAdminPaymentsQuery, { status: "weird" })[0].includes("succeeded"));
    assert.ok(issues(admin.listAdminReviewsQuery, { status: "all" }).length > 0);
    parse(admin.listAdminReviewsQuery, { status: "pending" });
  });
});

describe("admin body schemas", () => {
  it("booking status: optional status from the model's enum, note can be cleared", () => {
    assert.equal(parse(admin.updateBookingStatusBody, { status: "confirmed" }).status, "confirmed");
    assert.equal(parse(admin.updateBookingStatusBody, { adminNotes: "" }).adminNotes, "");
    assert.ok(issues(admin.updateBookingStatusBody, { status: "teleported" })[0].startsWith("status: status must be one of"));
  });

  it("review moderation: approved must be a real boolean", () => {
    assert.equal(parse(admin.moderateReviewBody, { approved: false }).approved, false);
    for (const approved of [undefined, "yes", 1, null]) {
      assert.deepEqual(issues(admin.moderateReviewBody, { approved }), ["approved: approved must be true or false"], String(approved));
    }
  });

  describe("coupons", () => {
    it("accepts the admin form's create and update payloads", () => {
      parse(admin.createCouponBody, { ...coupon, maxDiscountAmount: undefined, usageLimit: undefined });
      parse(admin.updateCouponBody, { description: "d", value: 20, minBookingAmount: 0, perUserLimit: 1, startDate: "2026-01-01", endDate: "2026-12-31" });
      assert.deepEqual({ ...parse(admin.updateCouponBody, { isActive: false }) }, { isActive: false });
    });

    it("only keeps known fields, so usageCount/usedBy/createdBy can't be set through the API", () => {
      const data = parse(admin.createCouponBody, { ...coupon, usageCount: 5, usedBy: [ID], createdBy: ID });
      for (const key of ["usageCount", "usedBy", "createdBy"]) assert.equal(key in data, false, key);
      assert.deepEqual({ ...parse(admin.updateCouponBody, { usageCount: 0, usedBy: [], isActive: true }) }, { isActive: true });
    });

    it("requires the model's required fields on create", () => {
      assert.deepEqual(issues(admin.createCouponBody, {}).map((m) => m.split(":")[0]), ["code", "description", "type", "value", "startDate", "endDate"]);
    });

    it("caps a percentage coupon at 100 but lets a fixed one exceed it", () => {
      assert.deepEqual(issues(admin.createCouponBody, { ...coupon, value: 150 }), ["value: value must be at most 100 for a percentage coupon"]);
      parse(admin.createCouponBody, { ...coupon, type: "fixed", value: 150 });
      assert.ok(issues(admin.updateCouponBody, { type: "percentage", value: 500 }).length > 0);
      parse(admin.updateCouponBody, { value: 500 }); // type unknown on a partial update: left to the model
    });

    it("rejects an end date before the start date, but allows a one-day coupon", () => {
      assert.deepEqual(issues(admin.createCouponBody, { ...coupon, startDate: "2026-12-31", endDate: "2026-01-01" }), [
        "endDate: endDate must not be before startDate",
      ]);
      parse(admin.createCouponBody, { ...coupon, startDate: "2026-05-05", endDate: "2026-05-05" });
    });

    it("rejects non-positive values, unknown types and operator objects", () => {
      assert.ok(issues(admin.createCouponBody, { ...coupon, value: 0 }).length > 0);
      assert.ok(issues(admin.createCouponBody, { ...coupon, value: { $gt: 0 } }).length > 0);
      assert.ok(issues(admin.createCouponBody, { ...coupon, type: "bogo" })[0].startsWith("type: type must be one of"));
      assert.ok(issues(admin.createCouponBody, { ...coupon, perUserLimit: 0 }).length > 0);
    });
  });
});

describe("user / contact / admin routes (over HTTP, auth stubbed, no database)", () => {
  let server;
  let base;
  let token;
  const stubs = [];

  const stub = (model, method, impl) => {
    const m = mock.method(model, method, impl);
    stubs.push(m);
    return m;
  };
  const fail = (what) => () => assert.fail(`${what} must not be called`);
  const chain = (result) => {
    const q = {
      populate: () => q, sort: () => q, skip: () => q, limit: () => q, select: () => q, lean: () => q,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return q;
  };

  before(async () => {
    // The auth middleware's lookup. Controllers that call User.findById are stubbed per test.
    mock.method(User, "findById", () => ({ select: async () => new User({ _id: ID, isActive: true, role: "admin" }) }));
    token = jwt.sign({ id: ID, role: "admin" }, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json());
    app.use("/users", userRoutes);
    app.use("/contact", contactRoutes);
    app.use("/admin", adminRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    while (stubs.length) stubs.pop().mock.restore();
  });

  const call = async (method, path, body, { auth = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(auth && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  describe("users", () => {
    it("PATCH /users/profile rejects a blank name, and passes a valid update through", async () => {
      const update = stub(User, "findByIdAndUpdate", async () => ({ _id: ID }));

      assert.equal((await call("PATCH", "/users/profile", { name: "" })).status, 400);
      assert.equal(update.mock.callCount(), 0);

      const res = await call("PATCH", "/users/profile", { name: "Rahul", phone: "", role: "admin" });
      assert.equal(res.status, 200);
      const set = update.mock.calls[0].arguments[1];
      assert.equal(set.name, "Rahul");
      assert.equal(set.phone, "");
      assert.equal("role" in set, false);
    });

    it("PATCH /users/change-password rejects a weak new password before comparing anything", async () => {
      const compare = stub(User.prototype, "comparePassword", fail("comparePassword"));
      const res = await call("PATCH", "/users/change-password", { currentPassword: "x", newPassword: "short" });
      assert.equal(res.status, 400);
      assert.equal(res.json.message, "newPassword must be at least 8 characters");
      assert.equal(compare.mock.callCount(), 0);
    });

    it("PATCH /users/change-password passes a valid body to the controller (wrong current password still 401s)", async () => {
      stub(User.prototype, "comparePassword", async () => false);
      const res = await call("PATCH", "/users/change-password", { currentPassword: "wrong", newPassword: "newpassword" });
      assert.equal(res.status, 401);
      assert.equal(res.json.message, "Current password is incorrect");
    });

    it("GET /users/rental-history rejects an unknown status and an oversized page", async () => {
      stub(Booking, "find", fail("Booking.find"));
      assert.equal((await call("GET", "/users/rental-history?status=bogus")).status, 400);
      assert.equal((await call("GET", "/users/rental-history?limit=5000")).status, 400);
    });

    it("GET /users/rental-history passes a valid query through", async () => {
      const find = stub(Booking, "find", () => chain([]));
      stub(Booking, "countDocuments", async () => 0);
      const res = await call("GET", "/users/rental-history?status=completed&page=2&limit=5");
      assert.equal(res.status, 200);
      assert.equal(find.mock.calls[0].arguments[0].status, "completed");
      assert.deepEqual(res.json.data.pagination, { page: 2, limit: 5, total: 0, pages: 0 });
    });

    it("POST /users/save-car and save-location reject malformed ids", async () => {
      assert.equal((await call("POST", "/users/save-car/not-an-id")).status, 400);
      assert.equal((await call("POST", "/users/save-location/not-an-id")).status, 400);
    });

    it("POST /users/save-car/:carId passes a valid id through", async () => {
      // Works for both the auth middleware (.select()) and the controller (awaited directly).
      const doc = new User({ _id: ID, isActive: true, role: "admin", savedCars: [] });
      stub(User, "findById", () => ({ select: async () => doc, then: (resolve) => resolve(doc) }));
      stub(User.prototype, "save", async function () { return this; });
      const res = await call("POST", `/users/save-car/${ID}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.saved, true);
    });

    it("PATCH /users/driving-license rejects a bad date and passes a valid one through", async () => {
      const update = stub(User, "findByIdAndUpdate", async () => ({ drivingLicense: { number: "MH12" } }));

      assert.equal((await call("PATCH", "/users/driving-license", { number: "MH12", expiryDate: "not-a-date" })).status, 400);
      assert.equal(update.mock.callCount(), 0);

      const res = await call("PATCH", "/users/driving-license", { number: "MH12", expiryDate: "2030-01-01" });
      assert.equal(res.status, 200);
      assert.equal(update.mock.calls[0].arguments[1]["drivingLicense.expiryDate"], "2030-01-01");
    });
  });

  describe("contact", () => {
    const ok = { name: "A", email: "a@b.com", subject: "Hello", message: "Hi there" };

    it("POST /contact rejects bad input before sending anything", async () => {
      assert.equal((await call("POST", "/contact", { ...ok, email: "nope" }, { auth: false })).status, 400);
      assert.equal((await call("POST", "/contact", { ...ok, subject: "Hi\nBcc: x@y.com" }, { auth: false })).status, 400);
      assert.equal((await call("POST", "/contact", { ...ok, message: "x".repeat(5001) }, { auth: false })).status, 400);
      assert.equal((await call("POST", "/contact", {}, { auth: false })).status, 400);
    });

    it("POST /contact still reaches the controller for a valid public submission", async () => {
      // With no admin address configured the controller answers 500 before any mail is sent,
      // which proves the body got past validation without needing an SMTP server.
      const saved = { ...process.env };
      for (const key of ["SMTP_FROM", "EMAIL_FROM", "EMAIL_USER"]) delete process.env[key];
      try {
        const res = await call("POST", "/contact", ok, { auth: false });
        assert.equal(res.status, 500);
        assert.equal(res.json.message, "Admin email is not configured");
      } finally {
        Object.assign(process.env, saved);
      }
    });
  });

  describe("admin", () => {
    it("GET /admin/users defaults to 20 per page and filters through", async () => {
      const find = stub(User, "find", () => chain([]));
      stub(User, "countDocuments", async () => 0);

      const res = await call("GET", "/admin/users?role=user&active=false");

      assert.equal(res.status, 200);
      assert.equal(res.json.data.pagination.limit, 20);
      assert.deepEqual(find.mock.calls[0].arguments[0], { role: "user", isActive: false });
    });

    it("admin lists reject bad filters before querying", async () => {
      stub(User, "find", fail("User.find"));
      stub(Booking, "find", fail("Booking.find"));
      stub(Payment, "find", fail("Payment.find"));
      stub(Review, "find", fail("Review.find"));
      stub(Coupon, "find", fail("Coupon.find"));

      assert.equal((await call("GET", "/admin/users?role=superuser")).status, 400);
      assert.equal((await call("GET", "/admin/users?limit=201")).status, 400);
      assert.equal((await call("GET", "/admin/bookings?status=teleported")).status, 400);
      assert.equal((await call("GET", "/admin/payments?status=weird")).status, 400);
      assert.equal((await call("GET", "/admin/reviews?status=all")).status, 400);
      assert.equal((await call("GET", "/admin/coupons?active=maybe")).status, 400);
    });

    it("GET /admin/reviews passes the UI's default filter through", async () => {
      const find = stub(Review, "find", () => chain([]));
      stub(Review, "countDocuments", async () => 0);
      const res = await call("GET", "/admin/reviews?status=pending");
      assert.equal(res.status, 200);
      assert.deepEqual(find.mock.calls[0].arguments[0], { isApproved: false });
    });

    it("PATCH /admin/bookings/:id/status rejects a bad id or status, and a valid transition still works", async () => {
      assert.equal((await call("PATCH", "/admin/bookings/not-an-id/status", { status: "confirmed" })).status, 400);
      assert.equal((await call("PATCH", `/admin/bookings/${ID}/status`, { status: "teleported" })).status, 400);

      const booking = { status: "pending", save: mock.fn(async () => {}) };
      stub(Booking, "findById", async () => booking);
      const res = await call("PATCH", `/admin/bookings/${ID}/status`, { status: "confirmed", adminNotes: "ok" });
      assert.equal(res.status, 200);
      assert.equal(booking.status, "confirmed");
      assert.equal(booking.adminNotes, "ok");
    });

    it("PATCH /admin/reviews/:id/moderate requires a real boolean", async () => {
      const update = stub(Review, "findByIdAndUpdate", async () => ({ _id: ID }));

      assert.equal((await call("PATCH", `/admin/reviews/${ID}/moderate`, {})).status, 400);
      assert.equal((await call("PATCH", `/admin/reviews/${ID}/moderate`, { approved: "yes" })).status, 400);
      assert.equal(update.mock.callCount(), 0);

      const res = await call("PATCH", `/admin/reviews/${ID}/moderate`, { approved: true });
      assert.equal(res.status, 200);
      assert.equal(update.mock.calls[0].arguments[1].isApproved, true);
    });

    it("POST /admin/coupons rejects invalid coupons before creating anything", async () => {
      const create = stub(Coupon, "create", fail("Coupon.create"));
      assert.equal((await call("POST", "/admin/coupons", {})).status, 400);
      assert.equal((await call("POST", "/admin/coupons", { ...coupon, value: 150 })).status, 400);
      assert.equal((await call("POST", "/admin/coupons", { ...coupon, startDate: "2026-12-31", endDate: "2026-01-01" })).status, 400);
      assert.equal(create.mock.callCount(), 0);
    });

    it("POST /admin/coupons creates with only known fields, and sets createdBy from the session", async () => {
      const create = stub(Coupon, "create", async (doc) => ({ _id: "c1", ...doc }));

      const res = await call("POST", "/admin/coupons", { ...coupon, usageCount: 99, usedBy: [ID], createdBy: "someone-else" });

      assert.equal(res.status, 201);
      const doc = create.mock.calls[0].arguments[0];
      assert.equal("usageCount" in doc, false);
      assert.equal("usedBy" in doc, false);
      assert.equal(String(doc.createdBy), ID, "createdBy comes from the authenticated user, never the body");
    });

    it("PATCH /admin/coupons/:id can toggle isActive but not touch the usage counters", async () => {
      const update = stub(Coupon, "findByIdAndUpdate", async () => ({ _id: ID }));

      const res = await call("PATCH", `/admin/coupons/${ID}`, { isActive: false, usageCount: 0, usedBy: [] });

      assert.equal(res.status, 200);
      assert.deepEqual(update.mock.calls[0].arguments[1], { isActive: false });
      assert.equal((await call("PATCH", "/admin/coupons/not-an-id", { isActive: true })).status, 400);
    });

    it("DELETE /admin/coupons/:id and PATCH users/:id/toggle-status reject malformed ids", async () => {
      stub(Coupon, "findByIdAndDelete", fail("Coupon.findByIdAndDelete"));
      assert.equal((await call("DELETE", "/admin/coupons/not-an-id")).status, 400);
      assert.equal((await call("PATCH", "/admin/users/not-an-id/toggle-status")).status, 400);
    });
  });
});

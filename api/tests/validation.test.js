import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";

const { default: User } = await import("../src/model/user.model.js");
const { default: bookingRoutes } = await import("../src/routes/booking.routes.js");
const { default: paymentRoutes } = await import("../src/routes/payment.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { validate } = await import("../src/middleware/validate.middleware.js");
const { createBookingBody, applyCouponBody, listBookingsQuery } = await import(
  "../src/validation/booking.validation.js"
);
const { confirmPaymentBody, refundBody } = await import("../src/validation/payment.validation.js");

const ID = "64b000000000000000000001";

describe("booking schemas", () => {
  const valid = { carId: ID, pickupDate: "2030-01-01", dropDate: "2030-01-03" };

  it("accepts the payload the web client sends and drops fields the model doesn't store", () => {
    const parsed = createBookingBody.parse({
      ...valid,
      rentalType: "hour",
      totalHours: "5",
      couponCode: "SAVE10",
      notes: "hi",
      driverDetails: { name: "Jane", email: "j@x.com", phone: "999" },
      pickupLocationId: ID,
      isAdmin: true,
    });
    assert.equal(parsed.totalHours, 5);
    assert.deepEqual(parsed.driverDetails, { name: "Jane", phone: "999" });
    assert.equal("isAdmin" in parsed, false);
  });

  it("rejects an operator object where an id is expected (NoSQL injection)", () => {
    const result = createBookingBody.safeParse({ ...valid, carId: { $ne: null } });
    assert.equal(result.success, false);
  });

  it("rejects missing dates, bad ids, bad rentalType and non-positive hours", () => {
    for (const bad of [
      { carId: ID, dropDate: "2030-01-03" },
      { ...valid, carId: "not-an-id" },
      { ...valid, rentalType: "weekly" },
      { ...valid, rentalType: "hour", totalHours: 0 },
    ]) {
      assert.equal(createBookingBody.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });

  it("allows applyCoupon without dropDate/rentalType (hourly callers and older clients)", () => {
    assert.equal(applyCouponBody.safeParse({ code: "X", carId: ID, pickupDate: "2030-01-01" }).success, true);
  });

  it("treats null and empty string on optional fields as not provided", () => {
    const parsed = createBookingBody.parse({
      ...valid,
      pickupLocationId: null,
      dropLocationId: "",
      couponCode: null,
      notes: "",
      driverDetails: null,
      rentalType: null,
      totalHours: "",
    });
    for (const key of ["pickupLocationId", "dropLocationId", "couponCode", "notes", "driverDetails", "rentalType", "totalHours"]) {
      assert.equal(parsed[key], undefined, key);
    }
    assert.equal(applyCouponBody.safeParse({ code: "X", carId: ID, pickupDate: "2030-01-01", dropDate: null, rentalType: "", totalHours: null }).success, true);
  });

  it("rejects dates that do not parse, but accepts timestamps", () => {
    for (const field of ["pickupDate", "dropDate"]) {
      assert.equal(createBookingBody.safeParse({ ...valid, [field]: "not-a-date" }).success, false, field);
    }
    assert.equal(applyCouponBody.safeParse({ code: "X", carId: ID, pickupDate: "not-a-date" }).success, false);
    assert.equal(applyCouponBody.safeParse({ code: "X", carId: ID, pickupDate: "2030-01-01", dropDate: "nope" }).success, false);
    assert.equal(createBookingBody.safeParse({ ...valid, pickupDate: 1893456000000 }).success, true);
  });

  it("validates driverDetails.licenseExpiry as a date before any side effect", () => {
    const withExpiry = (licenseExpiry) => createBookingBody.safeParse({ ...valid, driverDetails: { licenseExpiry } });
    assert.equal(withExpiry("banana").success, false);
    assert.equal(withExpiry("2032-05-01").success, true);
    assert.equal(withExpiry("").success, true);
  });

  it("only accepts plain decimal numbers for totalHours and bounds it", () => {
    const hours = (totalHours) => createBookingBody.safeParse({ ...valid, rentalType: "hour", totalHours });
    assert.equal(hours("5").data.totalHours, 5);
    assert.equal(hours(2.5).data.totalHours, 2.5);
    for (const bad of ["0x10", "1e3", [5], true, "abc", 0, -1, 721]) {
      assert.equal(hours(bad).success, false, JSON.stringify(bad));
    }
  });

  it("falls back to pagination defaults for empty page/limit", () => {
    assert.deepEqual(listBookingsQuery.parse({ page: "", limit: "" }), { page: 1, limit: 10 });
    assert.equal(listBookingsQuery.safeParse({ page: "0x10" }).success, false);
    assert.equal(listBookingsQuery.safeParse({ limit: "1e2" }).success, false);
  });

  it("rejects an unknown or repeated status filter instead of silently ignoring it", () => {
    assert.equal(listBookingsQuery.parse({ status: "confirmed" }).status, "confirmed");
    assert.equal(listBookingsQuery.parse({ status: "" }).status, undefined);
    assert.equal(listBookingsQuery.safeParse({ status: "bogus" }).success, false);
    assert.equal(listBookingsQuery.safeParse({ status: ["pending", "active"] }).success, false);
  });

  it("coerces and bounds list queries", () => {
    assert.deepEqual(listBookingsQuery.parse({}), { page: 1, limit: 10 });
    assert.equal(listBookingsQuery.parse({ page: "2", limit: "50" }).limit, 50);
    assert.equal(listBookingsQuery.safeParse({ limit: "1000" }).success, false);
    assert.equal(listBookingsQuery.safeParse({ page: "abc" }).success, false);
  });
});

describe("payment schemas", () => {
  it("treats a null or empty refund reason as not provided", () => {
    for (const reason of [undefined, null, ""]) {
      const result = refundBody.safeParse({ bookingId: ID, reason });
      assert.equal(result.success, true, String(reason));
      assert.equal(result.data.reason, undefined, String(reason));
    }
    assert.equal(refundBody.parse({ bookingId: ID, reason: "  damaged  " }).reason, "damaged");
    assert.equal(refundBody.safeParse({ bookingId: ID, reason: "x".repeat(501) }).success, false);
  });

  it("requires all three Razorpay confirmation fields as strings", () => {
    const ok = { razorpayPaymentId: "pay_1", razorpayOrderId: "order_1", razorpaySignature: "sig" };
    assert.equal(confirmPaymentBody.safeParse(ok).success, true);
    assert.equal(confirmPaymentBody.safeParse({ ...ok, razorpaySignature: "" }).success, false);
    assert.equal(confirmPaymentBody.safeParse({ ...ok, razorpayOrderId: { $ne: 1 } }).success, false);
  });
});

describe("validated routes (over HTTP, auth stubbed, no database)", () => {
  let server;
  let base;
  let token;

  before(async () => {
    mock.method(User, "findById", () => ({
      select: async () => new User({ _id: ID, isActive: true, role: "user" }),
    }));
    token = jwt.sign({ id: ID, role: "user" }, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
    app.use("/bookings", bookingRoutes);
    app.use("/payments", paymentRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  const call = (method, path, body) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("POST /bookings returns 400 with field errors, before touching the database", async () => {
    const res = await call("POST", "/bookings", { carId: { $ne: null }, pickupDate: "2030-01-01" });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.message, json.errors[0].message);
    assert.deepEqual(json.errors.map((e) => e.field).sort(), ["carId", "dropDate"]);
  });

  it("names the field when zod's default message would not", async () => {
    const res = await call("POST", "/bookings", { carId: ID, pickupDate: "2030-01-01", dropDate: "2030-01-03", couponCode: 123 });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.message, /^couponCode: /);
    assert.equal(json.message, json.errors[0].message);
  });

  it("GET /bookings rejects an unknown status", async () => {
    const res = await call("GET", "/bookings?status=bogus");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errors[0].field, "status");
  });

  it("installs parsed values on a read-only req.query (Express 5 getter)", () => {
    const req = {};
    Object.defineProperty(req, "query", { get: () => ({ page: "2" }), configurable: true });
    validate({ query: listBookingsQuery })(req, {}, () => {});
    assert.deepEqual(req.query, { page: 2, limit: 10 });
  });

  it("GET /bookings/:id rejects a malformed id", async () => {
    const res = await call("GET", "/bookings/not-an-id");
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errors[0].field, "id");
  });

  it("GET /bookings rejects an out-of-range limit", async () => {
    assert.equal((await call("GET", "/bookings?limit=5000")).status, 400);
  });

  it("PATCH /bookings/:id/reschedule requires both dates", async () => {
    assert.equal((await call("PATCH", `/bookings/${ID}/reschedule`, { pickupDate: "2030-01-01" })).status, 400);
  });

  it("POST /payments/create-intent and /confirm validate their bodies", async () => {
    assert.equal((await call("POST", "/payments/create-intent", {})).status, 400);
    assert.equal((await call("POST", "/payments/confirm", { razorpayOrderId: "o" })).status, 400);
  });

  it("leaves the Razorpay webhook unvalidated (it is signature-verified, not schema-shaped)", async () => {
    const res = await fetch(`${base}/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": "bad" }, body: "{}" });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).message, "Invalid webhook signature");
  });
});

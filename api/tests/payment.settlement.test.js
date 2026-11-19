import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import "express-async-errors";

process.env.RAZORPAY_KEY_SECRET = "key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook-secret";

// Razorpay's SDK talks over axios; answer its refund call locally and record what was asked.
process.env.RAZORPAY_KEY_ID = "key-id";
const gatewayRefunds = [];
const axios = createRequire(createRequire(import.meta.url).resolve("razorpay"))("axios").default;
axios.defaults.adapter = async (config) => {
  gatewayRefunds.push({ url: config.url, amount: JSON.parse(config.data).amount });
  return { data: { id: "rfnd_1" }, status: 200, statusText: "OK", headers: {}, config };
};
const { confirmPayment, razorpayWebhook, refundPayment } = await import("../src/controllers/payment.controller.js");
const { default: Payment } = await import("../src/model/payment.model.js");
const { default: Booking } = await import("../src/model/booking.model.js");

const ORDER = "order_1";
const PAY = "pay_1";
const USER = "user-1";

// In-memory stand-ins for the two collections. Every operation takes effect after one tick, as a
// real round trip would, so two requests running together interleave instead of running back to
// back. Individual operations are still atomic, like single Mongo writes.
let payment;
let booking;
let bookingWrites;
let failNextBookingWrite;

const tick = () => Promise.resolve();

function matches(doc, filter) {
  for (const [key, cond] of Object.entries(filter)) {
    const value = key.split(".").reduce((o, k) => o?.[k], doc);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$nin" in cond && cond.$nin.includes(value)) return false;
      if ("$ne" in cond && value === cond.$ne) return false;
    } else if (value !== cond) return false;
  }
  return true;
}

function apply(doc, update) {
  const fields = update.$set ?? update;
  for (const [key, value] of Object.entries(fields)) {
    const path = key.split(".");
    const last = path.pop();
    const target = path.reduce((o, k) => (o[k] ??= {}), doc);
    target[last] = value;
  }
}

function store(getDoc, { onWrite } = {}) {
  return {
    findOne: async (filter) => (await tick(), matches(getDoc(), filter) ? getDoc() : null),
    findById: async () => (await tick(), getDoc()),
    findOneAndUpdate: async (filter, update) => {
      await tick();
      onWrite?.();
      const doc = getDoc();
      if (!matches(doc, filter)) return null;
      apply(doc, update);
      return { ...doc };
    },
    updateOne: async (filter, update) => {
      await tick();
      const doc = getDoc();
      if (matches(doc, filter)) apply(doc, update);
    },
  };
}

const sign = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("hex");

function res() {
  return { body: undefined, json(b) { this.body = b; return this; } };
}

const confirm = (overrides = {}) => {
  const body = {
    razorpayOrderId: ORDER,
    razorpayPaymentId: PAY,
    razorpaySignature: sign(`${ORDER}|${PAY}`, "key-secret"),
    ...overrides,
  };
  const r = res();
  return confirmPayment({ body, user: { _id: USER } }, r).then(() => r);
};

const webhook = (event = "payment.captured") => {
  const rawBody = JSON.stringify({ event, payload: { payment: { entity: { order_id: ORDER, id: PAY } } } });
  const r = res();
  return razorpayWebhook(
    { headers: { "x-razorpay-signature": sign(rawBody, "hook-secret") }, rawBody, body: JSON.parse(rawBody) },
    r
  ).then(() => r);
};

beforeEach(() => {
  payment = { _id: "p1", booking: "b1", user: USER, amount: 1180, razorpayOrderId: ORDER, status: "pending" };
  booking = { _id: "b1", user: USER, status: "pending", paymentStatus: "pending", refundAmount: 0 };
  bookingWrites = 0;
  failNextBookingWrite = false;

  const payments = store(() => payment);
  for (const method of Object.keys(payments)) mock.method(Payment, method, payments[method]);

  const bookings = store(() => booking, {
    onWrite: () => {
      bookingWrites += 1;
      if (failNextBookingWrite) {
        failNextBookingWrite = false;
        throw new Error("transient database error");
      }
    },
  });
  mock.method(Booking, "findOneAndUpdate", bookings.findOneAndUpdate);
  mock.method(Booking, "findById", bookings.findById);
  mock.method(Booking, "updateOne", bookings.updateOne);
});
afterEach(() => mock.restoreAll());

describe("confirming a payment", () => {
  it("confirms a pending booking and records the payment", async () => {
    const r = await confirm();

    assert.equal(r.body.success, true);
    assert.equal(payment.status, "succeeded");
    assert.equal(payment.razorpayPaymentId, PAY);
    assert.deepEqual([booking.status, booking.paymentStatus, booking.razorpayOrderId], ["confirmed", "paid", ORDER]);
  });

  it("is idempotent when the same confirmation is sent again", async () => {
    await confirm();
    const r = await confirm();

    assert.equal(r.body.success, true);
    assert.equal(booking.status, "confirmed");
    assert.equal(payment.reconciliation, undefined);
  });

  it("does not let another user confirm someone else's payment", async () => {
    payment.user = "someone-else";
    await assert.rejects(confirm(), { statusCode: 404 });
    assert.equal(booking.status, "pending");
  });
});

describe("a failure between the payment write and the booking write", () => {
  it("is not reported as success, and a retried confirmation repairs the booking", async () => {
    failNextBookingWrite = true;

    await assert.rejects(confirm(), /transient database error/);
    assert.equal(payment.status, "succeeded");
    assert.equal(booking.status, "pending");

    const r = await confirm();

    assert.equal(r.body.success, true);
    assert.deepEqual([booking.status, booking.paymentStatus], ["confirmed", "paid"]);
    assert.equal(bookingWrites, 2, "the retry must attempt the booking update again");
  });

  it("is repaired by the capture webhook", async () => {
    failNextBookingWrite = true;
    await assert.rejects(confirm(), /transient database error/);

    await webhook();

    assert.deepEqual([booking.status, booking.paymentStatus], ["confirmed", "paid"]);
  });

  it("lets the webhook fail with an error, so the gateway redelivers it", async () => {
    failNextBookingWrite = true;

    await assert.rejects(webhook(), /transient database error/);
    await webhook();

    assert.equal(booking.status, "confirmed");
  });
});

describe("a capture for a booking that is no longer pending", () => {
  for (const status of ["cancelled", "completed", "no-show"]) {
    it(`does not revive a ${status} booking from the webhook, and flags the money for refund`, async () => {
      booking.status = status;
      booking.refundAmount = 0;

      const r = await webhook();

      assert.deepEqual(r.body, { received: true });
      assert.deepEqual([booking.status, booking.paymentStatus], [status, "pending"]);
      assert.equal(payment.status, "succeeded", "a real capture is not recorded as a failed payment");
      assert.equal(payment.razorpayPaymentId, PAY);
      assert.equal(payment.reconciliation.status, "refund_required");
      assert.equal(payment.reconciliation.reason, `booking_${status}`);
      assert.equal(booking.refundAmount, 1180, "so the admin refund endpoint can refund it");
    });
  }

  it("answers a client confirmation with a 409 and flags it the same way", async () => {
    booking.status = "cancelled";

    await assert.rejects(confirm(), { statusCode: 409, message: /refunded/ });

    assert.equal(payment.status, "succeeded");
    assert.equal(payment.reconciliation.status, "refund_required");
    assert.equal(booking.status, "cancelled");
  });

  it("flags it once however many times the capture is redelivered", async () => {
    booking.status = "cancelled";
    await webhook();
    const flaggedAt = payment.reconciliation.flaggedAt;

    await webhook();
    await assert.rejects(confirm(), { statusCode: 409 });

    assert.equal(payment.reconciliation.flaggedAt, flaggedAt);
  });

  it("does not overwrite a refund amount the cancellation already recorded", async () => {
    booking.status = "cancelled";
    booking.refundAmount = 900;

    await webhook();

    assert.equal(booking.refundAmount, 900);
  });
});

describe("a replayed capture after a refund", () => {
  beforeEach(() => {
    payment.status = "refunded";
    payment.razorpayPaymentId = PAY;
    booking.status = "cancelled";
    booking.paymentStatus = "refunded";
  });

  it("changes nothing via the webhook", async () => {
    const r = await webhook();

    assert.deepEqual(r.body, { received: true });
    assert.equal(payment.status, "refunded");
    assert.deepEqual([booking.status, booking.paymentStatus], ["cancelled", "refunded"]);
    assert.equal(payment.reconciliation, undefined);
  });

  it("is rejected for a client confirmation", async () => {
    await assert.rejects(confirm(), { statusCode: 409, message: /already been refunded/ });
    assert.equal(payment.status, "refunded");
    assert.equal(booking.status, "cancelled");
  });
});

describe("client confirmation and webhook arriving together", () => {
  it("confirm the booking once and both succeed", async () => {
    const [client, hook] = await Promise.all([confirm(), webhook()]);

    assert.equal(client.body.success, true);
    assert.deepEqual(hook.body, { received: true });
    assert.deepEqual([booking.status, booking.paymentStatus, booking.razorpayOrderId], ["confirmed", "paid", ORDER]);
    assert.equal(payment.status, "succeeded");
    assert.equal(payment.reconciliation, undefined);
  });

  it("do not flag a payment for refund when the other one confirmed the booking first", async () => {
    await Promise.all([webhook(), confirm(), webhook()]);

    assert.equal(booking.status, "confirmed");
    assert.equal(payment.reconciliation, undefined);
  });

  it("lose to a cancellation that lands first, without reclaiming the dates", async () => {
    booking.status = "cancelled";

    const results = await Promise.allSettled([confirm(), webhook()]);

    assert.equal(booking.status, "cancelled");
    assert.equal(results[0].status, "rejected");
    assert.equal(payment.reconciliation.status, "refund_required");
  });
});

describe("refunding a flagged payment", () => {
  it("refunds the captured money and resolves the reconciliation flag", async () => {
    booking.status = "cancelled";
    await webhook();
    assert.equal(payment.reconciliation.status, "refund_required");

    const doc = Payment.hydrate({ ...payment, _id: "64b000000000000000000001", booking: "64b000000000000000000002" });
    const save = mock.method(doc, "save", async () => doc);
    mock.method(Payment, "findOne", async () => doc);
    mock.method(Booking, "findById", async () => booking);
    mock.method(Booking, "findByIdAndUpdate", async () => {});

    const r = res();
    await refundPayment({ body: { bookingId: "b1", reason: "cancelled before capture" } }, r);

    assert.equal(gatewayRefunds.length, 1);
    assert.ok(gatewayRefunds[0].url.endsWith(`/payments/${PAY}/refund`), gatewayRefunds[0].url);
    assert.equal(gatewayRefunds[0].amount, 118000);
    assert.equal(doc.status, "refunded");
    assert.equal(doc.reconciliation.status, "resolved");
    assert.equal(save.mock.callCount(), 1);
  });
});

describe("webhook signature", () => {
  it("is still required", async () => {
    await assert.rejects(
      razorpayWebhook({ headers: { "x-razorpay-signature": "nope" }, rawBody: "{}", body: {} }, res()),
      { statusCode: 400 }
    );
    assert.equal(payment.status, "pending");
  });
});

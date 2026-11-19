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
  const body = JSON.parse(config.data);
  if (config.url.endsWith("/orders")) {
    return { data: { id: `order_${++ordersCreated + 1}`, amount: body.amount }, status: 200, statusText: "OK", headers: {}, config };
  }
  gatewayRefunds.push({ url: config.url, amount: body.amount });
  return { data: { id: "rfnd_1" }, status: 200, statusText: "OK", headers: {}, config };
};
let ordersCreated = 0;
const { confirmPayment, razorpayWebhook, refundPayment, createPaymentIntent, getPaymentHistory } = await import("../src/controllers/payment.controller.js");
const { default: UnmatchedCapture } = await import("../src/model/unmatchedCapture.model.js");
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
  if (!doc) return false;
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

function store(getDoc, { onWrite, insert } = {}) {
  return {
    findOne: async (filter) => (await tick(), matches(getDoc(), filter) ? getDoc() : null),
    findById: async () => (await tick(), getDoc() ?? null),
    findOneAndUpdate: async (filter, update, options = {}) => {
      await tick();
      onWrite?.();
      const doc = getDoc();
      if (!doc && options.upsert && insert) {
        // Equality fields of the filter, then $setOnInsert, then $set, as Mongo builds an upserted document.
        const created = { _id: "p-recreated", ...Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== "object")), ...update.$setOnInsert };
        apply(created, update);
        insert(created);
        return { ...created };
      }
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
  booking = { _id: "b1", user: USER, status: "pending", paymentStatus: "pending", totalAmount: 1180, refundAmount: 0 };
  bookingWrites = 0;
  failNextBookingWrite = false;

  const payments = store(() => payment, { insert: (doc) => (payment = doc) });
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
      assert.equal(booking.refundAmount, 0, "the booking itself is not edited, the payment carries the refund owed");
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

describe("a payment record that goes missing mid-settlement", () => {
  // The handler loaded the record, then it vanished before the update (the old reschedule path
  // deleted pending records). The capture is real: it must not be reported, or stored, as a refund.
  const loadThenLose = () => {
    const realFindOne = Payment.findOne;
    mock.method(Payment, "findOne", async (...args) => {
      const loaded = await realFindOne(...args);
      payment = null; // gone before settleCapture touches it
      return loaded;
    });
  };

  it("records the capture again and confirms the booking, for a webhook", async () => {
    loadThenLose();

    const r = await webhook();

    assert.deepEqual(r.body, { received: true });
    assert.equal(payment.status, "succeeded");
    assert.equal(payment.razorpayOrderId, ORDER);
    assert.equal(payment.razorpayPaymentId, PAY);
    assert.deepEqual([payment.booking, payment.user, payment.amount], ["b1", USER, 1180]);
    assert.deepEqual([booking.status, booking.paymentStatus], ["confirmed", "paid"]);
  });

  it("does not tell the customer it was refunded, for a client confirmation", async () => {
    loadThenLose();

    const r = await confirm();

    assert.equal(r.body.success, true);
    assert.equal(payment.status, "succeeded");
    assert.equal(booking.status, "confirmed");
  });

  it("still flags it for refund when the booking can't take the money", async () => {
    booking.status = "cancelled";
    loadThenLose();

    await webhook();

    assert.equal(payment.status, "succeeded");
    assert.equal(payment.reconciliation.status, "refund_required");
    assert.equal(booking.status, "cancelled");
  });

  it("is found again when the webhook is redelivered", async () => {
    loadThenLose();
    await webhook();
    mock.restoreAll();
    // restoreAll above dropped every stub: reinstall them over the recreated record
    const payments = store(() => payment, { insert: (doc) => (payment = doc) });
    for (const method of Object.keys(payments)) mock.method(Payment, method, payments[method]);
    const bookings = store(() => booking);
    mock.method(Booking, "findOneAndUpdate", bookings.findOneAndUpdate);
    mock.method(Booking, "findById", bookings.findById);

    const r = await webhook();

    assert.deepEqual(r.body, { received: true });
    assert.equal(payment.status, "succeeded");
    assert.equal(booking.status, "confirmed");
  });
});

describe("a checkout for a price the booking no longer has", () => {
  beforeEach(() => {
    booking.totalAmount = 11800; // rescheduled from one day to ten while checkout was open
  });

  it("is flagged for refund, and the booking is not marked paid, via the webhook", async () => {
    await webhook();

    assert.equal(payment.status, "succeeded");
    assert.deepEqual(payment.reconciliation && [payment.reconciliation.status, payment.reconciliation.reason], ["refund_required", "booking_repriced"]);
    assert.deepEqual([booking.status, booking.paymentStatus, booking.totalAmount], ["pending", "pending", 11800]);
  });

  it("is rejected for a client confirmation with a 409", async () => {
    await assert.rejects(confirm(), { statusCode: 409 });

    assert.equal(booking.paymentStatus, "pending");
    assert.equal(payment.reconciliation.status, "refund_required");
  });

  it("can be refunded from the flagged payment even though the booking has no refund amount", async () => {
    await webhook();
    const doc = Payment.hydrate({ ...payment, _id: "64b000000000000000000001", booking: "64b000000000000000000002" });
    mock.method(doc, "save", async () => doc);
    mock.method(Payment, "findOne", async (filter) => (filter["reconciliation.status"] ? doc : null));
    mock.method(Booking, "findById", async () => booking);
    const update = mock.method(Booking, "findByIdAndUpdate", async () => {});

    await refundPayment({ body: { bookingId: "b1" } }, res());

    assert.equal(doc.status, "refunded");
    assert.equal(doc.reconciliation.status, "resolved");
    assert.equal(update.mock.callCount(), 0, "the booking was never paid by this payment");
  });

  it("is accepted when the booking still costs what the order was created for", async () => {
    booking.totalAmount = 1180;

    await webhook();

    assert.deepEqual([booking.status, booking.paymentStatus], ["confirmed", "paid"]);
  });

  it("is also caught for a voided order that gets paid later", async () => {
    payment.status = "cancelled"; // voided by the reschedule, record kept

    await webhook();

    assert.equal(payment.status, "succeeded");
    assert.equal(payment.reconciliation.status, "refund_required");
    assert.equal(booking.paymentStatus, "pending");
  });
});

describe("a verified capture that matches no payment record", () => {
  it("is stored for follow-up before the webhook is acknowledged, and only once however often it is redelivered", async () => {
    payment = null;
    const stored = new Map();
    mock.method(UnmatchedCapture, "updateOne", async (filter, update) => {
      if (!stored.has(filter.razorpayPaymentId)) stored.set(filter.razorpayPaymentId, update.$setOnInsert);
    });
    const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: "order_unknown", id: "pay_9", amount: 118000, currency: "INR" } } } });
    const deliver = () =>
      razorpayWebhook({ headers: { "x-razorpay-signature": sign(rawBody, "hook-secret") }, rawBody, body: JSON.parse(rawBody) }, res());

    await deliver();
    await deliver();

    assert.equal(stored.size, 1);
    assert.deepEqual([stored.get("pay_9").razorpayOrderId, stored.get("pay_9").amount], ["order_unknown", 118000]);
  });

  it("is not acknowledged if it could not be stored", async () => {
    payment = null;
    mock.method(UnmatchedCapture, "updateOne", async () => { throw new Error("db down"); });

    await assert.rejects(webhook(), /db down/);
  });
});

describe("starting checkout", () => {
  const intent = () => {
    const r = res();
    return createPaymentIntent({ body: { bookingId: "b1" }, user: { _id: USER } }, r).then(() => r);
  };
  let created;
  let voided;

  beforeEach(() => {
    created = [];
    voided = [];
    mock.method(Booking, "findOne", () => ({ populate: async () => ({ ...booking, toString: () => "b1" }) }));
    mock.method(Payment, "create", async (doc) => (created.push(doc), doc));
    mock.method(Payment, "updateMany", async (filter, update) => voided.push({ filter, update }));
  });

  it("adds a record for the new order instead of overwriting the previous one", async () => {
    await intent();

    assert.equal(created.length, 1);
    assert.equal(created[0].razorpayOrderId, `order_${ordersCreated + 1}`);
    assert.equal(created[0].amount, 1180);
    assert.equal(created[0].status, "pending");
  });

  it("voids earlier pending checkouts, keeping them and their order ids", async () => {
    await intent();

    assert.equal(voided.length, 1);
    assert.deepEqual(voided[0].update, { status: "cancelled" });
    assert.equal(voided[0].filter.status, "pending");
    assert.equal(voided[0].filter.razorpayOrderId.$ne, created[0].razorpayOrderId, "never the new order");
  });
});

describe("payment history", () => {
  it("leaves out checkout attempts that were voided", async () => {
    const find = mock.method(Payment, "find", () => {
      const q = { populate: () => q, sort: () => q, skip: () => q, limit: () => q, then: (ok) => Promise.resolve([]).then(ok) };
      return q;
    });
    const count = mock.method(Payment, "countDocuments", async () => 0);

    await getPaymentHistory({ query: {}, user: { _id: USER } }, res());

    assert.deepEqual(find.mock.calls[0].arguments[0].status, { $ne: "cancelled" });
    assert.deepEqual(count.mock.calls[0].arguments[0].status, { $ne: "cancelled" });
  });
});

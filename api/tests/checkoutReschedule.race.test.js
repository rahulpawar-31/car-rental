import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import "express-async-errors";
import { stubTransactions } from "./helpers/transactions.js";

process.env.RAZORPAY_KEY_SECRET = "key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook-secret";

const { confirmPayment, razorpayWebhook } = await import("../src/controllers/payment.controller.js");
const { rescheduleUserBooking } = await import("../src/services/booking.js");
const { default: Payment } = await import("../src/model/payment.model.js");
const { default: Booking } = await import("../src/model/booking.model.js");
const { default: Car } = await import("../src/model/car.model.js");
const { default: ReservationLock } = await import("../src/model/reservationLock.model.js");

// A customer starts checkout for a pending one-day booking (2,000 + 18% GST + 5,000 deposit = 7,360)
// and, while that checkout is open, reschedules the booking to ten days. These tests run the real
// reschedule and the real payment settlement against shared in-memory collections and decide, with
// gates, which of the two writes reaches the "database" first.

const HOUR = 3600 * 1000;
const inHours = (h) => new Date(Date.now() + h * HOUR);
const ORDER = "order_1";
const PAY = "pay_1";
const USER = "user1";
const ONE_DAY = 7360;
const TEN_DAYS = 2000 * 10 + 3600 + 5000; // 28,600
const tick = () => Promise.resolve();

let booking;
let payments; // by _id
let hold; // gates for the next write of each kind
let reached; // which writes have arrived at their gate

function matches(doc, filter) {
  if (!doc) return false;
  for (const [key, cond] of Object.entries(filter)) {
    const value = key.split(".").reduce((o, k) => o?.[k], doc);
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$nin" in cond && cond.$nin.includes(value)) return false;
      if ("$ne" in cond && value === cond.$ne) return false;
    } else if (String(value) !== String(cond)) return false;
  }
  return true;
}
function apply(doc, update) {
  for (const [key, value] of Object.entries(update.$set ?? update)) {
    const path = key.split(".");
    const last = path.pop();
    path.reduce((o, k) => (o[k] ??= {}), doc)[last] = value;
  }
}

const gate = () => {
  let open;
  return { closed: new Promise((resolve) => (open = resolve)), open };
};
const until = async (flag) => {
  while (!reached[flag]) await new Promise((resolve) => setTimeout(resolve, 1));
};

const sign = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const res = () => ({ body: undefined, json(b) { this.body = b; return this; } });
const confirm = () =>
  confirmPayment(
    { body: { razorpayOrderId: ORDER, razorpayPaymentId: PAY, razorpaySignature: sign(`${ORDER}|${PAY}`, "key-secret") }, user: { _id: USER } },
    res()
  );
const webhook = () => {
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: ORDER, id: PAY } } } });
  return razorpayWebhook({ headers: { "x-razorpay-signature": sign(rawBody, "hook-secret") }, rawBody, body: JSON.parse(rawBody) }, res());
};
const move = (days = 10) => {
  const pickup = inHours(200);
  return rescheduleUserBooking(USER, "b1", {
    pickupDate: pickup.toISOString(), dropDate: new Date(pickup.getTime() + days * 24 * HOUR).toISOString(),
  });
};

const payment = () => payments.get("p1");
const refundFlag = () => payment().reconciliation?.status;

beforeEach(() => {
  stubTransactions();
  booking = {
    _id: "b1", user: USER, car: "car1", status: "pending", paymentStatus: "pending", rentalType: "day",
    pickupDate: inHours(24), dropDate: inHours(48), totalDays: 1, baseAmount: 2000, discountAmount: 0, taxAmount: 360, totalAmount: ONE_DAY,
  };
  payments = new Map([["p1", { _id: "p1", booking: "b1", user: USER, amount: ONE_DAY, razorpayOrderId: ORDER, status: "pending" }]]);
  hold = {};
  reached = {};

  mock.method(Booking, "findOne", async (filter) => {
    await tick();
    return filter.user ? { ...booking } : null; // the booking itself; never a conflicting one
  });
  mock.method(Booking, "findById", (id) => {
    const q = { populate: () => q, then: (ok, fail) => Promise.resolve({ ...booking, _id: id }).then(ok, fail) };
    return q;
  });
  // Both the reschedule's write and the payment confirmation's write go through here, each as one
  // atomic conditional update. `hold` lets a test stop either one just before it reaches the database.
  mock.method(Booking, "findOneAndUpdate", async (filter, update) => {
    const kind = update.$set ? "reschedule" : "confirm";
    reached[kind] = true;
    await hold[kind]?.closed;
    await tick();
    if (!matches(booking, filter)) return null;
    apply(booking, update);
    return { ...booking };
  });
  mock.method(Car, "findById", async () => ({ _id: "car1", pricePerDay: 2000, securityDeposit: 5000 }));
  mock.method(ReservationLock, "findOneAndUpdate", async () => ({}));
  mock.method(ReservationLock, "exists", async () => ({ _id: "lock" }));
  mock.method(ReservationLock, "create", async () => ({}));
  mock.method(ReservationLock, "deleteOne", async () => ({}));

  mock.method(Payment, "findOne", async (filter) => [...payments.values()].find((p) => matches(p, filter)) ?? null);
  mock.method(Payment, "findById", async (id) => payments.get(id) ?? null);
  mock.method(Payment, "findOneAndUpdate", async (filter, update) => {
    await tick();
    const found = [...payments.values()].find((p) => matches(p, filter));
    if (!found) return null;
    apply(found, update);
    return { ...found };
  });
  mock.method(Payment, "updateOne", async (filter, update) => {
    const found = [...payments.values()].find((p) => matches(p, filter));
    if (found) apply(found, update);
  });
  mock.method(Payment, "updateMany", async (filter, update) => {
    for (const p of payments.values()) if (matches(p, filter)) apply(p, update);
  });
});
afterEach(() => mock.restoreAll());

for (const [name, complete] of [["client confirmation", confirm], ["capture webhook", webhook]]) {
  describe(`${name} racing a reschedule`, () => {
    it("completing first wins: the reschedule then fails and the booking stays a paid one-day booking", async () => {
      hold.reschedule = gate(); // the reschedule has read the booking as pending and is about to write
      const rescheduling = move();
      rescheduling.catch(() => {});
      await until("reschedule");

      await complete(); // the checkout for the old amount is completed now
      assert.deepEqual([booking.status, booking.paymentStatus, booking.totalAmount], ["confirmed", "paid", ONE_DAY]);

      hold.reschedule.open();
      await assert.rejects(rescheduling, { statusCode: 409, message: /just updated/ });

      assert.deepEqual([booking.paymentStatus, booking.totalAmount, booking.totalDays], ["paid", ONE_DAY, 1]);
      assert.equal(payment().amount, booking.totalAmount, "what was collected is what the booking says was paid");
      assert.equal(payment().status, "succeeded");
      assert.equal(refundFlag(), undefined);
      assert.equal(payment().status === "cancelled", false, "a completed payment is not voided");
    });

    it("persisting first wins: the stale checkout is flagged for refund and the booking is not marked paid", async () => {
      hold.confirm = gate(); // the confirmation is about to write, still expecting a 7,360 booking
      const completing = complete();
      completing.catch(() => {});
      await until("confirm");

      await move(); // the reschedule persists first
      assert.equal(booking.totalAmount, TEN_DAYS);

      hold.confirm.open();
      await completing.catch(() => {}); // a client confirmation is told it can't be applied

      assert.deepEqual([booking.status, booking.paymentStatus, booking.totalAmount, booking.totalDays], ["pending", "pending", TEN_DAYS, 10]);
      assert.equal(payment().status, "succeeded", "the money really was taken");
      assert.equal(payment().amount, ONE_DAY);
      assert.equal(refundFlag(), "refund_required");
      assert.equal(payment().reconciliation.reason, "booking_repriced");
    });

    it("after the reschedule has persisted: the old checkout is flagged for refund, not applied", async () => {
      await move();

      await complete().catch(() => {});

      assert.deepEqual([booking.paymentStatus, booking.totalAmount], ["pending", TEN_DAYS]);
      assert.equal(refundFlag(), "refund_required");
    });
  });
}

describe("a reschedule that does not change the price", () => {
  it("leaves the open checkout valid: paying it afterwards confirms the booking", async () => {
    await move(1); // one day to one day, a different window: same 7,360

    assert.equal(booking.totalAmount, ONE_DAY);
    await confirm();

    assert.deepEqual([booking.status, booking.paymentStatus, booking.totalAmount], ["confirmed", "paid", ONE_DAY]);
    assert.equal(refundFlag(), undefined);
  });
});

describe("the same checkout delivered through both paths", () => {
  it("confirms once, repriced or not, and never marks the new price paid", async () => {
    hold.reschedule = gate();
    const rescheduling = move();
    rescheduling.catch(() => {});
    await until("reschedule");

    await Promise.all([confirm(), webhook()]);
    hold.reschedule.open();
    await assert.rejects(rescheduling, { statusCode: 409 });

    assert.deepEqual([booking.paymentStatus, booking.totalAmount], ["paid", ONE_DAY]);
    assert.equal(payment().amount, booking.totalAmount);
  });
});

describe("a paid booking", () => {
  it("cannot be repriced even if the booking was read as pending a moment earlier", async () => {
    hold.reschedule = gate();
    const rescheduling = move();
    rescheduling.catch(() => {});
    await until("reschedule");
    await confirm();
    hold.reschedule.open();
    await assert.rejects(rescheduling, { statusCode: 409 });

    // retrying now meets the paid-price rule instead
    await assert.rejects(move(), { statusCode: 400, message: /already paid/ });

    assert.deepEqual([booking.paymentStatus, booking.totalAmount], ["paid", ONE_DAY]);
  });
});

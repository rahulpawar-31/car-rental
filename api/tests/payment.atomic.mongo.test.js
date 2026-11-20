import { describe, it, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createRequire } from "node:module";
import Booking from "../src/model/booking.model.js";
import Car from "../src/model/car.model.js";
import Payment from "../src/model/payment.model.js";
import ReservationLock from "../src/model/reservationLock.model.js";
import { createBooking, rescheduleUserBooking } from "../src/services/booking.js";
import { settleCapture, SETTLEMENT } from "../src/services/paymentSettlement.js";
import { refundPayment } from "../src/controllers/payment.controller.js";

const url = process.env.MONGO_TEST_URL;
const gate = () => {
  let open;
  return { closed: new Promise((resolve) => { open = resolve; }), open };
};
const pickup = new Date("2030-01-01T09:00:00Z"), drop = new Date("2030-01-02T09:00:00Z");
const move = { pickupDate: "2030-01-10T09:00:00Z", dropDate: "2030-01-12T09:00:00Z" };

describe("reservation and payment atomicity on a replica set", { skip: !url && "set MONGO_TEST_URL", timeout: 30_000 }, () => {
  let user, car, booking, payment;
  before(async () => {
    await mongoose.connect(url, { dbName: "car_rental_test_payment_atomic" });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(hello.setName || hello.msg === "isdbgrid", "MONGO_TEST_URL must point to a replica set or mongos");
    await Promise.all([Booking.init(), Payment.init(), ReservationLock.init()]);
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([Booking.deleteMany({}), Payment.deleteMany({}), ReservationLock.deleteMany({}), Car.collection.deleteMany({})]);
    user = { _id: new mongoose.Types.ObjectId(), name: "Review", email: "review@example.com" };
    car = new mongoose.Types.ObjectId();
    await Car.collection.insertOne({ _id: car, name: "Test Car", brand: "Honda", model: "City", pricePerDay: 1000, securityDeposit: 0, isActive: true, isAvailable: true });
    booking = await Booking.create({ user: user._id, car, pickupDate: pickup, dropDate: drop, totalDays: 1,
      pricePerDay: 1000, baseAmount: 1000, taxAmount: 180, totalAmount: 1180, status: "pending", paymentStatus: "pending" });
    payment = await Payment.create({ booking: booking._id, user: user._id, amount: 1180, status: "pending", razorpayOrderId: "order_test" });
  });
  afterEach(() => { mock.restoreAll(); });

  // Pause after Mongo applies the move inside its transaction, before ownership is fenced/committed.
  function pauseMove() {
    const reached = gate(), release = gate();
    const write = Booking.findOneAndUpdate.bind(Booking);
    mock.method(Booking, "findOneAndUpdate", async (filter, update, options) => {
      const result = await write(filter, update, options);
      if (update.$set?.pickupDate && result) {
        reached.open();
        await release.closed;
      }
      return result;
    });
    return { reached: reached.closed, release: release.open };
  }
  const expire = () => ReservationLock.updateOne({ car }, { $set: { expiresAt: new Date(0) } });
  const book = (dates) => createBooking({ user: { ...user, _id: new mongoose.Types.ObjectId() }, input: { carId: String(car), ...dates } }, { sendEmail: async () => {} });
  const capture = () => settleCapture(payment, { razorpayPaymentId: "pay_test" });

  it("never publishes an insert whose lease was taken over before commit", async () => {
    const reached = gate(), release = gate();
    const create = Booking.create.bind(Booking);
    let calls = 0;
    mock.method(Booking, "create", async (...args) => {
      const created = await create(...args);
      if (++calls === 1) { reached.open(); await release.closed; }
      return created;
    });
    const first = book(move);
    first.catch(() => {});
    try {
      await reached.closed;
      assert.equal(await Booking.countDocuments({ car, pickupDate: new Date(move.pickupDate) }), 0);
      await expire();
      await book(move);
    } finally { release.open(); }
    await assert.rejects(first, { statusCode: 409 });
    assert.equal(await Booking.countDocuments({ car, pickupDate: new Date(move.pickupDate) }), 1);
  });

  it("does not release the original dates before a move commits, even after lease takeover", async () => {
    const paused = pauseMove();
    const moving = rescheduleUserBooking(user._id, booking._id, move);
    moving.catch(() => {});
    try {
      await paused.reached;
      const visible = await Booking.findById(booking._id).lean();
      assert.equal(visible.pickupDate.getTime(), pickup.getTime());
      assert.equal(visible.totalAmount, 1180);
      await expire();
      await assert.rejects(book({ pickupDate: pickup.toISOString(), dropDate: drop.toISOString() }), { statusCode: 409 });
    } finally { paused.release(); }
    await assert.rejects(moving, { statusCode: 409 });
    assert.equal(await Booking.countDocuments({ car, pickupDate: pickup, dropDate: drop }), 1);
  });

  it("aborts an expired move without changing the dates accepted by the new lock owner", async () => {
    const paused = pauseMove();
    const moving = rescheduleUserBooking(user._id, booking._id, move);
    moving.catch(() => {});
    try {
      await paused.reached;
      await expire();
      await book(move);
    } finally { paused.release(); }
    await assert.rejects(moving, { statusCode: 409 });
    const original = await Booking.findById(booking._id);
    assert.equal(original.pickupDate.getTime(), pickup.getTime());
    assert.equal(await Booking.countDocuments({ car, pickupDate: new Date(move.pickupDate) }), 1);
  });

  it("cannot roll a completed payment back to a different price after losing the lease", async () => {
    const paused = pauseMove();
    const moving = rescheduleUserBooking(user._id, booking._id, move);
    moving.catch(() => {});
    let capturing;
    try {
      await paused.reached;
      assert.equal((await Booking.findById(booking._id)).totalAmount, 1180, "checkout never sees the uncommitted 2360 price");
      capturing = capture();
      await expire();
    } finally { paused.release(); }
    await assert.rejects(moving, { statusCode: 409 });
    assert.equal((await capturing).outcome, SETTLEMENT.CONFIRMED);
    const final = await Booking.findById(booking._id);
    const charged = await Payment.findById(payment._id);
    assert.equal(final.paymentStatus, "paid");
    assert.equal(final.totalAmount, charged.amount);
    assert.equal(final.totalAmount, 1180);
  });

  it("keeps a refund decision final when the booking returns to the captured price", async () => {
    await Booking.updateOne({ _id: booking._id }, { $set: { totalAmount: 2360 } });
    assert.equal((await capture()).outcome, SETTLEMENT.REFUND_REQUIRED);
    await rescheduleUserBooking(user._id, booking._id, { pickupDate: "2030-01-20T09:00:00Z", dropDate: "2030-01-21T09:00:00Z" });
    // `payment` is deliberately the stale, unflagged document loaded before the refund decision.
    const deliveries = await Promise.all([capture(), capture(), capture()]);
    assert.ok(deliveries.every((result) => result.outcome === SETTLEMENT.REFUND_REQUIRED));
    assert.equal((await Booking.findById(booking._id)).paymentStatus, "pending");

    process.env.RAZORPAY_KEY_ID = "test-key";
    process.env.RAZORPAY_KEY_SECRET = "test-secret";
    const require = createRequire(import.meta.url);
    const axios = createRequire(require.resolve("razorpay"))("axios").default;
    let refunds = 0;
    const adapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => {
      refunds++;
      return { data: { id: "refund_test" }, status: 200, statusText: "OK", headers: {}, config };
    };
    try { await refundPayment({ body: { bookingId: booking._id } }, { json: (body) => body }); }
    finally { axios.defaults.adapter = adapter; }
    assert.equal(refunds, 1);
    assert.equal((await Payment.findById(payment._id)).status, "refunded");
    assert.equal((await Booking.findById(booking._id)).paymentStatus, "pending");
    assert.equal((await capture()).outcome, SETTLEMENT.REFUNDED);
  });

  it("aborts the capture record together with a failed booking confirmation, then retries safely", async () => {
    const write = Booking.findOneAndUpdate.bind(Booking);
    let fail = true;
    mock.method(Booking, "findOneAndUpdate", async (...args) => {
      if (fail) { fail = false; throw new Error("injected booking failure"); }
      return write(...args);
    });
    await assert.rejects(capture(), /injected booking failure/);
    assert.equal((await Payment.findById(payment._id)).status, "pending");
    assert.equal((await Booking.findById(booking._id)).paymentStatus, "pending");
    assert.equal((await capture()).outcome, SETTLEMENT.CONFIRMED);
  });

  it("serializes concurrent capture deliveries and confirms once", async () => {
    const results = await Promise.all([capture(), capture(), capture()]);
    assert.ok(results.every((result) => result.outcome === SETTLEMENT.CONFIRMED));
    assert.equal((await Booking.findById(booking._id)).totalAmount, (await Payment.findById(payment._id)).amount);
    assert.equal((await Payment.findById(payment._id)).reconciliation?.status, undefined);
  });

  it("recovers a missing legacy payment attempt and records its captured amount atomically", async () => {
    await Payment.deleteOne({ _id: payment._id });
    assert.equal((await capture()).outcome, SETTLEMENT.CONFIRMED);
    const recovered = await Payment.findOne({ razorpayOrderId: payment.razorpayOrderId });
    assert.equal(recovered.amount, 1180);
    assert.equal(recovered.status, "succeeded");
    assert.equal(recovered.razorpayPaymentId, "pay_test");
    assert.equal((await Booking.findById(booking._id)).paymentStatus, "paid");
  });
});

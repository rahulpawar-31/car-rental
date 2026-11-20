import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/model/booking.model.js";
import Car from "../src/model/car.model.js";
import Coupon from "../src/model/coupon.model.js";
import Payment from "../src/model/payment.model.js";
import ReservationLock from "../src/model/reservationLock.model.js";
import { createBooking, rescheduleUserBooking } from "../src/services/booking.js";
import { withCarLock } from "../src/services/reservationLock.js";
import { stubTransactions } from "./helpers/transactions.js";

const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(Date.now() + hours * HOUR);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- in-memory stand-ins for the lock and booking collections ------------------------------------
// Each operation is atomic but takes a little while, so concurrent requests really interleave. Only
// the database edges are replaced: createBooking, rescheduleUserBooking and withCarLock run as is.

let locks;
let bookings;
let insertDelay; // ms an insert takes to become visible, by call number (0-based)
let inserts;
let dbNow; // the database's clock in ms; tests move it to expire leases deterministically
let stall; // optional gates that hold a write back until the test lets it through

const unique = () => Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

// The lock queries use the database's own clock ($$NOW); this stand-in reads `dbNow` instead.
function leaseState(filter) {
  const op = Object.keys(filter.$expr)[0];
  return (held) => (op === "$lte" ? held.expiresAt <= dbNow : held.expiresAt > dbNow);
}

function installLockStore() {
  mock.method(ReservationLock, "findOneAndUpdate", async (filter, pipeline) => {
    await wait(1);
    const held = locks.get(String(filter.car));
    if (!held || !leaseState(filter)(held) || (filter.owner && held.owner !== filter.owner)) return null;
    if (!Array.isArray(pipeline)) return { ...held, revision: (held.revision || 0) + 1 };
    const { owner, expiresAt } = pipeline[0].$set;
    Object.assign(held, { owner, expiresAt: dbNow + expiresAt.$add[1] });
    return { ...held };
  });
  mock.method(ReservationLock, "exists", async (filter) => {
    await wait(1);
    const held = locks.get(String(filter.car));
    if (!held) return null;
    if (filter.owner !== undefined && held.owner !== filter.owner) return null;
    if (filter.$expr && !leaseState(filter)(held)) return null;
    return { _id: "lock" };
  });
  mock.method(ReservationLock, "create", async (doc) => {
    [doc] = doc;
    await wait(1);
    if (locks.has(String(doc.car))) throw unique();
    locks.set(String(doc.car), { car: String(doc.car), owner: doc.owner, expiresAt: doc.expiresAt.getTime() });
    return doc;
  });
  mock.method(ReservationLock, "deleteOne", async (filter) => {
    await wait(1);
    const held = locks.get(String(filter.car));
    if (held && held.owner === filter.owner) locks.delete(String(filter.car));
  });
}

function overlaps(b, filter) {
  return (
    (!filter.car || b.car === filter.car) &&
    filter.status.$in.includes(b.status) &&
    b.pickupDate <= filter.pickupDate.$lte &&
    b.dropDate >= filter.dropDate.$gte &&
    (!filter._id?.$ne || b._id !== filter._id.$ne)
  );
}

const live = () => bookings.filter((b) => ["pending", "confirmed", "active"].includes(b.status));

function hasOverlap(list) {
  return list.some((a, i) => list.some((b, j) => i < j && a.car === b.car && a.pickupDate <= b.dropDate && b.pickupDate <= a.dropDate));
}

function installBookingStore() {
  mock.method(Booking, "findOne", async (filter) => {
    await wait(1);
    if (filter.user) {
      const stored = bookings.find((b) => b._id === filter._id && b.user === filter.user);
      return stored ? { ...stored } : null;
    }
    return bookings.find((b) => overlaps(b, filter)) ?? null;
  });
  mock.method(Booking, "create", async (doc) => {
    const n = inserts++;
    const _id = `b${n}`; // allocated up front, before the insert becomes visible
    await stall.create?.(n);
    await wait(insertDelay(n));
    bookings.push({ ...doc, _id, bookingNumber: `BK${n}`, car: String(doc.car) });
    return { _id, bookingNumber: `BK${n}` };
  });
  // The reschedule's conditional write: applies only if the stored booking still matches every field.
  mock.method(Booking, "findOneAndUpdate", async (filter, update) => {
    await wait(1);
    await stall.write?.();
    const stored = bookings.find((b) => b._id === filter._id);
    if (!stored || Object.entries(filter).some(([key, value]) => stored[key] !== value)) return null;
    await wait(insertDelay(0));
    Object.assign(stored, update.$set);
    return { ...stored };
  });
  mock.method(Booking, "deleteOne", async (filter) => {
    await wait(1);
    bookings = bookings.filter((b) => b._id !== filter._id);
  });
  mock.method(Booking, "updateOne", async (filter, update) => {
    await wait(1);
    const stored = bookings.find((b) => b._id === filter._id);
    if (stored && Object.entries(filter).every(([key, value]) => String(stored[key]) === String(value))) Object.assign(stored, update.$set);
  });
  mock.method(Booking, "findById", (id) => {
    const q = { populate: () => q, then: (ok, fail) => Promise.resolve({ _id: id }).then(ok, fail) };
    return q;
  });
}

const car = { _id: "car1", brand: "Honda", model: "City", pricePerDay: 2000, securityDeposit: 5000, isActive: true, isAvailable: true };
const user = (n) => ({ _id: `user${n}`, email: `u${n}@example.com`, name: `U${n}` });
const request = (pickup, drop) => ({ carId: "car1", pickupDate: at(pickup).toISOString(), dropDate: at(drop).toISOString() });
const noEmail = () => ({ sendEmail: async () => {} });

beforeEach(() => {
  stubTransactions();
  locks = new Map();
  bookings = [];
  inserts = 0;
  insertDelay = () => 1;
  dbNow = 1_000_000;
  stall = {};
  installLockStore();
  installBookingStore();
  mock.method(Car, "findById", async (id) => ({ ...car, _id: id }));
  mock.method(Payment, "updateMany", async () => ({}));
});
afterEach(() => mock.restoreAll());

describe("concurrent bookings for the same car", () => {
  it("lets one win when the earlier-allocated insert is the slow one (the reordered-insert race)", async () => {
    // Request A allocates the smaller id but its insert takes a long time to become visible; B's is
    // quick. The old read/insert/re-read sequence (B ignores nothing, A ignores B by id) accepted both.
    insertDelay = (n) => (n === 0 ? 60 : 1);

    const results = await Promise.allSettled([
      createBooking({ user: user(1), input: request(48, 96) }, noEmail()),
      createBooking({ user: user(2), input: request(72, 120) }, noEmail()),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const loser = results.find((r) => r.status === "rejected").reason;
    assert.equal(loser.statusCode, 409);
    assert.equal(loser.message, "Car is not available for the selected dates");
    assert.equal(live().length, 1);
    assert.equal(hasOverlap(live()), false);
  });

  it("lets exactly one of many simultaneous requests through", async () => {
    insertDelay = (n) => (n % 3) * 10;

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => createBooking({ user: user(i), input: request(48, 96 + i) }, noEmail()))
    );

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results.filter((r) => r.status === "rejected")) assert.equal(r.reason.statusCode, 409);
    assert.equal(live().length, 1);
  });

  it("books requests for non-overlapping dates one after another", async () => {
    const results = await Promise.allSettled([
      createBooking({ user: user(1), input: request(24, 48) }, noEmail()),
      createBooking({ user: user(2), input: request(100, 124) }, noEmail()),
      createBooking({ user: user(3), input: request(200, 224) }, noEmail()),
    ]);

    assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled", "fulfilled"]);
    assert.equal(live().length, 3);
  });

  it("does not make different cars wait for each other", async () => {
    insertDelay = (n) => (n === 0 ? 80 : 1);

    const slow = createBooking({ user: user(1), input: request(48, 96) }, noEmail());
    const started = Date.now();
    await createBooking({ user: user(2), input: { ...request(48, 96), carId: "car2" } }, noEmail());
    const otherCarTook = Date.now() - started;
    await slow;

    assert.ok(otherCarTook < 60, `another car's booking waited ${otherCarTook}ms for car1's slow insert`);
    assert.equal(live().length, 2);
  });

  it("gives the losing request's coupon claim back", async () => {
    insertDelay = (n) => (n === 0 ? 40 : 1);
    mock.method(Coupon, "findOne", async () => ({ _id: "c1", minBookingAmount: 0, perUserLimit: 1, usageLimit: 0, type: "fixed", value: 100 }));
    mock.method(Coupon, "findOneAndUpdate", async () => ({ _id: "c1" }));
    const release = mock.method(Coupon, "updateOne", async () => ({}));

    const results = await Promise.allSettled([
      createBooking({ user: user(1), input: { ...request(48, 96), couponCode: "save" } }, noEmail()),
      createBooking({ user: user(2), input: { ...request(60, 100), couponCode: "save" } }, noEmail()),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(release.mock.callCount(), 1);
    assert.deepEqual(release.mock.calls[0].arguments[1], { $inc: { usageCount: -1 }, $pull: { usedBy: results[0].status === "rejected" ? "user1" : "user2" } });
  });

  it("frees the car for the next request once a booking is done", async () => {
    await createBooking({ user: user(1), input: request(48, 96) }, noEmail());

    assert.equal(locks.size, 0);
  });
});

describe("competing reschedules", () => {
  const stored = (id, userId, pickup, drop) => ({
    _id: id, user: userId, car: "car1", status: "confirmed", rentalType: "day", paymentStatus: "pending",
    pickupDate: at(pickup), dropDate: at(drop), totalDays: 2, baseAmount: 4000, discountAmount: 0, taxAmount: 720, totalAmount: 9720,
  });
  const move = (userId, id, pickup, drop) =>
    rescheduleUserBooking(userId, id, { pickupDate: at(pickup).toISOString(), dropDate: at(drop).toISOString() });

  it("lets only one of two bookings move onto the same dates", async () => {
    bookings.push(stored("r1", "user1", 24, 72), stored("r2", "user2", 300, 348));
    insertDelay = () => 25;

    const results = await Promise.allSettled([move("user1", "r1", 500, 548), move("user2", "r2", 510, 558)]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.statusCode, 409);
    assert.equal(hasOverlap(live()), false);
  });

  it("serializes a reschedule against a new booking for the same dates", async () => {
    bookings.push(stored("r1", "user1", 24, 72));
    insertDelay = () => 25;

    const results = await Promise.allSettled([
      move("user1", "r1", 500, 548),
      createBooking({ user: user(2), input: request(510, 558) }, noEmail()),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(hasOverlap(live()), false);
  });

  it("leaves the loser exactly where it was", async () => {
    bookings.push(stored("r1", "user1", 24, 72), stored("r2", "user2", 300, 348));

    await move("user1", "r1", 500, 548);
    const before = { ...bookings.find((b) => b._id === "r2") };
    await assert.rejects(move("user2", "r2", 510, 558), { statusCode: 409 });

    assert.deepEqual(bookings.find((b) => b._id === "r2"), before);
  });
});

describe("withCarLock", () => {
  it("runs claims for one car one at a time", async () => {
    let running = 0;
    let peak = 0;
    const claim = () =>
      withCarLock("car1", async () => {
        peak = Math.max(peak, ++running);
        await wait(10);
        running--;
      }, { retryMs: 2 });

    await Promise.all([claim(), claim(), claim(), claim()]);

    assert.equal(peak, 1);
    assert.equal(locks.size, 0);
  });

  it("releases the lock when the claim throws", async () => {
    await assert.rejects(withCarLock("car1", async () => { throw new Error("boom"); }), /boom/);

    assert.equal(locks.size, 0);
  });

  it("gives up with a 409 'try again' when the lock stays held", async () => {
    locks.set("car1", { car: "car1", owner: "someone-else", expiresAt: dbNow + 60_000 });
    const fn = mock.fn(async () => {});

    await assert.rejects(withCarLock("car1", fn, { waitMs: 30, retryMs: 5 }), { statusCode: 409, message: /try again/i });

    assert.equal(fn.mock.callCount(), 0);
    assert.equal(locks.get("car1").owner, "someone-else", "must not release a lock it never held");
  });

  it("takes over a lock whose lease has expired", async () => {
    locks.set("car1", { car: "car1", owner: "crashed", expiresAt: dbNow - 1000 });
    const fn = mock.fn(async () => "done");

    assert.equal(await withCarLock("car1", fn), "done");

    assert.equal(fn.mock.callCount(), 1);
    assert.equal(locks.size, 0);
  });

  it("does not remove a lock that was taken over after its own lease ran out", async () => {
    await assert.rejects(withCarLock("car1", async () => {
      dbNow += 20_000; // lease over
      locks.get("car1").owner = "newer-claim";
    }), { statusCode: 409 });

    assert.equal(locks.get("car1")?.owner, "newer-claim");
  });

  it("assertHeld passes while the lease is valid and fails once it has run out, even with nobody else in", async () => {
    await assert.rejects(withCarLock("car1", async (lock) => {
      await lock.assertHeld();
      dbNow += 20_000;
      await assert.rejects(lock.assertHeld(), { statusCode: 409, message: /took too long/ });
    }), { statusCode: 409 });
  });

  it("assertHeld fails once another claim has taken the lock over", async () => {
    await assert.rejects(withCarLock("car1", async (lock) => {
      dbNow += 20_000;
      await withCarLock("car1", async () => {
        // the first claim's lease is gone and this one holds the car now
        await assert.rejects(lock.assertHeld(), { statusCode: 409 });
      });
    }), { statusCode: 409 });
  });

  it("does not make different cars wait for each other", async () => {
    let otherRan = false;
    await withCarLock("car1", async () => {
      await withCarLock("car2", async () => { otherRan = true; });
    });

    assert.equal(otherRan, true);
  });
});

// Lease-expiry write isolation is covered against a real replica set in reservationLock.mongo.test.js.

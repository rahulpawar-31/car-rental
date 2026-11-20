// Runs the reservation lock and the booking race against a real MongoDB, because the lock relies
// on server-side behaviour (unique keys, $$NOW, atomic updates) that mocks can only imitate.
// Skipped unless MONGO_TEST_URL points at a throwaway replica set, e.g.
//   MONGO_TEST_URL=mongodb://127.0.0.1:27017/car_rental_test?replicaSet=rs0 npm test
// Clears the cars, bookings and reservationlocks collections in car_rental_test_reservations.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const url = process.env.MONGO_TEST_URL;
const skip = !url && "set MONGO_TEST_URL to run against a real MongoDB";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HOUR = 3600 * 1000;

describe("reservation lock on a real MongoDB", { skip }, () => {
  let ReservationLock, Booking, Car, withCarLock, createBooking;

  before(async () => {
    await mongoose.connect(url, { dbName: "car_rental_test_reservations" });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(hello.setName || hello.msg === "isdbgrid", "MONGO_TEST_URL must point to a replica set or mongos");
    ({ default: ReservationLock } = await import("../src/model/reservationLock.model.js"));
    ({ default: Booking } = await import("../src/model/booking.model.js"));
    ({ default: Car } = await import("../src/model/car.model.js"));
    ({ withCarLock } = await import("../src/services/reservationLock.js"));
    ({ createBooking } = await import("../src/services/booking.js"));
    await ReservationLock.init();
  });
  after(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([ReservationLock.deleteMany({}), Booking.deleteMany({}), Car.collection.deleteMany({})]);
  });

  it("lets exactly one of many parallel claims hold the lock at a time", async () => {
    const car = new mongoose.Types.ObjectId();
    let running = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 25 }, () =>
        withCarLock(car, async () => {
          peak = Math.max(peak, ++running);
          await wait(5);
          running--;
        }, { retryMs: 3, waitMs: 20_000 })
      )
    );

    assert.equal(peak, 1);
    assert.equal(await ReservationLock.countDocuments({ car }), 0, "every claim released its lock");
  });

  it("times a waiting claim out with a 409 while the lock is held", async () => {
    const car = new mongoose.Types.ObjectId();
    await withCarLock(car, async () => {
      await assert.rejects(withCarLock(car, async () => {}, { waitMs: 40, retryMs: 5 }), { statusCode: 409 });
    });
  });

  it("takes over an expired lease, after which the old holder no longer holds the lock", async () => {
    const car = new mongoose.Types.ObjectId();

    await assert.rejects(withCarLock(car, async (first) => {
      await first.assertHeld();
      await ReservationLock.updateOne({ car }, { $set: { expiresAt: new Date(Date.now() - 1000) } }, { session: null });

      await withCarLock(car, async (second) => {
        await second.assertHeld();
        await assert.rejects(first.assertHeld(), { statusCode: 409 });
      });
    }), { statusCode: 409 });
  });

  it("fails assertHeld when the lease has simply run out", async () => {
    const car = new mongoose.Types.ObjectId();
    await assert.rejects(withCarLock(car, async (lock) => {
      await ReservationLock.updateOne({ car }, { $set: { expiresAt: new Date(Date.now() - 1) } }, { session: null });
      await lock.assertHeld(); // the snapshot may still see the old lease; the commit WRITE fences it
    }), { statusCode: 409 });
  });

  it("books one of many simultaneous overlapping requests for the same car", async () => {
    const car = new mongoose.Types.ObjectId();
    await Car.collection.insertOne({ _id: car, brand: "Honda", model: "City", pricePerDay: 2000, securityDeposit: 1000, isActive: true, isAvailable: true });
    const request = (i) => ({
      user: { _id: new mongoose.Types.ObjectId(), email: `u${i}@example.com`, name: `U${i}` },
      input: {
        carId: String(car),
        pickupDate: new Date(Date.now() + 48 * HOUR).toISOString(),
        dropDate: new Date(Date.now() + (96 + i) * HOUR).toISOString(),
      },
    });

    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => createBooking(request(i), { sendEmail: async () => {} })));

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(results.filter((r) => r.status === "rejected").map((r) => r.reason.message)));
    for (const r of results.filter((r) => r.status === "rejected")) assert.equal(r.reason.statusCode, 409);
    assert.equal(await Booking.countDocuments({ car, status: "pending" }), 1);
  });
});

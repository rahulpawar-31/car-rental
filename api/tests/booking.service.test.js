import { describe, it, afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/model/booking.model.js";
import Car from "../src/model/car.model.js";
import Coupon from "../src/model/coupon.model.js";
import Location from "../src/model/location.model.js";
import Payment from "../src/model/payment.model.js";
import ReservationLock from "../src/model/reservationLock.model.js";
import { stubTransactions } from "./helpers/transactions.js";
import {
  parseRentalWindow,
  assertRentalSpan,
  calculateRefund,
  deriveTracking,
  createBooking,
  listUserBookings,
  cancelUserBooking,
  rescheduleUserBooking,
  previewCoupon,
} from "../src/services/booking.js";

const HOUR = 60 * 60 * 1000;
const inHours = (h) => new Date(Date.now() + h * HOUR);

// Nothing else is booking this car: the reservation lock is always free. (The lock itself, and
// what happens when it is contended, is covered in reservationLock.test.js.)
beforeEach(() => {
  stubTransactions();
  mock.method(ReservationLock, "findOneAndUpdate", async () => ({})); // taken straight away
  mock.method(ReservationLock, "exists", async () => ({ _id: "lock" })); // and still held at commit
  mock.method(ReservationLock, "create", async () => ({}));
  mock.method(ReservationLock, "deleteOne", async () => ({}));
});

afterEach(() => mock.restoreAll());

// Query-builder stand-in: every chained call returns itself and awaiting it yields `result`.
function chain(result) {
  const q = {
    populate: () => q,
    sort: () => q,
    skip: () => q,
    limit: () => q,
    select: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

// Makes a model method return the given values in call order (the last one repeats).
function sequence(model, method, ...values) {
  let i = 0;
  return mock.method(model, method, () => values[Math.min(i++, values.length - 1)]);
}

async function rejectsWith(promise, status, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, status);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

describe("parseRentalWindow", () => {
  it("returns parsed dates for a valid future range", () => {
    const { pickup, drop } = parseRentalWindow(inHours(24).toISOString(), inHours(48).toISOString());
    assert.ok(pickup instanceof Date && drop instanceof Date);
    assert.ok(pickup < drop);
  });

  it("rejects an unparseable date", () => {
    assert.throws(() => parseRentalWindow("nope", inHours(48).toISOString()), { message: "Invalid date format", statusCode: 400 });
  });

  it("rejects a drop that isn't after pickup", () => {
    const d = inHours(24).toISOString();
    assert.throws(() => parseRentalWindow(d, d), { message: "Drop date must be after pickup date", statusCode: 400 });
  });

  it("rejects a pickup in the past", () => {
    assert.throws(() => parseRentalWindow(inHours(-5).toISOString(), inHours(5).toISOString()), {
      message: "Pickup date cannot be in the past",
      statusCode: 400,
    });
  });
});

describe("assertRentalSpan", () => {
  const pickup = new Date("2030-01-01T10:00:00Z");
  const at = (h) => new Date(pickup.getTime() + h * HOUR);

  it("requires totalHours for hourly rentals", () => {
    assert.throws(() => assertRentalSpan({ rentalType: "hour", pickup, drop: at(3) }), {
      message: "totalHours is required for hourly rentals",
    });
  });

  it("rejects an hourly rental whose totalHours is more than an hour off the span", () => {
    assert.throws(() => assertRentalSpan({ rentalType: "hour", pickup, drop: at(3), totalHours: 5 }), {
      message: "totalHours must match the selected pickup/drop time range",
    });
  });

  it("tolerates up to an hour of drift on hourly rentals", () => {
    assert.doesNotThrow(() => assertRentalSpan({ rentalType: "hour", pickup, drop: at(3), totalHours: 4 }));
  });

  it("caps airport transfers at 24 hours", () => {
    assert.throws(() => assertRentalSpan({ rentalType: "airport", pickup, drop: at(25) }), { statusCode: 400 });
    assert.doesNotThrow(() => assertRentalSpan({ rentalType: "airport", pickup, drop: at(24) }));
  });

  it("puts no span rules on daily rentals", () => {
    assert.doesNotThrow(() => assertRentalSpan({ rentalType: "day", pickup, drop: at(24 * 30) }));
  });
});

describe("calculateRefund", () => {
  const booking = (hoursAway) => ({ pickupDate: inHours(hoursAway), totalAmount: 10000, securityDeposit: 2000 });

  it("refunds everything but the deposit at 48h or more", () => {
    assert.equal(calculateRefund(booking(72)), 8000);
  });

  it("refunds half of that between 24h and 48h", () => {
    assert.equal(calculateRefund(booking(30)), 4000);
  });

  it("refunds nothing inside 24h", () => {
    assert.equal(calculateRefund(booking(10)), 0);
  });

  it("uses the tier boundaries inclusively", () => {
    const now = new Date("2030-01-01T00:00:00Z");
    const at = (h) => ({ pickupDate: new Date(now.getTime() + h * HOUR), totalAmount: 10000, securityDeposit: 2000 });
    assert.equal(calculateRefund(at(48), now), 8000);
    assert.equal(calculateRefund(at(24), now), 4000);
    assert.equal(calculateRefund(at(23.9), now), 0);
  });
});

describe("deriveTracking", () => {
  const now = new Date("2030-01-10T12:00:00Z");
  const base = { pickupDate: "2030-01-10T10:00:00Z", dropDate: "2030-01-10T20:00:00Z" };

  it("reports cancelled and completed bookings as such", () => {
    assert.equal(deriveTracking({ ...base, status: "cancelled" }, now).trackingStatus, "cancelled");

    const done = deriveTracking({ ...base, status: "completed", actualDropDate: "2030-01-10T19:00:00Z" }, now);
    assert.equal(done.trackingStatus, "completed");
    assert.equal(done.timeInfo.completedAt, "2030-01-10T19:00:00Z");
  });

  it("is active inside the rental window, with hours remaining rounded to 1dp", () => {
    const { trackingStatus, timeInfo } = deriveTracking({ ...base, status: "confirmed" }, now);
    assert.equal(trackingStatus, "active");
    assert.equal(timeInfo.hoursRemaining, 8);
    assert.deepEqual(timeInfo.dropDate, new Date(base.dropDate));
  });

  it("is active for a booking marked active even outside the window, with 0 hours remaining", () => {
    const late = new Date("2030-01-11T00:00:00Z");
    const { trackingStatus, timeInfo } = deriveTracking({ ...base, status: "active" }, late);
    assert.equal(trackingStatus, "active");
    assert.equal(timeInfo.hoursRemaining, 0);
  });

  it("is upcoming before pickup, with hours until pickup", () => {
    const early = new Date("2030-01-10T07:30:00Z");
    const { trackingStatus, timeInfo } = deriveTracking({ ...base, status: "confirmed" }, early);
    assert.equal(trackingStatus, "upcoming");
    assert.equal(timeInfo.hoursUntilPickup, 2.5);
    assert.deepEqual(timeInfo.pickupDate, new Date(base.pickupDate));
  });

  it("falls back to the stored status once the window has passed without completion", () => {
    const after = new Date("2030-01-11T00:00:00Z");
    const { trackingStatus, timeInfo } = deriveTracking({ ...base, status: "confirmed" }, after);
    assert.equal(trackingStatus, "confirmed");
    assert.deepEqual(timeInfo, {});
  });
});

describe("createBooking", () => {
  const user = { _id: "user1", email: "u@example.com", name: "U" };
  const car = { _id: "car1", brand: "Honda", model: "City", pricePerDay: 2000, securityDeposit: 5000, isActive: true, isAvailable: true };
  const input = () => ({
    carId: "car1",
    pickupDate: inHours(24).toISOString(),
    dropDate: inHours(72).toISOString(),
  });
  const noEmail = () => ({ sendEmail: mock.fn(async () => {}) });

  it("rejects with 409 when the car is already booked for the dates", async () => {
    sequence(Booking, "findOne", { _id: "other" });
    const create = mock.method(Booking, "create", async () => ({}));

    await rejectsWith(createBooking({ user, input: input() }, noEmail()), 409, "Car is not available for the selected dates");
    assert.equal(create.mock.callCount(), 0);
  });

  it("rejects with 404 when the car is missing, inactive or unavailable", async () => {
    sequence(Booking, "findOne", null);
    sequence(Car, "findById", { ...car, isAvailable: false });

    await rejectsWith(createBooking({ user, input: input() }, noEmail()), 404, "Car not available");
  });

  describe("pickup and drop-off branches", () => {
    const withDrop = () => ({ ...input(), dropLocationId: "loc1" });
    const withPickup = () => ({ ...input(), pickupLocationId: "loc1" });
    const branch = (extra) => chain({ _id: "loc1", name: "Pune Kothrud", isActive: true, ...extra });

    it("rejects a branch that does not accept returns, before claiming a coupon or creating anything", async () => {
      sequence(Booking, "findOne", null);
      sequence(Car, "findById", car);
      sequence(Location, "findById", branch({ isDropAvailable: false }));
      const claim = mock.method(Coupon, "findOneAndUpdate", async () => ({}));
      const create = mock.method(Booking, "create", async () => ({}));

      await rejectsWith(createBooking({ user, input: { ...withDrop(), couponCode: "SAVE10" } }, noEmail()), 400, "Cars cannot be returned to Pune Kothrud");
      assert.equal(claim.mock.callCount(), 0);
      assert.equal(create.mock.callCount(), 0);
    });

    it("rejects a drop-off branch that does not exist or is inactive", async () => {
      sequence(Booking, "findOne", null);
      sequence(Car, "findById", car);
      sequence(Location, "findById", chain(null), branch({ isActive: false }));

      await rejectsWith(createBooking({ user, input: withDrop() }, noEmail()), 400, "Drop-off location not found");
      await rejectsWith(createBooking({ user, input: withDrop() }, noEmail()), 400, "Drop-off location not found");
    });

    it("rejects a pickup branch that does not hand cars out, before claiming a coupon or creating anything", async () => {
      sequence(Booking, "findOne", null);
      sequence(Car, "findById", car);
      sequence(Location, "findById", branch({ isPickupAvailable: false }));
      const claim = mock.method(Coupon, "findOneAndUpdate", async () => ({}));
      const create = mock.method(Booking, "create", async () => ({}));

      await rejectsWith(createBooking({ user, input: { ...withPickup(), couponCode: "SAVE10" } }, noEmail()), 400, "Cars cannot be picked up from Pune Kothrud");
      assert.equal(claim.mock.callCount(), 0);
      assert.equal(create.mock.callCount(), 0);
    });

    it("rejects a pickup branch that does not exist or is inactive", async () => {
      sequence(Booking, "findOne", null);
      sequence(Car, "findById", car);
      sequence(Location, "findById", chain(null), branch({ isActive: false }));

      await rejectsWith(createBooking({ user, input: withPickup() }, noEmail()), 400, "Pickup location not found");
      await rejectsWith(createBooking({ user, input: withPickup() }, noEmail()), 400, "Pickup location not found");
    });

    it("still answers 404 for an unavailable car before looking at the branches", async () => {
      sequence(Booking, "findOne", null);
      sequence(Car, "findById", { ...car, isAvailable: false });
      sequence(Location, "findById", chain(null));

      await rejectsWith(createBooking({ user, input: { ...withPickup(), dropLocationId: "loc2" } }, noEmail()), 404, "Car not available");
    });

    it("books normally between branches that allow it (including ones that never set the flags)", async () => {
      sequence(Booking, "findOne", null, null);
      sequence(Car, "findById", car);
      const lookup = sequence(Location, "findById", branch({ name: "Mumbai Hub" }));
      const create = mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
      sequence(Booking, "findById", chain({ _id: "b1" }));

      await createBooking({ user, input: { ...input(), pickupLocationId: "loc1", dropLocationId: "loc2" } }, noEmail());

      assert.equal(lookup.mock.callCount(), 2);
      const doc = create.mock.calls[0].arguments[0];
      assert.equal(doc.pickupLocation, "loc1");
      assert.equal(doc.dropLocation, "loc2");
    });

    it("does not look up a branch when none was chosen (drop at the pickup branch)", async () => {
      sequence(Booking, "findOne", null, null);
      sequence(Car, "findById", car);
      const lookup = mock.method(Location, "findById", () => chain(null));
      mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
      sequence(Booking, "findById", chain({ _id: "b1" }));

      await createBooking({ user, input: input() }, noEmail());
      assert.equal(lookup.mock.callCount(), 0);
    });
  });

  it("creates a priced pending booking, returns it populated and sends the confirmation email", async () => {
    sequence(Booking, "findOne", null, null);
    sequence(Car, "findById", car);
    const create = mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
    const populated = { _id: "b1", car: { brand: "Honda" } };
    sequence(Booking, "findById", chain(populated));
    const deps = noEmail();

    const result = await createBooking({ user, input: input() }, deps);

    assert.equal(result, populated);
    const doc = create.mock.calls[0].arguments[0];
    assert.equal(doc.user, "user1");
    assert.equal(doc.car, "car1");
    assert.equal(doc.status, "pending");
    assert.equal(doc.rentalType, "day");
    assert.equal(doc.totalDays, 2);
    assert.equal(doc.baseAmount, 4000);
    assert.equal(doc.totalAmount, 4000 + 720 + 5000);
    assert.equal(doc.coupon, null);

    assert.equal(deps.sendEmail.mock.callCount(), 1);
    const [email, name, details] = deps.sendEmail.mock.calls[0].arguments;
    assert.equal(email, "u@example.com");
    assert.equal(name, "U");
    assert.equal(details.bookingNumber, "BK1");
    assert.equal(details.carName, "Honda City");
  });

  it("still returns the booking when the confirmation email fails", async () => {
    sequence(Booking, "findOne", null, null);
    sequence(Car, "findById", car);
    mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
    sequence(Booking, "findById", chain({ _id: "b1" }));

    const result = await createBooking({ user, input: input() }, { sendEmail: async () => { throw new Error("smtp down"); } });
    assert.deepEqual(result, { _id: "b1" });
  });

  it("rejects when the coupon claim loses the race, without creating a booking", async () => {
    sequence(Booking, "findOne", null);
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", { _id: "c1", minBookingAmount: 0, perUserLimit: 1, usageLimit: 0, type: "fixed", value: 100 });
    sequence(Coupon, "findOneAndUpdate", null);
    const create = mock.method(Booking, "create", async () => ({}));

    await rejectsWith(
      createBooking({ user, input: { ...input(), couponCode: "save" } }, noEmail()),
      400,
      "Coupon already used or limit reached"
    );
    assert.equal(create.mock.callCount(), 0);
  });

  it("gives the coupon claim back, and creates nothing, when another request wins the dates inside the lock", async () => {
    sequence(Booking, "findOne", null, { _id: "earlier" }); // early check clear, authoritative check loses
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", { _id: "c1", minBookingAmount: 0, perUserLimit: 1, usageLimit: 0, type: "fixed", value: 100 });
    sequence(Coupon, "findOneAndUpdate", { _id: "c1" });
    const create = mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
    const updateOne = mock.method(Coupon, "updateOne", async () => ({}));
    const deps = noEmail();

    await rejectsWith(createBooking({ user, input: { ...input(), couponCode: "save" } }, deps), 409, "Car is not available for the selected dates");

    assert.equal(create.mock.callCount(), 0);
    assert.deepEqual(updateOne.mock.calls[0].arguments, [
      { _id: "c1" },
      { $inc: { usageCount: -1 }, $pull: { usedBy: "user1" } },
    ]);
    assert.equal(deps.sendEmail.mock.callCount(), 0);
  });

  describe("after the coupon is claimed", () => {
    const claimed = () => {
      sequence(Booking, "findOne", null, null);
      sequence(Car, "findById", car);
      sequence(Coupon, "findOne", { _id: "c1", minBookingAmount: 0, perUserLimit: 1, usageLimit: 0, type: "fixed", value: 100 });
      sequence(Coupon, "findOneAndUpdate", { _id: "c1" });
    };
    const withCoupon = () => ({ ...input(), couponCode: "save" });
    const release = { $inc: { usageCount: -1 }, $pull: { usedBy: "user1" } };

    it("gives the claim back when Booking.create throws", async () => {
      claimed();
      mock.method(Booking, "create", async () => { throw new Error("ValidationError: licenseExpiry"); });
      const updateOne = mock.method(Coupon, "updateOne", async () => ({}));

      await assert.rejects(createBooking({ user, input: withCoupon() }, noEmail()), /ValidationError/);

      assert.deepEqual(updateOne.mock.calls[0].arguments, [{ _id: "c1" }, release]);
    });

    it("keeps the claim once the booking exists, even if a later step fails", async () => {
      claimed();
      mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
      sequence(Booking, "findById", { populate: () => { throw new Error("db down"); } });
      const updateOne = mock.method(Coupon, "updateOne", async () => ({}));

      await assert.rejects(createBooking({ user, input: withCoupon() }, noEmail()), /db down/);

      assert.equal(updateOne.mock.callCount(), 0);
    });

    it("reports the original failure even if giving the claim back fails too", async () => {
      claimed();
      mock.method(Booking, "create", async () => { throw new Error("create failed"); });
      mock.method(Coupon, "updateOne", async () => { throw new Error("release failed"); });

      await assert.rejects(createBooking({ user, input: withCoupon() }, noEmail()), /create failed/);
    });

    it("claims no coupon, so releases nothing, when there is no coupon code", async () => {
      sequence(Booking, "findOne", null, null);
      sequence(Car, "findById", car);
      mock.method(Booking, "create", async () => { throw new Error("create failed"); });
      const updateOne = mock.method(Coupon, "updateOne", async () => ({}));

      await assert.rejects(createBooking({ user, input: input() }, noEmail()), /create failed/);

      assert.equal(updateOne.mock.callCount(), 0);
    });
  });
});

describe("listUserBookings", () => {
  it("returns the page of bookings with pagination metadata", async () => {
    const find = mock.method(Booking, "find", () => chain([{ _id: "b1" }, { _id: "b2" }]));
    mock.method(Booking, "countDocuments", async () => 25);

    const result = await listUserBookings("user1", { page: 2, limit: 10, status: "confirmed" });

    assert.deepEqual(find.mock.calls[0].arguments[0], { user: "user1", status: "confirmed" });
    assert.equal(result.bookings.length, 2);
    assert.deepEqual(result.pagination, { page: 2, limit: 10, total: 25, pages: 3 });
  });
});

describe("cancelUserBooking", () => {
  const pending = (overrides = {}) => ({
    status: "pending",
    pickupDate: inHours(72),
    totalAmount: 10000,
    securityDeposit: 2000,
    save: mock.fn(async () => {}),
    ...overrides,
  });

  it("404s for a booking that isn't the user's", async () => {
    sequence(Booking, "findOne", null);
    await rejectsWith(cancelUserBooking("user1", "b1", "why"), 404, "Booking not found");
  });

  it("refuses to cancel a booking past the confirmed stage", async () => {
    sequence(Booking, "findOne", pending({ status: "active" }));
    await rejectsWith(cancelUserBooking("user1", "b1", "why"), 400, "Booking cannot be cancelled at this stage");
  });

  it("cancels, records who/why/when and saves the refund", async () => {
    const booking = pending();
    sequence(Booking, "findOne", booking);

    const result = await cancelUserBooking("user1", "b1", "change of plans");

    assert.deepEqual(result, { refundAmount: 8000 });
    assert.equal(booking.status, "cancelled");
    assert.equal(booking.cancellationReason, "change of plans");
    assert.equal(booking.cancelledBy, "user");
    assert.equal(booking.refundAmount, 8000);
    assert.ok(booking.cancelledAt instanceof Date);
    assert.equal(booking.save.mock.callCount(), 1);
  });
});

describe("rescheduleUserBooking", () => {
  const car = { _id: "car1", pricePerDay: 2000, securityDeposit: 5000 };
  const dates = () => {
    const pickup = inHours(100);
    return { pickupDate: pickup.toISOString(), dropDate: new Date(pickup.getTime() + 48 * HOUR).toISOString() };
  };
  const existing = (overrides = {}) => ({
    _id: "b1",
    car: "car1",
    status: "confirmed",
    rentalType: "day",
    pickupDate: inHours(24),
    dropDate: inHours(48),
    totalDays: 1,
    baseAmount: 2000,
    discountAmount: 0,
    taxAmount: 360,
    totalAmount: 7360,
    paymentStatus: "pending",
    save: mock.fn(async () => {}),
    ...overrides,
  });
  // The booking read, the availability check (nobody else holds the dates), and the conditional write.
  const setup = (booking, { conflict = null, wrote = {} } = {}) => {
    sequence(Booking, "findOne", booking, conflict);
    sequence(Car, "findById", car);
    sequence(Booking, "findById", chain({ _id: "b1" }));
    const write = mock.method(Booking, "findOneAndUpdate", async () => wrote);
    const voidPayments = mock.method(Payment, "updateMany", async () => ({}));
    return { write, voidPayments };
  };

  it("only reschedules pending or confirmed bookings", async () => {
    sequence(Booking, "findOne", existing({ status: "completed" }));
    await rejectsWith(rescheduleUserBooking("user1", "b1", dates()), 400, "Only pending or confirmed bookings can be rescheduled");
  });

  it("reprices the booking in one conditional write and voids (not deletes) a stale pending payment", async () => {
    const booking = existing();
    const { write, voidPayments } = setup(booking);

    await rescheduleUserBooking("user1", "b1", dates());

    const [filter, update] = write.mock.calls[0].arguments;
    assert.deepEqual(filter, { _id: "b1", status: "confirmed", paymentStatus: "pending", totalAmount: 7360 }, "only if the booking is still as it was read");
    assert.equal(update.$set.totalDays, 2);
    assert.equal(update.$set.baseAmount, 4000);
    assert.equal(update.$set.totalAmount, 9720);
    assert.equal(update.$set.paymentStatus, "pending");
    assert.equal(booking.save.mock.callCount(), 0);
    assert.deepEqual(voidPayments.mock.calls[0].arguments, [{ booking: "b1", status: "pending" }, { status: "cancelled" }]);
  });

  describe("a paid booking", () => {
    // Two days at 2000/day + 18% tax + 5000 deposit, already collected.
    const paid = (overrides = {}) =>
      existing({ paymentStatus: "paid", totalDays: 2, baseAmount: 4000, taxAmount: 720, totalAmount: 9720, ...overrides });

    it("can move to dates that cost the same, leaving its payment untouched", async () => {
      const { write, voidPayments } = setup(paid());

      await rescheduleUserBooking("user1", "b1", dates()); // 48h, like the original

      const [filter, update] = write.mock.calls[0].arguments;
      assert.deepEqual(filter, { _id: "b1", status: "confirmed", paymentStatus: "paid", totalAmount: 9720 });
      assert.equal("paymentStatus" in update.$set, false, "stays paid");
      assert.equal(update.$set.totalAmount, 9720);
      assert.equal(voidPayments.mock.callCount(), 0);
    });

    it("cannot be extended: one day paid for stays one day, with nothing written", async () => {
      const { write } = setup(existing({ paymentStatus: "paid" })); // 1 day, 7360 paid

      await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), { statusCode: 400, message: /already paid \(₹7360\).*₹9720/ });

      assert.equal(write.mock.callCount(), 0);
    });

    it("cannot be extended from one day to ten", async () => {
      const { write } = setup(existing({ paymentStatus: "paid" }));

      await assert.rejects(
        rescheduleUserBooking("user1", "b1", { pickupDate: inHours(100).toISOString(), dropDate: inHours(100 + 240).toISOString() }),
        { statusCode: 400, message: /already paid/ }
      );

      assert.equal(write.mock.callCount(), 0);
    });

    it("cannot be shortened either, since the difference could not be refunded", async () => {
      const { write } = setup(paid());

      await assert.rejects(
        rescheduleUserBooking("user1", "b1", { pickupDate: inHours(100).toISOString(), dropDate: inHours(124).toISOString() }),
        { statusCode: 400, message: /already paid \(₹9720\).*₹7360/ }
      );

      assert.equal(write.mock.callCount(), 0);
    });
  });

  describe("when the booking changes between the read and the write", () => {
    it("refuses, instead of repricing a booking whose payment just completed", async () => {
      // The checkout for the old amount was confirmed after the booking was read as pending: the
      // conditional write no longer matches, so nothing is repriced and the payment stays valid.
      const { write, voidPayments } = setup(existing(), { wrote: null });

      await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), { statusCode: 409, message: /just updated/ });

      assert.equal(write.mock.callCount(), 1);
      assert.equal(voidPayments.mock.callCount(), 0, "the pending payment is not voided for a move that did not happen");
    });

    it("also refuses when it was cancelled in the meantime", async () => {
      setup(existing(), { wrote: null });

      await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), { statusCode: 409 });
    });
  });

  describe("rental span", () => {
    it("lets an hourly booking move to a window of the same length", async () => {
      const booking = existing({ rentalType: "hour", totalHours: 48 });
      sequence(Booking, "findOne", booking, null);
      sequence(Car, "findById", { ...car, pricePerHour: 100 });
      sequence(Booking, "findById", chain({ _id: "b1" }));
      const write = mock.method(Booking, "findOneAndUpdate", async () => ({}));
      mock.method(Payment, "updateMany", async () => ({}));

      await rescheduleUserBooking("user1", "b1", dates()); // 48h window, 48 totalHours

      assert.equal(write.mock.callCount(), 1);
    });

    it("rejects stretching an hourly booking, which would keep its old hourly price", async () => {
      sequence(Booking, "findOne", existing({ rentalType: "hour", totalHours: 3 }));
      const write = mock.method(Booking, "findOneAndUpdate", async () => ({}));

      await rejectsWith(
        rescheduleUserBooking("user1", "b1", dates()), // 48h window
        400,
        "An hourly booking can only be moved to a window of the same length (3 hours)"
      );
      assert.equal(write.mock.callCount(), 0);
    });

    it("rejects moving an airport transfer to a window past 24 hours", async () => {
      sequence(Booking, "findOne", existing({ rentalType: "airport" }));
      const write = mock.method(Booking, "findOneAndUpdate", async () => ({}));

      await rejectsWith(
        rescheduleUserBooking("user1", "b1", { pickupDate: inHours(100).toISOString(), dropDate: inHours(220).toISOString() }),
        400,
        "Airport transfer bookings can span at most 24 hours — use a daily rental for longer trips"
      );
      assert.equal(write.mock.callCount(), 0);
    });
  });

  describe("when another booking holds the new dates", () => {
    it("rejects with 409 and writes nothing, so there is nothing to restore", async () => {
      const { write, voidPayments } = setup(existing(), { conflict: { _id: "other" } });
      const updateOne = mock.method(Booking, "updateOne", async () => ({}));

      await rejectsWith(rescheduleUserBooking("user1", "b1", dates()), 409, "Car is not available for the selected dates");

      assert.equal(write.mock.callCount(), 0);
      assert.equal(updateOne.mock.callCount(), 0);
      assert.equal(voidPayments.mock.callCount(), 0);
    });

    it("keeps the booking's own dates out of the check, so moving within its own window is allowed", async () => {
      const booking = existing();
      const find = sequence(Booking, "findOne", booking, null);
      sequence(Car, "findById", car);
      sequence(Booking, "findById", chain({ _id: "b1" }));
      mock.method(Booking, "findOneAndUpdate", async () => ({}));
      mock.method(Payment, "updateMany", async () => ({}));

      await rescheduleUserBooking("user1", "b1", dates());

      assert.deepEqual(find.mock.calls[1].arguments[0]._id, { $ne: "b1" });
    });
  });

  it("surfaces a failure of the availability check without writing", async () => {
    const booking = existing();
    let call = 0;
    mock.method(Booking, "findOne", () => {
      if (++call === 1) return booking;
      throw new Error("db down");
    });
    sequence(Car, "findById", car);
    const write = mock.method(Booking, "findOneAndUpdate", async () => ({}));

    await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), /db down/);

    assert.equal(write.mock.callCount(), 0);
  });

  it("aborts a lost lease without a compensating write that could overwrite another booking", async () => {
    const { write } = setup(existing());
    ReservationLock.findOneAndUpdate.mock.restore();
    mock.method(ReservationLock, "findOneAndUpdate", async (filter) => filter.owner ? null : {});
    const restore = mock.method(Booking, "updateOne", async () => ({}));

    await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), { statusCode: 409, message: /took too long/ });

    assert.equal(write.mock.callCount(), 1);
    assert.equal(restore.mock.callCount(), 0, "the transaction aborts rather than restoring public data");
  });

});

describe("previewCoupon", () => {
  const user = { _id: "user1" };
  const car = { _id: "car1", pricePerDay: 2000, securityDeposit: 5000 };
  const body = (extra = {}) => ({
    code: "save",
    carId: "car1",
    pickupDate: "2030-01-01T10:00:00Z",
    dropDate: "2030-01-03T10:00:00Z",
    ...extra,
  });
  const coupon = (overrides = {}) => ({
    code: "SAVE",
    type: "fixed",
    value: 500,
    minBookingAmount: 0,
    usageLimit: 0,
    usageCount: 0,
    perUserLimit: 1,
    usedBy: [],
    ...overrides,
  });

  it("404s for an unknown car", async () => {
    sequence(Car, "findById", null);
    await rejectsWith(previewCoupon(user, body()), 404, "Car not found");
  });

  it("rejects an unknown or expired coupon", async () => {
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", null);
    await rejectsWith(previewCoupon(user, body()), 400, "Invalid or expired coupon");
  });

  it("rejects a coupon that has hit its usage limit", async () => {
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", coupon({ usageLimit: 10, usageCount: 10 }));
    await rejectsWith(previewCoupon(user, body()), 400, "Coupon limit reached");
  });

  it("rejects a booking below the coupon's minimum amount", async () => {
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", coupon({ minBookingAmount: 99999 }));
    await rejectsWith(previewCoupon(user, body()), 400, "Min amount ₹99999 required");
  });

  it("rejects a coupon the user has already used up", async () => {
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", coupon({ usedBy: ["user1"] }));
    await rejectsWith(previewCoupon(user, body()), 400, "Coupon already used");
  });

  it("returns the coupon and the discount createBooking would apply", async () => {
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", coupon());

    const result = await previewCoupon(user, body());

    assert.deepEqual(result, { coupon: { code: "SAVE", type: "fixed", value: 500 }, discountAmount: 500 });
  });
});

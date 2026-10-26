import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Booking from "../src/model/booking.model.js";
import Car from "../src/model/car.model.js";
import Coupon from "../src/model/coupon.model.js";
import Payment from "../src/model/payment.model.js";
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

afterEach(() => mock.restoreAll());

// Query-builder stand-in: every chained call returns itself and awaiting it yields `result`.
function chain(result) {
  const q = {
    populate: () => q,
    sort: () => q,
    skip: () => q,
    limit: () => q,
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

  it("rolls back the booking and the coupon claim when a concurrent request won the dates", async () => {
    sequence(Booking, "findOne", null, { _id: "earlier" }); // pre-check clear, post-create recheck loses
    sequence(Car, "findById", car);
    sequence(Coupon, "findOne", { _id: "c1", minBookingAmount: 0, perUserLimit: 1, usageLimit: 0, type: "fixed", value: 100 });
    sequence(Coupon, "findOneAndUpdate", { _id: "c1" });
    mock.method(Booking, "create", async () => ({ _id: "b1", bookingNumber: "BK1" }));
    const deleteOne = mock.method(Booking, "deleteOne", async () => ({}));
    const updateOne = mock.method(Coupon, "updateOne", async () => ({}));
    const deps = noEmail();

    await rejectsWith(createBooking({ user, input: { ...input(), couponCode: "save" } }, deps), 409, "Car is not available for the selected dates");

    assert.deepEqual(deleteOne.mock.calls[0].arguments[0], { _id: "b1" });
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
  const dates = () => ({ pickupDate: inHours(100).toISOString(), dropDate: inHours(148).toISOString() });
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

  it("only reschedules pending or confirmed bookings", async () => {
    sequence(Booking, "findOne", existing({ status: "completed" }));
    await rejectsWith(rescheduleUserBooking("user1", "b1", dates()), 400, "Only pending or confirmed bookings can be rescheduled");
  });

  it("reprices the booking and voids a stale pending payment", async () => {
    const booking = existing();
    sequence(Booking, "findOne", booking, null, null); // booking, conflict check, post-save recheck
    sequence(Car, "findById", car);
    const deleteOne = mock.method(Payment, "deleteOne", async () => ({}));
    sequence(Booking, "findById", chain({ _id: "b1" }));

    await rescheduleUserBooking("user1", "b1", dates());

    assert.equal(booking.totalDays, 2);
    assert.equal(booking.baseAmount, 4000);
    assert.equal(booking.paymentStatus, "pending");
    assert.equal(booking.save.mock.callCount(), 1);
    assert.deepEqual(deleteOne.mock.calls[0].arguments[0], { booking: "b1", status: "pending" });
  });

  it("leaves a paid booking's payment untouched", async () => {
    const booking = existing({ paymentStatus: "paid" });
    sequence(Booking, "findOne", booking, null, null);
    sequence(Car, "findById", car);
    const deleteOne = mock.method(Payment, "deleteOne", async () => ({}));
    sequence(Booking, "findById", chain({ _id: "b1" }));

    await rescheduleUserBooking("user1", "b1", dates());

    assert.equal(booking.paymentStatus, "paid");
    assert.equal(deleteOne.mock.callCount(), 0);
  });

  describe("rental span", () => {
    it("lets an hourly booking move to a window of the same length", async () => {
      const booking = existing({ rentalType: "hour", totalHours: 48 });
      sequence(Booking, "findOne", booking, null, null);
      sequence(Car, "findById", { ...car, pricePerHour: 100 });
      mock.method(Payment, "deleteOne", async () => ({}));
      sequence(Booking, "findById", chain({ _id: "b1" }));

      await rescheduleUserBooking("user1", "b1", dates()); // 48h window, 48 totalHours

      assert.equal(booking.save.mock.callCount(), 1);
    });

    it("rejects stretching an hourly booking, which would keep its old hourly price", async () => {
      const booking = existing({ rentalType: "hour", totalHours: 3 });
      sequence(Booking, "findOne", booking);

      await rejectsWith(
        rescheduleUserBooking("user1", "b1", dates()), // 48h window
        400,
        "An hourly booking can only be moved to a window of the same length (3 hours)"
      );
      assert.equal(booking.save.mock.callCount(), 0);
    });

    it("rejects moving an airport transfer to a window past 24 hours", async () => {
      const booking = existing({ rentalType: "airport" });
      sequence(Booking, "findOne", booking);

      await rejectsWith(
        rescheduleUserBooking("user1", "b1", { pickupDate: inHours(100).toISOString(), dropDate: inHours(220).toISOString() }),
        400,
        "Airport transfer bookings can span at most 24 hours — use a daily rental for longer trips"
      );
      assert.equal(booking.save.mock.callCount(), 0);
    });
  });

  describe("when a concurrent booking took the new dates", () => {
    const originalFields = ["pickupDate", "dropDate", "totalDays", "baseAmount", "discountAmount", "taxAmount", "totalAmount", "paymentStatus"];

    it("restores the original dates and amounts with one atomic write", async () => {
      const booking = existing();
      const original = { ...booking };
      sequence(Booking, "findOne", booking, null, { _id: "other" });
      sequence(Car, "findById", car);
      const deleteOne = mock.method(Payment, "deleteOne", async () => ({}));
      const updateOne = mock.method(Booking, "updateOne", async () => ({}));

      await rejectsWith(rescheduleUserBooking("user1", "b1", dates()), 409, "Car is not available for the selected dates");

      assert.equal(booking.save.mock.callCount(), 1); // only the reschedule itself
      assert.equal(updateOne.mock.callCount(), 1);
      const [filter, update] = updateOne.mock.calls[0].arguments;
      assert.deepEqual(filter, { _id: "b1" });
      assert.deepEqual(Object.keys(update.$set).sort(), [...originalFields].sort());
      for (const key of originalFields) assert.deepEqual(update.$set[key], original[key], key);
      assert.equal(deleteOne.mock.callCount(), 0);
    });

    it("retries the restore once before giving up", async () => {
      let attempts = 0;
      sequence(Booking, "findOne", existing(), null, { _id: "other" });
      sequence(Car, "findById", car);
      mock.method(Booking, "updateOne", async () => {
        if (++attempts === 1) throw new Error("transient");
        return {};
      });

      await rejectsWith(rescheduleUserBooking("user1", "b1", dates()), 409, "Car is not available for the selected dates");
      assert.equal(attempts, 2);
    });

    it("reports a 500, not a misleading 409, when the booking cannot be restored", async () => {
      sequence(Booking, "findOne", existing(), null, { _id: "other" });
      sequence(Car, "findById", car);
      const updateOne = mock.method(Booking, "updateOne", async () => { throw new Error("db down"); });

      await rejectsWith(
        rescheduleUserBooking("user1", "b1", dates()),
        500,
        "The reschedule conflicted and the booking could not be restored automatically. Please contact support."
      );
      assert.equal(updateOne.mock.callCount(), 2);
    });
  });

  it("restores the original dates when the post-save conflict check itself fails", async () => {
    let call = 0;
    mock.method(Booking, "findOne", () => {
      const n = ++call;
      if (n === 1) return existing();
      if (n === 2) return null;
      throw new Error("db down");
    });
    sequence(Car, "findById", car);
    const updateOne = mock.method(Booking, "updateOne", async () => ({}));

    await assert.rejects(rescheduleUserBooking("user1", "b1", dates()), /db down/);

    assert.equal(updateOne.mock.callCount(), 1);
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

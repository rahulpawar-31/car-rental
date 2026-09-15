import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_BOOKING_STATUSES, bookingConflictQuery } from "../src/services/carAvailability.js";

const pickup = new Date("2026-01-01T10:00:00Z");
const drop = new Date("2026-01-04T10:00:00Z");

describe("ACTIVE_BOOKING_STATUSES", () => {
  it("is the three statuses that hold a car's dates", () => {
    assert.deepEqual(ACTIVE_BOOKING_STATUSES, ["pending", "confirmed", "active"]);
  });
});

describe("bookingConflictQuery", () => {
  it("scopes to a single car when carId is given", () => {
    const query = bookingConflictQuery({ carId: "car1", pickup, drop });

    assert.deepEqual(query, {
      car: "car1",
      status: { $in: ACTIVE_BOOKING_STATUSES },
      pickupDate: { $lte: drop },
      dropDate: { $gte: pickup },
    });
  });

  it("omits the car filter for a fleet-wide check when carId isn't given", () => {
    const query = bookingConflictQuery({ pickup, drop });

    assert.equal("car" in query, false);
    assert.deepEqual(query, {
      status: { $in: ACTIVE_BOOKING_STATUSES },
      pickupDate: { $lte: drop },
      dropDate: { $gte: pickup },
    });
  });

  it("excludes a specific booking by id when rechecking after a save", () => {
    const query = bookingConflictQuery({ carId: "car1", pickup, drop, excludeBookingId: "booking1" });

    assert.deepEqual(query._id, { $ne: "booking1" });
  });

  it("tie-breaks to bookings created before a given id, for the post-create race recheck", () => {
    const query = bookingConflictQuery({ carId: "car1", pickup, drop, tieBreakBeforeId: "booking1" });

    assert.deepEqual(query._id, { $lt: "booking1" });
  });
});

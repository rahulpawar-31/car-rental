import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertRentalSpan, parseRentalWindow } from "../src/services/booking.js";
// The booking forms build their timestamps with this helper. Running its output through the API's
// own rules is what keeps the forms and the duration contract from drifting apart again.
import { buildBookingWindow } from "../../web/src/lib/bookingWindow.js";
import { HOUR_OPTIONS, TIME_SLOTS } from "../../web/src/constants/booking.js";

function futureDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// What the API does with a request, minus the database.
function acceptedBy({ rentalType, totalHours, window }) {
  const { pickup, drop } = parseRentalWindow(window.pickupDate, window.dropDate);
  assertRentalSpan({ rentalType, pickup, drop, totalHours });
  return { pickup, drop };
}

const pickupDate = futureDate(10);

describe("booking form timestamps against the API's duration contract", () => {
  for (const hours of HOUR_OPTIONS) {
    it(`accepts an hourly rental of ${hours}h at every offered pickup time`, () => {
      for (const pickupTime of TIME_SLOTS) {
        const window = buildBookingWindow({ rentalType: "hour", pickupDate, pickupTime, hours });
        const { pickup, drop } = acceptedBy({ rentalType: "hour", totalHours: hours, window });
        assert.equal((drop - pickup) / 3600000, hours, `${hours}h from ${pickupTime}`);
      }
    });
  }

  it("rejects the old date-only window for every hourly duration (the bug)", () => {
    for (const hours of HOUR_OPTIONS) {
      // The forms used to send two consecutive dates, i.e. a 24-hour window, whatever the duration.
      const pickup = new Date(`${pickupDate}T00:00:00Z`);
      const drop = new Date(pickup.getTime() + 24 * 3600000);
      assert.throws(() => assertRentalSpan({ rentalType: "hour", pickup, drop, totalHours: hours }), { statusCode: 400 }, `${hours}h`);
    }
  });

  it("accepts an airport transfer at every offered pickup time", () => {
    for (const pickupTime of TIME_SLOTS) {
      const window = buildBookingWindow({ rentalType: "airport", pickupDate, pickupTime });
      acceptedBy({ rentalType: "airport", window });
    }
  });

  it("accepts a daily rental with chosen pickup and drop times", () => {
    const window = buildBookingWindow({
      rentalType: "day",
      pickupDate,
      pickupTime: "10:30 AM",
      dropDate: futureDate(13),
      dropTime: "6:00 PM",
    });
    const { pickup, drop } = acceptedBy({ rentalType: "day", window });
    assert.ok(drop > pickup);
  });
});

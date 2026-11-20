import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertRentalSpan, parseRentalWindow } from "../src/services/booking.js";
// The booking forms build their timestamps with this helper. Running its output through the API's
// own rules is what keeps the forms and the duration contract from drifting apart again.
import { buildBookingWindow, rentalDays } from "../../web/src/lib/bookingWindow.js";
import { deriveRentalRates, computeBaseAmount, computeTaxAndTotal } from "../../web/src/lib/pricing.js";
import { computeBookingQuote } from "../src/services/booking.quote.js";
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

describe("the total the booking page shows against the server's quote for the same window", () => {
  const car = { pricePerDay: 3000, securityDeposit: 2000 };
  const rates = deriveRentalRates(car);

  // What the page displays: its own pricing maths over the window it will submit.
  function shown({ rentalType, window, hours, discountAmount = 0 }) {
    const days = rentalType === "day" ? rentalDays(window) : 0;
    const baseAmount = computeBaseAmount(rates, { rentalType, days, hours });
    return { days, baseAmount, ...computeTaxAndTotal({ baseAmount, discountAmount, securityDeposit: car.securityDeposit }) };
  }

  it("agrees for daily rentals whichever side of a 24-hour boundary the times fall", () => {
    for (const [pickupTime, dropTime] of [["9:00 AM", "9:00 AM"], ["9:00 AM", "10:00 AM"], ["9:00 AM", "8:30 AM"], ["10:00 PM", "9:00 PM"], ["6:00 AM", "9:30 PM"]]) {
      const window = buildBookingWindow({ rentalType: "day", pickupDate, pickupTime, dropDate: futureDate(12), dropTime });
      const server = computeBookingQuote({ car, rentalType: "day", ...window, coupon: null });
      const page = shown({ rentalType: "day", window });
      assert.equal(page.days, server.totalDays, `${pickupTime} -> ${dropTime}`);
      assert.equal(page.baseAmount, server.baseAmount, `${pickupTime} -> ${dropTime}`);
      assert.equal(page.total, server.totalAmount, `${pickupTime} -> ${dropTime}`);
    }
  });

  it("agrees for hourly and airport rentals", () => {
    for (const hours of HOUR_OPTIONS) {
      const window = buildBookingWindow({ rentalType: "hour", pickupDate, pickupTime: "9:00 AM", hours });
      const server = computeBookingQuote({ car, rentalType: "hour", ...window, totalHours: hours, coupon: null });
      assert.equal(shown({ rentalType: "hour", window, hours }).total, server.totalAmount, `${hours}h`);
    }
    const window = buildBookingWindow({ rentalType: "airport", pickupDate, pickupTime: "9:00 AM" });
    assert.equal(shown({ rentalType: "airport", window }).total, computeBookingQuote({ car, rentalType: "airport", ...window, coupon: null }).totalAmount);
  });

  it("agrees once the discount the server previews for that window is applied", () => {
    for (const coupon of [{ type: "percentage", value: 10 }, { type: "percentage", value: 50, maxDiscountAmount: 400 }, { type: "fixed", value: 250 }]) {
      for (const dropTime of ["9:00 AM", "10:00 AM"]) {
        const window = buildBookingWindow({ rentalType: "day", pickupDate, pickupTime: "9:00 AM", dropDate: futureDate(11), dropTime });
        const preview = computeBookingQuote({ car, rentalType: "day", ...window, coupon });
        const charged = computeBookingQuote({ car, rentalType: "day", ...window, coupon });
        assert.equal(shown({ rentalType: "day", window, discountAmount: preview.discountAmount }).total, charged.totalAmount);
      }
    }
  });

  it("a discount previewed for the old window does not match the new window's charge (why it must be dropped)", () => {
    const old = buildBookingWindow({ rentalType: "day", pickupDate, pickupTime: "9:00 AM", dropDate: futureDate(11), dropTime: "10:00 AM" });
    const now = buildBookingWindow({ rentalType: "day", pickupDate, pickupTime: "9:00 AM", dropDate: futureDate(11), dropTime: "9:00 AM" });
    const coupon = { type: "percentage", value: 10 };
    const stale = computeBookingQuote({ car, rentalType: "day", ...old, coupon }).discountAmount;

    const charged = computeBookingQuote({ car, rentalType: "day", ...now, coupon }).totalAmount;

    assert.notEqual(shown({ rentalType: "day", window: now, discountAmount: stale }).total, charged);
  });
});

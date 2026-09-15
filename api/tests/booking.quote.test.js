import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBookingQuote } from "../src/services/booking.quote.js";

const car = { pricePerDay: 2000, securityDeposit: 5000 };

describe("computeBookingQuote — day rental", () => {
  it("prices a 3-day rental at pricePerDay × days, plus 18% tax and the security deposit", () => {
    const quote = computeBookingQuote({
      car,
      rentalType: "day",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-04T10:00:00Z",
      coupon: null,
    });

    assert.equal(quote.totalDays, 3);
    assert.equal(quote.baseAmount, 6000);
    assert.equal(quote.discountAmount, 0);
    assert.equal(quote.taxAmount, 1080); // 6000 * 0.18
    assert.equal(quote.totalAmount, 12080); // 6000 + 1080 + 5000 deposit
  });
});

describe("computeBookingQuote — hourly rental", () => {
  it("uses the car's own pricePerHour when it's set, not pricePerDay / 8", () => {
    const carWithHourlyRate = { ...car, pricePerHour: 300 };

    const quote = computeBookingQuote({
      car: carWithHourlyRate,
      rentalType: "hour",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-01T14:00:00Z",
      totalHours: 4,
      coupon: null,
    });

    assert.equal(quote.baseAmount, 1200); // 300 * 4, NOT round(2000/8)*4 = 1000
  });

  it("falls back to pricePerDay / 8 when the car has no pricePerHour set", () => {
    const quote = computeBookingQuote({
      car, // no pricePerHour
      rentalType: "hour",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-01T14:00:00Z",
      totalHours: 4,
      coupon: null,
    });

    assert.equal(quote.baseAmount, 1000); // round(2000/8) * 4
  });
});

describe("computeBookingQuote — airport transfer", () => {
  it("prices at a fixed 40% of pricePerDay regardless of duration", () => {
    const quote = computeBookingQuote({
      car,
      rentalType: "airport",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-01T12:00:00Z",
      coupon: null,
    });

    assert.equal(quote.baseAmount, 800); // round(2000 * 0.4)
    assert.equal(quote.totalDays, 1);
  });
});

describe("computeBookingQuote — coupons", () => {
  it("caps a percentage coupon's discount at maxDiscountAmount", () => {
    const quote = computeBookingQuote({
      car,
      rentalType: "day",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-04T10:00:00Z", // baseAmount 6000
      coupon: { type: "percentage", value: 50, maxDiscountAmount: 1000 },
    });

    // 50% of 6000 would be 3000, but maxDiscountAmount caps it at 1000
    assert.equal(quote.discountAmount, 1000);
  });

  it("caps a flat coupon's discount at baseAmount, however this quote is used", () => {
    // The original bug: applyCoupon's preview didn't cap this, so it could
    // show a discount bigger than the booking cost (an impossible negative
    // total). This same cap also has to hold on the reschedule path, where
    // a booking's original flat discount is carried over against a new,
    // possibly smaller, baseAmount — same function, so it's covered either way.
    const quote = computeBookingQuote({
      car,
      rentalType: "day",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-02T10:00:00Z", // baseAmount 2000 (1 day)
      coupon: { type: "fixed", value: 5000 }, // flat discount bigger than baseAmount
    });

    assert.equal(quote.discountAmount, 2000); // capped at baseAmount, not 5000
    assert.equal(quote.baseAmount - quote.discountAmount, 0); // taxable amount, never negative
    assert.ok(quote.totalAmount >= car.securityDeposit); // never negative
  });

  it("applies no discount when no coupon is passed", () => {
    const quote = computeBookingQuote({
      car,
      rentalType: "day",
      pickupDate: "2026-01-01T10:00:00Z",
      dropDate: "2026-01-02T10:00:00Z",
      coupon: null,
    });

    assert.equal(quote.discountAmount, 0);
  });
});

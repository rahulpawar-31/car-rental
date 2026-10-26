import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../src/model/user.model.js";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import Payment from "../src/model/payment.model.js";
import Review from "../src/model/review.model.js";
import { getDashboardStats } from "../src/controllers/admin.controller.js";

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

const chain = (result) => {
  const q = {
    populate: () => q, sort: () => q, limit: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

// Evaluates the small subset of Mongo range operators the dashboard uses against one instant.
const inRange = (range, t) =>
  (range.$gte === undefined || t >= range.$gte) &&
  (range.$gt === undefined || t > range.$gt) &&
  (range.$lt === undefined || t < range.$lt) &&
  (range.$lte === undefined || t <= range.$lte);

// Runs the dashboard at a fixed moment and captures the createdAt range of each query that
// compares this month with last month.
async function captureWindows() {
  mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 26, 12, 0, 0) });

  const bookingRanges = [];
  const paymentRanges = [];
  mock.method(User, "countDocuments", async () => 0);
  mock.method(Car, "countDocuments", async () => 0);
  mock.method(Review, "countDocuments", async () => 0);
  mock.method(Booking, "countDocuments", async (filter) => {
    if (filter?.createdAt) bookingRanges.push(filter.createdAt);
    return 0;
  });
  mock.method(Booking, "find", () => chain([]));
  mock.method(Booking, "aggregate", async () => []);
  mock.method(Payment, "aggregate", async (pipeline) => {
    const range = pipeline[0].$match?.createdAt;
    if (range) paymentRanges.push(range);
    return [];
  });

  await getDashboardStats({}, { json() {} });

  const [thisBookings, lastBookings] = [bookingRanges.find((r) => r.$lt === undefined), bookingRanges.find((r) => r.$lt !== undefined || r.$lte !== undefined)];
  const [thisPayments, lastPayments] = [paymentRanges.find((r) => r.$lt === undefined && r.$lte === undefined), paymentRanges.find((r) => r.$lt !== undefined || r.$lte !== undefined)];
  return { thisBookings, lastBookings, thisPayments, lastPayments };
}

describe("dashboard month windows", () => {
  it("uses a half-open window for last month, ending where this month starts", async () => {
    const { thisBookings, lastBookings, thisPayments, lastPayments } = await captureWindows();

    assert.deepEqual(lastBookings.$gte, new Date(2026, 8, 1));
    assert.deepEqual(lastBookings.$lt, new Date(2026, 9, 1));
    assert.equal("$lte" in lastBookings, false);
    assert.deepEqual(lastPayments.$gte, new Date(2026, 8, 1));
    assert.deepEqual(lastPayments.$lt, new Date(2026, 9, 1));
    assert.equal("$lte" in lastPayments, false);
    assert.deepEqual(thisBookings.$gte, new Date(2026, 9, 1));
    assert.deepEqual(thisPayments.$gte, new Date(2026, 9, 1));
  });

  it("counts activity on the last day of the previous month as last month, never in neither window", async () => {
    const { thisBookings, lastBookings, thisPayments, lastPayments } = await captureWindows();

    const instants = [
      new Date(2026, 8, 1, 0, 0, 0),
      new Date(2026, 8, 30, 0, 0, 0),
      new Date(2026, 8, 30, 15, 30),
      new Date(2026, 8, 30, 23, 59, 59, 999),
      new Date(2026, 9, 1, 0, 0, 0),
      new Date(2026, 9, 25, 9, 0, 0),
    ];
    for (const t of instants) {
      for (const [label, thisRange, lastRange] of [["bookings", thisBookings, lastBookings], ["payments", thisPayments, lastPayments]]) {
        const hits = Number(inRange(thisRange, t)) + Number(inRange(lastRange, t));
        assert.equal(hits, 1, `${label}: ${t.toString()} should fall in exactly one of this/last month`);
      }
    }
  });
});

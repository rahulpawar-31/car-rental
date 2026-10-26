import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../src/model/user.model.js";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import Payment from "../src/model/payment.model.js";
import Review from "../src/model/review.model.js";
import { revenueMonthStarts, revenueByMonthPipeline, shapeRevenueByMonth } from "../src/utils/dashboard.utils.js";
import { getDashboardStats } from "../src/controllers/admin.controller.js";

afterEach(() => mock.restoreAll());

const NOW = new Date(2026, 9, 15, 10, 30); // 15 Oct 2026, local time
const label = (row) => `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
// A $bucket result row: _id is the month's local start.
const bucket = (year, month, total, count = 1) => ({ _id: new Date(year, month - 1, 1), total, count });

describe("revenueMonthStarts", () => {
  it("lists the 12 local month starts ending with the current month, oldest first", () => {
    const starts = revenueMonthStarts(NOW);

    assert.equal(starts.length, 12);
    assert.deepEqual(starts[0], new Date(2025, 10, 1)); // Nov 2025
    assert.deepEqual(starts[11], new Date(2026, 9, 1)); // Oct 2026
  });

  it("crosses a year boundary", () => {
    const starts = revenueMonthStarts(new Date(2026, 1, 20), 4); // Feb 2026

    assert.deepEqual(starts, [new Date(2025, 10, 1), new Date(2025, 11, 1), new Date(2026, 0, 1), new Date(2026, 1, 1)]);
  });

  it("rejects a month count that is not a positive integer", () => {
    for (const bad of [0, -1, 1.5, NaN, "12"]) {
      assert.throws(() => revenueMonthStarts(NOW, bad), RangeError, String(bad));
    }
  });
});

describe("revenueByMonthPipeline", () => {
  it("reads only succeeded payments inside the window and buckets them on the local month starts", () => {
    const [match, bucketStage, ...rest] = revenueByMonthPipeline({ now: NOW });

    assert.deepEqual(match, {
      $match: { status: "succeeded", createdAt: { $gte: new Date(2025, 10, 1), $lt: new Date(2026, 10, 1) } },
    });
    assert.equal(bucketStage.$bucket.groupBy, "$createdAt");
    assert.equal(bucketStage.$bucket.boundaries.length, 13); // 12 month starts + the end of the current month
    assert.deepEqual(bucketStage.$bucket.boundaries[0], new Date(2025, 10, 1));
    assert.deepEqual(bucketStage.$bucket.boundaries[12], new Date(2026, 10, 1));
    assert.deepEqual(rest, []);
  });

  it("takes the number of months to keep", () => {
    const [match, bucketStage] = revenueByMonthPipeline({ now: NOW, months: 6 });

    assert.equal(bucketStage.$bucket.boundaries.length, 7);
    assert.deepEqual(match.$match.createdAt.$gte, new Date(2026, 4, 1));
  });
});

describe("shapeRevenueByMonth", () => {
  it("keeps the months in the window, oldest first, in the chart's shape", () => {
    const rows = shapeRevenueByMonth([bucket(2026, 9, 900), bucket(2026, 10, 1000, 2)], { now: NOW });

    assert.deepEqual(rows, [
      { _id: { year: 2026, month: 9 }, total: 900, count: 1 },
      { _id: { year: 2026, month: 10 }, total: 1000, count: 2 },
    ]);
  });

  it("fills a month with no payments with a zero row, so adjacent bars are adjacent months", () => {
    const rows = shapeRevenueByMonth([bucket(2026, 3, 300), bucket(2026, 8, 800)], { now: NOW });

    assert.deepEqual(rows.map(label), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(rows.filter((r) => r.count === 0).map((r) => r.total), [0, 0, 0, 0, 0, 0]);
  });

  it("ends at the current month even when it has no payments yet", () => {
    const rows = shapeRevenueByMonth([bucket(2026, 8, 800)], { now: NOW });

    assert.deepEqual(rows.map(label), ["2026-08", "2026-09", "2026-10"]);
    assert.equal(rows[2].total, 0);
  });

  it("starts at the first month with revenue, so a new business has no run of empty bars", () => {
    const rows = shapeRevenueByMonth([bucket(2026, 7, 700), bucket(2026, 8, 800)], { now: NOW });

    assert.equal(label(rows[0]), "2026-07");
  });

  it("covers a full year across a year boundary", () => {
    const rows = shapeRevenueByMonth([bucket(2025, 11, 1), bucket(2026, 10, 2)], { now: NOW });

    assert.equal(rows.length, 12);
    assert.equal(label(rows[0]), "2025-11");
    assert.equal(label(rows[1]), "2025-12");
    assert.equal(label(rows[2]), "2026-01");
    assert.equal(label(rows[11]), "2026-10");
  });

  it("returns nothing when no month in the window has revenue", () => {
    assert.deepEqual(shapeRevenueByMonth([], { now: NOW }), []);
  });
});

describe("dashboard revenue chart data", () => {
  it("aggregates over the window and returns the zero-filled months as revenueByMonth", async () => {
    const pipelines = [];
    mock.method(User, "countDocuments", async () => 0);
    mock.method(Car, "countDocuments", async () => 0);
    mock.method(Review, "countDocuments", async () => 0);
    mock.method(Booking, "countDocuments", async () => 0);
    mock.method(Booking, "aggregate", async () => []);
    mock.method(Booking, "find", () => {
      const q = { populate: () => q, sort: () => q, limit: () => q, then: (r) => Promise.resolve([]).then(r) };
      return q;
    });
    mock.method(Payment, "aggregate", async (pipeline) => {
      pipelines.push(pipeline);
      const thisMonth = new Date().getMonth();
      return pipeline.some((s) => s.$bucket)
        ? [{ _id: new Date(new Date().getFullYear(), thisMonth - 2, 1), total: 500, count: 1 }]
        : [];
    });
    let sent;

    await getDashboardStats({}, { json: (body) => (sent = body) });

    assert.ok(pipelines.some((p) => p.some((s) => s.$bucket)), "the chart pipeline ran");
    const rows = sent.data.revenueByMonth;
    assert.equal(rows.length, 3); // two months ago, last month (zero), this month (zero)
    assert.equal(rows[0].total, 500);
    assert.deepEqual(rows.slice(1).map((r) => r.total), [0, 0]);
  });
});

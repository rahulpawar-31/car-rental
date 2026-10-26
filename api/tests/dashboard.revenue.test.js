import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../src/model/user.model.js";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import Payment from "../src/model/payment.model.js";
import Review from "../src/model/review.model.js";
import { revenueByMonthPipeline } from "../src/utils/dashboard.utils.js";
import { getDashboardStats } from "../src/controllers/admin.controller.js";

afterEach(() => mock.restoreAll());

// Runs the $sort and $limit stages of a pipeline over already-grouped documents. Those are the
// only stages after $group in this pipeline, and they decide which months survive.
function runSortAndLimit(docs, stages) {
  let rows = [...docs];
  for (const stage of stages) {
    if (stage.$sort) {
      const keys = Object.entries(stage.$sort);
      rows.sort((a, b) => {
        for (const [path, dir] of keys) {
          const field = path.split(".").pop();
          if (a._id[field] !== b._id[field]) return (a._id[field] - b._id[field]) * dir;
        }
        return 0;
      });
    } else if (stage.$limit) {
      rows = rows.slice(0, stage.$limit);
    }
  }
  return rows;
}
const tailOf = (pipeline) => pipeline.slice(pipeline.findIndex((s) => s.$group) + 1);

// One grouped row per month starting at (startYear, startMonth), amount = its position.
const monthsFrom = (startYear, startMonth, count) =>
  Array.from({ length: count }, (_, i) => {
    const index = startMonth - 1 + i;
    return { _id: { year: startYear + Math.floor(index / 12), month: (index % 12) + 1 }, total: (i + 1) * 100, count: 1 };
  });
const labels = (rows) => rows.map((r) => `${r._id.year}-${String(r._id.month).padStart(2, "0")}`);
const shuffled = (rows) => [...rows].sort((a, b) => ((a.total * 7919) % 13) - ((b.total * 7919) % 13));

describe("revenueByMonthPipeline", () => {
  it("sums succeeded payments per month, then keeps the newest months and re-sorts them oldest-first", () => {
    const stages = revenueByMonthPipeline();

    assert.deepEqual(stages[0], { $match: { status: "succeeded" } });
    assert.deepEqual(stages[1].$group._id, { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } });
    assert.deepEqual(stages.slice(2), [
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
  });

  it("takes the number of months to keep", () => {
    assert.equal(revenueByMonthPipeline(6).find((s) => s.$limit).$limit, 6);
  });

  it("keeps the latest 12 months, oldest first, when there is more than a year of history", () => {
    const history = shuffled(monthsFrom(2025, 5, 18)); // 2025-05 .. 2026-10

    const result = runSortAndLimit(history, tailOf(revenueByMonthPipeline()));

    assert.equal(result.length, 12);
    assert.deepEqual(labels(result), [
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("returns everything, oldest first, when there are fewer than 12 months", () => {
    const result = runSortAndLimit(shuffled(monthsFrom(2026, 3, 5)), tailOf(revenueByMonthPipeline()));

    assert.deepEqual(labels(result), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  });

  it("orders across a year boundary by year first, so December comes before the next January", () => {
    const result = runSortAndLimit(shuffled(monthsFrom(2025, 11, 4)), tailOf(revenueByMonthPipeline()));

    assert.deepEqual(labels(result), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("returns exactly 12 months unchanged when there are exactly 12", () => {
    const result = runSortAndLimit(shuffled(monthsFrom(2025, 11, 12)), tailOf(revenueByMonthPipeline()));

    assert.equal(result.length, 12);
    assert.equal(labels(result)[0], "2025-11");
    assert.equal(labels(result)[11], "2026-10");
  });

  it("would have returned the oldest months under the previous sort-then-limit order (guards the simulation)", () => {
    const previous = [{ $sort: { "_id.year": 1, "_id.month": 1 } }, { $limit: 12 }];

    const result = runSortAndLimit(shuffled(monthsFrom(2025, 5, 18)), previous);

    assert.equal(labels(result)[0], "2025-05");
    assert.equal(labels(result)[11], "2026-04");
  });
});

describe("dashboard revenue chart data", () => {
  it("uses the pipeline builder and returns its result as revenueByMonth", async () => {
    const pipelines = [];
    const chartRows = [{ _id: { year: 2026, month: 10 }, total: 1800, count: 1 }];
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
      return pipeline.some((s) => s.$limit) ? chartRows : [];
    });
    let sent;

    await getDashboardStats({}, { json: (body) => (sent = body) });

    const chartPipeline = pipelines.find((p) => p.some((s) => s.$limit));
    assert.deepEqual(chartPipeline, revenueByMonthPipeline());
    assert.deepEqual(sent.data.revenueByMonth, chartRows);
  });
});

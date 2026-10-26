import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseValidDate, monthBoundaries } from "../src/utils/date.utils.js";

describe("parseValidDate", () => {
  it("parses a valid ISO date string into a Date", () => {
    const result = parseValidDate("2026-01-04T10:00:00Z");
    assert.ok(result instanceof Date);
    assert.equal(result.toISOString(), "2026-01-04T10:00:00.000Z");
  });

  it("parses a valid date-only string", () => {
    const result = parseValidDate("2026-01-04");
    assert.ok(result instanceof Date);
    assert.equal(isNaN(result.getTime()), false);
  });

  it("passes through an already-valid Date instance", () => {
    const input = new Date("2026-01-04T10:00:00Z");
    const result = parseValidDate(input);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), input.getTime());
  });

  it("returns null for an unparseable string", () => {
    assert.equal(parseValidDate("not-a-date"), null);
  });

  it("returns null for a nonsensical calendar date", () => {
    assert.equal(parseValidDate("2024-13-45"), null);
  });

  it("returns null for an already-invalid Date instance", () => {
    assert.equal(parseValidDate(new Date("not-a-date")), null);
  });

  it("returns null for undefined", () => {
    assert.equal(parseValidDate(undefined), null);
  });

  it("returns null for an empty string", () => {
    assert.equal(parseValidDate(""), null);
  });

  it("returns null for null rather than resolving to the Unix epoch", () => {
    // new Date(null) === new Date(0), which is technically "valid" but
    // almost never what a missing date field means.
    assert.equal(parseValidDate(null), null);
  });
});

describe("monthBoundaries", () => {
  const ymdhm = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

  it("returns the first instant of this month and of last month, in local time", () => {
    const { startOfMonth, startOfLastMonth } = monthBoundaries(new Date(2026, 9, 26, 15, 30));
    assert.deepEqual(ymdhm(startOfMonth), [2026, 10, 1, 0, 0]);
    assert.deepEqual(ymdhm(startOfLastMonth), [2026, 9, 1, 0, 0]);
  });

  it("rolls back across a year boundary in January", () => {
    const { startOfMonth, startOfLastMonth } = monthBoundaries(new Date(2026, 0, 15));
    assert.deepEqual(ymdhm(startOfMonth), [2026, 1, 1, 0, 0]);
    assert.deepEqual(ymdhm(startOfLastMonth), [2025, 12, 1, 0, 0]);
  });

  it("is not thrown off by a day that doesn't exist in the previous month", () => {
    // March 31 -> last month is February (28 days in 2026).
    const { startOfLastMonth } = monthBoundaries(new Date(2026, 2, 31, 9));
    assert.deepEqual(ymdhm(startOfLastMonth), [2026, 2, 1, 0, 0]);
  });

  it("makes last month and this month meet exactly, so no instant between them is left out", () => {
    const { startOfMonth, startOfLastMonth } = monthBoundaries(new Date(2026, 9, 26));
    const lastMonth = (t) => t >= startOfLastMonth && t < startOfMonth;
    const thisMonth = (t) => t >= startOfMonth;

    for (const t of [
      new Date(2026, 8, 1, 0, 0, 0),
      new Date(2026, 8, 30, 0, 0, 0),
      new Date(2026, 8, 30, 15, 30),
      new Date(2026, 8, 30, 23, 59, 59, 999),
      new Date(2026, 9, 1, 0, 0, 0),
    ]) {
      assert.equal(Number(lastMonth(t)) + Number(thisMonth(t)), 1, `exactly one window should hold ${t.toString()}`);
    }
  });

  it("defaults to the current time", () => {
    const { startOfMonth } = monthBoundaries();
    const now = new Date();
    assert.equal(startOfMonth.getMonth(), now.getMonth());
    assert.equal(startOfMonth.getDate(), 1);
  });
});

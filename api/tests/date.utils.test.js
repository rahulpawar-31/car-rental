import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseValidDate } from "../src/utils/date.utils.js";

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

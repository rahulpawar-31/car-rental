import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPublicIdFromUrl } from "../src/services/media.js";

describe("extractPublicIdFromUrl", () => {
  it("prefixes the filename (without extension) with the given folder", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v123/abc123.jpg";
    assert.equal(extractPublicIdFromUrl(url, "car-rental/profiles"), "car-rental/profiles/abc123");
  });

  it("uses whichever folder is passed, not a hardcoded one", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v123/doc456.pdf";
    assert.equal(extractPublicIdFromUrl(url, "car-rental/documents"), "car-rental/documents/doc456");
  });

  it("keeps only the part before the first dot when the filename has multiple (matches the pre-existing avatar-cleanup behavior verbatim)", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/v123/my.license.png";
    assert.equal(extractPublicIdFromUrl(url, "car-rental/documents"), "car-rental/documents/my");
  });
});

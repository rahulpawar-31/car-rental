import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileFilter } from "../src/middleware/upload.middleware.js";
import { AppError } from "../src/middleware/errorHandler.js";

function fakeFile(mimetype) {
  return { mimetype };
}

describe("fileFilter", () => {
  it("accepts an allowed image mimetype", () => {
    fileFilter({}, fakeFile("image/jpeg"), (err, accept) => {
      assert.equal(err, null);
      assert.equal(accept, true);
    });
  });

  it("accepts an allowed pdf mimetype", () => {
    fileFilter({}, fakeFile("application/pdf"), (err, accept) => {
      assert.equal(err, null);
      assert.equal(accept, true);
    });
  });

  it("rejects a disallowed mimetype with an AppError (not a bare Error), so the global handler returns 400 with the real message instead of masking it as a generic 500", () => {
    fileFilter({}, fakeFile("text/plain"), (err, accept) => {
      assert.ok(err instanceof AppError, "expected an AppError so err.isOperational is true and the message survives in production");
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Invalid file type/);
      assert.equal(accept, false);
    });
  });
});

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Car from "../src/model/car.model.js";
import { cloudinary } from "../src/config/cloudinary.js";
import { uploadCarDocument } from "../src/controllers/car.controller.js";

const file = { path: "https://cdn/new.pdf", filename: "newpid" };

let log; // the order in which the handler touched the database and Cloudinary

beforeEach(() => {
  log = [];
});
afterEach(() => mock.restoreAll());

// Stubs the car lookup (what the handler reads first) plus the update and the Cloudinary delete,
// recording each call in `log`.
function stubWorld({ documents = {}, found = true, update = async () => ({ documents: { saved: true } }) } = {}) {
  mock.method(Car, "findById", () => {
    const q = { select: () => q, then: (resolve, reject) => Promise.resolve(found ? { documents } : null).then(resolve, reject) };
    return q;
  });
  const updateStub = mock.method(Car, "findByIdAndUpdate", async (...args) => {
    log.push("update");
    return update(...args);
  });
  const destroy = mock.method(cloudinary.uploader, "destroy", async (publicId) => {
    log.push(`destroy:${publicId}`);
    return {};
  });
  return { updateStub, destroy };
}

async function run(req) {
  const sent = {};
  await uploadCarDocument({ params: { id: "c1", docType: "insurance" }, file, body: {}, ...req }, { json: (b) => (sent.body = b) });
  return sent;
}

async function rejectsWith(promise, status, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, status);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

const oldDoc = { insurance: { url: "https://cdn/old.pdf", publicId: "oldpid" } };

describe("uploadCarDocument: the previous file is removed last", () => {
  it("leaves the existing document and its Cloudinary asset alone when the expiry date is bad", async () => {
    const { updateStub, destroy } = stubWorld({ documents: oldDoc });

    await rejectsWith(run({ body: { expiryDate: "not-a-date" } }), 400, "Invalid expiry date");

    assert.equal(destroy.mock.callCount(), 0, "the old asset must not be deleted");
    assert.equal(updateStub.mock.callCount(), 0, "nothing is saved");
    assert.deepEqual(log, []);
  });

  it("deletes the old asset only after the new document is saved", async () => {
    const { updateStub } = stubWorld({ documents: oldDoc });

    const { body } = await run({ body: { expiryDate: "2031-05-05" } });

    assert.deepEqual(log, ["update", "destroy:oldpid"]);
    assert.deepEqual(updateStub.mock.calls[0].arguments[1]["documents.insurance.expiryDate"], new Date("2031-05-05"));
    assert.equal(body.message, "insurance document uploaded");
    assert.deepEqual(body.data, { documents: { saved: true } });
  });

  it("keeps the old asset when saving the new document fails", async () => {
    const { destroy } = stubWorld({
      documents: oldDoc,
      update: async () => {
        throw new Error("database unavailable");
      },
    });

    await assert.rejects(run({}), { message: "database unavailable" });

    assert.equal(destroy.mock.callCount(), 0);
  });

  it("keeps the old asset when the car disappears before the update", async () => {
    const { destroy } = stubWorld({ documents: oldDoc, update: async () => null });

    await rejectsWith(run({}), 404, "Car not found");

    assert.equal(destroy.mock.callCount(), 0);
  });

  it("derives the old asset's id from its URL for records saved before public ids were stored", async () => {
    stubWorld({ documents: { insurance: { url: "https://cdn/folder/legacy.pdf" } } });

    await run({});

    assert.deepEqual(log, ["update", "destroy:car-rental/documents/legacy"]);
  });

  it("has nothing to delete when there was no previous document", async () => {
    const { updateStub, destroy } = stubWorld({ documents: {} });

    await run({});

    assert.equal(destroy.mock.callCount(), 0);
    assert.equal(updateStub.mock.callCount(), 1);
  });

  it("stores the new file as unverified", async () => {
    const { updateStub } = stubWorld({ documents: oldDoc });

    await run({});

    assert.deepEqual(updateStub.mock.calls[0].arguments[1], {
      "documents.insurance.url": "https://cdn/new.pdf",
      "documents.insurance.publicId": "newpid",
      "documents.insurance.verified": false,
    });
  });
});

describe("uploadCarDocument: unchanged checks", () => {
  it("still answers 404 for an unknown car, even with a bad expiry date, and touches nothing", async () => {
    const { updateStub, destroy } = stubWorld({ found: false });

    await rejectsWith(run({ body: { expiryDate: "nope" } }), 404, "Car not found");

    assert.equal(updateStub.mock.callCount(), 0);
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("still rejects an unknown document type and a missing file before looking anything up", async () => {
    const { updateStub } = stubWorld({ documents: oldDoc });

    await rejectsWith(run({ params: { id: "c1", docType: "license" } }), 400, "Invalid document type. Use: insurance, registration, pollution");
    await rejectsWith(run({ file: undefined }), 400, "No document uploaded");

    assert.equal(updateStub.mock.callCount(), 0);
  });
});

import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { default: User } = await import("../src/model/user.model.js");
const { default: Car } = await import("../src/model/car.model.js");
const { default: Booking } = await import("../src/model/booking.model.js");
const { cloudinary, carImageStorage, documentStorage, profileImageStorage } = await import("../src/config/cloudinary.js");
const { discardUploadsOnClientError } = await import("../src/middleware/upload.middleware.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { default: carRoutes } = await import("../src/routes/car.routes.js");
const { default: reviewRoutes } = await import("../src/routes/review.routes.js");
const { default: userRoutes } = await import("../src/routes/user.routes.js");

const ID = "64b000000000000000000001";
const ID2 = "64b000000000000000000002";

// Waits for work the middleware starts after the response has been sent.
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

describe("discardUploadsOnClientError (unit)", () => {
  let destroy;
  const run = async (req, statusCode, { emitFinish = true } = {}) => {
    const res = Object.assign(new EventEmitter(), { statusCode });
    let nexted = false;
    discardUploadsOnClientError(req, res, () => (nexted = true));
    assert.equal(nexted, true, "must call next() immediately and not delay the request");
    if (emitFinish) res.emit("finish");
    await settle();
  };
  const destroyedIds = () => destroy.mock.calls.map((c) => c.arguments[0]);

  before(() => {
    destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));
  });
  afterEach(() => destroy.mock.resetCalls());
  after(() => mock.restoreAll());

  it("deletes a single uploaded file when the request is rejected with a 4xx", async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      destroy.mock.resetCalls();
      await run({ file: { filename: "pidA" } }, status);
      assert.deepEqual(destroyedIds(), ["pidA"], `status ${status}`);
    }
  });

  it("deletes every file of a multi-file upload", async () => {
    await run({ files: [{ filename: "p1" }, { filename: "p2" }, { filename: "p3" }] }, 400);
    assert.deepEqual(destroyedIds().sort(), ["p1", "p2", "p3"]);
  });

  it("handles files keyed by field name (.fields())", async () => {
    await run({ files: { images: [{ filename: "p1" }], document: [{ filename: "p2" }] } }, 404);
    assert.deepEqual(destroyedIds().sort(), ["p1", "p2"]);
  });

  it("keeps the files when the request succeeds", async () => {
    for (const status of [200, 201, 204]) await run({ file: { filename: "pidA" } }, status);
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("keeps the files after a server error, since the handler may already have saved their URLs", async () => {
    for (const status of [500, 502, 503]) await run({ file: { filename: "pidA" } }, status);
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("does nothing when no file was uploaded", async () => {
    await run({}, 400);
    await run({ files: [] }, 400);
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("waits for the response to finish before doing anything", async () => {
    await run({ file: { filename: "pidA" } }, 400, { emitFinish: false });
    assert.equal(destroy.mock.callCount(), 0);
  });
});

describe("rejected uploads are removed from Cloudinary (over HTTP, real multipart, storage stubbed)", () => {
  let server;
  let base;
  let token;
  let destroy;
  const stubs = [];

  // Stands in for Cloudinary: "stores" each file and names it pid-<original name>.
  const fakeStorage = (storage) =>
    stubs.push(
      mock.method(storage, "_handleFile", (req, file, cb) => {
        file.stream.on("end", () => cb(null, { path: `https://cdn/${file.originalname}`, filename: `pid-${file.originalname}` }));
        file.stream.resume();
      })
    );

  before(async () => {
    mock.method(User, "findById", () => ({ select: async () => new User({ _id: ID, isActive: true, role: "admin" }) }));
    token = jwt.sign({ id: ID, role: "admin" }, process.env.JWT_SECRET);
    for (const storage of [carImageStorage, documentStorage, profileImageStorage]) fakeStorage(storage);
    destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));

    const app = express();
    app.use(express.json());
    app.use("/cars", carRoutes);
    app.use("/reviews", reviewRoutes);
    app.use("/users", userRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => destroy.mock.resetCalls());

  const image = (name) => new Blob(["fake image bytes"], { type: "image/png" });
  const send = async (method, path, fields, files = []) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const [field, name] of files) form.append(field, image(name), name);
    const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, json: await res.json() };
  };
  const destroyedIds = () => destroy.mock.calls.map((c) => c.arguments[0]).sort();

  const validCar = {
    name: "Honda City", brand: "Honda", model: "City", year: "2024", type: "sedan",
    transmission: "automatic", fuelType: "petrol", seats: "5", pricePerDay: "3000",
  };

  it("POST /cars with an invalid body: both uploaded images are deleted", async () => {
    const res = await send("POST", "/cars", { ...validCar, type: "spaceship" }, [["images", "a.png"], ["images", "b.png"]]);

    assert.equal(res.status, 400);
    await settle();
    assert.deepEqual(destroyedIds(), ["pid-a.png", "pid-b.png"]);
  });

  it("POST /cars that succeeds keeps its images", async () => {
    mock.method(Car, "create", async (doc) => ({ _id: "c1", ...doc }));

    const res = await send("POST", "/cars", validCar, [["images", "a.png"]]);

    assert.equal(res.status, 201);
    await settle();
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("POST /cars that fails with a server error keeps its images (the database may reference them)", async () => {
    Car.create.mock.restore();
    mock.method(Car, "create", async () => {
      throw new Error("database unavailable");
    });

    const res = await send("POST", "/cars", validCar, [["images", "a.png"]]);

    assert.equal(res.status, 500);
    await settle();
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("POST /cars/:id/images for an unknown car: the uploaded images are deleted", async () => {
    mock.method(Car, "findByIdAndUpdate", async () => null);

    const res = await send("POST", `/cars/${ID2}/images`, {}, [["images", "x.png"], ["images", "y.png"]]);

    assert.equal(res.status, 404);
    await settle();
    assert.deepEqual(destroyedIds(), ["pid-x.png", "pid-y.png"]);
  });

  it("POST /cars/:id/documents/:docType for an unknown car: the uploaded document is deleted", async () => {
    mock.method(Car, "findById", () => {
      const q = { select: () => q, then: (resolve, reject) => Promise.resolve(null).then(resolve, reject) };
      return q;
    });

    const res = await send("POST", `/cars/${ID2}/documents/insurance`, {}, [["document", "policy.png"]]);

    assert.equal(res.status, 404);
    await settle();
    assert.deepEqual(destroyedIds(), ["pid-policy.png"]);
  });

  it("POST /reviews with an invalid rating: the uploaded photos are deleted", async () => {
    mock.method(Booking, "findOne", async () => assert.fail("must not look anything up"));

    const res = await send("POST", "/reviews", { carId: ID, bookingId: ID2, rating: "9", comment: "x" }, [["images", "photo.png"]]);

    assert.equal(res.status, 400);
    await settle();
    assert.deepEqual(destroyedIds(), ["pid-photo.png"]);
  });

  it("PATCH /users/driving-license with a bad expiry date: the uploaded licence is deleted", async () => {
    const res = await send("PATCH", "/users/driving-license", { number: "MH12", expiryDate: "not-a-date" }, [["document", "licence.png"]]);

    assert.equal(res.status, 400);
    await settle();
    assert.deepEqual(destroyedIds(), ["pid-licence.png"]);
  });

  it("PATCH /users/driving-license that succeeds keeps the licence", async () => {
    mock.method(User, "findByIdAndUpdate", async () => ({ drivingLicense: { number: "MH12" } }));

    const res = await send("PATCH", "/users/driving-license", { number: "MH12", expiryDate: "2030-01-01" }, [["document", "licence.png"]]);

    assert.equal(res.status, 200);
    await settle();
    assert.equal(destroy.mock.callCount(), 0);
  });

  it("a request with no file and a 4xx has nothing to delete", async () => {
    const res = await send("POST", "/cars", { ...validCar, type: "spaceship" });

    assert.equal(res.status, 400);
    await settle();
    assert.equal(destroy.mock.callCount(), 0);
  });
});

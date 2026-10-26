import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import * as controller from "../src/controllers/car.controller.js";

afterEach(() => mock.restoreAll());

const chain = (result) => {
  const q = {
    populate: () => q, sort: () => q, skip: () => q, limit: () => q, select: () => q, lean: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

// A response double that records what the controller sent.
const run = async (handler, req) => {
  const sent = { status: 200 };
  const res = {
    status(code) { sent.status = code; return res; },
    json(body) { sent.body = body; return res; },
  };
  await handler({ query: {}, params: {}, body: {}, ...req }, res);
  return sent;
};

const file = { path: "https://cdn/doc.pdf", filename: "docpid" };
const files = [{ path: "https://cdn/1.jpg", filename: "pid1" }];

// These pin the response shapes and messages the web client reads, so moving the logic into
// services/car.js can't change what it receives.
describe("car controller responses", () => {
  it("getCars returns cars and pagination under data", async () => {
    mock.method(Car, "find", () => chain([{ _id: "c1" }]));
    mock.method(Car, "countDocuments", async () => 1);

    const { body } = await run(controller.getCars, { query: { limit: "12" } });

    assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body.data), ["cars", "pagination"]);
    assert.deepEqual(body.data.pagination, { page: 1, limit: 12, total: 1, pages: 1 });
  });

  it("getCarById, getFeaturedCars and getCarBookedDates keep their keys", async () => {
    mock.method(Car, "findById", () => chain({ _id: "c1", isActive: true }));
    mock.method(Car, "find", () => chain([{ _id: "c1" }]));
    mock.method(Booking, "find", () => chain([{ pickupDate: "a", dropDate: "b" }]));

    assert.deepEqual((await run(controller.getCarById, { params: { id: "c1" } })).body.data, { car: { _id: "c1", isActive: true } });
    assert.deepEqual((await run(controller.getFeaturedCars, {})).body.data, { cars: [{ _id: "c1" }] });
    assert.deepEqual((await run(controller.getCarBookedDates, { params: { id: "c1" } })).body.data, {
      bookedRanges: [{ from: "a", to: "b" }],
    });
  });

  it("checkCarAvailability answers with a plain available flag", async () => {
    mock.method(Car, "findById", async () => ({ isActive: true, isAvailable: true }));
    mock.method(Booking, "findOne", async () => null);
    const query = { pickupDate: new Date(Date.now() + 2 * 864e5).toISOString(), dropDate: new Date(Date.now() + 4 * 864e5).toISOString() };

    const { body } = await run(controller.checkCarAvailability, { params: { id: "c1" }, query });

    assert.deepEqual(body, { success: true, data: { available: true } });
  });

  it("createCar answers 201 with the created car", async () => {
    mock.method(Car, "create", async (doc) => ({ _id: "new", ...doc }));

    const { status, body } = await run(controller.createCar, { body: { name: "City" }, files });

    assert.equal(status, 201);
    assert.equal(body.message, "Car created");
    assert.equal(body.data.car.images[0].isPrimary, true);
  });

  it("updateCar and deleteCar word their messages", async () => {
    mock.method(Car, "findByIdAndUpdate", async () => ({ _id: "c1" }));

    assert.deepEqual((await run(controller.updateCar, { params: { id: "c1" }, body: {} })).body, {
      success: true, message: "Car updated", data: { car: { _id: "c1" } },
    });
    assert.deepEqual((await run(controller.deleteCar, { params: { id: "c1" } })).body, { success: true, message: "Car deactivated" });
  });

  it("addCarImages returns the images list", async () => {
    mock.method(Car, "findByIdAndUpdate", async () => ({ images: [{ url: "u" }] }));

    const { body } = await run(controller.addCarImages, { params: { id: "c1" }, files });

    assert.deepEqual(body, { success: true, message: "Images added", data: { images: [{ url: "u" }] } });
  });

  it("deleteCarImage confirms with a message only", async () => {
    const car = { images: { id: () => ({ publicId: "" }), pull() {} }, save: async () => {} };
    mock.method(Car, "findById", async () => car);

    assert.deepEqual((await run(controller.deleteCarImage, { params: { id: "c1", imageId: "i1" } })).body, {
      success: true, message: "Image deleted",
    });
  });

  it("document upload and verify name the document type in their messages", async () => {
    mock.method(Car, "findById", () => chain({ documents: {} }));
    mock.method(Car, "findByIdAndUpdate", async () => ({ documents: { pollution: { verified: false } } }));

    const uploaded = await run(controller.uploadCarDocument, { params: { id: "c1", docType: "pollution" }, file, body: {} });
    const verified = await run(controller.verifyCarDocument, { params: { id: "c1", docType: "pollution" } });

    assert.equal(uploaded.body.message, "pollution document uploaded");
    assert.deepEqual(uploaded.body.data, { documents: { pollution: { verified: false } } });
    assert.equal(verified.body.message, "pollution document verified");
  });

  it("getCarFilters returns the filter data directly under data", async () => {
    mock.method(Car, "distinct", async () => []);
    mock.method(Car, "aggregate", async () => []);

    const { body } = await run(controller.getCarFilters, {});

    assert.deepEqual(Object.keys(body.data), ["brands", "types", "transmissions", "fuelTypes", "priceRange"]);
  });
});

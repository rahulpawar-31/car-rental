import { describe, it, before, after, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import "express-async-errors"; // same as app.js: lets async controllers reject into errorHandler
import express from "express";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

const { default: User } = await import("../src/model/user.model.js");
const { default: Car } = await import("../src/model/car.model.js");
const { default: Review } = await import("../src/model/review.model.js");
const { default: Booking } = await import("../src/model/booking.model.js");
const { default: Location } = await import("../src/model/location.model.js");
const { default: carRoutes } = await import("../src/routes/car.routes.js");
const { default: reviewRoutes } = await import("../src/routes/review.routes.js");
const { default: locationRoutes } = await import("../src/routes/location.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const car = await import("../src/validation/car.validation.js");
const review = await import("../src/validation/review.validation.js");
const location = await import("../src/validation/location.validation.js");

const ID = "64b000000000000000000001";
const ID2 = "64b000000000000000000002";

const issues = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false, "expected the input to be rejected");
  return result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, true, result.error?.issues.map((i) => i.message).join("; "));
  return result.data;
};

const adminCar = {
  name: "Honda City",
  brand: "Honda",
  model: "City",
  year: 2024,
  type: "sedan",
  transmission: "automatic",
  fuelType: "petrol",
  seats: 5,
  pricePerDay: 3000,
  securityDeposit: 0,
  description: "",
  isAvailable: true,
  isFeatured: false,
};

describe("car query schema", () => {
  it("accepts what the Cars page sends and leaves values as strings", () => {
    const data = parse(car.listCarsQuery, {
      type: "sedan,suv", brand: "Honda", minPrice: "500", maxPrice: "5000", sort: "price-asc", page: "2", limit: "12", location: ID, search: "",
    });
    assert.equal(data.minPrice, "500");
    assert.equal(data.page, "2");
    assert.equal(data.search, undefined, "blank counts as absent, as before");
  });

  it('keeps "0" a string, because the controller treats "0" as a real value', () => {
    assert.equal(parse(car.listCarsQuery, { maxPrice: "0" }).maxPrice, "0");
  });

  it("leaves page/limit shape errors to the controller's own messages", () => {
    assert.equal(parse(car.listCarsQuery, { page: "abc", limit: "0" }).page, "abc");
  });

  it("caps limit at 100", () => {
    assert.equal(parse(car.listCarsQuery, { limit: "100" }).limit, "100");
    assert.deepEqual(issues(car.listCarsQuery, { limit: "101" }), ["limit: limit must be at most 100"]);
  });

  it("rejects repeated and nested params that would crash the controller's .split()", () => {
    assert.deepEqual(issues(car.listCarsQuery, { type: { $ne: "x" } }), ["type: type must be a single value"]);
    assert.deepEqual(issues(car.listCarsQuery, { brand: ["a", "b"] }), ["brand: brand must be a single value"]);
  });

  it("rejects non-numeric prices and seats", () => {
    assert.deepEqual(issues(car.listCarsQuery, { minPrice: "abc" }), ["minPrice: minPrice must be a non-negative number"]);
    assert.ok(issues(car.listCarsQuery, { seats: "-1" }).length > 0);
  });

  it("accepts only known sort keys, including object-prototype names", () => {
    for (const sort of car.CAR_SORTS) assert.equal(parse(car.listCarsQuery, { sort }).sort, sort);
    for (const sort of ["constructor", "__proto__", "price"]) assert.ok(issues(car.listCarsQuery, { sort }).length > 0, sort);
  });
});

describe("admin car body schemas", () => {
  it("accepts the admin form's create payload and drops fields the controller never kept", () => {
    const data = parse(car.createCarBody, { ...adminCar, images: [{ url: "x", isPrimary: true }], rating: 5, totalRentals: 99 });
    assert.equal(data.pricePerDay, 3000);
    for (const key of ["images", "rating", "totalRentals"]) assert.equal(key in data, false, key);
  });

  it("accepts multipart-style text values and a single feature", () => {
    const data = parse(car.createCarBody, { ...adminCar, year: "2024", seats: "5", pricePerDay: "3000", isAvailable: "true", features: "AC" });
    assert.equal(data.year, 2024);
    assert.equal(data.isAvailable, true);
    assert.deepEqual(data.features, ["AC"]);
  });

  it("requires what the Car model requires", () => {
    const fields = issues(car.createCarBody, {}).map((m) => m.split(":")[0]);
    assert.deepEqual(fields, ["name", "brand", "model", "year", "type", "transmission", "fuelType", "seats", "pricePerDay"]);
  });

  it("rejects bad enums, non-positive prices and operator objects", () => {
    assert.ok(issues(car.createCarBody, { ...adminCar, type: "spaceship" })[0].startsWith("type: type must be one of"));
    assert.deepEqual(issues(car.createCarBody, { ...adminCar, pricePerDay: -5 }), ["pricePerDay: pricePerDay must be at least 1"]);
    assert.ok(issues(car.createCarBody, { ...adminCar, pricePerDay: { $gt: 0 } }).length > 0);
    assert.ok(issues(car.createCarBody, { ...adminCar, seats: 2.5 }).length > 0);
  });

  it("makes updates partial, and lets description be cleared with an empty string", () => {
    assert.deepEqual({ ...parse(car.updateCarBody, { pricePerDay: 3500, isAvailable: false }) }, { pricePerDay: 3500, isAvailable: false });
    assert.equal(parse(car.updateCarBody, { description: "" }).description, "");
    assert.deepEqual(parse(car.updateCarBody, { location: "" }), {}, "blank location is dropped, not sent as undefined");
    assert.deepEqual(issues(car.updateCarBody, { location: "nope" }), ["location: location is not a valid id"]);
  });

  it("restricts document types", () => {
    assert.deepEqual(issues(car.carDocumentParams, { id: ID, docType: "license" }), [
      "docType: Invalid docType. Use: insurance, registration, pollution",
    ]);
    for (const docType of car.DOCUMENT_TYPES) parse(car.carDocumentParams, { id: ID, docType });
  });
});

describe("review schemas", () => {
  it("accepts the Dashboard and Profile payloads", () => {
    parse(review.createReviewBody, { carId: ID, bookingId: ID2, rating: 5, comment: "great" });
    parse(review.updateReviewBody, { rating: 4, comment: "ok" });
  });

  it("coerces multipart text (rating, aspects)", () => {
    const data = parse(review.createReviewBody, { carId: ID, bookingId: ID2, rating: "4", comment: "x", aspects: { cleanliness: "5" } });
    assert.equal(data.rating, 4);
    assert.equal(data.aspects.cleanliness, 5);
  });

  it("enforces the model's bounds", () => {
    assert.deepEqual(issues(review.createReviewBody, { carId: ID, bookingId: ID2, rating: 6, comment: "x" }), ["rating: rating must be at most 5"]);
    assert.deepEqual(issues(review.createReviewBody, { carId: ID, bookingId: ID2, rating: 5, comment: "" }), ["comment: comment is required"]);
    assert.ok(issues(review.createReviewBody, { carId: ID, bookingId: ID2, rating: 5, comment: "x".repeat(1001) }).length > 0);
    assert.ok(issues(review.createReviewBody, { carId: { $ne: null }, bookingId: ID2, rating: 5, comment: "x" }).length > 0);
  });

  it("paginates with the shared defaults and a 100 cap", () => {
    assert.deepEqual({ ...parse(review.listReviewsQuery, {}) }, { page: 1, limit: 10 });
    assert.ok(issues(review.listReviewsQuery, { limit: "5000" }).length > 0);
  });
});

describe("location schemas", () => {
  const form = { name: "A", city: "Pune", state: "MH", address: "x", phone: "", email: "", isActive: true, isPickupAvailable: true, isDropAvailable: true, country: "India" };

  it("accepts the admin form payload", () => {
    const data = parse(location.createLocationBody, form);
    assert.equal(data.phone, "", "blank contact fields are kept so they can be cleared");
  });

  it("only keeps known fields, so carCount and friends can't be set through the API", () => {
    const data = parse(location.createLocationBody, { ...form, carCount: 999, _id: "x", createdAt: "x" });
    for (const key of ["carCount", "_id", "createdAt"]) assert.equal(key in data, false, key);
  });

  it("requires name, city, state and address on create", () => {
    assert.deepEqual(issues(location.createLocationBody, {}).map((m) => m.split(":")[0]), ["name", "city", "state", "address"]);
  });

  it("makes updates partial and lets contact fields be cleared", () => {
    assert.deepEqual({ ...parse(location.updateLocationBody, { phone: "", email: "" }) }, { phone: "", email: "" });
    assert.deepEqual(parse(location.updateLocationBody, { name: "" }), {}, "a blank name is ignored rather than wiping the field");
    assert.deepEqual(issues(location.updateLocationBody, { email: "nope" }), ["email: email is not a valid email address"]);
  });

  it("rejects object-valued filters", () => {
    assert.deepEqual(issues(location.listLocationsQuery, { city: { $regex: "." } }), ["city: city must be a single value"]);
  });
});

describe("car / review / location routes (over HTTP, auth stubbed, no database)", () => {
  let server;
  let base;
  let token;
  const stubs = [];

  const stub = (model, method, impl) => {
    const m = mock.method(model, method, impl);
    stubs.push(m);
    return m;
  };
  const fail = (what) => () => assert.fail(`${what} must not be called`);
  // Query-builder stand-in: chained calls return itself, awaiting it yields `result`.
  const chain = (result) => {
    const q = {
      populate: () => q, sort: () => q, skip: () => q, limit: () => q, select: () => q, lean: () => q,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return q;
  };

  before(async () => {
    mock.method(User, "findById", () => ({ select: async () => new User({ _id: ID, isActive: true, role: "admin" }) }));
    token = jwt.sign({ id: ID, role: "admin" }, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json());
    app.use("/cars", carRoutes);
    app.use("/reviews", reviewRoutes);
    app.use("/locations", locationRoutes);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    mock.restoreAll();
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    while (stubs.length) stubs.pop().mock.restore();
  });

  const call = async (method, path, body, { auth = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(auth && { Authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  describe("cars", () => {
    it("GET /cars rejects nested params with a 400 instead of crashing in the controller", async () => {
      stub(Car, "find", fail("Car.find"));
      const res = await call("GET", "/cars?type[$ne]=x");
      assert.equal(res.status, 400);
      assert.equal(res.json.errors[0].field, "type");
    });

    it("GET /cars rejects limit > 100, unknown sort and non-numeric prices", async () => {
      stub(Car, "find", fail("Car.find"));
      assert.equal((await call("GET", "/cars?limit=101")).status, 400);
      assert.equal((await call("GET", "/cars?sort=constructor")).status, 400);
      assert.equal((await call("GET", "/cars?minPrice=abc")).status, 400);
    });

    it("GET /cars passes a valid query through; maxPrice=0 still filters at 0", async () => {
      const find = stub(Car, "find", () => chain([{ _id: "c1" }]));
      stub(Car, "countDocuments", async () => 1);

      const res = await call("GET", "/cars?maxPrice=0&type=sedan&limit=12&sort=price-asc");

      assert.equal(res.status, 200);
      const query = find.mock.calls[0].arguments[0];
      assert.deepEqual(query.pricePerDay, { $lte: 0 });
      assert.deepEqual(query.type, { $in: ["sedan"] });
      assert.equal(res.json.data.pagination.limit, 12);
    });

    it("GET /cars keeps the controller's own page error", async () => {
      stub(Car, "find", fail("Car.find"));
      const res = await call("GET", "/cars?page=abc");
      assert.equal(res.status, 400);
      assert.equal(res.json.message, "Invalid page parameter");
    });

    it("GET /cars/:id rejects a malformed id before querying", async () => {
      stub(Car, "findById", fail("Car.findById"));
      const res = await call("GET", "/cars/not-an-id");
      assert.equal(res.status, 400);
      assert.equal(res.json.message, "id is not a valid id");
    });

    it("GET /cars/:id/availability still reports missing dates with the controller's message", async () => {
      stub(Car, "findById", fail("Car.findById"));
      const res = await call("GET", `/cars/${ID}/availability`);
      assert.equal(res.status, 400);
      assert.equal(res.json.message, "Pickup and drop dates required");
    });

    it("admin writes check authentication before validating, so a bad body isn't echoed to anonymous callers", async () => {
      const res = await call("POST", "/cars", {}, { auth: false });
      assert.equal(res.status, 401);
    });

    it("POST /cars rejects an invalid body before creating anything", async () => {
      stub(Car, "create", fail("Car.create"));
      const res = await call("POST", "/cars", { ...adminCar, type: "spaceship", pricePerDay: -1 });
      assert.equal(res.status, 400);
      assert.equal(res.json.errors.length, 2);
    });

    it("POST /cars creates with only the validated, coerced fields", async () => {
      const create = stub(Car, "create", async (doc) => ({ _id: "c1", ...doc }));

      const res = await call("POST", "/cars", { ...adminCar, year: "2024", images: [{ url: "x" }], rating: 5 });

      assert.equal(res.status, 201);
      const doc = create.mock.calls[0].arguments[0];
      assert.equal(doc.year, 2024);
      assert.equal("rating" in doc, false);
      assert.equal("images" in doc, false);
    });

    it("PATCH /cars/:id lets an admin clear the description", async () => {
      const update = stub(Car, "findByIdAndUpdate", async () => ({ _id: ID }));

      const res = await call("PATCH", `/cars/${ID}`, { description: "", rating: 5 });

      assert.equal(res.status, 200);
      assert.deepEqual(update.mock.calls[0].arguments[1], { description: "" });
    });

    it("rejects a bad document type and bad ids before any upload or query", async () => {
      stub(Car, "findById", fail("Car.findById"));
      stub(Car, "findByIdAndUpdate", fail("Car.findByIdAndUpdate"));

      const doc = await call("POST", `/cars/${ID}/documents/license`);
      assert.equal(doc.status, 400);
      assert.equal(doc.json.message, "Invalid docType. Use: insurance, registration, pollution");

      assert.equal((await call("PATCH", `/cars/${ID}/documents/license/verify`)).status, 400);
      assert.equal((await call("DELETE", `/cars/${ID}/images/not-an-id`)).status, 400);
      assert.equal((await call("DELETE", "/cars/not-an-id")).status, 400);
    });
  });

  describe("reviews", () => {
    it("GET /reviews/car/:carId rejects a bad id and an oversized page", async () => {
      stub(Review, "find", fail("Review.find"));
      assert.equal((await call("GET", "/reviews/car/not-an-id")).status, 400);
      assert.equal((await call("GET", `/reviews/car/${ID}?limit=5000`)).status, 400);
    });

    it("GET /reviews/car/:carId passes a valid request through", async () => {
      stub(Review, "find", () => chain([]));
      stub(Review, "countDocuments", async () => 0);
      stub(Review, "aggregate", async () => []);

      const res = await call("GET", `/reviews/car/${ID}?page=2&limit=5`);

      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data.pagination, { page: 2, limit: 5, total: 0, pages: 0 });
    });

    it("POST /reviews rejects a bad rating before looking anything up", async () => {
      stub(Booking, "findOne", fail("Booking.findOne"));
      const res = await call("POST", "/reviews", { carId: ID, bookingId: ID2, rating: 9, comment: "x" });
      assert.equal(res.status, 400);
      assert.equal(res.json.message, "rating must be at most 5");
    });

    it("PATCH /reviews/:id requires rating and comment, and DELETE/helpful/report check the id", async () => {
      stub(Review, "findOne", fail("Review.findOne"));
      stub(Review, "findByIdAndUpdate", fail("Review.findByIdAndUpdate"));
      assert.equal((await call("PATCH", `/reviews/${ID}`, { title: "t" })).status, 400);
      assert.equal((await call("PATCH", "/reviews/not-an-id", { rating: 4, comment: "ok" })).status, 400);
      assert.equal((await call("DELETE", "/reviews/not-an-id")).status, 400);
      assert.equal((await call("POST", "/reviews/not-an-id/helpful")).status, 400);
      assert.equal((await call("POST", "/reviews/not-an-id/report")).status, 400);
    });

    it("POST /reviews/:id/helpful passes a valid id through", async () => {
      stub(Review, "findByIdAndUpdate", async () => ({ helpfulVotes: 3 }));
      const res = await call("POST", `/reviews/${ID}/helpful`);
      assert.equal(res.status, 200);
      assert.equal(res.json.data.helpfulVotes, 3);
    });
  });

  describe("locations", () => {
    it("GET /locations rejects object-valued filters before building a regex", async () => {
      stub(Location, "find", fail("Location.find"));
      assert.equal((await call("GET", "/locations?city[$regex]=.")).status, 400);
      assert.equal((await call("GET", "/locations?active=maybe")).status, 400);
    });

    it("GET /locations still defaults to active locations", async () => {
      const find = stub(Location, "find", () => chain([]));
      const res = await call("GET", "/locations?city=Pune");
      assert.equal(res.status, 200);
      assert.equal(find.mock.calls[0].arguments[0].isActive, true);
      assert.ok(find.mock.calls[0].arguments[0].city instanceof RegExp);
    });

    it("GET /locations/:id rejects a malformed id", async () => {
      stub(Location, "findById", fail("Location.findById"));
      assert.equal((await call("GET", "/locations/not-an-id")).status, 400);
    });

    it("POST /locations validates the body and no longer passes unknown fields to Mongoose", async () => {
      const create = stub(Location, "create", async (doc) => ({ _id: "l1", ...doc }));

      assert.equal((await call("POST", "/locations", { name: "A" })).status, 400);
      assert.equal(create.mock.callCount(), 0);

      const res = await call("POST", "/locations", { name: "A", city: "Pune", state: "MH", address: "x", country: "India", carCount: 999 });
      assert.equal(res.status, 201);
      assert.equal("carCount" in create.mock.calls[0].arguments[0], false);
    });

    it("PATCH /locations/:id lets an admin clear phone and email", async () => {
      const update = stub(Location, "findByIdAndUpdate", async () => ({ _id: ID }));

      const res = await call("PATCH", `/locations/${ID}`, { phone: "", email: "", carCount: 5 });

      assert.equal(res.status, 200);
      assert.deepEqual(update.mock.calls[0].arguments[1], { phone: "", email: "" });
    });

    it("PATCH and DELETE /locations/:id reject a malformed id", async () => {
      stub(Location, "findByIdAndUpdate", fail("Location.findByIdAndUpdate"));
      assert.equal((await call("PATCH", "/locations/not-an-id", { phone: "1" })).status, 400);
      assert.equal((await call("DELETE", "/locations/not-an-id")).status, 400);
    });
  });
});

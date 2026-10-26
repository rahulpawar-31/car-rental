import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import Car from "../src/model/car.model.js";
import Booking from "../src/model/booking.model.js";
import { cloudinary } from "../src/config/cloudinary.js";
import { ACTIVE_BOOKING_STATUSES } from "../src/services/carAvailability.js";
import {
  ALLOWED_CAR_FIELDS,
  CAR_SORT_OPTIONS,
  pickAllowedCarFields,
  toCarImages,
  parsePaging,
  buildCarFilter,
  listCars,
  getCar,
  getFeaturedCars,
  getBookedRanges,
  isCarAvailable,
  createCar,
  updateCar,
  addCarImages,
  deleteCarImage,
  deactivateCar,
  uploadCarDocument,
  verifyCarDocument,
  getCarFilters,
} from "../src/services/car.js";

afterEach(() => mock.restoreAll());

const DAY = 24 * 60 * 60 * 1000;
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();

// Query-builder stand-in that records the arguments of each chained call.
function chain(result) {
  const calls = {};
  const q = {
    calls,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  for (const name of ["populate", "sort", "skip", "limit", "select", "lean"]) {
    q[name] = (...args) => {
      calls[name] = args;
      return q;
    };
  }
  return q;
}

async function rejectsWith(promise, status, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, status);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

const files = [
  { path: "https://cdn/1.jpg", filename: "pid1" },
  { path: "https://cdn/2.jpg", filename: "pid2" },
];

describe("pickAllowedCarFields", () => {
  it("keeps only the allowed fields", () => {
    const picked = pickAllowedCarFields({
      name: "City", pricePerDay: 3000, features: ["AC"],
      rating: 5, totalRentals: 99, images: [{ url: "x" }], documents: {}, licensePlate: "MH12", _id: "x",
    });
    assert.deepEqual(picked, { name: "City", pricePerDay: 3000, features: ["AC"] });
  });

  it("allows exactly the fields the admin form manages", () => {
    assert.equal(ALLOWED_CAR_FIELDS.size, 17);
    for (const key of ["isActive", "isAvailable", "isFeatured", "securityDeposit"]) assert.ok(ALLOWED_CAR_FIELDS.has(key), key);
    for (const key of ["rating", "reviewCount", "totalRentals", "images", "documents"]) assert.equal(ALLOWED_CAR_FIELDS.has(key), false, key);
  });
});

describe("toCarImages", () => {
  it("makes the first image primary when creating a car", () => {
    assert.deepEqual(toCarImages(files, true), [
      { url: "https://cdn/1.jpg", publicId: "pid1", isPrimary: true },
      { url: "https://cdn/2.jpg", publicId: "pid2", isPrimary: false },
    ]);
  });

  it("never marks appended images primary", () => {
    assert.deepEqual(toCarImages(files, false).map((i) => i.isPrimary), [false, false]);
  });
});

describe("parsePaging", () => {
  it("parses valid page and limit", () => {
    assert.deepEqual(parsePaging("3", "12"), { pageNum: 3, limitNum: 12 });
  });

  it("rejects zero, negative and non-numeric values rather than defaulting them", () => {
    for (const bad of ["0", "-1", "abc", ""]) {
      assert.throws(() => parsePaging(bad, "12"), { message: "Invalid page parameter", statusCode: 400 }, `page=${bad}`);
      assert.throws(() => parsePaging("1", bad), { message: "Invalid limit parameter", statusCode: 400 }, `limit=${bad}`);
    }
  });

  it("checks page before limit", () => {
    assert.throws(() => parsePaging("0", "0"), { message: "Invalid page parameter" });
  });
});

describe("buildCarFilter", () => {
  it("only lists active cars by default", () => {
    assert.deepEqual(buildCarFilter({}), { isActive: true });
  });

  it("lowercases and splits type and fuelType lists, and lowercases transmission", () => {
    const q = buildCarFilter({ type: "SUV,Sedan", fuelType: "Petrol,Diesel", transmission: "Manual" });
    assert.deepEqual(q.type, { $in: ["suv", "sedan"] });
    assert.deepEqual(q.fuelType, { $in: ["petrol", "diesel"] });
    assert.equal(q.transmission, "manual");
  });

  it("matches brands exactly but case-insensitively, with regex characters escaped", () => {
    const { brand } = buildCarFilter({ brand: "Toyota, M.G " });
    assert.equal(brand.$in.length, 2);
    assert.equal(brand.$in[0].source, "^Toyota$");
    assert.equal(brand.$in[1].source, "^M\\.G$");
    assert.equal(brand.$in[0].flags, "i");
    assert.ok(brand.$in[0].test("TOYOTA"));
    assert.equal(brand.$in[0].test("Toyota Camry"), false);
  });

  it("filters price by range, treating the string \"0\" as a real bound", () => {
    assert.deepEqual(buildCarFilter({ minPrice: "500", maxPrice: "5000" }).pricePerDay, { $gte: 500, $lte: 5000 });
    assert.deepEqual(buildCarFilter({ maxPrice: "0" }).pricePerDay, { $lte: 0 });
    assert.deepEqual(buildCarFilter({ minPrice: "0" }).pricePerDay, { $gte: 0 });
  });

  it("reads seats as a minimum, featured only when \"true\", available as a flag", () => {
    const q = buildCarFilter({ seats: "5", featured: "true", available: "false" });
    assert.deepEqual(q.seats, { $gte: 5 });
    assert.equal(q.isFeatured, true);
    assert.equal(q.isAvailable, false);
    assert.equal("isFeatured" in buildCarFilter({ featured: "false" }), false);
    assert.equal(buildCarFilter({ available: "true" }).isAvailable, true);
  });

  it("uses a text search for search", () => {
    assert.deepEqual(buildCarFilter({ search: "city" }).$text, { $search: "city" });
  });

  it("accepts a valid location id and rejects anything else", () => {
    assert.equal(buildCarFilter({ location: "64b000000000000000000001" }).location, "64b000000000000000000001");
    assert.throws(() => buildCarFilter({ location: "nope" }), { message: "Invalid location ID", statusCode: 400 });
  });
});

describe("listCars", () => {
  const stubList = (cars = [{ _id: "c1" }], total = 25) => {
    const q = chain(cars);
    const find = mock.method(Car, "find", () => q);
    mock.method(Car, "countDocuments", async () => total);
    return { q, find };
  };

  it("pages 12 at a time from page 1 by default, newest first", async () => {
    const { q } = stubList();

    const result = await listCars({});

    assert.deepEqual(q.calls.sort, [{ createdAt: -1 }]);
    assert.deepEqual(q.calls.skip, [0]);
    assert.deepEqual(q.calls.limit, [12]);
    assert.deepEqual(result.pagination, { page: 1, limit: 12, total: 25, pages: 3 });
  });

  it("applies the requested page, limit and sort", async () => {
    const { q } = stubList();

    const result = await listCars({ page: "3", limit: "5", sort: "price-desc" });

    assert.deepEqual(q.calls.sort, [CAR_SORT_OPTIONS["price-desc"]]);
    assert.deepEqual(q.calls.skip, [10]);
    assert.deepEqual(result.pagination, { page: 3, limit: 5, total: 25, pages: 5 });
  });

  it("falls back to newest first for an unknown sort key", async () => {
    const { q } = stubList();
    await listCars({ sort: "weird" });
    assert.deepEqual(q.calls.sort, [{ createdAt: -1 }]);
  });

  it("rejects bad paging before querying anything", async () => {
    const find = mock.method(Car, "find", () => assert.fail("must not query"));
    await rejectsWith(listCars({ page: "0" }), 400, "Invalid page parameter");
    await rejectsWith(listCars({ limit: "abc" }), 400, "Invalid limit parameter");
    assert.equal(find.mock.callCount(), 0);
  });

  it("excludes cars already booked in the requested window", async () => {
    const { find } = stubList();
    const bookingFind = mock.method(Booking, "find", () => chain([{ car: { toString: () => "carA" } }, { car: { toString: () => "carB" } }]));

    await listCars({ pickupDate: inDays(2), dropDate: inDays(4) });

    const conflict = bookingFind.mock.calls[0].arguments[0];
    assert.deepEqual(conflict.status, { $in: ACTIVE_BOOKING_STATUSES });
    assert.equal("car" in conflict, false, "fleet-wide check, not scoped to one car");
    assert.deepEqual(find.mock.calls[0].arguments[0]._id, { $nin: ["carA", "carB"] });
  });

  it("adds no exclusion when nothing is booked in the window", async () => {
    const { find } = stubList();
    mock.method(Booking, "find", () => chain([]));

    await listCars({ pickupDate: inDays(2), dropDate: inDays(4) });

    assert.equal("_id" in find.mock.calls[0].arguments[0], false);
  });

  it("validates the window, and ignores a lone date", async () => {
    stubList();
    await rejectsWith(listCars({ pickupDate: "nope", dropDate: inDays(4) }), 400, "Invalid date format");
    await rejectsWith(listCars({ pickupDate: inDays(4), dropDate: inDays(2) }), 400, "Pickup date must be before drop date");

    const bookingFind = mock.method(Booking, "find", () => assert.fail("must not query bookings"));
    await listCars({ pickupDate: inDays(2) });
    assert.equal(bookingFind.mock.callCount(), 0);
  });
});

describe("getCar / getFeaturedCars", () => {
  it("returns an active car", async () => {
    const car = { _id: "c1", isActive: true };
    mock.method(Car, "findById", () => chain(car));
    assert.equal(await getCar("c1"), car);
  });

  it("404s for a missing or deactivated car", async () => {
    mock.method(Car, "findById", () => chain(null));
    await rejectsWith(getCar("c1"), 404, "Car not found");
    mock.method(Car, "findById", () => chain({ isActive: false }));
    await rejectsWith(getCar("c1"), 404, "Car not found");
  });

  it("featured cars must be active, available and flagged, capped at 8", async () => {
    const q = chain([]);
    const find = mock.method(Car, "find", () => q);

    await getFeaturedCars();

    assert.deepEqual(find.mock.calls[0].arguments[0], { isFeatured: true, isActive: true, isAvailable: true });
    assert.deepEqual(q.calls.limit, [8]);
  });
});

describe("getBookedRanges", () => {
  it("404s for an unknown or deactivated car", async () => {
    mock.method(Car, "findById", async () => null);
    await rejectsWith(getBookedRanges("c1"), 404, "Car not found");
  });

  it("lists upcoming booked ranges for active bookings, from midnight today", async () => {
    mock.method(Car, "findById", async () => ({ isActive: true }));
    const find = mock.method(Booking, "find", () =>
      chain([{ pickupDate: new Date("2030-01-01"), dropDate: new Date("2030-01-03") }])
    );

    const ranges = await getBookedRanges("c1");

    assert.deepEqual(ranges, [{ from: new Date("2030-01-01"), to: new Date("2030-01-03") }]);
    const query = find.mock.calls[0].arguments[0];
    assert.equal(query.car, "c1");
    assert.deepEqual(query.status, { $in: ACTIVE_BOOKING_STATUSES });
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    assert.equal(query.dropDate.$gt.getTime(), midnight.getTime());
  });
});

describe("isCarAvailable", () => {
  const car = { isActive: true, isAvailable: true };
  const dates = () => ({ pickupDate: inDays(2), dropDate: inDays(4) });

  it("requires both dates, parseable and in order", async () => {
    await rejectsWith(isCarAvailable("c1", {}), 400, "Pickup and drop dates required");
    await rejectsWith(isCarAvailable("c1", { pickupDate: inDays(2) }), 400, "Pickup and drop dates required");
    await rejectsWith(isCarAvailable("c1", { pickupDate: "x", dropDate: inDays(4) }), 400, "Invalid date format");
    await rejectsWith(isCarAvailable("c1", { pickupDate: inDays(4), dropDate: inDays(2) }), 400, "Pickup date must be before drop date");
  });

  it("404s for an unknown car", async () => {
    mock.method(Car, "findById", async () => null);
    await rejectsWith(isCarAvailable("c1", dates()), 404, "Car not found");
  });

  it("is true only when there is no conflicting booking and the car is listed as available", async () => {
    mock.method(Car, "findById", async () => car);
    mock.method(Booking, "findOne", async () => null);
    assert.equal(await isCarAvailable("c1", dates()), true);

    mock.method(Booking, "findOne", async () => ({ _id: "b1" }));
    assert.equal(await isCarAvailable("c1", dates()), false);

    mock.method(Car, "findById", async () => ({ ...car, isAvailable: false }));
    mock.method(Booking, "findOne", async () => null);
    assert.equal(await isCarAvailable("c1", dates()), false);
  });

  it("checks conflicts for that car only", async () => {
    mock.method(Car, "findById", async () => car);
    const findOne = mock.method(Booking, "findOne", async () => null);

    await isCarAvailable("c1", dates());

    assert.equal(findOne.mock.calls[0].arguments[0].car, "c1");
  });
});

describe("createCar / updateCar", () => {
  it("creates from the allowed fields and makes the first upload the primary image", async () => {
    const create = mock.method(Car, "create", async (doc) => doc);

    await createCar({ name: "City", rating: 5, images: [{ url: "x" }] }, files);

    const doc = create.mock.calls[0].arguments[0];
    assert.equal(doc.name, "City");
    assert.equal("rating" in doc, false);
    assert.deepEqual(doc.images.map((i) => i.isPrimary), [true, false]);
  });

  it("sets no images when nothing was uploaded", async () => {
    const create = mock.method(Car, "create", async (doc) => doc);
    await createCar({ name: "City" }, undefined);
    await createCar({ name: "City" }, []);
    assert.equal("images" in create.mock.calls[0].arguments[0], false);
    assert.equal("images" in create.mock.calls[1].arguments[0], false);
  });

  it("updates with the allowed fields only, running model validators", async () => {
    const update = mock.method(Car, "findByIdAndUpdate", async () => ({ _id: "c1" }));

    await updateCar("c1", { pricePerDay: 10, totalRentals: 99 });

    assert.deepEqual(update.mock.calls[0].arguments, ["c1", { pricePerDay: 10 }, { new: true, runValidators: true }]);
  });

  it("404s when updating an unknown car", async () => {
    mock.method(Car, "findByIdAndUpdate", async () => null);
    await rejectsWith(updateCar("c1", {}), 404, "Car not found");
  });
});

describe("images", () => {
  it("addCarImages appends uploads as non-primary and returns the car's images", async () => {
    const update = mock.method(Car, "findByIdAndUpdate", async () => ({ images: [{ url: "all" }] }));

    const images = await addCarImages("c1", files);

    assert.deepEqual(images, [{ url: "all" }]);
    const push = update.mock.calls[0].arguments[1].$push.images.$each;
    assert.deepEqual(push.map((i) => i.isPrimary), [false, false]);
  });

  it("addCarImages needs at least one file, and a real car", async () => {
    await rejectsWith(addCarImages("c1", undefined), 400, "No images uploaded");
    await rejectsWith(addCarImages("c1", []), 400, "No images uploaded");
    mock.method(Car, "findByIdAndUpdate", async () => null);
    await rejectsWith(addCarImages("c1", files), 404, "Car not found");
  });

  const carWithImages = () => {
    const car = {
      images: { id: (i) => (i === "img1" ? { publicId: "pid1" } : i === "img2" ? { publicId: "" } : null), pull: mock.fn() },
      save: mock.fn(async () => {}),
    };
    return car;
  };

  it("deleteCarImage removes the Cloudinary asset, then the image, then saves", async () => {
    const car = carWithImages();
    mock.method(Car, "findById", async () => car);
    const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));

    await deleteCarImage("c1", "img1");

    assert.deepEqual(destroy.mock.calls[0].arguments, ["pid1"]);
    assert.deepEqual(car.images.pull.mock.calls[0].arguments, ["img1"]);
    assert.equal(car.save.mock.callCount(), 1);
  });

  it("deleteCarImage skips Cloudinary for an image with no public id", async () => {
    const car = carWithImages();
    mock.method(Car, "findById", async () => car);
    const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));

    await deleteCarImage("c1", "img2");

    assert.equal(destroy.mock.callCount(), 0);
    assert.equal(car.images.pull.mock.callCount(), 1);
  });

  it("deleteCarImage 404s for an unknown car or image without touching anything", async () => {
    const car = carWithImages();
    mock.method(Car, "findById", async () => car);
    const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));

    await rejectsWith(deleteCarImage("c1", "zzz"), 404, "Image not found");
    assert.equal(destroy.mock.callCount(), 0);
    assert.equal(car.save.mock.callCount(), 0);

    mock.method(Car, "findById", async () => null);
    await rejectsWith(deleteCarImage("c1", "img1"), 404, "Car not found");
  });
});

describe("deactivateCar", () => {
  it("soft-deletes by marking the car inactive", async () => {
    const update = mock.method(Car, "findByIdAndUpdate", async () => ({ _id: "c1" }));
    await deactivateCar("c1");
    assert.deepEqual(update.mock.calls[0].arguments, ["c1", { isActive: false }, { new: true }]);
  });

  it("404s for an unknown car", async () => {
    mock.method(Car, "findByIdAndUpdate", async () => null);
    await rejectsWith(deactivateCar("c1"), 404, "Car not found");
  });
});

describe("documents", () => {
  const file = { path: "https://cdn/doc.pdf", filename: "docpid" };
  const stubCar = (documents = {}) => {
    mock.method(Car, "findById", () => chain({ documents }));
    return mock.method(Car, "findByIdAndUpdate", async () => ({ documents: { saved: true } }));
  };

  it("uploadCarDocument rejects an unknown type before anything else", async () => {
    const find = mock.method(Car, "findById", () => assert.fail("must not query"));
    await rejectsWith(uploadCarDocument("c1", "license", file, undefined), 400, "Invalid document type. Use: insurance, registration, pollution");
    assert.equal(find.mock.callCount(), 0);
  });

  it("uploadCarDocument needs a file and an existing car", async () => {
    await rejectsWith(uploadCarDocument("c1", "insurance", undefined, undefined), 400, "No document uploaded");
    mock.method(Car, "findById", () => chain(null));
    await rejectsWith(uploadCarDocument("c1", "insurance", file, undefined), 404, "Car not found");
  });

  it("stores the new file as unverified and returns the car's documents", async () => {
    const update = stubCar();

    const documents = await uploadCarDocument("c1", "insurance", file, undefined);

    assert.deepEqual(documents, { saved: true });
    assert.deepEqual(update.mock.calls[0].arguments[1], {
      "documents.insurance.url": "https://cdn/doc.pdf",
      "documents.insurance.publicId": "docpid",
      "documents.insurance.verified": false,
    });
  });

  it("parses the expiry date when given and rejects an unparseable one", async () => {
    const update = stubCar();
    await uploadCarDocument("c1", "pollution", file, "2031-05-05");
    assert.deepEqual(update.mock.calls[0].arguments[1]["documents.pollution.expiryDate"], new Date("2031-05-05"));

    stubCar();
    await rejectsWith(uploadCarDocument("c1", "pollution", file, "nope"), 400, "Invalid expiry date");
  });

  it("replaces the previous file: deletes its asset by public id, or derives one for legacy records", async () => {
    const destroy = mock.method(cloudinary.uploader, "destroy", async () => ({}));

    stubCar({ insurance: { url: "https://x/old.pdf", publicId: "oldpid" } });
    await uploadCarDocument("c1", "insurance", file, undefined);
    assert.deepEqual(destroy.mock.calls[0].arguments, ["oldpid"]);

    stubCar({ registration: { url: "https://x/folder/legacy.pdf" } });
    await uploadCarDocument("c1", "registration", file, undefined);
    assert.deepEqual(destroy.mock.calls[1].arguments, ["car-rental/documents/legacy"]);

    stubCar({});
    await uploadCarDocument("c1", "pollution", file, undefined);
    assert.equal(destroy.mock.callCount(), 2, "nothing to delete when there was no previous file");
  });

  it("verifyCarDocument marks the document verified", async () => {
    const update = mock.method(Car, "findByIdAndUpdate", async () => ({ documents: { insurance: { verified: true } } }));

    const documents = await verifyCarDocument("c1", "insurance");

    assert.deepEqual(update.mock.calls[0].arguments, ["c1", { "documents.insurance.verified": true }, { new: true }]);
    assert.deepEqual(documents, { insurance: { verified: true } });
  });

  it("verifyCarDocument rejects an unknown type and an unknown car", async () => {
    await rejectsWith(verifyCarDocument("c1", "license"), 400, "Invalid document type");
    mock.method(Car, "findByIdAndUpdate", async () => null);
    await rejectsWith(verifyCarDocument("c1", "insurance"), 404, "Car not found");
  });
});

describe("getCarFilters", () => {
  it("returns sorted brands, types and fuel types plus the price range", async () => {
    mock.method(Car, "distinct", async (field) => ({ brand: ["Toyota", "Honda"], type: ["suv", "sedan"], fuelType: ["petrol", "diesel"] })[field]);
    mock.method(Car, "aggregate", async () => [{ _id: null, min: 500, max: 9000 }]);

    const data = await getCarFilters();

    assert.deepEqual(data, {
      brands: ["Honda", "Toyota"],
      types: ["sedan", "suv"],
      transmissions: ["automatic", "manual"],
      fuelTypes: ["diesel", "petrol"],
      priceRange: { _id: null, min: 500, max: 9000 },
    });
  });

  it("falls back to a default price range for an empty fleet", async () => {
    mock.method(Car, "distinct", async () => []);
    mock.method(Car, "aggregate", async () => []);

    assert.deepEqual((await getCarFilters()).priceRange, { min: 0, max: 10000 });
  });
});

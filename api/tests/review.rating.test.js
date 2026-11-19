import { describe, it, afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Review from "../src/model/review.model.js";
import Car from "../src/model/car.model.js";
import { moderateReview } from "../src/services/admin.js";

const CAR = new mongoose.Types.ObjectId();
const OTHER_CAR = new mongoose.Types.ObjectId();

// A tiny in-memory stand-in for the reviews collection and the car's cached fields. Only the
// database edges are replaced; moderateReview and the model's real hooks run on top of them.
let reviews;
let car;

function seed(list) {
  reviews = list.map(([rating, isApproved, carId = CAR], i) => ({
    _id: new mongoose.Types.ObjectId(),
    car: carId,
    user: new mongoose.Types.ObjectId(),
    booking: new mongoose.Types.ObjectId(),
    comment: `review ${i}`,
    rating,
    isApproved,
  }));
  car = { rating: 0, reviewCount: 0 };
  return reviews.map((r) => r._id);
}

beforeEach(() => {
  mock.method(Review.collection, "findOneAndUpdate", async (filter, update) => {
    const found = reviews.find((r) => String(r._id) === String(filter._id));
    if (!found) return null;
    Object.assign(found, update.$set);
    return { ...found };
  });
  mock.method(Review, "aggregate", async ([{ $match }]) => {
    const approved = reviews.filter((r) => String(r.car) === String($match.car) && r.isApproved === $match.isApproved);
    if (!approved.length) return [];
    const avgRating = approved.reduce((sum, r) => sum + r.rating, 0) / approved.length;
    return [{ _id: $match.car, avgRating, count: approved.length }];
  });
  mock.method(Car, "findByIdAndUpdate", async (id, fields) => {
    if (String(id) === String(CAR)) Object.assign(car, fields);
  });
});

afterEach(() => mock.restoreAll());

describe("moderateReview keeps the car's rating in step with the approved reviews", () => {
  it("counts the first review the moment it is approved", async () => {
    const [id] = seed([[4, false]]);

    await moderateReview(id, { approved: true });

    assert.deepEqual(car, { rating: 4, reviewCount: 1 });
  });

  it("drops a rejected review from the rating, down to zero when it was the last one", async () => {
    const [id] = seed([[5, true]]);
    car = { rating: 5, reviewCount: 1 };

    await moderateReview(id, { approved: false });

    assert.deepEqual(car, { rating: 0, reviewCount: 0 });
  });

  it("recomputes the average as approval changes among several ratings", async () => {
    const [a, b, c] = seed([
      [5, true],
      [3, false],
      [2, true],
    ]);

    await moderateReview(b, { approved: true });
    assert.deepEqual(car, { rating: 3.3, reviewCount: 3 });

    await moderateReview(c, { approved: false });
    assert.deepEqual(car, { rating: 4, reviewCount: 2 });

    await moderateReview(a, { approved: false });
    assert.deepEqual(car, { rating: 3, reviewCount: 1 });
  });

  it("only counts reviews of the car that was moderated", async () => {
    const [id] = seed([
      [1, true, OTHER_CAR],
      [5, false],
    ]);
    // The first seeded id belongs to the other car; moderating it must not touch this car.
    await moderateReview(id, { approved: false });

    assert.deepEqual(car, { rating: 0, reviewCount: 0 });
  });

  it("does not recalculate anything when the review does not exist", async () => {
    seed([[5, true]]);
    const update = Car.findByIdAndUpdate;

    await assert.rejects(moderateReview(new mongoose.Types.ObjectId(), { approved: true }), { statusCode: 404 });

    assert.equal(update.mock.callCount(), 0);
  });
});

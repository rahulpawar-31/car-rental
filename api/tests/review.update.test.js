import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import "express-async-errors";
import Review from "../src/model/review.model.js";
import { updateReview } from "../src/controllers/review.controller.js";

const ID = "64b000000000000000000001";

// A stored, approved review that has everything the edit form might leave out.
const stored = () =>
  Review.hydrate({
    _id: ID,
    user: "64b000000000000000000002",
    car: "64b000000000000000000003",
    booking: "64b000000000000000000004",
    rating: 5,
    title: "Great car",
    comment: "Original comment",
    aspects: { cleanliness: 5, comfort: 4 },
    isApproved: true,
  });

// Runs updateReview against `review`, capturing what would be written instead of saving it.
async function runUpdate(review, body) {
  mock.method(Review, "findOne", async () => review);
  let changes;
  mock.method(review, "save", async () => {
    changes = review.getChanges();
    return review;
  });
  const res = { json: mock.fn() };

  await updateReview({ params: { id: ID }, user: { _id: "u1" }, body }, res);

  return { changes, response: res.json.mock.calls[0].arguments[0] };
}

afterEach(() => mock.restoreAll());

describe("updateReview", () => {
  it("keeps the title and aspects when the edit form sends only rating and comment", async () => {
    const review = stored();

    const { changes } = await runUpdate(review, { rating: 4, comment: "edited" });

    assert.equal("$unset" in changes, false, `unexpected unset: ${JSON.stringify(changes.$unset)}`);
    assert.equal(review.title, "Great car");
    assert.deepEqual(review.aspects.toObject(), { cleanliness: 5, comfort: 4 });
    assert.equal(review.rating, 4);
    assert.equal(review.comment, "edited");
  });

  it("still updates title and aspects when they are sent", async () => {
    const review = stored();

    await runUpdate(review, { rating: 3, comment: "c", title: "New title", aspects: { cleanliness: 2 } });

    assert.equal(review.title, "New title");
    assert.equal(review.aspects.cleanliness, 2);
  });

  it("can still clear the title explicitly with an empty string", async () => {
    const review = stored();

    await runUpdate(review, { rating: 5, comment: "c", title: "" });

    assert.equal(review.title, "");
  });

  it("sends an edited review back for approval", async () => {
    const review = stored();

    const { changes, response } = await runUpdate(review, { rating: 5, comment: "c" });

    assert.equal(changes.$set.isApproved, false);
    assert.equal(response.message, "Review updated and pending approval");
  });

  it("404s for a review that isn't the user's", async () => {
    mock.method(Review, "findOne", async () => null);
    await assert.rejects(
      updateReview({ params: { id: ID }, user: { _id: "u1" }, body: { rating: 5, comment: "c" } }, { json() {} }),
      { statusCode: 404, message: "Review not found" }
    );
  });
});

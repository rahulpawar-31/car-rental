import { z } from "zod";
import { nonEmptyString, numberInput, objectId, optionalField, pagination } from "./common.js";

// Same bounds as the Review model. Decimals are allowed, as the model allows them.
const stars = (name) =>
  numberInput(name).pipe(z.number().min(1, `${name} must be at least 1`).max(5, `${name} must be at most 5`));

const aspects = z.object({
  cleanliness: optionalField(stars("cleanliness")),
  comfort: optionalField(stars("comfort")),
  performance: optionalField(stars("performance")),
  valueForMoney: optionalField(stars("valueForMoney")),
});

const reviewFields = {
  rating: stars("rating"),
  // The model requires a comment (max 1000) and allows a title (max 100).
  comment: nonEmptyString("comment", 1000),
  title: optionalField(z.string({ error: "title must be text" }).trim().max(100, "title must be at most 100 characters")),
  aspects: optionalField(aspects),
};

export const createReviewBody = z.object({
  carId: objectId("carId"),
  bookingId: objectId("bookingId"),
  ...reviewFields,
});

// updateReview rewrites the whole review (an omitted field is cleared), so rating and comment
// are required, which is what the model's own validation already demanded.
export const updateReviewBody = z.object(reviewFields);

export const carReviewsParams = z.object({ carId: objectId("carId") });
export const listReviewsQuery = z.object({ ...pagination });

import { Router } from "express";
import {
  createReview,
  getCarReviews,
  getMyReviews,
  updateReview,
  deleteReview,
  voteHelpful,
  reportReview,
} from "../controllers/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadCarImages } from "../middleware/upload.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { idParams } from "../validation/common.js";
import { createReviewBody, updateReviewBody, carReviewsParams, listReviewsQuery } from "../validation/review.validation.js";

const router = Router();

router.get("/car/:carId", validate({ params: carReviewsParams, query: listReviewsQuery }), getCarReviews);

router.use(protect);
router.post("/", uploadCarImages, validate({ body: createReviewBody }), createReview);
router.get("/my", getMyReviews);
router.patch("/:id", validate({ params: idParams, body: updateReviewBody }), updateReview);
router.delete("/:id", validate({ params: idParams }), deleteReview);
router.post("/:id/helpful", validate({ params: idParams }), voteHelpful);
router.post("/:id/report", validate({ params: idParams }), reportReview);

export default router;

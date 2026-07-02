import mongoose from "mongoose";
import Review from "../model/review.model.js";
import Booking from "../model/booking.model.js";
import { AppError } from "../middleware/errorHandler.js";

export const createReview = async (req, res) => {
  const { carId, bookingId, rating, title, comment, aspects } = req.body;

  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id, car: carId });
  if (!booking) throw new AppError("No completed booking found for this car", 400);
  if (booking.status !== "completed") throw new AppError("Booking must be completed to review", 400);
  if (booking.isReviewed) throw new AppError("You have already reviewed this booking", 409);

  const existing = await Review.findOne({ booking: bookingId });
  if (existing) throw new AppError("Review already submitted", 409);

  const images = req.files?.map((f) => ({ url: f.path, publicId: f.filename })) || [];

  const review = await Review.create({
    user: req.user._id,
    car: carId,
    booking: bookingId,
    rating,
    title,
    comment,
    aspects,
    images,
    isApproved: false,
  });

  await Booking.findByIdAndUpdate(bookingId, { isReviewed: true });

  res.status(201).json({ success: true, message: "Review submitted for approval", data: { review } });
};

export const getCarReviews = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  if (!mongoose.isValidObjectId(req.params.carId)) throw new AppError("Invalid car ID", 400);

  const query = { car: req.params.carId, isApproved: true, isVisible: true };

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Review.countDocuments(query),
  ]);

  const ratingStats = await Review.aggregate([
    { $match: { car: new mongoose.Types.ObjectId(req.params.carId), isApproved: true } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
        dist: { $push: "$rating" },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      reviews,
      stats: ratingStats[0] || { avgRating: 0, count: 0 },
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    },
  });
};

export const getMyReviews = async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .populate("car", "name brand model images")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: { reviews } });
};

export const updateReview = async (req, res) => {
  const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
  if (!review) throw new AppError("Review not found", 404);

  const { rating, title, comment, aspects } = req.body;
  Object.assign(review, { rating, title, comment, aspects, isApproved: false });
  await review.save();

  res.json({ success: true, message: "Review updated and pending approval", data: { review } });
};

export const deleteReview = async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!review) throw new AppError("Review not found", 404);

  res.json({ success: true, message: "Review deleted" });
};

export const voteHelpful = async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { $inc: { helpfulVotes: 1 } }, { new: true });
  if (!review) throw new AppError("Review not found", 404);
  res.json({ success: true, data: { helpfulVotes: review.helpfulVotes } });
};

export const reportReview = async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new AppError("Review not found", 404);

  if (review.reportedBy.some((id) => id.toString() === req.user._id.toString())) {
    throw new AppError("Already reported", 400);
  }

  review.reportedBy.push(req.user._id);
  if (review.reportedBy.length >= 3) review.isFlagged = true;
  await review.save();

  res.json({ success: true, message: "Review reported" });
};

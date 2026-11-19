import mongoose from "mongoose";
import Car from "./car.model.js";

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    images: [{ url: String, publicId: String }],
    aspects: {
      cleanliness: { type: Number, min: 1, max: 5 },
      comfort: { type: Number, min: 1, max: 5 },
      performance: { type: Number, min: 1, max: 5 },
      valueForMoney: { type: Number, min: 1, max: 5 },
    },
    isApproved: { type: Boolean, default: false },
    isVisible: { type: Boolean, default: true },
    adminResponse: String,
    helpfulVotes: { type: Number, default: 0 },
    reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isFlagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ car: 1, isApproved: 1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ booking: 1 }, { unique: true });

reviewSchema.post("save", async function () {
  await updateCarRating(this.car);
});

reviewSchema.post("findOneAndDelete", async function (doc) {
  if (doc) await updateCarRating(doc.car);
});

// Moderation flips isApproved through findByIdAndUpdate, which skips the save hook above.
reviewSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) await updateCarRating(doc.car);
});

async function updateCarRating(carId) {
  const stats = await mongoose.model("Review").aggregate([
    { $match: { car: carId, isApproved: true } },
    {
      $group: {
        _id: "$car",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  if (stats.length > 0) {
    await Car.findByIdAndUpdate(carId, {
      rating: Math.round(stats[0].avgRating * 10) / 10,
      reviewCount: stats[0].count,
    });
  } else {
    await Car.findByIdAndUpdate(carId, { rating: 0, reviewCount: 0 });
  }
}

const Review = mongoose.model("Review", reviewSchema);
export default Review;

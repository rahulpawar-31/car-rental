import User from "../model/user.model.js";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";
import Review from "../model/review.model.js";
import Coupon from "../model/coupon.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { escapeRegex } from "../utils/regex.utils.js";

/** The `pagination` block every admin list returns. `page` and `limit` may still be query strings. */
export function paginationMeta(page, limit, total) {
  return { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) };
}

const containsInsensitive = (text) => new RegExp(escapeRegex(text), "i");

// --- users -------------------------------------------------------------------------------------

export async function listUsers({ page = 1, limit = 20, search, role, active } = {}) {
  const query = {};
  if (role) query.role = role;
  if (active !== undefined) query.isActive = active === "true";
  if (search) query.$or = [{ name: containsInsensitive(search) }, { email: containsInsensitive(search) }];

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    User.countDocuments(query),
  ]);

  return { users, pagination: paginationMeta(page, limit, total) };
}

/** Flips a user's active flag. Admins can't be deactivated. */
export async function toggleUserStatus(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (user.role === "admin") throw new AppError("Cannot deactivate admin", 400);

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  return { isActive: user.isActive };
}

// --- bookings ----------------------------------------------------------------------------------

export async function listBookings({ page = 1, limit = 20, status, search } = {}) {
  const query = {};
  if (status) query.status = status;

  if (search) {
    const matches = containsInsensitive(search);
    const users = await User.find({ $or: [{ name: matches }, { email: matches }] }).select("_id");
    query.$or = [{ user: { $in: users.map((u) => u._id) } }, { bookingNumber: matches }];
  }

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("user", "name email phone")
      .populate("car", "name brand model licensePlate")
      .populate("pickupLocation", "name city")
      .populate("dropLocation", "name city")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Booking.countDocuments(query),
  ]);

  return { bookings, pagination: paginationMeta(page, limit, total) };
}

// Which statuses a booking may move to from its current status. isAvailable is a separate,
// manually-controlled "delist this car" flag (see Admin car form) — it must not be
// auto-toggled by booking status, or one active rental would block unrelated future dates.
export const ALLOWED_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled", "no-show"],
  confirmed: ["active", "cancelled", "no-show"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": ["cancelled"],
};

/** Throws a 400 unless a booking may move from `from` to `to`. */
export function assertStatusTransition(from, to) {
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[from] || [];
  if (!allowedNext.includes(to)) {
    throw new AppError(`Cannot change booking status from "${from}" to "${to}"`, 400);
  }
}

/** Applies an admin's status change and/or note to a booking, enforcing the allowed transitions. */
export async function updateBookingStatus(bookingId, { status, adminNotes }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError("Booking not found", 404);

  if (status && status !== booking.status) {
    assertStatusTransition(booking.status, status);

    if (status === "cancelled") {
      booking.cancelledAt = new Date();
      booking.cancelledBy = "admin";
      booking.cancellationReason = booking.cancellationReason || adminNotes || "Cancelled by admin";
      if (booking.paymentStatus === "paid" && !booking.refundAmount) {
        booking.refundAmount = booking.totalAmount - booking.securityDeposit;
      }
    }
    if (status === "completed") {
      await Car.findByIdAndUpdate(booking.car, { $inc: { totalRentals: 1 } });
    }

    booking.status = status;
  }

  if (adminNotes !== undefined) booking.adminNotes = adminNotes;

  await booking.save();

  return booking;
}

// --- payments ----------------------------------------------------------------------------------

export async function listPayments({ page = 1, limit = 20, status } = {}) {
  const query = {};
  if (status) query.status = status;

  const [payments, total, totalRevenue] = await Promise.all([
    Payment.find(query)
      .populate("user", "name email")
      .populate({
        path: "booking",
        select: "bookingNumber",
        populate: { path: "car", select: "name brand" },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Payment.countDocuments(query),
    Payment.aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return { payments, totalRevenue: totalRevenue[0]?.total || 0, pagination: paginationMeta(page, limit, total) };
}

// --- reviews -----------------------------------------------------------------------------------

export async function listReviews({ page = 1, limit = 20, status } = {}) {
  const query = {};
  if (status === "pending") query.isApproved = false;
  if (status === "approved") query.isApproved = true;
  if (status === "flagged") query.isFlagged = true;

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate("user", "name email")
      .populate("car", "name brand model")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Review.countDocuments(query),
  ]);

  return { reviews, pagination: paginationMeta(page, limit, total) };
}

/** Approves or rejects a review, with an optional response from the admin. */
export async function moderateReview(reviewId, { approved, response }) {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { isApproved: approved, adminResponse: response },
    { new: true }
  );
  if (!review) throw new AppError("Review not found", 404);

  return review;
}

// --- coupons -----------------------------------------------------------------------------------

export function createCoupon(fields, createdBy) {
  return Coupon.create({ ...fields, createdBy });
}

export function listCoupons({ active } = {}) {
  const query = {};
  if (active !== undefined) query.isActive = active === "true";

  return Coupon.find(query).sort({ createdAt: -1 });
}

export async function updateCoupon(couponId, fields) {
  const coupon = await Coupon.findByIdAndUpdate(couponId, fields, {
    new: true,
    runValidators: true,
  });
  if (!coupon) throw new AppError("Coupon not found", 404);

  return coupon;
}

export async function deleteCoupon(couponId) {
  await Coupon.findByIdAndDelete(couponId);
}

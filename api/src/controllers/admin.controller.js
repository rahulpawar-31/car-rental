import User from "../model/user.model.js";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";
import Review from "../model/review.model.js";
import Coupon from "../model/coupon.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { escapeRegex } from "../utils/regex.utils.js";

export const getDashboardStats = async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalUsers,
    newUsersThisMonth,
    totalCars,
    availableCars,
    totalBookings,
    bookingsThisMonth,
    bookingsLastMonth,
    activeBookings,
    revenueThisMonth,
    revenueLastMonth,
    pendingReviews,
    recentBookings,
    bookingsByStatus,
    revenueByMonth,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", createdAt: { $gte: startOfMonth } }),
    Car.countDocuments({ isActive: true }),
    Car.countDocuments({ isActive: true, isAvailable: true }),
    Booking.countDocuments(),
    Booking.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Booking.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
    Booking.countDocuments({ status: "active" }),
    Payment.aggregate([
      { $match: { status: "succeeded", createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Review.countDocuments({ isApproved: false, isFlagged: false }),
    Booking.find()
      .populate("user", "name email")
      .populate("car", "name brand model")
      .populate("pickupLocation", "name city")
      .sort({ createdAt: -1 })
      .limit(5),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: "succeeded" } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 },
    ]),
  ]);

  const thisMonthRevenue = revenueThisMonth[0]?.total || 0;
  const lastMonthRevenue = revenueLastMonth[0]?.total || 0;
  const revenueGrowth =
    lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
  const bookingGrowth =
    bookingsLastMonth > 0 ? ((bookingsThisMonth - bookingsLastMonth) / bookingsLastMonth) * 100 : 0;

  res.json({
    success: true,
    data: {
      stats: {
        totalUsers,
        newUsersThisMonth,
        totalCars,
        availableCars,
        totalBookings,
        bookingsThisMonth,
        activeBookings,
        revenueThisMonth: thisMonthRevenue,
        revenueGrowth: revenueGrowth.toFixed(1),
        bookingGrowth: bookingGrowth.toFixed(1),
        pendingReviews,
      },
      recentBookings,
      bookingsByStatus,
      revenueByMonth,
    },
  });
};

export const getAllUsers = async (req, res) => {
  const { page = 1, limit = 20, search, role, active } = req.query;

  const query = {};
  if (role) query.role = role;
  if (active !== undefined) query.isActive = active === "true";
  if (search)
    query.$or = [
      { name: new RegExp(escapeRegex(search), "i") },
      { email: new RegExp(escapeRegex(search), "i") },
    ];

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    User.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const toggleUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  if (user.role === "admin") throw new AppError("Cannot deactivate admin", 400);

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: `User ${user.isActive ? "activated" : "deactivated"}`,
    data: { isActive: user.isActive },
  });
};

export const getAllBookings = async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;

  const query = {};
  if (status) query.status = status;

  let bookings, total;

  if (search) {
    const escaped = escapeRegex(search);
    const users = await User.find({
      $or: [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }],
    }).select("_id");
    query.$or = [
      { user: { $in: users.map((u) => u._id) } },
      { bookingNumber: new RegExp(escaped, "i") },
    ];
  }

  [bookings, total] = await Promise.all([
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

  res.json({
    success: true,
    data: {
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

// Which statuses a booking may move to from its current status. isAvailable is a separate,
// manually-controlled "delist this car" flag (see Admin car form) — it must not be
// auto-toggled by booking status, or one active rental would block unrelated future dates.
const ALLOWED_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled", "no-show"],
  confirmed: ["active", "cancelled", "no-show"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  "no-show": ["cancelled"],
};

export const updateBookingStatus = async (req, res) => {
  const { status, adminNotes } = req.body;

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new AppError("Booking not found", 404);

  if (status && status !== booking.status) {
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[booking.status] || [];
    if (!allowedNext.includes(status)) {
      throw new AppError(
        `Cannot change booking status from "${booking.status}" to "${status}"`,
        400
      );
    }

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

  res.json({ success: true, message: "Booking updated", data: { booking } });
};

export const getAllPayments = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

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

  res.json({
    success: true,
    data: {
      payments,
      totalRevenue: totalRevenue[0]?.total || 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const moderateReviews = async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

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

  res.json({
    success: true,
    data: {
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const approveReview = async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { isApproved: req.body.approved, adminResponse: req.body.response },
    { new: true }
  );
  if (!review) throw new AppError("Review not found", 404);

  res.json({
    success: true,
    message: `Review ${req.body.approved ? "approved" : "rejected"}`,
    data: { review },
  });
};

export const createCoupon = async (req, res) => {
  const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json({ success: true, message: "Coupon created", data: { coupon } });
};

export const getCoupons = async (req, res) => {
  const { active } = req.query;
  const query = {};
  if (active !== undefined) query.isActive = active === "true";

  const coupons = await Coupon.find(query).sort({ createdAt: -1 });
  res.json({ success: true, data: { coupons } });
};

export const updateCoupon = async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!coupon) throw new AppError("Coupon not found", 404);

  res.json({ success: true, message: "Coupon updated", data: { coupon } });
};

export const deleteCoupon = async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Coupon deleted" });
};

export const getFleetStats = async (req, res) => {
  const [carsByType, carsByLocation, carsByStatus, topRentedCars] = await Promise.all([
    Car.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    Car.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$location", count: { $sum: 1 } } },
      { $lookup: { from: "locations", localField: "_id", foreignField: "_id", as: "location" } },
      { $unwind: "$location" },
      { $project: { city: "$location.city", name: "$location.name", count: 1 } },
    ]),
    Car.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$isAvailable", count: { $sum: 1 } } },
    ]),
    Car.find({ isActive: true })
      .sort({ totalRentals: -1 })
      .limit(5)
      .select("name brand model totalRentals rating"),
  ]);

  res.json({ success: true, data: { carsByType, carsByLocation, carsByStatus, topRentedCars } });
};

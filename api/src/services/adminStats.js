import User from "../model/user.model.js";
import Car from "../model/car.model.js";
import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";
import { revenueByMonthPipeline, shapeRevenueByMonth } from "../utils/dashboard.utils.js";
import Review from "../model/review.model.js";
import { monthBoundaries } from "../utils/date.utils.js";

/** Percentage change from `previous` to `current`, or 0 when there is nothing to compare against. */
export function growthPercent(current, previous) {
  return previous > 0 ? ((current - previous) / previous) * 100 : 0;
}

/** The admin dashboard: headline counts, month-on-month growth, recent bookings and charts data. */
export async function getDashboardStats() {
  const now = new Date();
  const { startOfMonth, startOfLastMonth } = monthBoundaries(now);

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
    revenueBuckets,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "user", createdAt: { $gte: startOfMonth } }),
    Car.countDocuments({ isActive: true }),
    Car.countDocuments({ isActive: true, isAvailable: true }),
    Booking.countDocuments(),
    Booking.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Booking.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
    Booking.countDocuments({ status: "active" }),
    Payment.aggregate([
      { $match: { status: "succeeded", createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
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
    Payment.aggregate(revenueByMonthPipeline({ now })),
  ]);

  const revenueByMonth = shapeRevenueByMonth(revenueBuckets, { now });

  const thisMonthRevenue = revenueThisMonth[0]?.total || 0;
  const lastMonthRevenue = revenueLastMonth[0]?.total || 0;
  const revenueGrowth = growthPercent(thisMonthRevenue, lastMonthRevenue);
  const bookingGrowth = growthPercent(bookingsThisMonth, bookingsLastMonth);

  return {
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
  };
}

/** Fleet breakdowns: by type, by location, by availability, plus the five most-rented cars. */
export async function getFleetStats() {
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

  return { carsByType, carsByLocation, carsByStatus, topRentedCars };
}

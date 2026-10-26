import { Router } from "express";
import {
  getDashboardStats,
  getAllUsers,
  toggleUserStatus,
  getAllBookings,
  updateBookingStatus,
  getAllPayments,
  moderateReviews,
  approveReview,
  createCoupon,
  getCoupons,
  updateCoupon,
  deleteCoupon,
  getFleetStats,
} from "../controllers/admin.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { idParams } from "../validation/common.js";
import {
  listUsersQuery,
  listAdminBookingsQuery,
  listAdminPaymentsQuery,
  listAdminReviewsQuery,
  listCouponsQuery,
  updateBookingStatusBody,
  moderateReviewBody,
  createCouponBody,
  updateCouponBody,
} from "../validation/admin.validation.js";

const router = Router();

router.use(protect, authorize("admin"));

router.get("/dashboard", getDashboardStats);
router.get("/fleet-stats", getFleetStats);

router.get("/users", validate({ query: listUsersQuery }), getAllUsers);
router.patch("/users/:id/toggle-status", validate({ params: idParams }), toggleUserStatus);

router.get("/bookings", validate({ query: listAdminBookingsQuery }), getAllBookings);
router.patch("/bookings/:id/status", validate({ params: idParams, body: updateBookingStatusBody }), updateBookingStatus);

router.get("/payments", validate({ query: listAdminPaymentsQuery }), getAllPayments);

router.get("/reviews", validate({ query: listAdminReviewsQuery }), moderateReviews);
router.patch("/reviews/:id/moderate", validate({ params: idParams, body: moderateReviewBody }), approveReview);

router.get("/coupons", validate({ query: listCouponsQuery }), getCoupons);
router.post("/coupons", validate({ body: createCouponBody }), createCoupon);
router.patch("/coupons/:id", validate({ params: idParams, body: updateCouponBody }), updateCoupon);
router.delete("/coupons/:id", validate({ params: idParams }), deleteCoupon);

export default router;

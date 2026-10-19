import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  applyCoupon,
  rescheduleBooking,
  trackRental,
} from "../controllers/booking.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { idParams } from "../validation/common.js";
import {
  createBookingBody,
  applyCouponBody,
  cancelBookingBody,
  rescheduleBookingBody,
  listBookingsQuery,
} from "../validation/booking.validation.js";

const router = Router();

router.use(protect);

router.post("/apply-coupon", validate({ body: applyCouponBody }), applyCoupon);
router.post("/", validate({ body: createBookingBody }), createBooking);
router.get("/", validate({ query: listBookingsQuery }), getMyBookings);
router.get("/:id/track", validate({ params: idParams }), trackRental);
router.get("/:id", validate({ params: idParams }), getBookingById);
router.post("/:id/cancel", validate({ params: idParams, body: cancelBookingBody }), cancelBooking);
router.patch("/:id/reschedule", validate({ params: idParams, body: rescheduleBookingBody }), rescheduleBooking);

export default router;

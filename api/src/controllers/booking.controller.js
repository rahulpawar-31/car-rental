import * as bookingService from "../services/booking.js";

export const createBooking = async (req, res) => {
  const booking = await bookingService.createBooking({ user: req.user, input: req.body });

  res.status(201).json({ success: true, message: "Booking created", data: { booking } });
};

export const getMyBookings = async (req, res) => {
  const { bookings, pagination } = await bookingService.listUserBookings(req.user._id, req.query);

  res.json({ success: true, data: { bookings, pagination } });
};

export const getBookingById = async (req, res) => {
  const booking = await bookingService.getUserBooking(req.user._id, req.params.id);

  res.json({ success: true, data: { booking } });
};

export const cancelBooking = async (req, res) => {
  const { refundAmount } = await bookingService.cancelUserBooking(req.user._id, req.params.id, req.body.reason);

  res.json({
    success: true,
    message: "Booking cancelled",
    data: { refundAmount, message: refundAmount > 0 ? `Refund of ₹${refundAmount} will be processed in 5-7 days` : "No refund applicable" },
  });
};

export const rescheduleBooking = async (req, res) => {
  const booking = await bookingService.rescheduleUserBooking(req.user._id, req.params.id, req.body);

  res.json({ success: true, message: "Booking rescheduled successfully", data: { booking } });
};

export const trackRental = async (req, res) => {
  const tracking = await bookingService.trackUserRental(req.user._id, req.params.id);

  res.json({ success: true, data: { tracking } });
};

export const applyCoupon = async (req, res) => {
  const result = await bookingService.previewCoupon(req.user, req.body);

  res.json({ success: true, data: result });
};

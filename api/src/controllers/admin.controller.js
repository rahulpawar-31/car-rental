import * as adminService from "../services/admin.js";
import * as adminStats from "../services/adminStats.js";

export const getDashboardStats = async (req, res) => {
  const data = await adminStats.getDashboardStats();

  res.json({ success: true, data });
};

export const getAllUsers = async (req, res) => {
  const data = await adminService.listUsers(req.query);

  res.json({ success: true, data });
};

export const toggleUserStatus = async (req, res) => {
  const { isActive } = await adminService.toggleUserStatus(req.params.id);

  res.json({
    success: true,
    message: `User ${isActive ? "activated" : "deactivated"}`,
    data: { isActive },
  });
};

export const getAllBookings = async (req, res) => {
  const data = await adminService.listBookings(req.query);

  res.json({ success: true, data });
};

export const updateBookingStatus = async (req, res) => {
  const booking = await adminService.updateBookingStatus(req.params.id, req.body);

  res.json({ success: true, message: "Booking updated", data: { booking } });
};

export const getAllPayments = async (req, res) => {
  const data = await adminService.listPayments(req.query);

  res.json({ success: true, data });
};

export const moderateReviews = async (req, res) => {
  const data = await adminService.listReviews(req.query);

  res.json({ success: true, data });
};

export const approveReview = async (req, res) => {
  const review = await adminService.moderateReview(req.params.id, req.body);

  res.json({
    success: true,
    message: `Review ${req.body.approved ? "approved" : "rejected"}`,
    data: { review },
  });
};

export const createCoupon = async (req, res) => {
  const coupon = await adminService.createCoupon(req.body, req.user._id);

  res.status(201).json({ success: true, message: "Coupon created", data: { coupon } });
};

export const getCoupons = async (req, res) => {
  const coupons = await adminService.listCoupons(req.query);

  res.json({ success: true, data: { coupons } });
};

export const updateCoupon = async (req, res) => {
  const coupon = await adminService.updateCoupon(req.params.id, req.body);

  res.json({ success: true, message: "Coupon updated", data: { coupon } });
};

export const deleteCoupon = async (req, res) => {
  await adminService.deleteCoupon(req.params.id);

  res.json({ success: true, message: "Coupon deleted" });
};

export const getFleetStats = async (req, res) => {
  const data = await adminStats.getFleetStats();

  res.json({ success: true, data });
};

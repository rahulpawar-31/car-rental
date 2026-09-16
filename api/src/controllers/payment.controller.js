import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createOrder,
  refundPaymentGateway,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../services/razorpay.js";

export const createPaymentIntent = async (req, res) => {
  const { bookingId } = req.body;

  const booking = await Booking.findOne({ _id: bookingId, user: req.user._id }).populate(
    "car",
    "name brand"
  );
  if (!booking) throw new AppError("Booking not found", 404);
  if (booking.paymentStatus === "paid") throw new AppError("Booking already paid", 400);
  if (booking.status !== "pending")
    throw new AppError(`Booking is ${booking.status} and can no longer be paid for`, 400);

  const amountInPaise = Math.round(booking.totalAmount * 100);

  const order = await createOrder({
    amount: amountInPaise,
    currency: "INR",
    receipt: `rcpt_${bookingId}`,
    notes: {
      bookingId: bookingId.toString(),
      userId: req.user._id.toString(),
    },
  });

  await Payment.findOneAndUpdate(
    { booking: bookingId },
    {
      booking: bookingId,
      user: req.user._id,
      amount: booking.totalAmount,
      razorpayOrderId: order.id,
      status: "pending",
      method: "card",
    },
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    data: {
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID,
    },
  });
};

export const confirmPayment = async (req, res) => {
  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    throw new AppError("Payment verification failed: invalid signature", 400);
  }

  // Fix #2: bind lookup to the requesting user so user A cannot confirm user B's payment
  const existing = await Payment.findOne({ razorpayOrderId, user: req.user._id });
  if (!existing) throw new AppError("Payment record not found", 404);

  // Fix #12: idempotent retry — a client retry or a race with the webhook can call this
  // twice for the same order. Without this, the second call would find the booking no
  // longer "pending" and wrongly flip an already-succeeded payment to "failed".
  if (existing.status === "succeeded") {
    return res.json({
      success: true,
      message: "Payment verified and confirmed",
      data: { payment: existing },
    });
  }

  const payment = await Payment.findOneAndUpdate(
    { _id: existing._id, status: { $ne: "succeeded" } },
    { status: "succeeded", razorpayPaymentId, razorpaySignature },
    { new: true }
  );
  if (!payment) {
    // Lost the race to a concurrent confirm call that just succeeded — treat as success too.
    const latest = await Payment.findById(existing._id);
    return res.json({
      success: true,
      message: "Payment verified and confirmed",
      data: { payment: latest },
    });
  }

  // Fix #11: the booking may have been cancelled (or already confirmed by a prior race)
  // since this Razorpay order was created — don't let a stale checkout session revive it.
  const booking = await Booking.findOneAndUpdate(
    { _id: payment.booking, status: "pending" },
    { status: "confirmed", paymentStatus: "paid", razorpayOrderId },
    { new: true }
  );
  if (!booking) {
    payment.status = "failed";
    await payment.save();
    throw new AppError(
      "This booking is no longer payable — it may have been cancelled or already confirmed",
      409
    );
  }

  res.json({ success: true, message: "Payment verified and confirmed", data: { payment } });
};

export const getPaymentHistory = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const [payments, total] = await Promise.all([
    Payment.find({ user: req.user._id })
      .populate({
        path: "booking",
        select: "bookingNumber pickupDate dropDate status",
        populate: { path: "car", select: "name brand model" },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Payment.countDocuments({ user: req.user._id }),
  ]);

  res.json({
    success: true,
    data: {
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
};

export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];

  if (!verifyWebhookSignature(req.rawBody, signature)) {
    throw new AppError("Invalid webhook signature", 400);
  }

  const { event, payload } = req.body;

  if (event === "payment.captured") {
    const { order_id, id: paymentId } = payload.payment.entity;
    const payment = await Payment.findOne({ razorpayOrderId: order_id });
    if (payment && payment.status !== "succeeded") {
      payment.status = "succeeded";
      payment.razorpayPaymentId = paymentId;
      await payment.save();
      await Booking.findByIdAndUpdate(payment.booking, {
        status: "confirmed",
        paymentStatus: "paid",
        razorpayOrderId: order_id,
      });
    }
  }

  res.json({ received: true });
};

export const refundPayment = async (req, res) => {
  const { bookingId, reason } = req.body;

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError("Booking not found", 404);

  const payment = await Payment.findOne({ booking: bookingId, status: "succeeded" });
  if (!payment) throw new AppError("No successful payment found", 404);

  const refundAmount = booking.refundAmount || 0;
  if (refundAmount <= 0) throw new AppError("No refund applicable", 400);

  const refund = await refundPaymentGateway(payment.razorpayPaymentId, {
    amount: Math.round(refundAmount * 100),
    notes: { reason: reason || "Customer requested refund" },
  });

  payment.status = "refunded";
  payment.refundAmount = refundAmount;
  payment.refundedAt = new Date();
  payment.refundReason = reason;
  payment.razorpayRefundId = refund.id;
  await payment.save();

  await Booking.findByIdAndUpdate(bookingId, { paymentStatus: "refunded", refundedAt: new Date() });

  res.json({
    success: true,
    message: "Refund processed",
    data: { refundAmount, refundId: refund.id },
  });
};

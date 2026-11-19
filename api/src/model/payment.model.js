import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "inr" },
    status: {
      type: String,
      enum: ["pending", "processing", "succeeded", "failed", "cancelled", "refunded"],
      default: "pending",
    },
    method: { type: String, enum: ["card", "upi", "netbanking", "wallet", "cash"] },
    stripePaymentIntentId: { type: String, sparse: true },
    stripeChargeId: String,
    stripeRefundId: String,
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: String,
    razorpayRefundId: String,
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },
    refundAmount: { type: Number, default: 0 },
    refundedAt: Date,
    refundReason: String,
    // Set when money was captured that no booking can keep (e.g. the booking was cancelled
    // before the capture arrived). The payment stays "succeeded": the money really was taken.
    reconciliation: {
      status: { type: String, enum: ["refund_required", "resolved"] },
      reason: String,
      flaggedAt: Date,
    },
    description: String,
    receiptUrl: String,
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ booking: 1 });
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ "reconciliation.status": 1 }, { sparse: true });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;

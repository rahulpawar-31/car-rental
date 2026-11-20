import mongoose from "mongoose";

// A verified gateway capture that matched none of our payment records. The money was taken, so
// it is stored here for follow-up instead of being acknowledged and forgotten.
const unmatchedCaptureSchema = new mongoose.Schema(
  {
    razorpayPaymentId: { type: String, required: true, unique: true },
    razorpayOrderId: String,
    amount: Number, // in paise, as the gateway reports it
    currency: String,
    event: Object,
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const UnmatchedCapture = mongoose.model("UnmatchedCapture", unmatchedCaptureSchema);
export default UnmatchedCapture;

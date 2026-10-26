import mongoose from "mongoose";

export const BOOKING_STATUSES = ["pending", "confirmed", "active", "completed", "cancelled", "no-show"];

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
    pickupLocation: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
    dropLocation: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
    pickupDate: { type: Date, required: true },
    dropDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    totalHours: { type: Number },
    rentalType: { type: String, enum: ["day", "hour", "airport"], default: "day" },
    pricePerDay: { type: Number, required: true },
    baseAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    securityDeposit: { type: Number, default: 0 },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    status: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "partially-refunded", "failed"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "upi", "netbanking", "wallet", "cash"],
    },
    stripePaymentIntentId: String,
    razorpayOrderId: String,
    cancellationReason: String,
    cancelledAt: Date,
    cancelledBy: { type: String, enum: ["user", "admin"] },
    refundAmount: { type: Number, default: 0 },
    refundedAt: Date,
    actualPickupDate: Date,
    actualDropDate: Date,
    driverDetails: {
      name: String,
      phone: String,
      licenseNumber: String,
      licenseExpiry: Date,
    },
    additionalDrivers: [
      {
        name: String,
        phone: String,
        licenseNumber: String,
      },
    ],
    notes: String,
    adminNotes: String,
    isReviewed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

bookingSchema.pre("save", async function (next) {
  if (!this.bookingNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.bookingNumber = `DR${timestamp}${random}`;
  }
  next();
});

bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ car: 1, status: 1, pickupDate: 1, dropDate: 1 });

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;

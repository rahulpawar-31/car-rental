import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";
import { inTransaction } from "./transaction.js";
import { AppError } from "../middleware/errorHandler.js";

/** How a captured gateway payment ended up relative to its booking. */
export const SETTLEMENT = {
  /** The booking is confirmed and paid for this payment (now, or already). */
  CONFIRMED: "confirmed",
  /** Money was captured but the booking can't take it; the payment is flagged for refund. */
  REFUND_REQUIRED: "refund_required",
  /** The payment was already refunded; a replayed capture changes nothing. */
  REFUNDED: "refunded",
};

/**
 * Applies a captured payment to its booking. The client confirmation and the capture webhook both
 * come through here, so they follow one set of lifecycle rules, and either can be retried or
 * race the other safely:
 *
 * - Refunded payments are terminal; a replayed capture never revives them.
 * - Capture recording, booking confirmation and the refund decision commit together. A failed
 *   transaction can be retried by either delivery path without exposing a half-finished write.
 * - A refund-required decision is final: replay cannot reuse that money if the price changes back.
 * - Only a pending booking whose price is still the amount this order was created for is
 *   confirmed. If it was cancelled (or otherwise left the pending state) or repriced before the
 *   capture arrived, the booking is left alone, the payment stays `succeeded` because the money
 *   really was taken, and it is flagged `refund_required` for an admin refund.
 * - Payment records are never deleted, so a verified capture can always be traced to its order.
 */
export async function settleCapture(payment, { razorpayPaymentId, razorpaySignature }) {
  return inTransaction(() => settleInTransaction(payment, { razorpayPaymentId, razorpaySignature }));
}

async function settleInTransaction(payment, { razorpayPaymentId, razorpaySignature }) {
  // Always load AND write the current payment, even for succeeded captures. Concurrent capture
  // deliveries and refund decisions must serialize on this row rather than use a stale document.
  const latest = await Payment.findOneAndUpdate(
    { razorpayOrderId: payment.razorpayOrderId },
    {
      $inc: { settlementRevision: 1 },
      $setOnInsert: { booking: payment.booking, user: payment.user, amount: payment.amount, method: payment.method, status: "pending" },
    },
    { upsert: true, new: true }
  );
  payment = latest;
  // A missing legacy attempt was recreated above; only an actual refund is reported as refunded.
  if (payment.status === "refunded") return { outcome: SETTLEMENT.REFUNDED, payment };
  if (payment.reconciliation?.status) return { outcome: SETTLEMENT.REFUND_REQUIRED, payment };

  let current = payment;
  if (payment.status !== "succeeded") {
    const set = { status: "succeeded", razorpayPaymentId };
    if (razorpaySignature) set.razorpaySignature = razorpaySignature;
    current = (await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $nin: ["succeeded", "refunded"] } },
      set,
      { new: true }
    )) || (await Payment.findById(payment._id));
    if (!current) throw new AppError("The captured payment could not be recorded. Please retry.", 500);
    if (current.status === "refunded") return { outcome: SETTLEMENT.REFUNDED, payment: current };
    if (current.reconciliation?.status) return { outcome: SETTLEMENT.REFUND_REQUIRED, payment: current };
  }

  // One atomic write decides it: the booking must still be pending *and* still cost what this
  // order was created for. If it was repriced (e.g. rescheduled) after checkout started, the money
  // paid for a different amount and must not mark the new price as paid.
  const confirmed = await Booking.findOneAndUpdate(
    { _id: current.booking, status: "pending", totalAmount: current.amount },
    { status: "confirmed", paymentStatus: "paid", razorpayOrderId: current.razorpayOrderId },
    { new: true }
  );
  if (confirmed) return { outcome: SETTLEMENT.CONFIRMED, payment: current };

  // Not confirmable now. Either an earlier attempt (or the other delivery path) already
  // confirmed it for this order, or it can't take this payment.
  const booking = await Booking.findById(current.booking);
  if (booking && booking.paymentStatus === "paid" && booking.razorpayOrderId === current.razorpayOrderId) {
    return { outcome: SETTLEMENT.CONFIRMED, payment: current };
  }

  await flagForRefund(current, booking);
  return { outcome: SETTLEMENT.REFUND_REQUIRED, payment: current };
}

function refundReason(booking) {
  if (!booking) return "booking_missing";
  if (booking.status === "pending") return "booking_repriced";
  return `booking_${booking.status}`;
}

async function flagForRefund(payment, booking) {
  await Payment.updateOne(
    { _id: payment._id, "reconciliation.status": { $ne: "refund_required" } },
    {
      $set: {
        "reconciliation.status": "refund_required",
        "reconciliation.reason": refundReason(booking),
        "reconciliation.flaggedAt": new Date(),
      },
    }
  );
}

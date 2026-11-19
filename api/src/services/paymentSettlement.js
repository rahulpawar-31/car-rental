import Booking from "../model/booking.model.js";
import Payment from "../model/payment.model.js";

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
 * - Marking the payment succeeded records that the money arrived. It is not treated as proof the
 *   booking was updated: the booking is checked on every call, so a retry repairs a write that
 *   failed between the two.
 * - Only a pending booking is confirmed. If it was cancelled (or otherwise left the pending
 *   state) before the capture arrived, its dates stay released, the payment stays `succeeded`
 *   because the money really was taken, and it is flagged `refund_required` for an admin refund.
 */
export async function settleCapture(payment, { razorpayPaymentId, razorpaySignature }) {
  if (payment.status === "refunded") return { outcome: SETTLEMENT.REFUNDED, payment };

  let current = payment;
  if (payment.status !== "succeeded") {
    const set = { status: "succeeded", razorpayPaymentId };
    if (razorpaySignature) set.razorpaySignature = razorpaySignature;
    const recorded = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $nin: ["succeeded", "refunded"] } },
      set,
      { new: true }
    );
    // Lost a race to a concurrent confirm/webhook: carry on from whatever it recorded.
    current = recorded || (await Payment.findById(payment._id));
    if (!current || current.status === "refunded") return { outcome: SETTLEMENT.REFUNDED, payment: current };
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: current.booking, status: "pending" },
    { status: "confirmed", paymentStatus: "paid", razorpayOrderId: current.razorpayOrderId },
    { new: true }
  );
  if (confirmed) return { outcome: SETTLEMENT.CONFIRMED, payment: current };

  // Not pending any more. Either an earlier attempt (or the other delivery path) already
  // confirmed it for this order, or it left the pending state without this payment.
  const booking = await Booking.findById(current.booking);
  if (booking && booking.paymentStatus === "paid" && booking.razorpayOrderId === current.razorpayOrderId) {
    return { outcome: SETTLEMENT.CONFIRMED, payment: current };
  }

  await flagForRefund(current, booking);
  return { outcome: SETTLEMENT.REFUND_REQUIRED, payment: current };
}

async function flagForRefund(payment, booking) {
  const reason = booking ? `booking_${booking.status}` : "booking_missing";
  await Payment.updateOne(
    { _id: payment._id, "reconciliation.status": { $ne: "refund_required" } },
    { $set: { "reconciliation.status": "refund_required", "reconciliation.reason": reason, "reconciliation.flaggedAt": new Date() } }
  );

  // Give the existing admin refund endpoint something to refund: it refunds booking.refundAmount.
  if (booking && booking.paymentStatus !== "paid" && !(booking.refundAmount > 0)) {
    await Booking.updateOne({ _id: booking._id }, { $set: { refundAmount: payment.amount } });
  }
}

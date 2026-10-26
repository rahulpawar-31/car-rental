import Booking from "../model/booking.model.js";
import Car from "../model/car.model.js";
import Coupon from "../model/coupon.model.js";
import Payment from "../model/payment.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendBookingConfirmationEmail } from "../utils/email.utils.js";
import { parseValidDate } from "../utils/date.utils.js";
import { logger } from "../utils/logger.js";
import { computeBookingQuote } from "./booking.quote.js";
import { bookingConflictQuery } from "./carAvailability.js";

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Parses a pickup/drop pair and applies the date rules shared by create and reschedule.
 * Throws a 400 AppError for an unparseable, reversed or past range.
 */
export function parseRentalWindow(pickupDate, dropDate) {
  const pickup = parseValidDate(pickupDate);
  const drop = parseValidDate(dropDate);
  if (!pickup || !drop) throw new AppError("Invalid date format", 400);

  if (pickup >= drop) throw new AppError("Drop date must be after pickup date", 400);
  if (pickup < new Date()) throw new AppError("Pickup date cannot be in the past", 400);

  return { pickup, drop };
}

/**
 * Request-shape rules for a rental's duration by type. This is about what the client sent
 * (not the pricing math, which lives in computeBookingQuote).
 */
export function assertRentalSpan({ rentalType, pickup, drop, totalHours, rescheduling = false }) {
  const durationHours = (drop - pickup) / MS_PER_HOUR;

  if (rentalType === "hour") {
    if (!(totalHours > 0)) throw new AppError("totalHours is required for hourly rentals", 400);
    // totalHours must match the actual pickup/drop span, since that's what blocks the car
    if (Math.abs(durationHours - totalHours) > 1) {
      // A reschedule sends no totalHours: the booking keeps its own, so it can only move.
      throw new AppError(
        rescheduling
          ? `An hourly booking can only be moved to a window of the same length (${totalHours} hours)`
          : "totalHours must match the selected pickup/drop time range",
        400
      );
    }
  } else if (rentalType === "airport") {
    if (durationHours > 24) {
      throw new AppError("Airport transfer bookings can span at most 24 hours — use a daily rental for longer trips", 400);
    }
  }
}

/**
 * Refund owed on a user cancellation: everything but the security deposit when cancelling
 * 48h+ before pickup, half of that from 24h, nothing inside 24h.
 */
export function calculateRefund(booking, now = new Date()) {
  const hoursToPickup = (new Date(booking.pickupDate) - now) / MS_PER_HOUR;
  const refundable = booking.totalAmount - booking.securityDeposit;

  if (hoursToPickup >= 48) return refundable;
  if (hoursToPickup >= 24) return refundable * 0.5;
  return 0;
}

/** Derives the customer-facing tracking state (and its timing info) from a booking. */
export function deriveTracking(booking, now = new Date()) {
  const pickupDate = new Date(booking.pickupDate);
  const dropDate = new Date(booking.dropDate);
  const timeInfo = {};
  let trackingStatus;

  if (booking.status === "cancelled") {
    trackingStatus = "cancelled";
  } else if (booking.status === "completed") {
    trackingStatus = "completed";
    timeInfo.completedAt = booking.actualDropDate;
  } else if (booking.status === "active" || (now >= pickupDate && now <= dropDate)) {
    trackingStatus = "active";
    const msRemaining = Math.max(0, dropDate - now);
    timeInfo.hoursRemaining = Math.round((msRemaining / MS_PER_HOUR) * 10) / 10;
    timeInfo.dropDate = dropDate;
  } else if (now < pickupDate) {
    trackingStatus = "upcoming";
    const msUntilPickup = pickupDate - now;
    timeInfo.hoursUntilPickup = Math.round((msUntilPickup / MS_PER_HOUR) * 10) / 10;
    timeInfo.pickupDate = pickupDate;
  } else {
    trackingStatus = booking.status;
  }

  return { trackingStatus, timeInfo };
}

/** Gives back a coupon use claimed for a booking that did not get created. */
function releaseCouponClaim(couponId, userId) {
  return Coupon.updateOne({ _id: couponId }, { $inc: { usageCount: -1 }, $pull: { usedBy: userId } });
}

/**
 * Creates a booking: availability check, coupon claim, pricing, persistence, then a race
 * recheck that rolls back (booking and coupon claim) if a concurrent request won the dates.
 * Once the coupon is claimed, any failure before the booking exists gives the claim back.
 *
 * @param {{ user: any, input: any }} args - `user` is the authenticated user document.
 * @param {{ sendEmail?: typeof sendBookingConfirmationEmail }} [deps]
 */
export async function createBooking({ user, input }, { sendEmail = sendBookingConfirmationEmail } = {}) {
  const { carId, pickupLocationId, dropLocationId, pickupDate, dropDate, couponCode, driverDetails, notes, rentalType, totalHours } = input;

  const { pickup, drop } = parseRentalWindow(pickupDate, dropDate);

  const conflict = await Booking.findOne(bookingConflictQuery({ carId, pickup, drop }));
  if (conflict) throw new AppError("Car is not available for the selected dates", 409);

  const car = await Car.findById(carId);
  if (!car || !car.isActive || !car.isAvailable) throw new AppError("Car not available", 404);

  // Fix #7: price by rental type. Request-shape validation stays here (not in
  // computeBookingQuote) — it's about what the client sent, not the pricing math.
  assertRentalSpan({ rentalType, pickup, drop, totalHours });

  // baseAmount only, to gate the coupon's minBookingAmount before it's claimed.
  const { baseAmount: baseAmountForCouponGate } = computeBookingQuote({
    car, rentalType, pickupDate, dropDate, totalHours, coupon: null,
  });

  let appliedCoupon = null;
  let coupon = null;

  if (couponCode) {
    coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    if (!coupon) throw new AppError("Invalid or expired coupon code", 400);
    if (baseAmountForCouponGate < coupon.minBookingAmount) {
      throw new AppError(`Minimum booking amount ₹${coupon.minBookingAmount} required`, 400);
    }

    // Fix #4: atomic coupon claim — check + increment in one query to prevent race
    const claimed = await Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        ...(coupon.usageLimit ? { usageCount: { $lt: coupon.usageLimit } } : {}),
        $expr: {
          $lt: [
            { $size: { $filter: { input: "$usedBy", as: "u", cond: { $eq: ["$$u", user._id] } } } },
            coupon.perUserLimit,
          ],
        },
      },
      { $inc: { usageCount: 1 }, $push: { usedBy: user._id } }
    );
    if (!claimed) throw new AppError("Coupon already used or limit reached", 400);

    appliedCoupon = coupon._id;
  }

  // The coupon is already claimed, so a failure from here until the booking exists (pricing,
  // a Mongoose validation or cast error, a DB error) must give the claim back.
  let booking;
  let totalAmount;
  try {
    const quote = computeBookingQuote({
      car, rentalType, pickupDate, dropDate, totalHours, coupon,
    });
    totalAmount = quote.totalAmount;

    booking = await Booking.create({
      user: user._id,
      car: carId,
      ...(pickupLocationId && { pickupLocation: pickupLocationId }),
      ...(dropLocationId && { dropLocation: dropLocationId }),
      pickupDate: pickup,
      dropDate: drop,
      totalDays: quote.totalDays,
      ...(rentalType === "hour" && { totalHours }),
      rentalType: rentalType || "day",
      pricePerDay: car.pricePerDay,
      baseAmount: quote.baseAmount,
      discountAmount: quote.discountAmount,
      taxAmount: quote.taxAmount,
      totalAmount,
      securityDeposit: car.securityDeposit,
      coupon: appliedCoupon,
      driverDetails,
      notes,
      status: "pending",
    });

    // Fix #10: the availability check above and this create() aren't atomic, so two concurrent
    // requests for the same car/dates can both pass it. Re-verify now that both rows exist;
    // whichever booking has the smaller _id (created first) wins.
    const earlierConflict = await Booking.findOne(
      bookingConflictQuery({ carId, pickup, drop, tieBreakBeforeId: booking._id })
    );
    if (earlierConflict) {
      await Booking.deleteOne({ _id: booking._id });
      booking = null; // gone, so the catch below gives the coupon claim back
      throw new AppError("Car is not available for the selected dates", 409);
    }
  } catch (err) {
    if (appliedCoupon && !booking) {
      await releaseCouponClaim(appliedCoupon, user._id).catch((releaseErr) =>
        logger.error(`Could not release coupon ${appliedCoupon} claimed by user ${user._id}: ${releaseErr.message}`)
      );
    }
    throw err;
  }

  const populatedBooking = await Booking.findById(booking._id)
    .populate("car", "name brand model images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");

  await sendEmail(user.email, user.name, {
    bookingNumber: booking.bookingNumber,
    carName: `${car.brand} ${car.model}`,
    pickupDate,
    dropDate,
    totalAmount,
  }).catch(() => {});

  return populatedBooking;
}

/** The user's bookings, newest first, with pagination metadata. */
export async function listUserBookings(userId, { page = 1, limit = 10, status } = {}) {
  const query = { user: userId };
  if (status) query.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("car", "name brand model images color")
      .populate("pickupLocation", "name city")
      .populate("dropLocation", "name city")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit)),
    Booking.countDocuments(query),
  ]);

  return {
    bookings,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
  };
}

export async function getUserBooking(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, user: userId })
    .populate("car")
    .populate("pickupLocation")
    .populate("dropLocation")
    .populate("coupon", "code type value");

  if (!booking) throw new AppError("Booking not found", 404);
  return booking;
}

/** Cancels the user's pending/confirmed booking and records the refund owed. */
export async function cancelUserBooking(userId, bookingId, reason) {
  const booking = await Booking.findOne({ _id: bookingId, user: userId });
  if (!booking) throw new AppError("Booking not found", 404);

  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new AppError("Booking cannot be cancelled at this stage", 400);
  }

  const refundAmount = calculateRefund(booking);

  booking.status = "cancelled";
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();
  booking.cancelledBy = "user";
  booking.refundAmount = refundAmount;
  await booking.save();

  return { refundAmount };
}

/**
 * Moves the user's booking to new dates, repricing it. Rolls the booking back if a concurrent
 * booking lands on the new dates between the check and the save.
 */
export async function rescheduleUserBooking(userId, bookingId, { pickupDate, dropDate }) {
  const { pickup, drop } = parseRentalWindow(pickupDate, dropDate);

  const booking = await Booking.findOne({ _id: bookingId, user: userId });
  if (!booking) throw new AppError("Booking not found", 404);

  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new AppError("Only pending or confirmed bookings can be rescheduled", 400);
  }

  // The same span rules as creation, applied to the booking's own rentalType and hours: an
  // hourly booking keeps its length (it is priced from totalHours) and an airport transfer
  // stays within 24h.
  assertRentalSpan({ rentalType: booking.rentalType, pickup, drop, totalHours: booking.totalHours, rescheduling: true });

  const conflict = await Booking.findOne(
    bookingConflictQuery({ carId: booking.car, pickup, drop, excludeBookingId: booking._id })
  );
  if (conflict) throw new AppError("Car is not available for the selected dates", 409);

  const car = await Car.findById(booking.car);
  if (!car) throw new AppError("Car not found", 404);

  // Fix #7 (reschedule side): price by the booking's own rentalType, not
  // unconditionally as a daily rental — a rescheduled hourly or airport
  // booking was silently repriced as a full daily rental before.
  //
  // Fix #9: preserve the original coupon discount rather than re-deriving it
  // (a percentage coupon doesn't get rescaled against the new baseAmount).
  // Expressed as a synthetic "fixed" coupon so it goes through the exact
  // same baseAmount cap computeBookingQuote already applies everywhere else
  // — the original bug this reschedule path had: a frozen discount bigger
  // than a new, smaller baseAmount drove taxableAmount negative.
  const { totalDays, baseAmount, discountAmount, taxAmount, totalAmount } = computeBookingQuote({
    car,
    rentalType: booking.rentalType,
    pickupDate,
    dropDate,
    totalHours: booking.totalHours,
    coupon: booking.discountAmount ? { type: "fixed", value: booking.discountAmount } : null,
  });

  // Fix #10: snapshot originals in case the post-save conflict check below forces a rollback
  const original = {
    pickupDate: booking.pickupDate,
    dropDate: booking.dropDate,
    totalDays: booking.totalDays,
    baseAmount: booking.baseAmount,
    discountAmount: booking.discountAmount,
    taxAmount: booking.taxAmount,
    totalAmount: booking.totalAmount,
    paymentStatus: booking.paymentStatus,
  };

  booking.pickupDate = pickup;
  booking.dropDate = drop;
  booking.totalDays = totalDays;
  booking.baseAmount = baseAmount;
  // discountAmount can shrink here (Fix #9's cap) even though it started
  // from booking.discountAmount — save the capped value, not the original,
  // so it stays consistent with the taxAmount/totalAmount derived from it.
  booking.discountAmount = discountAmount;
  booking.taxAmount = taxAmount;
  booking.totalAmount = totalAmount;
  if (booking.paymentStatus !== "paid") booking.paymentStatus = "pending";
  await booking.save();

  // Puts the booking back on its original dates and amounts with one atomic write that does not
  // depend on this document's in-memory state. Retried once; if both attempts fail the booking
  // is stuck on the new dates, which is logged for follow-up and reported as a 500 rather than
  // the 409 that would tell the user nothing changed.
  const restoreOriginal = async () => {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await Booking.updateOne({ _id: booking._id }, { $set: original });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    logger.error(`Could not restore booking ${booking._id} after a failed reschedule: ${lastErr.message}`);
    throw new AppError("The reschedule conflicted and the booking could not be restored automatically. Please contact support.", 500);
  };

  // Re-verify: the conflict check above and this save() aren't atomic, so a concurrent
  // booking/reschedule for the same car could have landed on these dates in between. If the
  // check itself fails we can't tell, so fail closed and restore the original dates.
  let overlapping;
  try {
    overlapping = await Booking.findOne(
      bookingConflictQuery({ carId: booking.car, pickup, drop, excludeBookingId: booking._id })
    );
  } catch (err) {
    await restoreOriginal();
    throw err;
  }
  if (overlapping) {
    await restoreOriginal();
    throw new AppError("Car is not available for the selected dates", 409);
  }

  // Fix #3: now that the reschedule is confirmed, void any stale pending Razorpay order
  // so the user can't pay the old (lower) amount. Done after the rollback check above so a
  // failed reschedule doesn't orphan a still-valid pending payment for the original dates.
  if (original.paymentStatus !== "paid") {
    await Payment.deleteOne({ booking: booking._id, status: "pending" });
  }

  return Booking.findById(booking._id)
    .populate("car", "name brand model images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");
}

/** The tracking view for one of the user's bookings. */
export async function trackUserRental(userId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, user: userId })
    .populate("car", "brand model color licensePlate images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");

  if (!booking) throw new AppError("Booking not found", 404);

  const { trackingStatus, timeInfo } = deriveTracking(booking);

  return {
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    trackingStatus,
    timeInfo,
    car: booking.car,
    pickupLocation: booking.pickupLocation,
    dropLocation: booking.dropLocation,
    pickupDate: booking.pickupDate,
    dropDate: booking.dropDate,
    totalDays: booking.totalDays,
    driverDetails: booking.driverDetails,
    paymentStatus: booking.paymentStatus,
  };
}

/** Previews a coupon's discount for a prospective booking, without claiming it. */
export async function previewCoupon(user, { code, carId, pickupDate, dropDate, rentalType, totalHours }) {
  // rentalType/totalHours are optional so existing callers that don't send
  // them yet keep previewing as a daily rental, same as before this fix —
  // but accepting them here is what lets the preview match createBooking's
  // actual price for hourly/airport bookings at all. (The frontend still
  // needs a follow-up change to actually send them; that's out of scope for
  // this backend module — see the "Extract a rental-pricing module" audit
  // candidate for the client-side duplication.)
  const car = await Car.findById(carId);
  if (!car) throw new AppError("Car not found", 404);

  // baseAmount only, to gate minBookingAmount/usage before we know it's valid to apply.
  const { baseAmount } = computeBookingQuote({
    car, rentalType: rentalType || "day", pickupDate, dropDate, totalHours, coupon: null,
  });

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });

  if (!coupon) throw new AppError("Invalid or expired coupon", 400);
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) throw new AppError("Coupon limit reached", 400);
  if (baseAmount < coupon.minBookingAmount) throw new AppError(`Min amount ₹${coupon.minBookingAmount} required`, 400);

  const userUsage = coupon.usedBy.filter((id) => id.toString() === user._id.toString()).length;
  if (userUsage >= coupon.perUserLimit) throw new AppError("Coupon already used", 400);

  // Same computeBookingQuote call createBooking will make — this is the fix:
  // the preview used to always price as a daily rental (ignoring rentalType
  // entirely) and never capped a flat coupon at baseAmount, so it could show
  // a different, sometimes impossible (negative-total) discount than what
  // createBooking would actually charge.
  const { discountAmount } = computeBookingQuote({
    car, rentalType: rentalType || "day", pickupDate, dropDate, totalHours, coupon,
  });

  return { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discountAmount };
}

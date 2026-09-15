import Booking from "../model/booking.model.js";
import Car from "../model/car.model.js";
import Coupon from "../model/coupon.model.js";
import Payment from "../model/payment.model.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendBookingConfirmationEmail } from "../utils/email.utils.js";
import { computeBookingQuote } from "../services/booking.quote.js";
import { bookingConflictQuery } from "../services/carAvailability.js";

export const createBooking = async (req, res) => {
  const { carId, pickupLocationId, dropLocationId, pickupDate, dropDate, couponCode, driverDetails, notes, rentalType, totalHours } = req.body;

  const pickup = new Date(pickupDate);
  const drop = new Date(dropDate);

  if (pickup >= drop) throw new AppError("Drop date must be after pickup date", 400);
  if (pickup < new Date()) throw new AppError("Pickup date cannot be in the past", 400);

  const conflict = await Booking.findOne(bookingConflictQuery({ carId, pickup, drop }));
  if (conflict) throw new AppError("Car is not available for the selected dates", 409);

  const car = await Car.findById(carId);
  if (!car || !car.isActive || !car.isAvailable) throw new AppError("Car not available", 404);

  // Fix #7: price by rental type. Request-shape validation stays here (not in
  // computeBookingQuote) — it's about what the client sent, not the pricing math.
  const msPerHour = 60 * 60 * 1000;
  const durationHours = (drop - pickup) / msPerHour;
  if (rentalType === "hour") {
    if (!(totalHours > 0)) throw new AppError("totalHours is required for hourly rentals", 400);
    // totalHours must match the actual pickup/drop span, since that's what blocks the car
    if (Math.abs(durationHours - totalHours) > 1) {
      throw new AppError("totalHours must match the selected pickup/drop time range", 400);
    }
  } else if (rentalType === "airport") {
    if (durationHours > 24) {
      throw new AppError("Airport transfer bookings can span at most 24 hours — use a daily rental for longer trips", 400);
    }
  }

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
            { $size: { $filter: { input: "$usedBy", as: "u", cond: { $eq: ["$$u", req.user._id] } } } },
            coupon.perUserLimit,
          ],
        },
      },
      { $inc: { usageCount: 1 }, $push: { usedBy: req.user._id } }
    );
    if (!claimed) throw new AppError("Coupon already used or limit reached", 400);

    appliedCoupon = coupon._id;
  }

  const { totalDays, baseAmount, discountAmount, taxAmount, totalAmount } = computeBookingQuote({
    car, rentalType, pickupDate, dropDate, totalHours, coupon,
  });

  const booking = await Booking.create({
    user: req.user._id,
    car: carId,
    ...(pickupLocationId && { pickupLocation: pickupLocationId }),
    ...(dropLocationId && { dropLocation: dropLocationId }),
    pickupDate: pickup,
    dropDate: drop,
    totalDays,
    ...(rentalType === "hour" && { totalHours }),
    rentalType: rentalType || "day",
    pricePerDay: car.pricePerDay,
    baseAmount,
    discountAmount,
    taxAmount,
    totalAmount,
    securityDeposit: car.securityDeposit,
    coupon: appliedCoupon,
    driverDetails,
    notes,
    status: "pending",
  });

  // Fix #10: the availability check above (line 19-24) and this create() aren't atomic,
  // so two concurrent requests for the same car/dates can both pass it. Re-verify now that
  // both rows exist; whichever booking has the smaller _id (created first) wins.
  const earlierConflict = await Booking.findOne(
    bookingConflictQuery({ carId, pickup, drop, tieBreakBeforeId: booking._id })
  );
  if (earlierConflict) {
    await Booking.deleteOne({ _id: booking._id });
    if (appliedCoupon) {
      await Coupon.updateOne({ _id: appliedCoupon }, { $inc: { usageCount: -1 }, $pull: { usedBy: req.user._id } });
    }
    throw new AppError("Car is not available for the selected dates", 409);
  }

  const populatedBooking = await Booking.findById(booking._id)
    .populate("car", "name brand model images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");

  await sendBookingConfirmationEmail(req.user.email, req.user.name, {
    bookingNumber: booking.bookingNumber,
    carName: `${car.brand} ${car.model}`,
    pickupDate,
    dropDate,
    totalAmount,
  }).catch(() => {});

  res.status(201).json({ success: true, message: "Booking created", data: { booking: populatedBooking } });
};

const VALID_STATUSES = ["pending", "confirmed", "active", "completed", "cancelled", "no-show"];

export const getMyBookings = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  const query = { user: req.user._id };
  if (status && VALID_STATUSES.includes(status)) query.status = status;

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

  res.json({
    success: true,
    data: {
      bookings,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    },
  });
};

export const getBookingById = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id })
    .populate("car")
    .populate("pickupLocation")
    .populate("dropLocation")
    .populate("coupon", "code type value");

  if (!booking) throw new AppError("Booking not found", 404);
  res.json({ success: true, data: { booking } });
};

export const cancelBooking = async (req, res) => {
  const { reason } = req.body;

  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new AppError("Booking not found", 404);

  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new AppError("Booking cannot be cancelled at this stage", 400);
  }

  const hoursToPickup = (new Date(booking.pickupDate) - new Date()) / (1000 * 60 * 60);
  let refundAmount = 0;

  if (hoursToPickup >= 48) refundAmount = booking.totalAmount - booking.securityDeposit;
  else if (hoursToPickup >= 24) refundAmount = (booking.totalAmount - booking.securityDeposit) * 0.5;

  booking.status = "cancelled";
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date();
  booking.cancelledBy = "user";
  booking.refundAmount = refundAmount;
  await booking.save();

  res.json({
    success: true,
    message: "Booking cancelled",
    data: { refundAmount, message: refundAmount > 0 ? `Refund of ₹${refundAmount} will be processed in 5-7 days` : "No refund applicable" },
  });
};

export const rescheduleBooking = async (req, res) => {
  const { pickupDate, dropDate } = req.body;

  if (!pickupDate || !dropDate) {
    throw new AppError("pickupDate and dropDate are required", 400);
  }

  const pickup = new Date(pickupDate);
  const drop = new Date(dropDate);

  if (pickup >= drop) throw new AppError("Drop date must be after pickup date", 400);
  if (pickup < new Date()) throw new AppError("Pickup date cannot be in the past", 400);

  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
  if (!booking) throw new AppError("Booking not found", 404);

  if (!["pending", "confirmed"].includes(booking.status)) {
    throw new AppError("Only pending or confirmed bookings can be rescheduled", 400);
  }

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

  // Re-verify: the conflict check above and this save() aren't atomic, so a concurrent
  // booking/reschedule for the same car could have landed on these dates in between.
  const overlapping = await Booking.findOne(
    bookingConflictQuery({ carId: booking.car, pickup, drop, excludeBookingId: booking._id })
  );
  if (overlapping) {
    Object.assign(booking, original);
    await booking.save();
    throw new AppError("Car is not available for the selected dates", 409);
  }

  // Fix #3: now that the reschedule is confirmed, void any stale pending Razorpay order
  // so the user can't pay the old (lower) amount. Done after the rollback check above so a
  // failed reschedule doesn't orphan a still-valid pending payment for the original dates.
  if (original.paymentStatus !== "paid") {
    await Payment.deleteOne({ booking: booking._id, status: "pending" });
  }

  const updatedBooking = await Booking.findById(booking._id)
    .populate("car", "name brand model images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");

  res.json({ success: true, message: "Booking rescheduled successfully", data: { booking: updatedBooking } });
};

export const trackRental = async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id })
    .populate("car", "brand model color licensePlate images")
    .populate("pickupLocation", "name city address")
    .populate("dropLocation", "name city address");

  if (!booking) throw new AppError("Booking not found", 404);

  const now = new Date();
  const pickupDate = new Date(booking.pickupDate);
  const dropDate = new Date(booking.dropDate);

  let trackingStatus;
  let timeInfo = {};

  if (booking.status === "cancelled") {
    trackingStatus = "cancelled";
  } else if (booking.status === "completed") {
    trackingStatus = "completed";
    timeInfo.completedAt = booking.actualDropDate;
  } else if (booking.status === "active" || (now >= pickupDate && now <= dropDate)) {
    trackingStatus = "active";
    const msRemaining = Math.max(0, dropDate - now);
    timeInfo.hoursRemaining = Math.round((msRemaining / (1000 * 60 * 60)) * 10) / 10;
    timeInfo.dropDate = dropDate;
  } else if (now < pickupDate) {
    trackingStatus = "upcoming";
    const msUntilPickup = pickupDate - now;
    timeInfo.hoursUntilPickup = Math.round((msUntilPickup / (1000 * 60 * 60)) * 10) / 10;
    timeInfo.pickupDate = pickupDate;
  } else {
    trackingStatus = booking.status;
  }

  res.json({
    success: true,
    data: {
      tracking: {
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
      },
    },
  });
};

export const applyCoupon = async (req, res) => {
  // rentalType/totalHours are optional so existing callers that don't send
  // them yet keep previewing as a daily rental, same as before this fix —
  // but accepting them here is what lets the preview match createBooking's
  // actual price for hourly/airport bookings at all. (The frontend still
  // needs a follow-up change to actually send them; that's out of scope for
  // this backend module — see the "Extract a rental-pricing module" audit
  // candidate for the client-side duplication.)
  const { code, carId, pickupDate, dropDate, rentalType, totalHours } = req.body;

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

  const userUsage = coupon.usedBy.filter((id) => id.toString() === req.user._id.toString()).length;
  if (userUsage >= coupon.perUserLimit) throw new AppError("Coupon already used", 400);

  // Same computeBookingQuote call createBooking will make — this is the fix:
  // the preview used to always price as a daily rental (ignoring rentalType
  // entirely) and never capped a flat coupon at baseAmount, so it could show
  // a different, sometimes impossible (negative-total) discount than what
  // createBooking would actually charge.
  const { discountAmount } = computeBookingQuote({
    car, rentalType: rentalType || "day", pickupDate, dropDate, totalHours, coupon,
  });

  res.json({
    success: true,
    data: { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discountAmount },
  });
};

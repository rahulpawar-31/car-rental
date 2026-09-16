/**
 * The statuses that hold a car's dates against new bookings. Shared by
 * car.controller.js (search exclusion, booked-dates calendar, availability
 * check) and booking.controller.js (create/reschedule conflict checks) —
 * previously each defined its own copy of this list.
 */
export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "active"];

/**
 * Builds the Mongoose filter for "is there an active booking overlapping
 * this date range" — the predicate 5+ call sites across car.controller.js
 * and booking.controller.js had each retyped. Returns a plain filter
 * object; callers still run `Booking.findOne(...)` / `.find(...)`
 * themselves and handle a conflict however that call site needs to
 * (throw, roll back a save, delete a just-created row) — this only
 * removes the duplicated predicate, not each site's own conflict handling.
 *
 * @param {object} options
 * @param {string} [options.carId] - scope to one car; omit for a fleet-wide
 *   check (e.g. excluding every booked car from a search).
 * @param {Date} options.pickup
 * @param {Date} options.drop
 * @param {string} [options.excludeBookingId] - exclude this booking from the
 *   conflict check (e.g. rescheduleBooking checking against everything
 *   except the booking being rescheduled).
 * @param {string} [options.tieBreakBeforeId] - only consider bookings created
 *   before this id (e.g. createBooking's post-create race recheck, where
 *   whichever concurrent request's row has the smaller _id wins).
 */
export function bookingConflictQuery({ carId, pickup, drop, excludeBookingId, tieBreakBeforeId }) {
  return {
    ...(carId && { car: carId }),
    status: { $in: ACTIVE_BOOKING_STATUSES },
    pickupDate: { $lte: drop },
    dropDate: { $gte: pickup },
    ...(excludeBookingId && { _id: { $ne: excludeBookingId } }),
    ...(tieBreakBeforeId && { _id: { $lt: tieBreakBeforeId } }),
  };
}

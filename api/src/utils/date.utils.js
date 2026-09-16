/**
 * Parses a date-like value (string, number, or Date) into a real Date, or
 * returns null when it doesn't parse to a valid instant — so callers can
 * throw their own 400 with whatever message fits the field, instead of
 * re-deriving `new Date(x)` + `isNaN(x.getTime())` themselves.
 *
 * car.controller.js already repeated this exact check at 3 call sites
 * (search date-range filter, availability check, document expiry date).
 * booking.controller.js's pickup/drop parses (createBooking,
 * rescheduleBooking) skipped it entirely: an unparseable pickupDate/dropDate
 * produced an Invalid Date, and since every comparison against NaN is
 * false, both the "drop after pickup" and "pickup not in the past" checks
 * silently passed it through. The request would still fail eventually —
 * computeBookingQuote's math went NaN and Mongoose's own Date cast rejects
 * an Invalid Date inside Booking.create() — but as a generic "Cast to date
 * failed" CastError instead of a clean, explicit 400. Routing both
 * controllers through this one check closes that gap.
 *
 * Treats null/undefined/"" as "not provided" (returns null) rather than
 * letting `new Date(null)` silently resolve to the Unix epoch, which is
 * almost never what a missing date field means.
 *
 * @param {string|number|Date} value
 * @returns {Date|null}
 */
export function parseValidDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

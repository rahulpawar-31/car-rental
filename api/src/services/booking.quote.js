const TAX_RATE = 0.18;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure pricing calculation for a car-rental booking — no database access.
 * The single source of truth for baseAmount/discount/tax/total, used
 * identically by createBooking, rescheduleBooking, and the applyCoupon
 * preview. Those three had each grown their own copy of this math and
 * drifted: the preview didn't know about rentalType at all (always priced
 * as a daily rental), and a flat coupon's discount wasn't capped at
 * baseAmount outside of createBooking.
 *
 * Known gap (pre-existing, not introduced here): does not check
 * coupon.applicableCars / applicableCarTypes — those restriction fields
 * exist on the Coupon schema but aren't enforced anywhere yet.
 *
 * @param {object} car - already-fetched Car document (pricePerDay,
 *   pricePerHour, securityDeposit)
 * @param {"day"|"hour"|"airport"} rentalType
 * @param {string|Date} pickupDate
 * @param {string|Date} dropDate
 * @param {number} [totalHours] - required when rentalType is "hour"
 * @param {object|null} coupon - already-resolved, already-validated Coupon
 *   document, or null. This function never looks up or claims a coupon.
 *   Only `.type` / `.value` / `.maxDiscountAmount` are read, so a plain
 *   `{ type, value, maxDiscountAmount? }` object works too — used by
 *   rescheduleBooking to re-cap a booking's already-frozen discount amount
 *   without needing the original Coupon document.
 */
export function computeBookingQuote({ car, rentalType, pickupDate, dropDate, totalHours, coupon }) {
  const pickup = new Date(pickupDate);
  const drop = new Date(dropDate);

  let totalDays;
  let baseAmount;

  if (rentalType === "hour") {
    const pricePerHour = car.pricePerHour ?? Math.round(car.pricePerDay / 8);
    baseAmount = pricePerHour * totalHours;
    totalDays = 0;
  } else if (rentalType === "airport") {
    baseAmount = Math.round(car.pricePerDay * 0.4);
    totalDays = 1;
  } else {
    totalDays = Math.max(1, Math.ceil((drop - pickup) / MS_PER_DAY));
    baseAmount = totalDays * car.pricePerDay;
  }

  let discountAmount = 0;
  if (coupon) {
    discountAmount =
      coupon.type === "percentage"
        ? Math.min(baseAmount * (coupon.value / 100), coupon.maxDiscountAmount ?? Infinity)
        : Math.min(coupon.value, baseAmount);
  }

  const taxableAmount = baseAmount - discountAmount;
  const taxAmount = Math.round(taxableAmount * TAX_RATE);
  const totalAmount = taxableAmount + taxAmount + (car.securityDeposit ?? 0);

  return {
    totalDays,
    totalHours: rentalType === "hour" ? totalHours : null,
    baseAmount,
    discountAmount,
    taxAmount,
    totalAmount,
  };
}

// Builds the pickup/drop instants a booking request carries. Both booking forms use this, so they
// can't drift apart: the API checks hourly rentals against the real span between the two
// timestamps (api/src/services/booking.js assertRentalSpan), which date-only values can't express.

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

/** Airport transfers block the car for one day; the API allows at most 24 hours. */
export const AIRPORT_TRANSFER_HOURS = 24

/** "9:30 AM" / "12:00 PM" (the TIME_SLOTS labels) -> { hours, minutes } on a 24-hour clock, or null. */
export function parseTimeSlot(label) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(label || '')
  if (!match) return null
  const hour12 = Number(match[1])
  const minutes = Number(match[2])
  if (hour12 < 1 || hour12 > 12 || minutes > 59) return null
  const isPm = match[3].toUpperCase() === 'PM'
  return { hours: (hour12 % 12) + (isPm ? 12 : 0), minutes }
}

/** The local-time instant for a "YYYY-MM-DD" date and a time-slot label (midnight if none/unparseable). */
export function localInstant(dateString, timeLabel) {
  const [year, month, day] = String(dateString || '')
    .split('-')
    .map(Number)
  if (!year || !month || !day) return null
  const time = parseTimeSlot(timeLabel) || { hours: 0, minutes: 0 }
  return new Date(year, month - 1, day, time.hours, time.minutes, 0, 0)
}

/**
 * The pickup and drop instants for a booking, as ISO strings (UTC), or null until the form has
 * enough to build them.
 *
 * - day: the chosen pickup and drop date/times. An empty drop time falls back to the pickup
 *   time, so a whole number of days stays a whole number of days.
 * - hour: pickup, then exactly `hours` later (so a window that crosses midnight is correct).
 * - airport: pickup, then AIRPORT_TRANSFER_HOURS later.
 */
export function buildBookingWindow({ rentalType, pickupDate, pickupTime, dropDate, dropTime, hours }) {
  const pickup = localInstant(pickupDate, pickupTime)
  if (!pickup) return null

  let drop
  if (rentalType === 'day') {
    drop = localInstant(dropDate, dropTime || pickupTime)
  } else if (rentalType === 'hour') {
    drop = Number(hours) > 0 ? new Date(pickup.getTime() + Number(hours) * MS_PER_HOUR) : null
  } else if (rentalType === 'airport') {
    drop = new Date(pickup.getTime() + AIRPORT_TRANSFER_HOURS * MS_PER_HOUR)
  }
  if (!drop) return null

  return { pickupDate: pickup.toISOString(), dropDate: drop.toISOString() }
}

/** Billable days for a daily rental, counted the way the API prices it (whole 24h periods, at least 1). */
export function rentalDays(window) {
  if (!window) return 0
  const span = new Date(window.dropDate) - new Date(window.pickupDate)
  return span > 0 ? Math.max(1, Math.ceil(span / MS_PER_DAY)) : 0
}

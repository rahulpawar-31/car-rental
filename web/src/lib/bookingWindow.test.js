import { buildBookingWindow, parseTimeSlot, localInstant, rentalDays, AIRPORT_TRANSFER_HOURS } from './bookingWindow'
import { HOUR_OPTIONS, TIME_SLOTS } from '../constants/booking'

const HOUR = 3600000

const hoursBetween = w => (new Date(w.dropDate) - new Date(w.pickupDate)) / HOUR

describe('parseTimeSlot', () => {
  test('reads every offered time slot onto a 24-hour clock', () => {
    expect(parseTimeSlot('6:00 AM')).toEqual({ hours: 6, minutes: 0 })
    expect(parseTimeSlot('12:00 PM')).toEqual({ hours: 12, minutes: 0 })
    expect(parseTimeSlot('12:30 AM')).toEqual({ hours: 0, minutes: 30 })
    expect(parseTimeSlot('9:30 PM')).toEqual({ hours: 21, minutes: 30 })
    for (const slot of TIME_SLOTS) expect(parseTimeSlot(slot)).not.toBeNull()
  })

  test('rejects anything that is not a time slot', () => {
    expect(parseTimeSlot('')).toBeNull()
    expect(parseTimeSlot(undefined)).toBeNull()
    expect(parseTimeSlot('25:00 AM')).toBeNull()
    expect(parseTimeSlot('noon')).toBeNull()
  })
})

describe('localInstant', () => {
  test('is the local wall-clock time on that date', () => {
    const d = localInstant('2026-12-01', '2:30 PM')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 1, 14, 30])
  })

  test('is null without a usable date', () => {
    expect(localInstant('', '9:00 AM')).toBeNull()
    expect(localInstant('nope', '9:00 AM')).toBeNull()
  })
})

describe('buildBookingWindow', () => {
  const base = { pickupDate: '2026-12-01', pickupTime: '9:00 AM' }

  test.each(HOUR_OPTIONS)('an hourly rental of %ih ends exactly that many hours after pickup', hours => {
    const w = buildBookingWindow({ ...base, rentalType: 'hour', hours })

    expect(hoursBetween(w)).toBe(hours)
    const pickup = new Date(w.pickupDate)
    expect([pickup.getHours(), pickup.getMinutes()]).toEqual([9, 0])
  })

  test('an hourly rental can cross midnight', () => {
    const w = buildBookingWindow({ ...base, pickupTime: '9:00 PM', rentalType: 'hour', hours: 8 })

    const drop = new Date(w.dropDate)
    expect([drop.getDate(), drop.getHours()]).toEqual([2, 5])
    expect(hoursBetween(w)).toBe(8)
  })

  test('an hourly rental is exact across a daylight-saving change', () => {
    // 2026-03-08 is the US spring-forward date; the span must still be exactly the chosen hours.
    const w = buildBookingWindow({ pickupDate: '2026-03-07', pickupTime: '9:00 PM', rentalType: 'hour', hours: 12 })

    expect(hoursBetween(w)).toBe(12)
  })

  test('a daily rental keeps the chosen pickup and drop times', () => {
    const w = buildBookingWindow({ ...base, rentalType: 'day', dropDate: '2026-12-03', dropTime: '6:30 PM' })

    const drop = new Date(w.dropDate)
    expect([drop.getDate(), drop.getHours(), drop.getMinutes()]).toEqual([3, 18, 30])
    expect(hoursBetween(w)).toBe(57.5)
  })

  test('a daily rental with no drop time drops at the pickup time, so whole days stay whole days', () => {
    const w = buildBookingWindow({ ...base, rentalType: 'day', dropDate: '2026-12-03' })

    expect(hoursBetween(w)).toBe(48)
  })

  test('an airport transfer lasts the full transfer window from the chosen time', () => {
    const w = buildBookingWindow({ ...base, pickupTime: '4:30 PM', rentalType: 'airport' })

    expect(hoursBetween(w)).toBe(AIRPORT_TRANSFER_HOURS)
    expect(new Date(w.pickupDate).getHours()).toBe(16)
  })

  test('sends ISO instants, not date-only strings', () => {
    const w = buildBookingWindow({ ...base, rentalType: 'hour', hours: 2 })

    expect(w.pickupDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(w.dropDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('is null until the form has enough to build a window', () => {
    expect(buildBookingWindow({ rentalType: 'hour', hours: 2 })).toBeNull()
    expect(buildBookingWindow({ ...base, rentalType: 'day' })).toBeNull()
    expect(buildBookingWindow({ ...base, rentalType: 'hour', hours: 0 })).toBeNull()
  })
})

describe('rentalDays', () => {
  test('counts whole 24-hour periods like the API, at least one', () => {
    const day = hours => rentalDays(buildBookingWindow({ rentalType: 'day', pickupDate: '2026-12-01', pickupTime: '9:00 AM', dropDate: '2026-12-02', dropTime: hours }))

    expect(day('9:00 AM')).toBe(1)
    expect(day('11:00 AM')).toBe(2)
    expect(day('6:00 AM')).toBe(1)
  })

  test('is 0 with no window or a reversed one', () => {
    expect(rentalDays(null)).toBe(0)
    expect(rentalDays({ pickupDate: '2026-12-02T00:00:00Z', dropDate: '2026-12-01T00:00:00Z' })).toBe(0)
  })
})

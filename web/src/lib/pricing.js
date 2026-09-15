export const TAX_RATE = 0.18
export const HOURLY_RATE_DIVISOR = 8
export const AIRPORT_RATE_MULTIPLIER = 0.4

export function deriveRentalRates(car) {
  const pricePerDay = car?.pricePerDay || 0
  return {
    pricePerDay,
    pricePerHour: Math.round(pricePerDay / HOURLY_RATE_DIVISOR),
    airportPrice: Math.round(pricePerDay * AIRPORT_RATE_MULTIPLIER),
  }
}

export function computeBaseAmount(rates, { rentalType, days, hours }) {
  const { pricePerDay, pricePerHour, airportPrice } = rates
  if (rentalType === 'day') return pricePerDay * days
  if (rentalType === 'hour') return pricePerHour * hours
  if (rentalType === 'airport') return airportPrice
  return 0
}

export function computeTaxAndTotal({ baseAmount, discountAmount = 0, securityDeposit = 0 }) {
  const tax = Math.round((baseAmount - discountAmount) * TAX_RATE)
  const total = baseAmount - discountAmount + tax + securityDeposit
  return { tax, total }
}

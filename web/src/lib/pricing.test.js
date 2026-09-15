import { deriveRentalRates, computeBaseAmount, computeTaxAndTotal, TAX_RATE, HOURLY_RATE_DIVISOR, AIRPORT_RATE_MULTIPLIER } from './pricing'

describe('deriveRentalRates', () => {
  test('derives hour and airport rates from pricePerDay', () => {
    const rates = deriveRentalRates({ pricePerDay: 2400 })

    expect(rates).toEqual({
      pricePerDay: 2400,
      pricePerHour: Math.round(2400 / HOURLY_RATE_DIVISOR),
      airportPrice: Math.round(2400 * AIRPORT_RATE_MULTIPLIER),
    })
  })

  test('treats a missing pricePerDay as 0', () => {
    const rates = deriveRentalRates({})

    expect(rates).toEqual({ pricePerDay: 0, pricePerHour: 0, airportPrice: 0 })
  })
})

describe('computeBaseAmount', () => {
  const rates = deriveRentalRates({ pricePerDay: 2400 })

  test('multiplies the daily rate by days for a day rental', () => {
    const amount = computeBaseAmount(rates, { rentalType: 'day', days: 3 })
    expect(amount).toBe(2400 * 3)
  })

  test('multiplies the hourly rate by hours for an hour rental', () => {
    const amount = computeBaseAmount(rates, { rentalType: 'hour', hours: 5 })
    expect(amount).toBe(rates.pricePerHour * 5)
  })

  test('uses the flat airport rate regardless of days/hours', () => {
    const amount = computeBaseAmount(rates, { rentalType: 'airport', days: 0, hours: 0 })
    expect(amount).toBe(rates.airportPrice)
  })

  test('returns 0 for an unrecognized rental type', () => {
    const amount = computeBaseAmount(rates, { rentalType: 'weekly' })
    expect(amount).toBe(0)
  })
})

describe('computeTaxAndTotal', () => {
  test('taxes the base amount at TAX_RATE when there is no discount or deposit', () => {
    const { tax, total } = computeTaxAndTotal({ baseAmount: 1000 })
    expect(tax).toBe(Math.round(1000 * TAX_RATE))
    expect(total).toBe(1000 + tax)
  })

  test('taxes the discounted amount, not the base amount', () => {
    const { tax, total } = computeTaxAndTotal({ baseAmount: 1000, discountAmount: 200 })
    expect(tax).toBe(Math.round((1000 - 200) * TAX_RATE))
    expect(total).toBe(1000 - 200 + tax)
  })

  test('adds the security deposit after tax, undiscounted', () => {
    const { tax, total } = computeTaxAndTotal({ baseAmount: 1000, discountAmount: 200, securityDeposit: 500 })
    expect(tax).toBe(Math.round((1000 - 200) * TAX_RATE))
    expect(total).toBe(1000 - 200 + tax + 500)
  })

  test('defaults discountAmount and securityDeposit to 0 when omitted', () => {
    const withDefaults = computeTaxAndTotal({ baseAmount: 1000 })
    const explicit = computeTaxAndTotal({ baseAmount: 1000, discountAmount: 0, securityDeposit: 0 })
    expect(withDefaults).toEqual(explicit)
  })
})

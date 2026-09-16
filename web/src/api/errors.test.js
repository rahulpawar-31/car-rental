import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  test('returns the backend envelope message when present', () => {
    const err = { response: { data: { message: 'Coupon has expired' } } }
    expect(getErrorMessage(err, 'Invalid coupon')).toBe('Coupon has expired')
  })

  test('falls back to the given fallback when there is no response body message', () => {
    const err = { response: { data: {} } }
    expect(getErrorMessage(err, 'Invalid coupon')).toBe('Invalid coupon')
  })

  test('falls back to the given fallback when there is no response at all (network error)', () => {
    const err = { message: 'Network Error' }
    expect(getErrorMessage(err, 'Failed to cancel booking')).toBe('Failed to cancel booking')
  })

  test('falls back to the given fallback for a completely empty error', () => {
    expect(getErrorMessage({}, 'Something went wrong')).toBe('Something went wrong')
  })
})

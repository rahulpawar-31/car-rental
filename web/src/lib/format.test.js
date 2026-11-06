import { reviewCountLabel } from './format'

describe('reviewCountLabel', () => {
  test('uses the singular for exactly one review', () => {
    expect(reviewCountLabel(1)).toBe('1 review')
  })

  test('uses the plural for zero and for many', () => {
    expect(reviewCountLabel(0)).toBe('0 reviews')
    expect(reviewCountLabel(12)).toBe('12 reviews')
  })
})

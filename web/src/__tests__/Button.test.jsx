import { render, screen, fireEvent } from '@testing-library/react'
import Button from '../components/ui/Button'

describe('Button', () => {
  test('renders its children', () => {
    render(<Button>Save Changes</Button>)
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })

  test('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  test('an explicit type overrides the default', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  test('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  test('defaults to the primary variant', () => {
    render(<Button>Book Now</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-teal-500/)
  })

  test.each([
    ['secondary', 'bg-teal-50'],
    ['outline', 'border-gray-200'],
    ['danger', 'bg-red-500'],
  ])('variant="%s" applies its color classes', (variant, expectedClass) => {
    render(<Button variant={variant}>Action</Button>)
    expect(screen.getByRole('button').className).toMatch(new RegExp(expectedClass))
  })

  test.each([
    ['primary', 'font-bold'],
    ['secondary', 'font-bold'],
    ['danger', 'font-bold'],
  ])(
    'variant="%s" is font-bold, matching every real solid button in the app',
    (variant, expectedClass) => {
      render(<Button variant={variant}>Action</Button>)
      expect(screen.getByRole('button').className).toMatch(new RegExp(expectedClass))
    }
  )

  test('the outline variant is font-medium, not font-bold, matching every real outline/cancel button in the app', () => {
    render(<Button variant="outline">Cancel</Button>)
    const className = screen.getByRole('button').className
    expect(className).toMatch(/font-medium/)
    expect(className).not.toMatch(/font-bold/)
  })

  test.each([
    ['sm', 'text-xs'],
    ['md', 'text-sm'],
    ['lg', 'text-base'],
  ])('size="%s" applies its text-size class', (size, expectedClass) => {
    render(<Button size={size}>Action</Button>)
    expect(screen.getByRole('button').className).toMatch(new RegExp(expectedClass))
  })

  test('size="sm" uses px-3, matching the real small-button precedent (Profile.jsx review-edit buttons)', () => {
    render(<Button size="sm">Action</Button>)
    expect(screen.getByRole('button').className).toMatch(/px-3\b/)
  })

  test('always applies the shared radius and disabled-opacity classes regardless of variant', () => {
    render(<Button variant="outline">Action</Button>)
    const className = screen.getByRole('button').className
    expect(className).toMatch(/rounded-lg/)
    expect(className).toMatch(/disabled:opacity-60/)
  })

  test('merges a caller-provided className without dropping the base classes', () => {
    render(<Button className="w-full">Action</Button>)
    const className = screen.getByRole('button').className
    expect(className).toMatch(/w-full/)
    expect(className).toMatch(/bg-teal-500/)
  })

  test('forwards arbitrary props like aria-label and data-testid', () => {
    render(
      <Button aria-label="Confirm booking" data-testid="confirm-btn">
        ✓
      </Button>
    )
    const button = screen.getByTestId('confirm-btn')
    expect(button).toHaveAttribute('aria-label', 'Confirm booking')
  })
})

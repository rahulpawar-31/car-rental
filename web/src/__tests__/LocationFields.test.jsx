import { render, screen, fireEvent, within } from '@testing-library/react'
import LocationFields from '../components/booking/LocationFields'

const LOCATIONS = [
  {
    _id: 'loc1',
    name: 'MG Road Branch',
    city: 'Bengaluru',
    isPickupAvailable: true,
    isDropAvailable: true,
  },
  {
    _id: 'loc2',
    name: 'Airport Branch',
    city: 'Mumbai',
    isPickupAvailable: true,
    isDropAvailable: false,
  },
]

function setup(props = {}) {
  const onPickupLocationChange = vi.fn()
  const onDropLocationChange = vi.fn()
  const onCustomPickupAddrChange = vi.fn()
  const onCustomDropAddrChange = vi.fn()
  render(
    <LocationFields
      idPrefix="test"
      locations={LOCATIONS}
      pickupLocation=""
      onPickupLocationChange={onPickupLocationChange}
      dropLocation=""
      onDropLocationChange={onDropLocationChange}
      customPickupAddr=""
      onCustomPickupAddrChange={onCustomPickupAddrChange}
      customDropAddr=""
      onCustomDropAddrChange={onCustomDropAddrChange}
      {...props}
    />
  )
  return {
    onPickupLocationChange,
    onDropLocationChange,
    onCustomPickupAddrChange,
    onCustomDropAddrChange,
  }
}

describe('LocationFields', () => {
  test('renders a Pickup Location branch select and a Drop-off Location branch select by default', () => {
    setup()
    expect(screen.getByLabelText(/pickup location/i).tagName).toBe('SELECT')
    expect(screen.getByLabelText(/drop-off location/i).tagName).toBe('SELECT')
  })

  test('pickup select only lists branches with isPickupAvailable !== false', () => {
    setup()
    const select = screen.getByLabelText(/pickup location/i)
    expect(within(select).getByRole('option', { name: /mg road branch/i })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: /airport branch/i })).toBeInTheDocument()
    expect(select.querySelectorAll('option')).toHaveLength(3) // placeholder + 2 pickup-available branches
  })

  test('drop-off select only lists branches with isDropAvailable !== false', () => {
    setup()
    const select = screen.getByLabelText(/drop-off location/i)
    expect(within(select).getByRole('option', { name: /mg road branch/i })).toBeInTheDocument()
    expect(select.querySelectorAll('option')).toHaveLength(2) // placeholder + 1 drop-available branch (loc2 excluded)
  })

  test('picking a drop-off branch flips Pickup Location into a free-text address input', () => {
    setup({ dropLocation: 'loc1' })
    const pickupField = screen.getByLabelText(/pickup location/i)
    expect(pickupField.tagName).toBe('INPUT')
    expect(pickupField).toHaveAttribute('placeholder', 'Enter your pickup address…')
  })

  test('picking a pickup branch flips Drop-off Location into a free-text address input', () => {
    setup({ pickupLocation: 'loc1' })
    const dropField = screen.getByLabelText(/drop-off location/i)
    expect(dropField.tagName).toBe('INPUT')
    expect(dropField).toHaveAttribute('placeholder', 'Enter your drop-off address…')
  })

  test('typing in the flipped free-text address calls its change handler', () => {
    const { onCustomPickupAddrChange } = setup({ dropLocation: 'loc1' })
    fireEvent.change(screen.getByLabelText(/pickup location/i), {
      target: { value: '34 Main Street' },
    })
    expect(onCustomPickupAddrChange).toHaveBeenCalledWith('34 Main Street')
  })

  test('falls back to free-text address inputs on both sides when there are no branches to select from', () => {
    setup({ locations: [] })
    const pickupField = screen.getByLabelText(/pickup location/i)
    const dropField = screen.getByLabelText(/drop-off location/i)
    expect(pickupField.tagName).toBe('INPUT')
    expect(dropField.tagName).toBe('INPUT')
  })

  test('selecting a branch calls its change handler with the location id', () => {
    const { onPickupLocationChange } = setup()
    fireEvent.change(screen.getByLabelText(/pickup location/i), { target: { value: 'loc1' } })
    expect(onPickupLocationChange).toHaveBeenCalledWith('loc1')
  })

  test('stacks to a single column when stacked is true', () => {
    const { container } = render(
      <LocationFields
        idPrefix="test"
        locations={LOCATIONS}
        pickupLocation=""
        onPickupLocationChange={() => {}}
        dropLocation=""
        onDropLocationChange={() => {}}
        customPickupAddr=""
        onCustomPickupAddrChange={() => {}}
        customDropAddr=""
        onCustomDropAddrChange={() => {}}
        stacked
      />
    )
    expect(container.firstChild.className).not.toMatch(/sm:grid-cols-2/)
  })

  test('defaults to a two-column layout when stacked is not set', () => {
    const { container } = render(
      <LocationFields
        idPrefix="test"
        locations={LOCATIONS}
        pickupLocation=""
        onPickupLocationChange={() => {}}
        dropLocation=""
        onDropLocationChange={() => {}}
        customPickupAddr=""
        onCustomPickupAddrChange={() => {}}
        customDropAddr=""
        onCustomDropAddrChange={() => {}}
      />
    )
    expect(container.firstChild.className).toMatch(/sm:grid-cols-2/)
  })
})

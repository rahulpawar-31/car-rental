import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CarDetail from '../pages/CarDetail'
import { createBooking } from '../api/bookings'
import { getLocations } from '../api/locations'

const MOCK_CAR = {
  _id: 'car1',
  brand: 'Honda',
  model: 'City',
  type: 'sedan',
  year: 2024,
  color: 'White',
  pricePerDay: 3000,
  securityDeposit: 0,
  seats: 5,
  fuelType: 'petrol',
  transmission: 'automatic',
  isAvailable: true,
  isFeatured: false,
  rating: 0,
  images: [],
  features: [],
}

vi.mock('../api/cars', () => ({
  getCarById: vi.fn(() => Promise.resolve({ data: { data: { car: MOCK_CAR } } })),
  getCars: vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  getCarBookedDates: vi.fn(() => Promise.resolve({ data: { data: { bookedRanges: [] } } })),
}))

vi.mock('../api/reviews', () => ({
  getCarReviews: vi.fn(() => Promise.resolve({ data: { data: { reviews: [] } } })),
}))

vi.mock('../api/users', () => ({
  saveCar: vi.fn(() => Promise.resolve({ data: { saved: true, message: 'Saved' } })),
}))

vi.mock('../api/bookings', () => ({
  createBooking: vi.fn(() => Promise.resolve({ data: { data: { booking: { _id: 'booking1' } } } })),
}))

vi.mock('../api/locations', () => ({
  getLocations: vi.fn(() => Promise.resolve({ data: { data: { locations: [] } } })),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// A stable object reference matters here: CarDetail's data-fetching effect
// depends on `user`, and a fresh object literal on every render (unlike
// real zustand, which only changes reference when store state actually
// changes) would re-trigger the effect every render and loop forever.
const MOCK_USER = { name: 'Priya Sharma', email: 'priya@example.com', phone: '9876543210' }
vi.mock('../store/authStore', () => ({
  default: () => ({ user: MOCK_USER }),
}))

vi.mock('../components/ui/Spinner', () => ({
  default: () => <div data-testid="spinner" />,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderCarDetail() {
  return render(
    <MemoryRouter initialEntries={['/cars/car1']}>
      <Routes>
        <Route path="/cars/:id" element={<CarDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CarDetail booking form', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    createBooking.mockClear()
  })

  test('renders Personal Information fields pre-filled from the logged-in user', async () => {
    renderCarDetail()
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Priya Sharma')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('priya@example.com')
  })

  test('renders Pickup Date and Pickup Time fields', async () => {
    renderCarDetail()
    await waitFor(() => {
      expect(screen.getByLabelText(/pickup date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/pickup time/i)).toBeInTheDocument()
    })
  })

  test('Pickup & Drop-off Location fields fall back to free-text address inputs when no branches load (API failure, or none active)', async () => {
    renderCarDetail()
    await waitFor(() => {
      expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument()
    })
    // With zero locations there's nothing to pick from a <select> -- the user
    // must still be able to type where they want to be picked up/dropped off.
    expect(screen.getByLabelText(/pickup location/i).tagName).toBe('INPUT')
    expect(screen.getByLabelText(/drop-off location/i).tagName).toBe('INPUT')
  })

  test('Book Instantly submits the form with the pre-filled personal info and pickup location id', async () => {
    getLocations.mockResolvedValueOnce({
      data: {
        data: {
          locations: [
            {
              _id: 'loc1',
              name: 'MG Road Branch',
              city: 'Bengaluru',
              isPickupAvailable: true,
              isDropAvailable: true,
            },
          ],
        },
      },
    })
    renderCarDetail()
    await waitFor(() => expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/pickup location/i), { target: { value: 'loc1' } })
    fireEvent.change(screen.getByLabelText(/pickup date/i), { target: { value: '2026-12-01' } })
    fireEvent.change(screen.getByLabelText(/pickup time/i), { target: { value: '9:00 AM' } })
    fireEvent.change(screen.getByLabelText(/drop off date/i), { target: { value: '2026-12-03' } })
    fireEvent.change(screen.getByLabelText(/drop off time/i), { target: { value: '9:00 AM' } })

    fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    const payload = createBooking.mock.calls[0][0]
    expect(payload).toMatchObject({
      carId: 'car1',
      pickupDate: '2026-12-01',
      dropDate: '2026-12-03',
      rentalType: 'day',
      pickupLocationId: 'loc1',
      driverDetails: { name: 'Priya Sharma', email: 'priya@example.com', phone: '9876543210' },
    })
  })

  test('selecting a drop-off branch flips Pickup Location to a free-text address, which ends up in the booking notes', async () => {
    getLocations.mockResolvedValueOnce({
      data: {
        data: {
          locations: [
            {
              _id: 'loc1',
              name: 'MG Road Branch',
              city: 'Bengaluru',
              isPickupAvailable: true,
              isDropAvailable: true,
            },
          ],
        },
      },
    })
    renderCarDetail()
    await waitFor(() => expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/drop-off location/i), { target: { value: 'loc1' } })
    const pickupField = screen.getByLabelText(/pickup location/i)
    expect(pickupField.tagName).toBe('INPUT')
    fireEvent.change(pickupField, { target: { value: '34 Main Street' } })

    fireEvent.change(screen.getByLabelText(/pickup date/i), { target: { value: '2026-12-01' } })
    fireEvent.change(screen.getByLabelText(/pickup time/i), { target: { value: '9:00 AM' } })
    fireEvent.change(screen.getByLabelText(/drop off date/i), { target: { value: '2026-12-03' } })
    fireEvent.change(screen.getByLabelText(/drop off time/i), { target: { value: '9:00 AM' } })

    fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    const payload = createBooking.mock.calls[0][0]
    expect(payload.dropLocationId).toBe('loc1')
    expect(payload.notes).toMatch(/Pickup: 34 Main Street/)
  })

  test('switching to Per Hour rental type shows the Duration (Hours) pills instead of Drop Off fields', async () => {
    renderCarDetail()
    await waitFor(() => expect(screen.getByLabelText(/pickup date/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /per day/i }))
    fireEvent.click(screen.getByRole('button', { name: /^per hour/i }))

    expect(screen.getByText(/duration \(hours\)/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/drop off date/i)).not.toBeInTheDocument()
  })
})

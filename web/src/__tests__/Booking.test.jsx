import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Booking from '../pages/Booking'
import { createBooking } from '../api/bookings'
import { HOUR_OPTIONS } from '../constants/booking'

const MOCK_CAR = {
  _id: 'car1',
  brand: 'Honda',
  model: 'City',
  name: 'Honda City',
  pricePerDay: 3000,
  securityDeposit: 0,
  isAvailable: true,
  images: [],
}

vi.mock('../api/cars', () => ({
  getCarById: vi.fn(() => Promise.resolve({ data: { data: { car: MOCK_CAR } } })),
}))

vi.mock('../api/bookings', () => ({
  createBooking: vi.fn(() => Promise.resolve({ data: { data: { booking: { _id: 'booking1' } } } })),
  applyCoupon: vi.fn(),
}))

vi.mock('../api/locations', () => ({
  getLocations: vi.fn(() => Promise.resolve({ data: { data: { locations: [] } } })),
}))

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

const hoursBetween = payload => (new Date(payload.dropDate) - new Date(payload.pickupDate)) / 3600000

function renderBooking(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/booking/car1', state }]}>
      <Routes>
        <Route path="/booking/:carId" element={<Booking />} />
      </Routes>
    </MemoryRouter>
  )
}

async function book(state, fill) {
  renderBooking(state)
  await waitFor(() => expect(screen.getByRole('button', { name: /book instantly/i })).toBeEnabled())
  fill?.()
  fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))
  await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
  return createBooking.mock.calls[0][0]
}

describe('Booking page timestamps', () => {
  beforeEach(() => {
    createBooking.mockClear()
  })

  test.each(HOUR_OPTIONS)('an hourly rental of %ih sends a window of exactly that length from the chosen time', async hours => {
    const payload = await book({ rentalType: 'hour', pickupDate: '2026-12-01' }, () => {
      fireEvent.change(screen.getByLabelText('Time'), { target: { value: '2:30 PM' } })
      fireEvent.click(screen.getByRole('button', { name: `${hours}h` }))
    })

    expect(payload.rentalType).toBe('hour')
    expect(payload.totalHours).toBe(hours)
    expect(payload.pickupDate).toBe(new Date(2026, 11, 1, 14, 30).toISOString())
    expect(hoursBetween(payload)).toBe(hours)
  })

  test('an hourly rental that crosses midnight ends on the next day', async () => {
    const payload = await book({ rentalType: 'hour', pickupDate: '2026-12-01' }, () => {
      fireEvent.change(screen.getByLabelText('Time'), { target: { value: '9:00 PM' } })
      fireEvent.click(screen.getByRole('button', { name: '8h' }))
    })

    expect(payload.dropDate).toBe(new Date(2026, 11, 2, 5, 0).toISOString())
  })

  test('a daily rental keeps the chosen pickup and drop-off times', async () => {
    const payload = await book({ pickupDate: '2026-12-01', dropDate: '2026-12-03' }, () => {
      fireEvent.change(document.getElementById('booking-day-pickup-time'), { target: { value: '10:00 AM' } })
      fireEvent.change(document.getElementById('booking-day-drop-time'), { target: { value: '6:00 PM' } })
    })

    expect(payload.pickupDate).toBe(new Date(2026, 11, 1, 10, 0).toISOString())
    expect(payload.dropDate).toBe(new Date(2026, 11, 3, 18, 0).toISOString())
  })

  test('an airport transfer starts at the chosen time and stays within 24 hours', async () => {
    const payload = await book({ rentalType: 'airport', pickupDate: '2026-12-01' }, () => {
      fireEvent.change(document.getElementById('booking-airport-pickup-time'), { target: { value: '4:30 PM' } })
    })

    expect(payload.pickupDate).toBe(new Date(2026, 11, 1, 16, 30).toISOString())
    expect(hoursBetween(payload)).toBeGreaterThan(0)
    expect(hoursBetween(payload)).toBeLessThanOrEqual(24)
  })
})

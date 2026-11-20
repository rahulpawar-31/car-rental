import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Booking from '../pages/Booking'
import { createBooking, applyCoupon } from '../api/bookings'
import { toast } from 'sonner'
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

describe('Booking page coupons follow the rental they were previewed for', () => {
  const DAY = { pickupDate: '2026-12-01', dropDate: '2026-12-02' }
  const preview = discountAmount => Promise.resolve({ data: { data: { discountAmount } } })

  beforeEach(() => {
    createBooking.mockClear()
    applyCoupon.mockReset()
    toast.error.mockClear()
  })

  async function openAndApply(state, discount, fill) {
    renderBooking(state)
    await waitFor(() => expect(screen.getByRole('button', { name: /book instantly/i })).toBeEnabled())
    fill?.()
    applyCoupon.mockReturnValueOnce(preview(discount))
    fireEvent.change(screen.getByPlaceholderText(/coupon code/i), { target: { value: 'save10' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await screen.findByRole('button', { name: /applied/i })
  }

  const setDropTime = value => fireEvent.change(document.getElementById('booking-day-drop-time'), { target: { value } })

  test('asks the server to price the same window, rental type and hours that will be submitted', async () => {
    await openAndApply({ rentalType: 'hour', pickupDate: '2026-12-01' }, 100, () => {
      fireEvent.click(screen.getByRole('button', { name: '4h' }))
    })

    const request = applyCoupon.mock.calls[0][0]
    expect(request).toMatchObject({ code: 'SAVE10', rentalType: 'hour', totalHours: 4 })
    expect((new Date(request.dropDate) - new Date(request.pickupDate)) / 3600000).toBe(4)
  })

  test('drops a discount calculated for two billable days when the drop-off time brings it back to one', async () => {
    await openAndApply(DAY, 600, () => setDropTime('10:00 AM')) // 25 hours: two days, base 6,000
    expect(screen.getByText('− ₹600')).toBeInTheDocument()

    setDropTime('9:00 AM') // 24 hours: one day

    expect(screen.queryByText('− ₹600')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    expect(createBooking.mock.calls[0][0].couponCode).toBeUndefined()
  })

  test('drops it the other way too, when a later drop-off adds a billable day', async () => {
    await openAndApply(DAY, 300)
    expect(screen.getByText('− ₹300')).toBeInTheDocument()

    setDropTime('10:00 AM')

    expect(screen.queryByText('− ₹300')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeEnabled()
  })

  test('drops it when the pickup time shifts the window', async () => {
    await openAndApply(DAY, 300)

    fireEvent.change(document.getElementById('booking-day-pickup-time'), { target: { value: '8:00 AM' } })

    expect(screen.queryByText('− ₹300')).not.toBeInTheDocument()
  })

  test('drops it when the number of hours changes', async () => {
    await openAndApply({ rentalType: 'hour', pickupDate: '2026-12-01' }, 50)
    expect(screen.getByText('− ₹50')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '8h' }))

    expect(screen.queryByText('− ₹50')).not.toBeInTheDocument()
  })

  test('keeps it while nothing that affects the price changes', async () => {
    await openAndApply(DAY, 300)

    fireEvent.change(document.getElementById('booking-name'), { target: { value: 'Someone Else' } })

    expect(screen.getByText('− ₹300')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /applied/i })).toBeInTheDocument()
  })

  test('does not let a preview for an old window restore a stale discount', async () => {
    renderBooking(DAY)
    await waitFor(() => expect(screen.getByRole('button', { name: /book instantly/i })).toBeEnabled())
    setDropTime('10:00 AM')
    let resolvePreview
    applyCoupon.mockReturnValueOnce(new Promise(resolve => (resolvePreview = resolve)))
    fireEvent.change(screen.getByPlaceholderText(/coupon code/i), { target: { value: 'save10' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    setDropTime('9:00 AM') // the rental changes while the preview is in flight
    resolvePreview({ data: { data: { discountAmount: 600 } } })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/apply the coupon again/i)))
    expect(screen.queryByText('− ₹600')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^apply$/i })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    expect(createBooking.mock.calls[0][0].couponCode).toBeUndefined()
  })

  test('a flat or capped coupon that still applies is submitted with the booking', async () => {
    await openAndApply(DAY, 200)

    fireEvent.click(screen.getByRole('button', { name: /book instantly/i }))

    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(1))
    expect(createBooking.mock.calls[0][0].couponCode).toBe('SAVE10')
  })
})

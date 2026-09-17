import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../pages/Admin'
import { createAdminCar, createAdminLocation } from '../api/admin'

const mockGetAllUsers = vi.fn()
const mockToggleUserStatus = vi.fn()

vi.mock('../api/admin', () => ({
  getDashboardStats: vi.fn(() =>
    Promise.resolve({
      data: {
        data: {
          stats: {
            totalUsers: 0,
            newUsersThisMonth: 0,
            totalCars: 0,
            availableCars: 0,
            totalBookings: 0,
            bookingsThisMonth: 0,
            bookingGrowth: 0,
            revenueThisMonth: 0,
            activeBookings: 0,
            revenueGrowth: 0,
            pendingReviews: 0,
          },
          recentBookings: [],
          bookingsByStatus: [],
          revenueByMonth: [],
        },
      },
    })
  ),
  getAllUsers: (...args) => mockGetAllUsers(...args),
  toggleUserStatus: (...args) => mockToggleUserStatus(...args),
  getAllBookings: vi.fn(() =>
    Promise.resolve({ data: { data: { bookings: [], pagination: {} } } })
  ),
  updateBookingStatus: vi.fn(() => Promise.resolve({ data: {} })),
  getAdminReviews: vi.fn(() =>
    Promise.resolve({ data: { data: { reviews: [], pagination: {} } } })
  ),
  approveReview: vi.fn(() => Promise.resolve({ data: {} })),
  getCoupons: vi.fn(() => Promise.resolve({ data: { data: { coupons: [] } } })),
  createCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  getAdminPayments: vi.fn(() =>
    Promise.resolve({ data: { data: { payments: [], pagination: {}, totalRevenue: 0 } } })
  ),
  getAdminCars: vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  createAdminCar: vi.fn(),
  updateAdminCar: vi.fn(),
  deleteAdminCar: vi.fn(),
  getAdminLocations: vi.fn(() => Promise.resolve({ data: { data: { locations: [] } } })),
  createAdminLocation: vi.fn(),
  updateAdminLocation: vi.fn(),
  deleteAdminLocation: vi.fn(),
  uploadAdminCarImages: vi.fn(),
}))

vi.mock('../api/payments', () => ({
  refundPayment: vi.fn(() => Promise.resolve({ data: { data: {} } })),
}))

vi.mock('../api/locations', () => ({
  getLocations: vi.fn(() => Promise.resolve({ data: { data: { locations: [] } } })),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderAdmin() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>
  )
}

const ACTIVE_USER = {
  _id: 'user-1',
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '9876543210',
  role: 'customer',
  isActive: true,
  createdAt: new Date('2025-01-01').toISOString(),
}

const INACTIVE_USER = {
  _id: 'user-2',
  name: 'Vikram Shah',
  email: 'vikram@example.com',
  phone: '9123456780',
  role: 'customer',
  isActive: false,
  createdAt: new Date('2025-02-01').toISOString(),
}

async function goToUsersTab() {
  renderAdmin()
  fireEvent.click(screen.getByRole('button', { name: /^users$/i }))
  await waitFor(() => expect(screen.getByText('Asha Rao')).toBeInTheDocument())
}

describe('Admin Users tab — deactivate confirm gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllUsers.mockResolvedValue({
      data: { data: { users: [ACTIVE_USER, INACTIVE_USER], pagination: { total: 2, pages: 1 } } },
    })
    mockToggleUserStatus.mockResolvedValue({
      data: { data: { isActive: false }, message: 'User deactivated' },
    })
  })

  test('clicking Deactivate opens a confirm modal instead of calling the API immediately', async () => {
    await goToUsersTab()

    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }))

    expect(screen.getByText(/deactivate asha rao/i)).toBeInTheDocument()
    expect(mockToggleUserStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /yes, deactivate/i }))
    await waitFor(() => expect(mockToggleUserStatus).toHaveBeenCalledWith('user-1'))
  })

  test('cancelling the confirm modal does not call the API', async () => {
    await goToUsersTab()

    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }))

    expect(screen.queryByText(/deactivate asha rao/i)).not.toBeInTheDocument()
    expect(mockToggleUserStatus).not.toHaveBeenCalled()
  })

  test('activating an already-inactive user calls the API directly, with no confirm gate', async () => {
    await goToUsersTab()

    fireEvent.click(screen.getByRole('button', { name: /^activate$/i }))

    await waitFor(() => expect(mockToggleUserStatus).toHaveBeenCalledWith('user-2'))
    expect(screen.queryByText(/keep it/i)).not.toBeInTheDocument()
  })
})

describe('Admin Cars tab — modal (shared Modal shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function goToCarsTab() {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: /^cars$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add car/i })).toBeInTheDocument()
    )
  }

  test('Add Car opens the modal with the right title', async () => {
    await goToCarsTab()
    fireEvent.click(screen.getByRole('button', { name: /add car/i }))
    expect(screen.getByRole('heading', { name: /add new car/i })).toBeInTheDocument()
  })

  test('Cancel closes the modal without saving', async () => {
    await goToCarsTab()
    fireEvent.click(screen.getByRole('button', { name: /add car/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('heading', { name: /add new car/i })).not.toBeInTheDocument()
    expect(createAdminCar).not.toHaveBeenCalled()
  })

  test('the modal close (X) button also closes it', async () => {
    await goToCarsTab()
    fireEvent.click(screen.getByRole('button', { name: /add car/i }))
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('heading', { name: /add new car/i })).not.toBeInTheDocument()
  })
})

describe('Admin Locations tab — modal (shared Modal shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function goToLocationsTab() {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: /^locations$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add location/i })).toBeInTheDocument()
    )
  }

  test('Add Location opens the modal with the right title', async () => {
    await goToLocationsTab()
    fireEvent.click(screen.getByRole('button', { name: /add location/i }))
    expect(screen.getByRole('heading', { name: /^add location$/i })).toBeInTheDocument()
  })

  test('Cancel closes the modal without saving', async () => {
    await goToLocationsTab()
    fireEvent.click(screen.getByRole('button', { name: /add location/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('heading', { name: /^add location$/i })).not.toBeInTheDocument()
    expect(createAdminLocation).not.toHaveBeenCalled()
  })
})

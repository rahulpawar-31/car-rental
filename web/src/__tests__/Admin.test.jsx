import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../pages/Admin'
import { createAdminCar, createAdminLocation } from '../api/admin'

const mockGetAllUsers = vi.fn()
const mockToggleUserStatus = vi.fn()
const mockGetCoupons = vi.fn()
const mockCreateCoupon = vi.fn()
const mockUpdateCoupon = vi.fn()

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
  getCoupons: (...args) => mockGetCoupons(...args),
  createCoupon: (...args) => mockCreateCoupon(...args),
  deleteCoupon: vi.fn(),
  updateCoupon: (...args) => mockUpdateCoupon(...args),
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

// Coupon form fields use a bare <label> sibling to their <input>/<select>, not
// htmlFor/id association (a pre-existing pattern across every Admin.jsx form,
// unrelated to this phase's scope) -- getByLabelText won't find them, so look
// up the control via its label's sibling instead. Scoped to the open modal's
// <form> since some field labels (Code, Description) collide with table
// column headers of the same name.
function fieldByLabel(text) {
  const form = document.querySelector('form')
  return within(form).getByText(text).parentElement.querySelector('input, select')
}

describe('Admin Coupons tab — unified create/edit modal', () => {
  const PERCENTAGE_COUPON = {
    _id: 'coupon-1',
    code: 'SUMMER20',
    description: '20% off summer bookings',
    type: 'percentage',
    value: 20,
    minBookingAmount: 1000,
    maxDiscountAmount: 500,
    usageLimit: 100,
    usageCount: 10,
    perUserLimit: 1,
    isActive: true,
    startDate: '2030-06-01T00:00:00.000Z',
    endDate: '2030-08-31T00:00:00.000Z',
  }

  const FIXED_COUPON = {
    ...PERCENTAGE_COUPON,
    _id: 'coupon-2',
    code: 'FLAT500',
    type: 'fixed',
    value: 500,
    maxDiscountAmount: undefined,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCoupons.mockResolvedValue({
      data: { data: { coupons: [PERCENTAGE_COUPON, FIXED_COUPON] } },
    })
    mockCreateCoupon.mockResolvedValue({ data: {} })
    mockUpdateCoupon.mockResolvedValue({ data: {} })
  })

  async function goToCouponsTab() {
    renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: /^coupons$/i }))
    await waitFor(() => expect(screen.getByText('SUMMER20')).toBeInTheDocument())
  }

  test('New Coupon opens the modal in create mode with Code and Type enabled', async () => {
    await goToCouponsTab()
    fireEvent.click(screen.getByRole('button', { name: /new coupon/i }))

    expect(screen.getByRole('heading', { name: /^create coupon$/i })).toBeInTheDocument()
    expect(fieldByLabel(/^code/i)).not.toBeDisabled()
    expect(fieldByLabel(/^type/i)).not.toBeDisabled()
  })

  test('creating a coupon includes code and type in the payload', async () => {
    await goToCouponsTab()
    fireEvent.click(screen.getByRole('button', { name: /new coupon/i }))

    fireEvent.change(fieldByLabel(/^code/i), { target: { value: 'WELCOME10' } })
    fireEvent.change(fieldByLabel(/^description/i), { target: { value: '10% off first ride' } })
    fireEvent.change(fieldByLabel(/^value/i), { target: { value: '10' } })
    fireEvent.change(fieldByLabel(/^start date/i), { target: { value: '2030-01-01' } })
    fireEvent.change(fieldByLabel(/^end date/i), { target: { value: '2030-12-31' } })

    fireEvent.click(screen.getByRole('button', { name: /^create coupon$/i }))

    await waitFor(() => expect(mockCreateCoupon).toHaveBeenCalledTimes(1))
    const payload = mockCreateCoupon.mock.calls[0][0]
    expect(payload.code).toBe('WELCOME10')
    expect(payload.type).toBe('percentage')
  })

  test('Edit opens the modal in edit mode, prefilled, with Code and Type disabled', async () => {
    await goToCouponsTab()
    fireEvent.click(screen.getByRole('button', { name: /edit coupon summer20/i }))

    expect(screen.getByRole('heading', { name: /^edit coupon$/i })).toBeInTheDocument()
    expect(fieldByLabel(/^code/i)).toHaveValue('SUMMER20')
    expect(fieldByLabel(/^code/i)).toBeDisabled()
    expect(fieldByLabel(/^type/i)).toBeDisabled()
  })

  test('saving an edited coupon does not include code or type in the payload', async () => {
    await goToCouponsTab()
    fireEvent.click(screen.getByRole('button', { name: /edit coupon summer20/i }))

    fireEvent.change(fieldByLabel(/^description/i), { target: { value: 'Updated description' } })
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => expect(mockUpdateCoupon).toHaveBeenCalledTimes(1))
    const [id, payload] = mockUpdateCoupon.mock.calls[0]
    expect(id).toBe('coupon-1')
    expect(payload.description).toBe('Updated description')
    expect(payload).not.toHaveProperty('code')
    expect(payload).not.toHaveProperty('type')
  })

  test('Max Discount only shows for percentage-type coupons', async () => {
    await goToCouponsTab()

    fireEvent.click(screen.getByRole('button', { name: /edit coupon summer20/i }))
    expect(screen.getByText(/max discount/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    fireEvent.click(screen.getByRole('button', { name: /edit coupon flat500/i }))
    expect(screen.queryByText(/max discount/i)).not.toBeInTheDocument()
  })

  test('Cancel closes the modal without saving', async () => {
    await goToCouponsTab()
    fireEvent.click(screen.getByRole('button', { name: /new coupon/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('heading', { name: /^create coupon$/i })).not.toBeInTheDocument()
    expect(mockCreateCoupon).not.toHaveBeenCalled()
  })
})

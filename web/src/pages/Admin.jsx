import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LayoutDashboard, Users, CalendarCheck, Star, Tag,
  TrendingUp, TrendingDown, Car, CheckCircle, XCircle,
  Search, ChevronLeft, ChevronRight, Trash2,
  ToggleLeft, ToggleRight, Plus, X, AlertCircle,
  MapPin, CreditCard, Edit2, Calendar, Upload, Link as LinkIcon,
} from 'lucide-react'
import {
  getDashboardStats,
  getAllUsers, toggleUserStatus,
  getAllBookings, updateBookingStatus,
  getAdminReviews, approveReview,
  getCoupons, createCoupon, deleteCoupon, updateCoupon,
  getAdminPayments,
  getAdminCars, createAdminCar, updateAdminCar, deleteAdminCar,
  getAdminLocations, createAdminLocation, updateAdminLocation, deleteAdminLocation,
  uploadAdminCarImages,
} from '../api/admin'
import { refundPayment } from '../api/payments'
import { getLocations } from '../api/locations'
import { getErrorMessage } from '../api/errors'
import Spinner from '../components/ui/Spinner'
import ConfirmModal from '../components/ui/ConfirmModal'
import { toast } from 'sonner'

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString('en-IN')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const BOOKING_STATUSES = ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'no-show']
const STATUS_COLOR = {
  pending:   'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  active:    'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-50 text-red-700',
  'no-show': 'bg-orange-50 text-orange-700',
}

// ─── sub-components ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, growth }) {
  const up = parseFloat(growth) >= 0
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        {growth !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
            {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(growth)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}
        className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-gray-600">Page {page} of {pages}</span>
      <button disabled={page === pages} onClick={() => onChange(page + 1)}
        className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(({ data }) => setData(data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!data) return null

  const { stats, recentBookings, bookingsByStatus, revenueByMonth } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={fmt(stats.totalUsers)} sub={`+${stats.newUsersThisMonth} this month`} icon={Users} color="text-blue-600 bg-blue-50" />
        <StatCard label="Total Cars" value={fmt(stats.totalCars)} sub={`${stats.availableCars} available`} icon={Car} color="text-green-600 bg-green-50" />
        <StatCard label="Total Bookings" value={fmt(stats.totalBookings)} sub={`${stats.bookingsThisMonth} this month`} icon={CalendarCheck} color="text-purple-600 bg-purple-50" growth={stats.bookingGrowth} />
        <StatCard label="Revenue (Month)" value={`₹${fmt(stats.revenueThisMonth)}`} sub={`${stats.activeBookings} active now`} icon={TrendingUp} color="text-amber-600 bg-amber-50" growth={stats.revenueGrowth} />
      </div>

      {/* Revenue chart */}
      {revenueByMonth?.length > 0 && (
        <RevenueChart data={revenueByMonth} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bookings by status */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Bookings by Status</h3>
          <div className="space-y-2">
            {bookingsByStatus.map(({ _id, count }) => (
              <div key={_id} className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[_id] || 'bg-gray-100 text-gray-600'}`}>{_id}</span>
                <span className="text-sm font-semibold text-gray-800">{count}</span>
              </div>
            ))}
          </div>
          {stats.pendingReviews > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {stats.pendingReviews} review{stats.pendingReviews !== 1 ? 's' : ''} awaiting approval
            </div>
          )}
        </div>

        {/* Recent bookings */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Bookings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-left pb-2 font-medium">Car</th>
                  <th className="text-left pb-2 font-medium">Pickup</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentBookings.map(b => (
                  <tr key={b._id}>
                    <td className="py-2.5">
                      <p className="font-medium text-gray-800 truncate max-w-[120px]">{b.user?.name}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[120px]">{b.user?.email}</p>
                    </td>
                    <td className="py-2.5 text-gray-600 truncate max-w-[120px]">{b.car?.brand} {b.car?.model}</td>
                    <td className="py-2.5 text-gray-500">{fmtDate(b.pickupDate)}</td>
                    <td className="py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[b.status] || ''}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Revenue Bar Chart ────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function RevenueChart({ data }) {
  const sorted = [...data].sort((a, b) =>
    a._id.year !== b._id.year ? a._id.year - b._id.year : a._id.month - b._id.month
  ).slice(-8)

  const maxVal = Math.max(...sorted.map(d => d.total), 1)
  const BAR_W  = 36
  const GAP    = 16
  const H      = 140
  const PAD_L  = 52
  const PAD_B  = 32
  const chartW = sorted.length * (BAR_W + GAP) + PAD_L + 8

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxVal))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Monthly Revenue (₹)</h3>
      <div className="overflow-x-auto">
        <svg width={chartW} height={H + PAD_B + 8} className="min-w-full">
          {/* Y-axis grid + labels */}
          {yTicks.map(tick => {
            const y = H - (tick / maxVal) * H
            return (
              <g key={tick}>
                <line x1={PAD_L} y1={y} x2={chartW - 8} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#9ca3af">
                  {tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {sorted.map((d, i) => {
            const barH = Math.max((d.total / maxVal) * H, 2)
            const x    = PAD_L + i * (BAR_W + GAP)
            const y    = H - barH
            const label = MONTH_NAMES[(d._id.month - 1) % 12]
            return (
              <g key={`${d._id.year}-${d._id.month}`}>
                <rect x={x} y={y} width={BAR_W} height={barH} rx={4} fill="#14b8a6" opacity={0.85} />
                {/* Value on top */}
                {barH > 16 && (
                  <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#0f766e" fontWeight="600">
                    {d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : d.total}
                  </text>
                )}
                {/* Month label */}
                <text x={x + BAR_W / 2} y={H + PAD_B - 14} textAnchor="middle" fontSize={9} fill="#6b7280">
                  {label}
                </text>
                <text x={x + BAR_W / 2} y={H + PAD_B - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">
                  {String(d._id.year).slice(-2)}
                </text>
              </g>
            )
          })}

          {/* X-axis line */}
          <line x1={PAD_L} y1={H} x2={chartW - 8} y2={H} stroke="#e5e7eb" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}

// ─── Availability Tab ─────────────────────────────────────────────────────────
function AvailabilityTab() {
  const [cars, setCars]         = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    Promise.all([
      getAdminCars({ limit: 200 }),
      getAllBookings({ status: 'confirmed', limit: 200 }),
    ])
      .then(([cRes, bRes]) => {
        setCars(cRes.data.data.cars || [])
        setBookings(bRes.data.data.bookings || [])
      })
      .catch(() => toast.error('Failed to load fleet data'))
      .finally(() => setLoading(false))
  }, [])

  const upcomingCountByCar = bookings.reduce((acc, b) => {
    const carId = b.car?._id || b.car
    if (carId) acc[carId] = (acc[carId] || 0) + 1
    return acc
  }, {})

  const filtered = cars.filter(c =>
    filter === 'all' ? true :
    filter === 'available' ? c.isAvailable :
    filter === 'unavailable' ? !c.isAvailable :
    filter === 'featured' ? c.isFeatured : true
  )

  const availCount   = cars.filter(c => c.isAvailable).length
  const unavailCount = cars.filter(c => !c.isAvailable).length
  const bookedCount  = Object.keys(upcomingCountByCar).length

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Available',   value: availCount,   color: 'text-green-600 bg-green-50' },
          { label: 'Unavailable', value: unavailCount, color: 'text-red-600 bg-red-50' },
          { label: 'With Upcoming Bookings', value: bookedCount, color: 'text-amber-600 bg-amber-50' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${color.split(' ')[0]}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[['all','All Cars'],['available','Available'],['unavailable','Unavailable'],['featured','Featured']].map(([val, lbl]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              filter === val ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400'
            }`}>
            {lbl}
          </button>
        ))}
        <span className="text-xs text-gray-400 self-center ml-2">{filtered.length} cars</span>
      </div>

      {/* Car grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(car => {
          const upcoming = upcomingCountByCar[car._id] || 0
          return (
            <div key={car._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-36 bg-gray-100 relative">
                {car.images?.[0]?.url
                  ? <img src={car.images[0].url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl">🚗</div>}
                {/* Status overlay */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${car.isAvailable ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {car.isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                  {car.isFeatured && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                      Featured
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3">
                <p className="font-semibold text-gray-900 text-sm">{car.brand} {car.model}</p>
                <p className="text-xs text-gray-400 capitalize">{car.type} · {car.year} · {car.transmission}</p>
                <div className="flex items-center justify-between mt-2.5">
                  <p className="text-sm font-bold text-teal-600">₹{car.pricePerDay?.toLocaleString()}<span className="text-xs font-normal text-gray-400">/day</span></p>
                  {upcoming > 0 ? (
                    <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                      {upcoming} booking{upcoming !== 1 ? 's' : ''} ahead
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No upcoming</span>
                  )}
                </div>
                {car.location && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-1.5">
                    <MapPin className="w-3 h-3" /> {car.location.city || car.location.name}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-16 text-gray-400">No cars match this filter</div>
        )}
      </div>
    </div>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [toggling, setToggling] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getAllUsers({ page, search: search || undefined })
      .then(({ data }) => { setUsers(data.data.users); setPagination(data.data.pagination) })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const handleToggle = async (id) => {
    setToggling(id)
    try {
      const { data } = await toggleUserStatus(id)
      setUsers(prev => prev.map(u => u._id === id ? { ...u, isActive: data.data.isActive } : u))
      toast.success(data.message)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update user'))
    } finally {
      setToggling(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search name or email..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <span className="text-sm text-gray-500">{pagination.total ?? 0} users</span>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['User', 'Phone', 'Role', 'Joined', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs shrink-0">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role !== 'admin' && (
                      <button onClick={() => handleToggle(u._id)} disabled={toggling === u._id}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
                        {toggling === u._id ? <Spinner size="sm" /> : u.isActive
                          ? <ToggleRight className="w-4 h-4 text-green-600" />
                          : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination page={page} pages={pagination.pages} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────
function BookingsTab() {
  const [bookings, setBookings] = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [updating, setUpdating] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getAllBookings({ page, status: status || undefined, search: search || undefined })
      .then(({ data }) => { setBookings(data.data.bookings); setPagination(data.data.pagination) })
      .catch(() => toast.error('Failed to load bookings'))
      .finally(() => setLoading(false))
  }, [page, status, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const handleStatusChange = async (id, newStatus) => {
    setUpdating(id)
    try {
      await updateBookingStatus(id, { status: newStatus })
      setBookings(prev => prev.map(b => b._id === id ? { ...b, status: newStatus } : b))
      toast.success('Booking status updated')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update'))
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search booking# or customer..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <span className="text-sm text-gray-500">{pagination.total ?? 0} bookings</span>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Booking #', 'Customer', 'Car', 'Dates', 'Amount', 'Status', 'Update'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => (
                  <tr key={b._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.bookingNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{b.user?.name}</p>
                      <p className="text-xs text-gray-400">{b.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.car?.brand} {b.car?.model}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {fmtDate(b.pickupDate)}<br />{fmtDate(b.dropDate)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">₹{fmt(b.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[b.status] || ''}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {updating === b._id ? <Spinner size="sm" /> : (
                        <select value={b.status}
                          onChange={e => handleStatusChange(b._id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white">
                          {BOOKING_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} pages={pagination.pages} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reviews Tab ──────────────────────────────────────────────────────────────
function ReviewsTab() {
  const [reviews, setReviews] = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [acting, setActing] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getAdminReviews({ page, status: filter || undefined })
      .then(({ data }) => { setReviews(data.data.reviews); setPagination(data.data.pagination) })
      .catch(() => toast.error('Failed to load reviews'))
      .finally(() => setLoading(false))
  }, [page, filter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const handle = async (id, approved) => {
    setActing(id)
    try {
      await approveReview(id, { approved })
      setReviews(prev => prev.filter(r => r._id !== id))
      toast.success(approved ? 'Review approved' : 'Review rejected')
    } catch {
      toast.error('Failed to update review')
    } finally {
      setActing(null)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {['pending', 'approved', 'flagged', ''].map((f, i) => {
          const labels = ['Pending', 'Approved', 'Flagged', 'All']
          return (
            <button key={i} onClick={() => { setFilter(f); setPage(1) }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === f ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {labels[i]}
            </button>
          )
        })}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : reviews.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No reviews in this category.</div>
      ) : (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r._id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold shrink-0">
                      {r.user?.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{r.user?.name}</p>
                      <p className="text-xs text-gray-400">{r.car?.brand} {r.car?.model}</p>
                    </div>
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                  {r.title && <p className="text-sm font-medium text-gray-800 mb-1">{r.title}</p>}
                  <p className="text-sm text-gray-600">{r.comment}</p>
                  <p className="text-xs text-gray-400 mt-2">{fmtDate(r.createdAt)}</p>
                </div>
                {!r.isApproved && (
                  <div className="flex gap-2 shrink-0">
                    {acting === r._id ? <Spinner size="sm" /> : (
                      <>
                        <button onClick={() => handle(r._id, true)}
                          className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100">
                          <CheckCircle className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => handle(r._id, false)}
                          className="flex items-center gap-1 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                )}
                {r.isApproved && (
                  <span className="text-xs bg-green-50 text-green-700 font-medium px-2 py-1 rounded-full shrink-0">Approved</span>
                )}
              </div>
            </div>
          ))}
          <Pagination page={page} pages={pagination.pages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

// ─── Coupons Tab ──────────────────────────────────────────────────────────────
const EMPTY_COUPON = {
  code: '', description: '', type: 'percentage', value: '',
  minBookingAmount: '', maxDiscountAmount: '', usageLimit: '',
  startDate: '', endDate: '', perUserLimit: 1,
}

function CouponsTab() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_COUPON)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editingCoupon, setEditingCoupon] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_COUPON)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = () => {
    setLoading(true)
    getCoupons()
      .then(({ data }) => setCoupons(data.data.coupons))
      .catch(() => toast.error('Failed to load coupons'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const setF = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        value: Number(form.value),
        minBookingAmount: Number(form.minBookingAmount) || 0,
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perUserLimit: Number(form.perUserLimit),
      }
      await createCoupon(payload)
      toast.success('Coupon created!')
      setShowForm(false)
      setForm(EMPTY_COUPON)
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create coupon'))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (c) => {
    try {
      await updateCoupon(c._id, { isActive: !c.isActive })
      setCoupons(prev => prev.map(x => x._id === c._id ? { ...x, isActive: !x.isActive } : x))
      toast.success(`Coupon ${!c.isActive ? 'activated' : 'deactivated'}`)
    } catch {
      toast.error('Failed to update coupon')
    }
  }

  const handleDelete = async (id) => {
    setDeleteTarget(null)
    setDeleting(id)
    try {
      await deleteCoupon(id)
      setCoupons(prev => prev.filter(c => c._id !== id))
      toast.success('Coupon deleted')
    } catch {
      toast.error('Failed to delete coupon')
    } finally {
      setDeleting(null)
    }
  }

  const startEdit = (c) => {
    setEditingCoupon(c._id)
    setEditForm({
      code: c.code,
      description: c.description || '',
      type: c.type,
      value: c.value,
      minBookingAmount: c.minBookingAmount || 0,
      maxDiscountAmount: c.maxDiscountAmount || '',
      usageLimit: c.usageLimit || '',
      perUserLimit: c.perUserLimit || 1,
      startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '',
      endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
    })
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        description: editForm.description,
        value: Number(editForm.value),
        minBookingAmount: Number(editForm.minBookingAmount) || 0,
        maxDiscountAmount: editForm.maxDiscountAmount ? Number(editForm.maxDiscountAmount) : undefined,
        usageLimit: editForm.usageLimit ? Number(editForm.usageLimit) : undefined,
        perUserLimit: Number(editForm.perUserLimit),
        startDate: editForm.startDate,
        endDate: editForm.endDate,
      }
      await updateCoupon(editingCoupon, payload)
      toast.success('Coupon updated!')
      setEditingCoupon(null)
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update coupon'))
    } finally {
      setSaving(false)
    }
  }

  const setEF = (k) => (e) => setEditForm(p => ({ ...p, [k]: e.target.value }))

  const today = new Date().toISOString().split('T')[0]

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          message={`Delete coupon "${deleteTarget.code}"?`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget._id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm text-gray-500">{coupons.length} coupons</span>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-800">
          <Plus className="w-4 h-4" /> New Coupon
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">Create Coupon</h3>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_COUPON) }}>
              <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Code *</label>
              <input required value={form.code} onChange={setF('code')} placeholder="e.g. SUMMER20"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Description *</label>
              <input required value={form.description} onChange={setF('description')} placeholder="e.g. 20% off for summer"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Type *</label>
              <select value={form.type} onChange={setF('type')} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed (₹)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Value *</label>
              <input required type="number" min="1" value={form.value} onChange={setF('value')}
                placeholder={form.type === 'percentage' ? '20' : '500'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Min Booking Amount (₹)</label>
              <input type="number" min="0" value={form.minBookingAmount} onChange={setF('minBookingAmount')} placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {form.type === 'percentage' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Max Discount (₹)</label>
                <input type="number" min="0" value={form.maxDiscountAmount} onChange={setF('maxDiscountAmount')} placeholder="Optional"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Usage Limit</label>
              <input type="number" min="1" value={form.usageLimit} onChange={setF('usageLimit')} placeholder="Unlimited"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Per-user Limit</label>
              <input type="number" min="1" value={form.perUserLimit} onChange={setF('perUserLimit')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Start Date *</label>
              <input required type="date" min={today} value={form.startDate} onChange={setF('startDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">End Date *</label>
              <input required type="date" min={form.startDate || today} value={form.endDate} onChange={setF('endDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Creating...' : 'Create Coupon'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_COUPON) }}
                className="border border-gray-200 text-gray-700 text-sm font-medium px-6 py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit form */}
      {editingCoupon && (
        <div className="bg-white border border-blue-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">Edit Coupon — <span className="font-mono text-blue-700">{editForm.code}</span></h3>
            <button onClick={() => setEditingCoupon(null)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <form onSubmit={handleEditSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs font-medium text-gray-600 block mb-1">Description *</label>
              <input required value={editForm.description} onChange={setEF('description')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Value *</label>
              <input required type="number" min="1" value={editForm.value} onChange={setEF('value')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Min Booking (₹)</label>
              <input type="number" min="0" value={editForm.minBookingAmount} onChange={setEF('minBookingAmount')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Max Discount (₹)</label>
              <input type="number" min="0" value={editForm.maxDiscountAmount} onChange={setEF('maxDiscountAmount')} placeholder="No limit"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Usage Limit</label>
              <input type="number" min="1" value={editForm.usageLimit} onChange={setEF('usageLimit')} placeholder="Unlimited"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Per-user Limit</label>
              <input type="number" min="1" value={editForm.perUserLimit} onChange={setEF('perUserLimit')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Start Date *</label>
              <input required type="date" value={editForm.startDate} onChange={setEF('startDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">End Date *</label>
              <input required type="date" min={editForm.startDate} value={editForm.endDate} onChange={setEF('endDate')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditingCoupon(null)}
                className="border border-gray-200 text-gray-700 text-sm font-medium px-6 py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Code', 'Description', 'Discount', 'Min. Order', 'Usage', 'Valid Until', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No coupons yet</td></tr>
              ) : coupons.map(c => {
                const expired = new Date(c.endDate) < new Date()
                return (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{c.description}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.type === 'percentage' ? `${c.value}%` : `₹${fmt(c.value)}`}
                      {c.maxDiscountAmount && <span className="text-xs text-gray-400 ml-1">(max ₹{fmt(c.maxDiscountAmount)})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">₹{fmt(c.minBookingAmount)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.usageCount}/{c.usageLimit ?? '∞'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(c.endDate)}</td>
                    <td className="px-4 py-3">
                      {expired ? (
                        <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">Expired</span>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!expired && (
                          <button onClick={() => handleToggleActive(c)} title={c.isActive ? 'Deactivate' : 'Activate'}
                            className="text-gray-400 hover:text-gray-700">
                            {c.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        )}
                        <button onClick={() => startEdit(c)} title="Edit coupon"
                          className="text-gray-400 hover:text-blue-600">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(c)} disabled={deleting === c._id}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-40">
                          {deleting === c._id ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Cars Tab ─────────────────────────────────────────────────────────────────
const CAR_TYPES = ['sedan','suv','hatchback','coupe','convertible','van','truck','luxury','electric','hybrid']
const TRANSMISSIONS = ['automatic','manual']
const FUEL_TYPES = ['petrol','diesel','electric','hybrid','cng']

const CAR_BLANK = { brand:'', model:'', year: new Date().getFullYear(), type:'sedan', transmission:'automatic', fuelType:'petrol', seats:5, pricePerDay:'', securityDeposit:'', description:'', imageUrl:'', location:'', isAvailable:true, isFeatured:false }

function CarsTab() {
  const [cars, setCars]         = useState([])
  const [locs, setLocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | 'create' | car object
  const [form, setForm]         = useState(CAR_BLANK)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [imageFile, setImageFile]   = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const imgInputRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([getAdminCars(), getLocations()])
      .then(([cRes, lRes]) => {
        setCars(cRes.data.data.cars)
        setLocs(lRes.data.data.locations)
      })
      .catch(() => toast.error('Failed to load cars'))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const resetImageState = () => { setImageFile(null); setImagePreview(null) }

  const openCreate = () => { setForm(CAR_BLANK); resetImageState(); setModal('create') }
  const openEdit   = (car) => {
    setForm({
      brand: car.brand, model: car.model, year: car.year, type: car.type,
      transmission: car.transmission, fuelType: car.fuelType, seats: car.seats,
      pricePerDay: car.pricePerDay, securityDeposit: car.securityDeposit || '',
      description: car.description || '', imageUrl: car.images?.[0]?.url || '',
      location: car.location?._id || '', isAvailable: car.isAvailable, isFeatured: car.isFeatured,
    })
    resetImageState()
    setModal(car)
  }

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type))
      return toast.error('Only JPEG, PNG, or WebP images allowed')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: `${form.brand} ${form.model}`,
        year: Number(form.year),
        seats: Number(form.seats),
        pricePerDay: Number(form.pricePerDay),
        securityDeposit: Number(form.securityDeposit) || 0,
        images: form.imageUrl ? [{ url: form.imageUrl, isPrimary: true }] : [],
        location: form.location || undefined,
      }
      delete payload.imageUrl

      let carId
      if (modal === 'create') {
        const { data } = await createAdminCar(payload)
        carId = data.data.car._id
      } else {
        await updateAdminCar(modal._id, payload)
        carId = modal._id
      }

      if (imageFile && carId) {
        const fd = new FormData()
        fd.append('images', imageFile)
        await uploadAdminCarImages(carId, fd)
      }

      toast.success(modal === 'create' ? 'Car created' : 'Car updated')
      setModal(null)
      load()
    } catch (err) { toast.error(getErrorMessage(err, 'Failed to save')) }
    finally { setSaving(false) }
  }

  const [deleteTarget, setDeleteTarget] = useState(null)

  const handleDelete = async (id) => {
    setDeleteTarget(null)
    try { await deleteAdminCar(id); toast.success('Car deleted'); load() }
    catch (err) { toast.error(getErrorMessage(err, 'Failed to delete')) }
  }

  const filtered = cars.filter(c =>
    !search || `${c.brand} ${c.model}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          message={`Delete "${deleteTarget.brand} ${deleteTarget.model}"?`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget._id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cars..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Car
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['Car','Type','Price/Day','Location','Status','Actions'].map(h =>
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(car => (
                <tr key={car._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-gray-100 rounded overflow-hidden shrink-0">
                        {car.images?.[0]?.url
                          ? <img src={car.images[0].url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-base">🚗</div>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{car.brand} {car.model}</p>
                        <p className="text-xs text-gray-400">{car.year} · {car.transmission}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">{car.type}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{fmt(car.pricePerDay)}</td>
                  <td className="px-4 py-3 text-gray-600">{car.location?.city || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${car.isAvailable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {car.isAvailable ? 'Available' : 'Unavailable'}
                      </span>
                      {car.isFeatured && <span className="text-xs font-medium px-2 py-0.5 rounded-full w-fit bg-amber-50 text-amber-700">Featured</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(car)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(car)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No cars found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Car Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{modal === 'create' ? 'Add New Car' : 'Edit Car'}</h2>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[['Brand','brand'],['Model','model']].map(([label, key]) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
                    <input required value={form[key]} onChange={e => setForm(p => ({...p,[key]:e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Year</label>
                  <input type="number" required value={form.year} onChange={e => setForm(p => ({...p,year:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Seats</label>
                  <input type="number" required value={form.seats} onChange={e => setForm(p => ({...p,seats:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Price/Day (₹)</label>
                  <input type="number" required value={form.pricePerDay} onChange={e => setForm(p => ({...p,pricePerDay:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({...p,type:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:border-teal-400">
                    {CAR_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Transmission</label>
                  <select value={form.transmission} onChange={e => setForm(p => ({...p,transmission:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:border-teal-400">
                    {TRANSMISSIONS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Fuel Type</label>
                  <select value={form.fuelType} onChange={e => setForm(p => ({...p,fuelType:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:border-teal-400">
                    {FUEL_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Location</label>
                  <select value={form.location} onChange={e => setForm(p => ({...p,location:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white focus:border-teal-400">
                    <option value="">— No location —</option>
                    {locs.map(l => <option key={l._id} value={l._id}>{l.name}, {l.city}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Security Deposit (₹)</label>
                  <input type="number" value={form.securityDeposit} onChange={e => setForm(p => ({...p,securityDeposit:e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Car Image</label>
                <input ref={imgInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden" onChange={handleImageFileChange} />
                {imagePreview ? (
                  <div className="relative mb-2 w-full h-36 rounded-lg overflow-hidden border border-gray-200">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button type="button"
                      onClick={() => { resetImageState(); if (imgInputRef.current) imgInputRef.current.value = '' }}
                      className="absolute top-2 right-2 bg-black/60 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/80">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button type="button" onClick={() => imgInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border border-gray-200 rounded-lg hover:border-teal-400 hover:text-teal-600 transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Upload file
                  </button>
                  <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-teal-400 transition-colors">
                    <LinkIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input value={form.imageUrl} onChange={e => setForm(p => ({...p,imageUrl:e.target.value}))}
                      placeholder="Or paste image URL..." className="flex-1 text-xs outline-none text-gray-700 bg-transparent" />
                  </div>
                </div>
                {imageFile && <p className="text-xs text-teal-600 mt-1">File selected: {imageFile.name}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 resize-none" />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(p => ({...p,isAvailable:e.target.checked}))} className="rounded" />
                  Available
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({...p,isFeatured:e.target.checked}))} className="rounded" />
                  Featured
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
                  {saving ? 'Saving...' : modal === 'create' ? 'Create Car' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Locations Tab ────────────────────────────────────────────────────────────
const LOC_BLANK = { name:'', city:'', state:'', address:'', phone:'', email:'', isActive:true, isPickupAvailable:true, isDropAvailable:true }

function LocationsTab() {
  const [locs, setLocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [form, setForm]         = useState(LOC_BLANK)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAdminLocations()
      .then(r => setLocs(r.data.data.locations))
      .catch(() => toast.error('Failed to load locations'))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setForm(LOC_BLANK); setModal('create') }
  const openEdit   = (loc) => {
    setForm({ name: loc.name, city: loc.city, state: loc.state, address: loc.address,
      phone: loc.phone||'', email: loc.email||'', isActive: loc.isActive,
      isPickupAvailable: loc.isPickupAvailable, isDropAvailable: loc.isDropAvailable })
    setModal(loc)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'create') await createAdminLocation({ ...form, country: 'India' })
      else await updateAdminLocation(modal._id, form)
      toast.success(modal === 'create' ? 'Location created' : 'Location updated')
      setModal(null); load()
    } catch (err) { toast.error(getErrorMessage(err, 'Failed to save')) }
    finally { setSaving(false) }
  }

  const [deleteTarget, setDeleteTarget] = useState(null)

  const handleDelete = async (loc) => {
    setDeleteTarget(null)
    try { await deleteAdminLocation(loc._id); toast.success('Location deactivated'); load() }
    catch (err) { toast.error(getErrorMessage(err, 'Failed')) }
  }

  const field = (label, key, type='text', required=false) => (
    <div key={key}>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input required={required} type={type} value={form[key]}
        onChange={e => setForm(p => ({...p,[key]:e.target.value}))}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
    </div>
  )

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          message={`Deactivate "${deleteTarget.name}"?`}
          confirmLabel="Deactivate"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex justify-end mb-4">
        <button onClick={openCreate}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Location
        </button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['Name','City / State','Contact','Pickup/Drop','Status','Actions'].map(h =>
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locs.map(loc => (
                <tr key={loc._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{loc.name}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">{loc.address}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{loc.city}, {loc.state}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {loc.phone && <p>{loc.phone}</p>}
                    {loc.email && <p>{loc.email}</p>}
                    {!loc.phone && !loc.email && '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${loc.isPickupAvailable ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {loc.isPickupAvailable ? '✓ Pickup' : '✗ Pickup'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${loc.isDropAvailable ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {loc.isDropAvailable ? '✓ Drop' : '✗ Drop'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${loc.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {loc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(loc)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(loc)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {locs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No locations found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{modal === 'create' ? 'Add Location' : 'Edit Location'}</h2>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {field('Location Name', 'name', 'text', true)}
              <div className="grid grid-cols-2 gap-4">
                {field('City', 'city', 'text', true)}
                {field('State', 'state', 'text', true)}
              </div>
              {field('Address', 'address', 'text', true)}
              <div className="grid grid-cols-2 gap-4">
                {field('Phone', 'phone')}
                {field('Email', 'email', 'email')}
              </div>
              <div className="flex items-center gap-6 pt-1">
                {[['isActive','Active'],['isPickupAvailable','Pickup Available'],['isDropAvailable','Drop Available']].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form[key]} onChange={e => setForm(p => ({...p,[key]:e.target.checked}))} className="rounded" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
                  {saving ? 'Saving...' : modal === 'create' ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────
const PAY_STATUS_COLOR = {
  succeeded: 'bg-green-50 text-green-700',
  pending:   'bg-amber-50 text-amber-700',
  failed:    'bg-red-50 text-red-700',
  refunded:  'bg-blue-50 text-blue-700',
}

function PaymentsTab() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [total, setTotal]       = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [refunding, setRefunding] = useState(null)
  const [refundTarget, setRefundTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getAdminPayments({ limit: 50 })
      .then(r => {
        const data = r.data.data
        setPayments(data.payments || [])
        setTotal(data.pagination?.total || 0)
        setTotalRevenue(data.totalRevenue || 0)
      })
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefund = async (payment) => {
    setRefundTarget(null)
    setRefunding(payment._id)
    try {
      const { data } = await refundPayment({ bookingId: payment.booking?._id, reason: 'Admin initiated refund' })
      toast.success(`Refund of ₹${fmt(data.data?.refundAmount)} processed`)
      load()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Refund failed'))
    } finally {
      setRefunding(null)
    }
  }

  return (
    <div>
      {refundTarget && (
        <ConfirmModal
          message={`Issue refund for booking #${refundTarget.booking?.bookingNumber || ''}? This cannot be undone.`}
          confirmLabel="Issue refund"
          onConfirm={() => handleRefund(refundTarget)}
          onCancel={() => setRefundTarget(null)}
        />
      )}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Transactions', value: total, color: 'text-gray-900' },
          { label: 'Total Revenue',      value: `₹${fmt(totalRevenue)}`, color: 'text-teal-600' },
          { label: 'Succeeded',          value: payments.filter(p => p.status === 'succeeded').length, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['Date','Booking','User','Car','Amount','Status','Action'].map(h =>
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => (
                <tr key={p._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700">
                      {p.booking?.bookingNumber || p.booking?._id?.slice(-8).toUpperCase() || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.user?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.booking?.car ? `${p.booking.car.brand} ${p.booking.car.model}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900">₹{fmt(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PAY_STATUS_COLOR[p.status] || 'bg-gray-50 text-gray-700'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'succeeded' && (
                      <button
                        onClick={() => setRefundTarget(p)}
                        disabled={refunding === p._id}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {refunding === p._id ? 'Refunding…' : 'Refund'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No payments found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'cars',        label: 'Cars',         icon: Car },
  { id: 'locations',   label: 'Locations',    icon: MapPin },
  { id: 'availability',label: 'Availability', icon: Calendar },
  { id: 'users',       label: 'Users',        icon: Users },
  { id: 'bookings',    label: 'Bookings',     icon: CalendarCheck },
  { id: 'payments',    label: 'Payments',     icon: CreditCard },
  { id: 'reviews',     label: 'Reviews',      icon: Star },
  { id: 'coupons',     label: 'Coupons',      icon: Tag },
]

export default function Admin() {
  const [tab, setTab] = useState('dashboard')
  const active = TABS.find(t => t.id === tab)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-52 shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl p-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1">Admin Panel</p>
            <nav className="space-y-0.5">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${tab === id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-5">
            {active && <active.icon className="w-5 h-5 text-gray-400" />}
            <h1 className="text-xl font-bold text-gray-900">{active?.label}</h1>
          </div>
          {tab === 'dashboard'    && <DashboardTab />}
          {tab === 'cars'         && <CarsTab />}
          {tab === 'locations'    && <LocationsTab />}
          {tab === 'availability' && <AvailabilityTab />}
          {tab === 'users'        && <UsersTab />}
          {tab === 'bookings'     && <BookingsTab />}
          {tab === 'payments'     && <PaymentsTab />}
          {tab === 'reviews'      && <ReviewsTab />}
          {tab === 'coupons'      && <CouponsTab />}
        </main>
      </div>
    </div>
  )
}

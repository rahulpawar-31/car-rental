import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getBookingById } from '../api/bookings'
import { cancelBooking } from '../api/bookings'
import { getErrorMessage } from '../api/errors'
import Spinner from '../components/ui/Spinner'
import ConfirmModal from '../components/ui/ConfirmModal'
import { toast } from 'sonner'
import {
  ChevronLeft, Calendar, MapPin, Car, CreditCard,
  CheckCircle, XCircle, Clock, Tag,
} from 'lucide-react'

const STATUS_COLOR = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  active:    'bg-green-50 text-green-700 border-green-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
  'no-show': 'bg-orange-50 text-orange-700 border-orange-200',
}

const STATUS_ICON = {
  pending:   Clock,
  confirmed: CheckCircle,
  active:    Car,
  completed: CheckCircle,
  cancelled: XCircle,
  'no-show': XCircle,
}

const fmt = (n) => (n ?? 0).toLocaleString('en-IN')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    getBookingById(id)
      .then(({ data }) => setBooking(data.data.booking))
      .catch(() => { toast.error('Booking not found'); navigate('/dashboard') })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleCancel = async () => {
    setShowCancelConfirm(false)
    setCancelling(true)
    try {
      const { data } = await cancelBooking(id)
      setBooking(prev => ({ ...prev, status: 'cancelled' }))
      toast.success(data.data.message || 'Booking cancelled')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to cancel booking'))
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  if (!booking) return null

  const car = booking.car
  const StatusIcon = STATUS_ICON[booking.status] || Clock
  const canCancel = ['pending', 'confirmed'].includes(booking.status)
  const canPay = booking.status === 'pending' && booking.paymentStatus === 'pending'

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {showCancelConfirm && (
        <ConfirmModal
          message="Cancel this booking? This cannot be undone."
          confirmLabel="Yes, cancel"
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Booking Number</p>
            <p className="font-mono font-bold text-gray-900 text-lg">{booking.bookingNumber}</p>
            <p className="text-xs text-gray-400 mt-1">Booked on {fmtDate(booking.createdAt)}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border capitalize ${STATUS_COLOR[booking.status] || ''}`}>
            <StatusIcon className="w-4 h-4" />
            {booking.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Car info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" /> Vehicle
          </h2>
          {car && (
            <div className="flex gap-4">
              <div className="w-20 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {car.images?.[0] ? (
                  <img src={car.images[0].url} alt="" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full flex items-center justify-center text-2xl">🚗</div>}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{car.brand} {car.model}</p>
                <p className="text-sm text-gray-500 capitalize">{car.type} · {car.year}</p>
                <Link to={`/cars/${car._id}`} className="text-xs text-blue-700 hover:underline mt-1 inline-block">
                  View car details
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" /> Rental Period
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Pickup</span>
              <span className="font-medium text-gray-900">{fmtDate(booking.pickupDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Return</span>
              <span className="font-medium text-gray-900">{fmtDate(booking.dropDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Duration</span>
              <span className="font-medium text-gray-900">{booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> Locations
          </h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Pickup</p>
              <p className="font-medium text-gray-900">{booking.pickupLocation?.name}</p>
              <p className="text-xs text-gray-500">{booking.pickupLocation?.city}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Drop-off</p>
              <p className="font-medium text-gray-900">{booking.dropLocation?.name}</p>
              <p className="text-xs text-gray-500">{booking.dropLocation?.city}</p>
            </div>
          </div>
        </div>

        {/* Payment summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" /> Payment
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>₹{fmt(booking.pricePerDay)} × {booking.totalDays} days</span>
              <span>₹{fmt(booking.baseAmount)}</span>
            </div>
            {booking.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Coupon discount</span>
                <span>− ₹{fmt(booking.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>GST (18%)</span>
              <span>₹{fmt(booking.taxAmount)}</span>
            </div>
            {booking.securityDeposit > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Security deposit</span>
                <span>₹{fmt(booking.securityDeposit)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>₹{fmt(booking.totalAmount)}</span>
            </div>
            <div className="pt-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                booking.paymentStatus === 'paid' ? 'bg-green-50 text-green-700' :
                booking.paymentStatus === 'refunded' ? 'bg-blue-50 text-blue-700' :
                'bg-amber-50 text-amber-700'}`}>
                Payment: {booking.paymentStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {booking.notes && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mt-5">
          <h2 className="font-semibold text-gray-900 mb-2">Special Requests</h2>
          <p className="text-sm text-gray-600">{booking.notes}</p>
        </div>
      )}

      {/* Cancellation info */}
      {booking.status === 'cancelled' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mt-5">
          <h2 className="font-semibold text-red-700 mb-2">Cancellation Details</h2>
          <div className="text-sm space-y-1 text-red-600">
            {booking.cancellationReason && <p>Reason: {booking.cancellationReason}</p>}
            {booking.cancelledAt && <p>Cancelled on: {fmtDate(booking.cancelledAt)}</p>}
            {booking.refundAmount > 0
              ? <p className="font-medium">Refund: ₹{fmt(booking.refundAmount)} will be processed in 5–7 business days.</p>
              : <p>No refund applicable.</p>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        {canPay && (
          <Link
            to={`/payment/${booking._id}`}
            className="bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-blue-800 transition-colors"
          >
            Complete Payment
          </Link>
        )}
        {canCancel && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={cancelling}
            className="border border-red-200 text-red-600 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Booking'}
          </button>
        )}
        <Link to="/cars" className="border border-gray-200 text-gray-700 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
          Book Another Car
        </Link>
      </div>
    </div>
  )
}

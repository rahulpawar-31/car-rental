import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Car, Clock, CheckCircle, XCircle, Star, X, CalendarClock } from 'lucide-react'
import { getMyBookings, cancelBooking, rescheduleBooking } from '../api/bookings'
import { createReview } from '../api/reviews'
import { getErrorMessage } from '../api/errors'
import useAuthStore from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import ConfirmModal from '../components/ui/ConfirmModal'
import { toast } from 'sonner'

const STATUS_STYLES = {
  pending:   { color: 'text-amber-600 bg-amber-50',  icon: Clock },
  confirmed: { color: 'text-blue-600 bg-blue-50',    icon: CheckCircle },
  active:    { color: 'text-green-600 bg-green-50',  icon: Car },
  completed: { color: 'text-gray-600 bg-gray-100',   icon: CheckCircle },
  cancelled: { color: 'text-red-600 bg-red-50',      icon: XCircle },
}

function ReviewModal({ booking, onClose, onSubmitted }) {
  const [rating, setRating]     = useState(0)
  const [hover, setHover]       = useState(0)
  const [comment, setComment]   = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (rating === 0) return toast.error('Please select a star rating')
    setSubmitting(true)
    try {
      await createReview({
        carId:     booking.car._id,
        bookingId: booking._id,
        rating,
        comment,
      })
      toast.success('Review submitted! It will appear after approval.')
      onSubmitted(booking._id)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to submit review'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Write a Review</h2>
            <p className="text-xs text-gray-500 mt-0.5">{booking.car?.brand} {booking.car?.model}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Star rating */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Your Rating <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hover || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Your Review
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder="Share your experience with this vehicle..."
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 outline-none focus:border-teal-400 transition-colors resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting || rating === 0}
              className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RescheduleModal({ booking, onClose, onRescheduled }) {
  const today = new Date().toISOString().split('T')[0]
  const [pickupDate, setPickupDate] = useState(
    booking.pickupDate ? new Date(booking.pickupDate).toISOString().split('T')[0] : today
  )
  const [dropDate, setDropDate] = useState(
    booking.dropDate ? new Date(booking.dropDate).toISOString().split('T')[0] : today
  )
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pickupDate >= dropDate) return toast.error('Drop date must be after pickup date')
    if (pickupDate < today) return toast.error('Pickup date cannot be in the past')
    setSubmitting(true)
    try {
      const { data } = await rescheduleBooking(booking._id, { pickupDate, dropDate })
      toast.success('Booking rescheduled!')
      onRescheduled(data.data.booking)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reschedule booking'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Reschedule Booking</h2>
            <p className="text-xs text-gray-500 mt-0.5">{booking.car?.brand} {booking.car?.model}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              New Pickup Date <span className="text-red-400">*</span>
            </label>
            <input type="date" min={today} value={pickupDate} onChange={e => setPickupDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 outline-none focus:border-teal-400 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              New Drop-off Date <span className="text-red-400">*</span>
            </label>
            <input type="date" min={pickupDate || today} value={dropDate} onChange={e => setDropDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 outline-none focus:border-teal-400 transition-colors" />
          </div>
          {pickupDate && dropDate && dropDate > pickupDate && (
            <p className="text-xs text-teal-600 bg-teal-50 rounded-lg px-3 py-2">
              Duration: {Math.ceil((new Date(dropDate) - new Date(pickupDate)) / (24*60*60*1000))} day(s)
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
              {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [bookings, setBookings]               = useState([])
  const [loading, setLoading]                 = useState(true)
  const [reviewBooking, setReviewBooking]     = useState(null)
  const [rescheduleBookingItem, setRescheduleBookingItem] = useState(null)
  const [cancelConfirmId, setCancelConfirmId] = useState(null)

  useEffect(() => {
    getMyBookings()
      .then(({ data }) => setBookings(data.data.bookings || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCancelConfirmed = async () => {
    const id = cancelConfirmId
    setCancelConfirmId(null)
    try {
      await cancelBooking(id)
      setBookings(prev => prev.map(b => b._id === id ? { ...b, status: 'cancelled' } : b))
      toast.success('Booking cancelled')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to cancel booking'))
    }
  }

  const handleReviewSubmitted = (bookingId) => {
    setBookings(prev => prev.map(b => b._id === bookingId ? { ...b, isReviewed: true } : b))
  }

  const handleRescheduled = (updatedBooking) => {
    setBookings(prev => prev.map(b => b._id === updatedBooking._id ? { ...b, ...updatedBooking } : b))
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {cancelConfirmId && (
        <ConfirmModal
          message="Cancel this booking? This cannot be undone."
          confirmLabel="Yes, cancel"
          onConfirm={handleCancelConfirmed}
          onCancel={() => setCancelConfirmId(null)}
        />
      )}
      {reviewBooking && (
        <ReviewModal
          booking={reviewBooking}
          onClose={() => setReviewBooking(null)}
          onSubmitted={handleReviewSubmitted}
        />
      )}
      {rescheduleBookingItem && (
        <RescheduleModal
          booking={rescheduleBookingItem}
          onClose={() => setRescheduleBookingItem(null)}
          onRescheduled={handleRescheduled}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back, {user?.name?.split(' ')[0]}</p>
        </div>
        <Link
          to="/cars"
          className="bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          Book a car
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Bookings', value: bookings.length,                                       icon: Calendar,     color: 'text-blue-600 bg-blue-50' },
          { label: 'Active',         value: bookings.filter(b => b.status === 'active').length,    icon: Car,          color: 'text-green-600 bg-green-50' },
          { label: 'Completed',      value: bookings.filter(b => b.status === 'completed').length, icon: CheckCircle,  color: 'text-teal-600 bg-teal-50' },
          { label: 'Cancelled',      value: bookings.filter(b => b.status === 'cancelled').length, icon: XCircle,      color: 'text-red-600 bg-red-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Bookings */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">My Bookings</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No bookings yet</h3>
            <p className="text-sm text-gray-500 mb-4">Ready to hit the road?</p>
            <Link to="/cars" className="text-sm text-teal-600 underline">Browse cars</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {bookings.map(booking => {
              const statusStyle = STATUS_STYLES[booking.status] || STATUS_STYLES.pending
              const StatusIcon  = statusStyle.icon
              const car         = booking.car
              const canReview   = booking.status === 'completed' && !booking.isReviewed

              return (
                <div key={booking._id} className="p-5 flex items-center gap-4">
                  {/* Car image */}
                  <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                    {car?.images?.[0] ? (
                      <img src={car.images[0].url} alt="" className="w-full h-full object-cover" />
                    ) : <div className="w-full h-full flex items-center justify-center text-xl">🚗</div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {car?.brand} {car?.model}
                      </p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {booking.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(booking.pickupDate).toLocaleDateString()} — {new Date(booking.dropDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Amount + actions */}
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900 text-sm">₹{booking.totalAmount?.toLocaleString()}</p>
                    <div className="flex gap-2 mt-1 justify-end flex-wrap">
                      <Link to={`/bookings/${booking._id}`} className="text-xs text-teal-600 hover:underline">
                        Details
                      </Link>
                      {canReview && (
                        <button
                          onClick={() => setReviewBooking(booking)}
                          className="text-xs text-amber-600 hover:underline flex items-center gap-0.5"
                        >
                          <Star className="w-3 h-3" /> Review
                        </button>
                      )}
                      {booking.isReviewed && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-300 text-amber-300" /> Reviewed
                        </span>
                      )}
                      {['pending', 'confirmed'].includes(booking.status) && (
                        <>
                          <button
                            onClick={() => setRescheduleBookingItem(booking)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                          >
                            <CalendarClock className="w-3 h-3" /> Reschedule
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(booking._id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

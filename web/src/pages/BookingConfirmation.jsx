import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, Calendar, MapPin, Car, CreditCard, ArrowRight } from 'lucide-react'
import { getBookingById } from '../api/bookings'
import Spinner from '../components/ui/Spinner'

const fmtDate = d =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
const fmt = n => (n ?? 0).toLocaleString('en-IN')

export default function BookingConfirmation() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBookingById(bookingId)
      .then(({ data }) => setBooking(data.data.booking))
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [bookingId, navigate])

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    )
  if (!booking) return null

  const car = booking.car

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Success banner */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-teal-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
        <p className="text-gray-500">
          Your booking has been confirmed and payment received. We&apos;ll send details to your
          email.
        </p>
        <div className="inline-block mt-3 px-4 py-1.5 bg-gray-100 rounded-full">
          <span className="text-xs text-gray-500 font-medium">Booking No: </span>
          <span className="text-sm font-bold font-mono text-gray-900">{booking.bookingNumber}</span>
        </div>
      </div>

      {/* Booking details card */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
        {/* Car */}
        <div className="flex items-center gap-4 p-5 border-b border-gray-100">
          <div className="w-20 h-14 bg-gray-100 rounded-lg overflow-hidden shrink-0">
            {car?.images?.[0]?.url ? (
              <img src={car.images[0].url} alt="" className="w-full h-full object-cover object-bottom" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">🚗</div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900">
              {car?.brand} {car?.model}
            </p>
            <p className="text-sm text-gray-500 capitalize">
              {car?.type} · {car?.year}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Total Paid</p>
            <p className="text-xl font-bold text-teal-600">₹{fmt(booking.totalAmount)}</p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-gray-50">
          <div className="flex items-start gap-3 px-5 py-4">
            <Calendar className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-0.5">Rental Period</p>
              <p className="text-sm font-semibold text-gray-900">
                {fmtDate(booking.pickupDate)} → {fmtDate(booking.dropDate)}
              </p>
              <p className="text-xs text-gray-500">
                {booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-5 py-4">
            <MapPin className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-0.5">Pickup Location</p>
              <p className="text-sm font-semibold text-gray-900">{booking.pickupLocation?.name}</p>
              <p className="text-xs text-gray-500">{booking.pickupLocation?.city}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-5 py-4">
            <CreditCard className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-0.5">Payment Breakdown</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>
                    ₹{fmt(booking.pricePerDay)} × {booking.totalDays} days
                  </span>
                  <span>₹{fmt(booking.baseAmount)}</span>
                </div>
                {booking.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon discount</span>
                    <span>−₹{fmt(booking.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>GST (18%)</span>
                  <span>₹{fmt(booking.taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span>₹{fmt(booking.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What's next */}
      <div className="bg-teal-50 border border-teal-100 rounded-2xl p-5 mb-8">
        <h3 className="font-semibold text-teal-800 mb-3 flex items-center gap-2">
          <Car className="w-4 h-4" /> What happens next?
        </h3>
        <ol className="space-y-2 text-sm text-teal-700">
          <li className="flex items-start gap-2">
            <span className="font-bold shrink-0">1.</span> You&apos;ll receive a confirmation email
            with your booking details.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold shrink-0">2.</span> Bring a valid driver&apos;s licence and
            ID proof to the pickup location.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold shrink-0">3.</span> Arrive at the pickup point on your
            scheduled date and time.
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold shrink-0">4.</span> The security deposit will be collected at
            the time of pickup.
          </li>
        </ol>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/dashboard"
          className="flex-1 text-center bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
        >
          View My Bookings <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to={`/bookings/${booking._id}`}
          className="flex-1 text-center border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-lg transition-colors text-sm"
        >
          Booking Details
        </Link>
        <Link
          to="/cars"
          className="flex-1 text-center border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-lg transition-colors text-sm"
        >
          Browse More Cars
        </Link>
      </div>
    </div>
  )
}

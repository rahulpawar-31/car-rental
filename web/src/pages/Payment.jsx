import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getBookingById } from '../api/bookings'
import { createPaymentIntent, confirmPayment } from '../api/payments'
import { getErrorMessage } from '../api/errors'
import useAuthStore from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import { toast } from 'sonner'
import { Shield, Calendar, Car, CreditCard, Smartphone, Building2 } from 'lucide-react'

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-sdk')) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.id = 'razorpay-sdk'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

function CheckoutForm({ booking, bookingId }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [processing, setProcessing] = useState(false)

  const handlePay = useCallback(async () => {
    setProcessing(true)
    try {
      const loaded = await loadRazorpayScript()
      if (!loaded) throw new Error('Failed to load Razorpay SDK')

      const { data: orderData } = await createPaymentIntent({ bookingId })
      const { orderId, amount, currency, key } = orderData.data

      await new Promise((resolve, reject) => {
        const options = {
          key,
          amount,
          currency,
          name: 'DriveEase',
          description: `Booking #${booking.bookingNumber}`,
          order_id: orderId,
          prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || '',
          },
          theme: { color: '#14b8a6' },
          handler: async (response) => {
            try {
              await confirmPayment({
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
                bookingId,
              })
              toast.success('Payment successful!')
              navigate(`/booking-confirmation/${bookingId}`)
              resolve()
            } catch (err) {
              reject(err)
            }
          },
          modal: {
            ondismiss: () => reject(new Error('dismissed')),
          },
        }

        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', (response) => {
          reject(new Error(response.error?.description || 'Payment failed'))
        })
        rzp.open()
      })
    } catch (err) {
      if (err.message !== 'dismissed') {
        toast.error(getErrorMessage(err, err.message || 'Payment failed. Please try again.'))
      }
    } finally {
      setProcessing(false)
    }
  }, [booking, bookingId, navigate])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Shield className="w-4 h-4 text-teal-500" /> Secure Payment
      </h2>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: CreditCard, label: 'Cards' },
          { icon: Smartphone, label: 'UPI' },
          { icon: Building2, label: 'Net Banking' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 border border-gray-100 rounded-lg py-3 text-gray-500">
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={handlePay}
        disabled={processing}
        className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {processing ? (
          <><Spinner size="sm" /> Opening payment...</>
        ) : (
          <>Pay ₹{booking?.totalAmount?.toLocaleString('en-IN')} with Razorpay</>
        )}
      </button>

      <p className="text-center text-xs text-gray-400 mt-4">
        Secured by Razorpay · 256-bit SSL encryption
      </p>
    </div>
  )
}

export default function Payment() {
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

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="max-w-lg mx-auto px-4 sm:px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Complete Payment</h1>

        {booking && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Car className="w-4 h-4 text-teal-500" /> Booking Summary
            </h2>
            <div className="flex gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="w-16 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                {booking.car?.images?.[0]?.url
                  ? <img src={booking.car.images[0].url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xl">🚗</div>}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{booking.car?.brand} {booking.car?.model}</p>
                <p className="text-xs text-gray-400 mt-0.5">#{booking.bookingNumber}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Pickup</span>
                <span className="font-medium text-gray-800">
                  {new Date(booking.pickupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Drop</span>
                <span className="font-medium text-gray-800">
                  {new Date(booking.dropDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {booking.discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>− ₹{booking.discountAmount?.toLocaleString('en-IN')}</span>
                </div>
              )}
              {booking.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>GST (18%)</span>
                  <span>₹{booking.taxAmount?.toLocaleString('en-IN')}</span>
                </div>
              )}
              {booking.securityDeposit > 0 && (
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>Security deposit (refundable)</span>
                  <span>₹{booking.securityDeposit?.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100 text-base">
                <span>Total Amount</span>
                <span className="text-teal-600">₹{booking.totalAmount?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        )}

        {booking && <CheckoutForm booking={booking} bookingId={bookingId} />}
      </div>
    </div>
  )
}

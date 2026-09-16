import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { Calendar, Clock, User, Mail, Phone, Shield, Tag, ChevronRight, Plane, MapPin } from 'lucide-react'
import { getCarById } from '../api/cars'
import { createBooking, applyCoupon } from '../api/bookings'
import { getErrorMessage } from '../api/errors'
import { getLocations } from '../api/locations'
import useAuthStore from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import { toast } from 'sonner'
import { TIME_SLOTS, HOUR_OPTIONS } from '../constants/booking'
import { deriveRentalRates, computeBaseAmount, computeTaxAndTotal } from '../lib/pricing'

const RENTAL_LABELS = { day: 'Per Day', hour: 'Per Hour', airport: 'Airport Transfer' }

export default function Booking() {
  const { carId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const state = location.state || {}
  const rentalType = state.rentalType || 'day'
  const isRequestMode = state.mode === 'request'

  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')

  const [pickupDate, setPickupDate] = useState(state.pickupDate || '')
  const [pickupTime, setPickupTime] = useState('9:00 AM')
  const [dropDate, setDropDate] = useState(state.dropDate || '')
  const [dropTime, setDropTime] = useState('9:00 AM')
  const [hours, setHours] = useState(2)
  const [notes, setNotes] = useState('')
  const [coupon, setCoupon] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [couponApplied, setCouponApplied] = useState(false)
  const [pickupLocation, setPickupLocation] = useState(state.pickupLocation?._id || '')
  const [dropLocation, setDropLocation] = useState(state.dropLocation?._id || '')
  const [customPickupAddr, setCustomPickupAddr] = useState('')
  const [customDropAddr, setCustomDropAddr] = useState('')
  const [locations, setLocations] = useState([])

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    getCarById(carId)
      .then(res => setCar(res.data.data.car))
      .catch(() => navigate('/cars'))
      .finally(() => setLoading(false))
    getLocations().then(res => setLocations(res.data.data.locations || [])).catch(() => toast.error('Could not load branch locations'))
  }, [carId, navigate])

  // Pricing per rental type
  const rates = deriveRentalRates(car)
  const { pricePerDay, pricePerHour, airportPrice } = rates

  const days = (() => {
    if (rentalType !== 'day' || !pickupDate || !dropDate) return 0
    return Math.max(0, Math.ceil((new Date(dropDate) - new Date(pickupDate)) / 86400000))
  })()

  const baseAmount = computeBaseAmount(rates, { rentalType, days, hours })

  const isReady = (() => {
    if (rentalType === 'day')     return days > 0
    if (rentalType === 'hour')    return !!pickupDate
    if (rentalType === 'airport') return !!pickupDate
    return false
  })()

  const securityDeposit = car?.securityDeposit || 0
  const { tax, total } = computeTaxAndTotal({ baseAmount, discountAmount, securityDeposit })

  // Compute a synthetic dropDate for the backend date-range check
  const effectiveDropDate = (() => {
    if (rentalType === 'day') return dropDate
    if (!pickupDate) return ''
    const d = new Date(pickupDate)
    if (rentalType === 'hour')    d.setDate(d.getDate() + Math.ceil(hours / 24))
    if (rentalType === 'airport') d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()

  const validate = () => {
    if (!car?.isAvailable) { toast.error('This car is currently unavailable'); return false }
    if (!pickupDate) { toast.error('Select a pickup date'); return false }
    if (rentalType === 'day') {
      if (!dropDate) { toast.error('Select a drop-off date'); return false }
      if (dropDate <= pickupDate) { toast.error('Drop-off date must be after pickup date'); return false }
    }
    return true
  }

  const buildPayload = (extraNotes = '') => {
    const addrNote = [
      customPickupAddr ? `Custom pickup: ${customPickupAddr}` : '',
      customDropAddr   ? `Custom drop-off: ${customDropAddr}` : '',
    ].filter(Boolean).join(' | ')
    return {
      carId,
      pickupDate,
      dropDate: effectiveDropDate || pickupDate,
      rentalType,
      ...(rentalType === 'hour' && { totalHours: hours }),
      notes: [extraNotes, addrNote, notes].filter(Boolean).join(' · ') || undefined,
      couponCode: couponApplied ? coupon : undefined,
      driverDetails: { name, email, phone },
      pickupLocationId: pickupLocation || undefined,
      dropLocationId: dropLocation || undefined,
    }
  }

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return
    if (rentalType === 'day' && (!pickupDate || !dropDate))
      return toast.error('Select dates before applying coupon')
    if (rentalType !== 'day' && !pickupDate)
      return toast.error('Select a pickup date before applying coupon')
    try {
      const { data } = await applyCoupon({ code: coupon, carId, pickupDate, dropDate: effectiveDropDate || pickupDate })
      setDiscountAmount(data.data.discountAmount || 0)
      setCouponApplied(true)
      toast.success(`Coupon applied! ₹${data.data.discountAmount} off`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Invalid coupon'))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const { data } = await createBooking(buildPayload(
        rentalType === 'hour'    ? `[Per Hour · ${hours}h]` :
        rentalType === 'airport' ? '[Airport Transfer]' : ''
      ))
      toast.success('Booking created!')
      navigate(`/payment/${data.data.booking._id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create booking'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const { data } = await createBooking(buildPayload(
        rentalType === 'hour'    ? `[Booking Request · Per Hour · ${hours}h]` :
        rentalType === 'airport' ? '[Booking Request · Airport Transfer]' :
                                   '[Booking Request]'
      ))
      toast.success('Booking request submitted! We will confirm shortly.')
      navigate(`/payment/${data.data.booking._id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to submit request'))
    } finally {
      setSubmitting(false)
    }
  }

  const resetCoupon = () => { setCouponApplied(false); setDiscountAmount(0) }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  if (!car) return null

  const primaryImg = car.images?.find(i => i.isPrimary) || car.images?.[0]

  return (
    <div className="bg-gray-50 min-h-screen">

      {/* Hero */}
      <div className="relative min-h-[420px] md:min-h-[520px] overflow-hidden bg-gray-900">
        {primaryImg ? (
          <img src={primaryImg.url} alt={`${car.brand} ${car.model}`}
            className="absolute inset-0 w-full h-full object-cover object-center" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-teal-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80" />

        <div className="absolute top-5 left-0 right-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5 text-sm text-white/75">
              <button onClick={() => navigate('/cars')} className="hover:text-white transition-colors">Cars</button>
              <ChevronRight className="w-3.5 h-3.5" />
              <button onClick={() => navigate(`/cars/${carId}`)} className="hover:text-white transition-colors">
                {car.brand} {car.model}
              </button>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white font-medium">Book</span>
            </nav>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 pb-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">
              {car.brand} {car.model}
            </h1>
            <p className="text-white/70 text-sm md:text-base mt-2 capitalize">
              {car.type} · {car.year} · {RENTAL_LABELS[rentalType]}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Left: Form ─────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">

            {/* Personal Info */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-5 flex items-center gap-2">
                <User className="w-4 h-4 text-teal-500" /> Personal Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="booking-name" className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Full Name</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                    <User className="w-4 h-4 text-gray-400 shrink-0" />
                    <input id="booking-name" type="text" required value={name} onChange={e => setName(e.target.value)}
                      placeholder="John Doe" className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label htmlFor="booking-email" className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                    <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                    <input id="booking-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="john@example.com" className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label htmlFor="booking-phone" className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Phone Number</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <input id="booking-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210" className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                  </div>
                </div>
              </div>
            </div>

            {/* Rental Period — adapts by rentalType */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-500" />
                {rentalType === 'airport' ? 'Pickup Details' : 'Rental Period'}
              </h2>
              <p className="text-xs text-teal-600 font-semibold uppercase tracking-wider mb-5">
                {RENTAL_LABELS[rentalType]}
              </p>

              {/* ── PER DAY: pickup + drop-off ── */}
              {rentalType === 'day' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Pickup</p>
                      <div>
                        <label htmlFor="booking-day-pickup-date" className="text-xs font-medium text-gray-500 block mb-1.5">Date</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Calendar className="w-4 h-4 text-teal-500 shrink-0" />
                          <input id="booking-day-pickup-date" type="date" required min={today} value={pickupDate}
                            onChange={e => { setPickupDate(e.target.value); resetCoupon() }}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="booking-day-pickup-time" className="text-xs font-medium text-gray-500 block mb-1.5">Time</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Clock className="w-4 h-4 text-teal-500 shrink-0" />
                          <select id="booking-day-pickup-time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Drop Off</p>
                      <div>
                        <label htmlFor="booking-day-drop-date" className="text-xs font-medium text-gray-500 block mb-1.5">Date</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Calendar className="w-4 h-4 text-teal-500 shrink-0" />
                          <input id="booking-day-drop-date" type="date" required min={pickupDate || today} value={dropDate}
                            onChange={e => { setDropDate(e.target.value); resetCoupon() }}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="booking-day-drop-time" className="text-xs font-medium text-gray-500 block mb-1.5">Time</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Clock className="w-4 h-4 text-teal-500 shrink-0" />
                          <select id="booking-day-drop-time" value={dropTime} onChange={e => setDropTime(e.target.value)}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  {days > 0 && (
                    <div className="mt-4 bg-teal-50 rounded-xl px-4 py-3 text-sm text-teal-700 font-medium">
                      {days} day{days !== 1 ? 's' : ''} rental · {pickupTime} → {dropTime}
                    </div>
                  )}
                </>
              )}

              {/* ── PER HOUR: pickup date/time + hours ── */}
              {rentalType === 'hour' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Pickup</p>
                      <div>
                        <label htmlFor="booking-hour-pickup-date" className="text-xs font-medium text-gray-500 block mb-1.5">Date</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Calendar className="w-4 h-4 text-teal-500 shrink-0" />
                          <input id="booking-hour-pickup-date" type="date" required min={today} value={pickupDate}
                            onChange={e => { setPickupDate(e.target.value); resetCoupon() }}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="booking-hour-pickup-time" className="text-xs font-medium text-gray-500 block mb-1.5">Time</label>
                        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                          <Clock className="w-4 h-4 text-teal-500 shrink-0" />
                          <select id="booking-hour-pickup-time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
                            className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-teal-600 uppercase tracking-wider">Duration</p>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1.5">Number of Hours</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {HOUR_OPTIONS.map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setHours(h)}
                              className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                                hours === h
                                  ? 'bg-teal-500 border-teal-500 text-white'
                                  : 'border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
                              }`}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  {pickupDate && (
                    <div className="mt-4 bg-teal-50 rounded-xl px-4 py-3 text-sm text-teal-700 font-medium">
                      {hours} hour{hours !== 1 ? 's' : ''} rental · starts {pickupTime}
                    </div>
                  )}
                </>
              )}

              {/* ── AIRPORT TRANSFER: pickup date/time only ── */}
              {rentalType === 'airport' && (
                <>
                  <div className="max-w-sm space-y-3">
                    <p className="text-xs font-bold text-teal-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Plane className="w-3.5 h-3.5" /> Pickup Date &amp; Time
                    </p>
                    <div>
                      <label htmlFor="booking-airport-pickup-date" className="text-xs font-medium text-gray-500 block mb-1.5">Date</label>
                      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                        <Calendar className="w-4 h-4 text-teal-500 shrink-0" />
                        <input id="booking-airport-pickup-date" type="date" required min={today} value={pickupDate}
                          onChange={e => { setPickupDate(e.target.value); resetCoupon() }}
                          className="flex-1 text-sm outline-none text-gray-800 bg-transparent" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="booking-airport-pickup-time" className="text-xs font-medium text-gray-500 block mb-1.5">Time</label>
                      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                        <Clock className="w-4 h-4 text-teal-500 shrink-0" />
                        <select id="booking-airport-pickup-time" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
                          className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                          {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {pickupDate && (
                    <div className="mt-4 bg-teal-50 rounded-xl px-4 py-3 text-sm text-teal-700 font-medium flex items-center gap-2">
                      <Plane className="w-4 h-4" /> Airport transfer on {pickupDate} at {pickupTime}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Pickup & Drop Location */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-5 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-500" /> Pickup &amp; Drop-off Location
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Pickup — shows text input when a drop-off branch is chosen */}
                <div>
                  <label htmlFor="booking-pickup-location" className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Pickup Location</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                    <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
                    {dropLocation ? (
                      <input
                        id="booking-pickup-location"
                        type="text"
                        value={customPickupAddr}
                        onChange={e => setCustomPickupAddr(e.target.value)}
                        placeholder="Enter your pickup address…"
                        className="flex-1 text-sm outline-none text-gray-800 bg-transparent placeholder-gray-400"
                      />
                    ) : (
                      <select id="booking-pickup-location" value={pickupLocation} onChange={e => setPickupLocation(e.target.value)}
                        className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                        <option value="">— Select branch —</option>
                        {locations.filter(l => l.isPickupAvailable !== false).map(l => (
                          <option key={l._id} value={l._id}>{l.name}, {l.city}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Drop-off — shows text input when a pickup branch is chosen */}
                <div>
                  <label htmlFor="booking-drop-location" className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Drop-off Location</label>
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                    <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
                    {pickupLocation ? (
                      <input
                        id="booking-drop-location"
                        type="text"
                        value={customDropAddr}
                        onChange={e => setCustomDropAddr(e.target.value)}
                        placeholder="Enter your drop-off address…"
                        className="flex-1 text-sm outline-none text-gray-800 bg-transparent placeholder-gray-400"
                      />
                    ) : (
                      <select id="booking-drop-location" value={dropLocation} onChange={e => setDropLocation(e.target.value)}
                        className="flex-1 text-sm outline-none text-gray-800 bg-transparent">
                        <option value="">— Same as pickup —</option>
                        {locations.filter(l => l.isDropAvailable !== false).map(l => (
                          <option key={l._id} value={l._id}>{l.name}, {l.city}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Special Requests */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-4">Special Requests <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Any special requests or notes for your rental..."
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none text-gray-700 placeholder-gray-400"
              />
            </div>

            {/* Coupon */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-500" /> Coupon Code
              </h2>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                  <Tag className="w-4 h-4 text-gray-400 shrink-0" />
                  <input type="text" value={coupon}
                    onChange={e => { setCoupon(e.target.value.toUpperCase()); resetCoupon() }}
                    placeholder="Enter coupon code" disabled={couponApplied}
                    className="flex-1 text-sm outline-none text-gray-800 bg-transparent disabled:text-gray-400" />
                </div>
                <button type="button" onClick={handleApplyCoupon} disabled={!coupon || couponApplied}
                  className="px-5 py-2.5 text-sm font-bold bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 disabled:opacity-40 transition-colors whitespace-nowrap">
                  {couponApplied ? 'Applied ✓' : 'Apply'}
                </button>
              </div>
            </div>

            {!car?.isAvailable && (
              <p className="text-sm text-red-600 font-medium text-center mb-3">This car is currently unavailable for booking.</p>
            )}
            <div className="space-y-3">
              {!isRequestMode && (
                <button type="submit" disabled={submitting || !isReady || !car?.isAvailable}
                  className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors text-base uppercase tracking-wide shadow-lg shadow-teal-500/25">
                  {submitting ? 'Processing…' : 'Book Instantly'}
                </button>
              )}
              <button type="button" onClick={handleRequestSubmit} disabled={submitting || !isReady || !car?.isAvailable}
                className={`w-full font-bold py-4 rounded-2xl transition-colors text-base uppercase tracking-wide disabled:opacity-50 ${
                  isRequestMode
                    ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/25'
                    : 'border-2 border-teal-500 text-teal-600 hover:bg-teal-50'
                }`}>
                {submitting ? 'Processing…' : 'Request for Booking'}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Free cancellation if cancelled 48 hours before pickup
            </p>
          </form>

          {/* ── Right: Order Summary ────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-24">

            {/* Car card */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="h-44 bg-gray-100 overflow-hidden">
                {primaryImg
                  ? <img src={primaryImg.url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-5xl">🚗</div>}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 text-lg">{car.brand} {car.model}</h3>
                <p className="text-xs text-gray-500 capitalize mt-0.5">{car.type} · {car.year}</p>
                <div className="mt-3 flex items-baseline gap-1">
                  {rentalType === 'day' && (
                    <><span className="text-2xl font-bold text-teal-600">₹{pricePerDay.toLocaleString()}</span>
                    <span className="text-sm text-gray-400">/ day</span></>
                  )}
                  {rentalType === 'hour' && (
                    <><span className="text-2xl font-bold text-teal-600">₹{pricePerHour.toLocaleString()}</span>
                    <span className="text-sm text-gray-400">/ hour</span></>
                  )}
                  {rentalType === 'airport' && (
                    <><span className="text-2xl font-bold text-teal-600">₹{airportPrice.toLocaleString()}</span>
                    <span className="text-sm text-gray-400">flat rate</span></>
                  )}
                </div>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-4">Price Summary</h3>
              <div className="space-y-2.5 text-sm">
                {rentalType === 'day' && (
                  <div className="flex justify-between text-gray-600">
                    <span>₹{pricePerDay.toLocaleString()} × {days || '—'} day{days !== 1 ? 's' : ''}</span>
                    <span>{days > 0 ? `₹${baseAmount.toLocaleString()}` : '—'}</span>
                  </div>
                )}
                {rentalType === 'hour' && (
                  <div className="flex justify-between text-gray-600">
                    <span>₹{pricePerHour.toLocaleString()} × {hours} hour{hours !== 1 ? 's' : ''}</span>
                    <span>₹{baseAmount.toLocaleString()}</span>
                  </div>
                )}
                {rentalType === 'airport' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Airport transfer (flat rate)</span>
                    <span>₹{airportPrice.toLocaleString()}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Coupon discount</span>
                    <span>− ₹{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>GST (18%)</span>
                  <span>{isReady ? `₹${tax.toLocaleString()}` : '—'}</span>
                </div>
                {securityDeposit > 0 && (
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Security deposit <span className="text-gray-400">(refundable)</span></span>
                    <span>₹{securityDeposit.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900 text-base">
                  <span>Total</span>
                  <span className="text-teal-600">{isReady ? `₹${total.toLocaleString()}` : '—'}</span>
                </div>
              </div>
            </div>

            <div className="bg-teal-50 rounded-2xl p-4 text-xs text-teal-700 space-y-1.5">
              <p className="font-semibold">Included in your rental:</p>
              {['Third-party insurance', '24/7 roadside assistance', 'Free cancellation (48h+)'].map(f => (
                <p key={f} className="flex items-center gap-1.5">
                  <span className="text-teal-500">✓</span> {f}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

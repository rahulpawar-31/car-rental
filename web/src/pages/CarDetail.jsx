import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { Star, Users, Settings, Fuel, Heart, CheckCircle, ChevronRight, ChevronLeft, ChevronDown, Share2, Plus, Minus, Briefcase } from 'lucide-react'
import { FaFacebookF, FaTwitter, FaWhatsapp } from 'react-icons/fa'
import { getCarById, getCars, getCarBookedDates } from '../api/cars'
import { getCarReviews } from '../api/reviews'
import { saveCar } from '../api/users'
import { createBooking } from '../api/bookings'
import { getLocations } from '../api/locations'
import { getErrorMessage } from '../api/errors'
import useAuthStore from '../store/authStore'
import Spinner from '../components/ui/Spinner'
import { toast } from 'sonner'
import { TIME_SLOTS, HOUR_OPTIONS } from '../constants/booking'
import { deriveRentalRates } from '../lib/pricing'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa']

function AvailabilityCalendar({ bookedRanges }) {
  const todayRef = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const [viewDate, setViewDate] = useState(new Date(todayRef.getFullYear(), todayRef.getMonth(), 1))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const parsedRanges = useMemo(() =>
    bookedRanges
      .filter(({ from, to }) => from && to)
      .map(({ from, to }) => ({ from: from.slice(0, 10), to: to.slice(0, 10) })),
    [bookedRanges])

  const isBooked = (date) => {
    const s = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return parsedRanges.some(({ from, to }) => s >= from && s <= to)
  }

  const cells = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const canGoPrev = viewDate > new Date(todayRef.getFullYear(), todayRef.getMonth(), 1)

  return (
    <div className="px-5 pb-5 pt-4 border-t border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Availability Calendar</h3>

      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">{MONTH_NAMES[month]} {year}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const isPast = date < todayRef
          const isToday = date.getTime() === todayRef.getTime()
          const booked = !isPast && isBooked(date)
          const available = !isPast && !booked

          return (
            <div
              key={i}
              className={[
                'text-center text-[11px] py-1 mx-0.5 rounded font-medium select-none',
                isPast  ? 'text-gray-300' : '',
                booked  ? 'bg-red-100 text-red-500' : '',
                available ? 'bg-teal-50 text-teal-700' : '',
                isToday ? 'ring-1 ring-teal-500' : '',
              ].join(' ')}
            >
              {date.getDate()}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-teal-50 border border-teal-300" />
          <span className="text-[11px] text-gray-500">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span className="text-[11px] text-gray-500">Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-teal-500" />
          <span className="text-[11px] text-gray-500">Today</span>
        </div>
      </div>
    </div>
  )
}

const DEFAULT_INCLUDED = ['Audio input', 'All Wheel drive', 'Bluetooth', 'USB input', 'Heated seats', 'FM Radio']

function AccordionItem({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full py-4 text-left group"
      >
        <span className="font-semibold text-gray-800 text-sm uppercase tracking-wide group-hover:text-teal-600 transition-colors">
          {title}
        </span>
        <span className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center shrink-0 text-gray-500">
          {open ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </span>
      </button>
      {open && (
        <div className="pb-5 text-sm text-gray-600 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}

export default function CarDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()

  const [car, setCar]               = useState(null)
  const [reviews, setReviews]       = useState([])
  const [similar, setSimilar]       = useState([])
  const [bookedRanges, setBookedRanges] = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeImg, setActiveImg]   = useState(0)
  const [saved, setSaved]           = useState(false)
  const [rentalType, setRentalType] = useState('day')
  const [typeDropOpen, setTypeDropOpen] = useState(false)
  const typeDropRef = useRef(null)

  // Inline booking form state
  const today = new Date().toISOString().split('T')[0]
  const [formName, setFormName]               = useState('')
  const [formEmail, setFormEmail]             = useState('')
  const [formPhone, setFormPhone]             = useState('')
  const [formPickupAddress, setFormPickupAddress] = useState('')
  const [formDropAddress, setFormDropAddress] = useState('')
  const [formPickupDate, setFormPickupDate]   = useState('')
  const [formPickupTime, setFormPickupTime]   = useState('')
  const [formDropDate, setFormDropDate]       = useState('')
  const [formDropTime, setFormDropTime]       = useState('')
  const [formHours, setFormHours]             = useState(2)
  const [formSubmitting, setFormSubmitting]   = useState(false)
  const [locations, setLocations]             = useState([])
  const [formPickupLocation, setFormPickupLocation] = useState(location.state?.pickupLocation?._id || '')
  const [formDropLocation, setFormDropLocation]     = useState(location.state?.dropLocation?._id   || '')

  useEffect(() => {
    const handler = (e) => {
      if (typeDropRef.current && !typeDropRef.current.contains(e.target)) setTypeDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    // Rapidly switching cars (e.g. via "Similar Cars") can let an older, slower
    // response resolve after a newer one — `ignore` drops any result that's no
    // longer for the currently-mounted `id`.
    let ignore = false
    setLoading(true)
    Promise.all([getCarById(id), getCarReviews(id)])
      .then(([carRes, reviewRes]) => {
        if (ignore) return
        const loaded = carRes.data.data.car
        setCar(loaded)
        setReviews(reviewRes.data.data.reviews || [])
        if (user?.savedCars) setSaved(user.savedCars.some(s => (s._id || s) === id))
        getCars({ type: loaded.type, limit: 4 })
          .then(res => { if (!ignore) setSimilar((res.data.data.cars || []).filter(c => c._id !== id).slice(0, 3)) })
          .catch(() => {})
      })
      .catch(() => { if (!ignore) navigate('/cars') })
      .finally(() => { if (!ignore) setLoading(false) })

    getCarBookedDates(id)
      .then(res => { if (!ignore) setBookedRanges(res.data.data.bookedRanges || []) })
      .catch(() => {})

    getLocations()
      .then(res => { if (!ignore) setLocations(res.data.data.locations || []) })
      .catch(() => {})

    return () => { ignore = true }
  }, [id, navigate, user])

  // Pre-fill form from user profile
  useEffect(() => {
    if (user) {
      setFormName(user.name || '')
      setFormEmail(user.email || '')
      setFormPhone(user.phone || '')
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return navigate('/login')
    try {
      const { data } = await saveCar(id)
      setSaved(data.saved)
      toast.success(data.message)
    } catch { toast.error('Failed to save car') }
  }

  const validateForm = () => {
    if (!user) { navigate('/login', { state: { from: location } }); return false }
    if (!car.isAvailable) { toast.error('This car is currently unavailable'); return false }
    if (!formName.trim()) { toast.error('Enter your full name'); return false }
    if (!formEmail.trim()) { toast.error('Enter your email address'); return false }
    if (!formPickupDate) { toast.error('Select a pickup date'); return false }
    if (!formPickupTime) { toast.error('Select a pickup time'); return false }
    if (rentalType === 'day') {
      if (!formDropDate) { toast.error('Select a drop-off date'); return false }
      if (formDropDate <= formPickupDate) { toast.error('Drop-off date must be after pickup date'); return false }
    }
    return true
  }

  const buildFormPayload = (extraNotes = '') => {
    const effectiveDropDate = (() => {
      if (rentalType === 'day') return formDropDate
      if (!formPickupDate) return ''
      const d = new Date(formPickupDate)
      if (rentalType === 'hour')    d.setDate(d.getDate() + Math.ceil(formHours / 24))
      if (rentalType === 'airport') d.setDate(d.getDate() + 1)
      return d.toISOString().split('T')[0]
    })()
    const noteParts = [
      formPickupAddress && `Pickup: ${formPickupAddress}`,
      formDropAddress && `Drop-off: ${formDropAddress}`,
      rentalType === 'hour' && `Duration: ${formHours}h`,
      extraNotes,
    ].filter(Boolean)
    return {
      carId: id,
      pickupDate: formPickupDate,
      dropDate: effectiveDropDate || formPickupDate,
      rentalType,
      ...(rentalType === 'hour' && { totalHours: formHours }),
      driverDetails: { name: formName, email: formEmail, phone: formPhone },
      notes: noteParts.join(' · ') || undefined,
      ...(formPickupLocation && { pickupLocationId: formPickupLocation }),
      ...(formDropLocation   && { dropLocationId:   formDropLocation }),
    }
  }

  const handleFormBook = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      const label = rentalType === 'hour' ? `[Per Hour · ${formHours}h]`
        : rentalType === 'airport' ? '[Airport Transfer]' : ''
      const { data } = await createBooking(buildFormPayload(label))
      toast.success('Booking created!')
      navigate(`/payment/${data.data.booking._id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create booking'))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleFormRequest = async () => {
    if (!validateForm()) return
    setFormSubmitting(true)
    try {
      const label = rentalType === 'hour' ? `[Booking Request · Per Hour · ${formHours}h]`
        : rentalType === 'airport' ? '[Booking Request · Airport Transfer]' : '[Booking Request]'
      const { data } = await createBooking(buildFormPayload(label))
      toast.success('Booking request submitted!')
      navigate(`/payment/${data.data.booking._id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to submit request'))
    } finally {
      setFormSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
  if (!car) return null

  const included = car.features?.length ? car.features : DEFAULT_INCLUDED
  const POSSIBLE_EXCLUDED = ['GPS Navigation', 'Sunroof', 'Child Seat', 'Ski Rack']
  const excluded = POSSIBLE_EXCLUDED.filter(
    f => !included.some(inc => inc.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(inc.toLowerCase()))
  )
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const rates = deriveRentalRates(car)
  const RENTAL_TYPES = [
    { key: 'day',     label: 'Per Day',          price: rates.pricePerDay },
    { key: 'hour',    label: 'Per Hour',          price: rates.pricePerHour },
    { key: 'airport', label: 'Airport Transfer',  price: rates.airportPrice },
  ]
  const activeType = RENTAL_TYPES.find(t => t.key === rentalType)
  const primaryImg = car.images?.find(i => i.isPrimary) || car.images?.[0]
  const heroImg = car.images?.[activeImg] || primaryImg

  return (
    <div className="bg-white min-h-screen">

      {/* ── Hero Banner ───────────────────────────────────────────── */}
      <div className="relative min-h-[320px] md:min-h-[440px] overflow-hidden">
        {heroImg ? (
          <img
            src={heroImg.url}
            alt={`${car.brand} ${car.model}`}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-8xl">🚗</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80" />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-12 text-center px-4">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-2 tracking-tight drop-shadow-lg">
            {car.brand} {car.model}
          </h1>
          <p className="text-gray-300 text-sm md:text-base capitalize">
            {car.type} · {car.year} · {car.color}
          </p>
        </div>
        {/* Breadcrumb overlay */}
        <div className="absolute top-4 left-0 right-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5 text-sm text-white/80">
              <Link to="/home" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link to="/cars" className="hover:text-white transition-colors">Cars</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white font-medium">{car.brand} {car.model}</span>
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-10 items-start">

          {/* ── LEFT COLUMN ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Thumbnail strip — always shown when there are images */}
            {car.images?.length > 0 && (
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {car.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      activeImg === i ? 'border-teal-500' : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover object-center bg-gray-100" />
                  </button>
                ))}
              </div>
            )}

            {/* Car title + rating + save */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1.5">{car.brand} {car.model}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {car.rating > 0 && (
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < Math.round(car.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                      ))}
                      <span className="text-sm text-gray-500 ml-1">{car.reviewCount} reviews</span>
                    </div>
                  )}
                  {car.isFeatured && (
                    <span className="text-xs bg-amber-50 text-amber-600 font-semibold px-2 py-0.5 rounded-full">Featured</span>
                  )}
                  {!car.isAvailable && (
                    <span className="text-xs bg-red-50 text-red-500 font-semibold px-2 py-0.5 rounded-full">Unavailable</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleSave}
                title={saved ? 'Remove from saved' : 'Save car'}
                className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                  saved
                    ? 'bg-red-50 border-red-200 text-red-500'
                    : 'border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-400'
                }`}
              >
                <Heart className={`w-4 h-4 ${saved ? 'fill-red-500' : ''}`} />
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>

            {/* Spec icons row */}
            <div className="grid grid-cols-4 divide-x divide-gray-200 border border-gray-200 rounded-xl overflow-hidden mb-8">
              {[
                { Icon: Users,     label: `${car.seats} Passengers` },
                { Icon: Briefcase, label: '2 Luggages' },
                { Icon: Settings,  label: car.transmission },
                { Icon: Fuel,      label: car.fuelType },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center justify-center py-4 px-2 gap-2 bg-white">
                  <Icon className="w-5 h-5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 text-center capitalize leading-tight">{label}</span>
                </div>
              ))}
            </div>

            {/* Accordion sections */}
            <div className="mb-8 border-b border-gray-200">
              {car.description && (
                <AccordionItem title="About this Car" defaultOpen>
                  <p>{car.description}</p>
                </AccordionItem>
              )}
              <AccordionItem title="Refueling">
                <p>The vehicle must be returned with the same fuel level as at pickup. If returned with less fuel, a refueling fee will be charged at the current market rate plus a service charge. Please keep the fuel receipt as proof.</p>
              </AccordionItem>
              <AccordionItem title="Car Wash">
                <p>Please return the vehicle in a reasonably clean condition. Excessive dirt or soiling may result in a cleaning fee. Interior cleanliness is expected — any damage caused by spillage, pets, or food will incur additional charges at our discretion.</p>
              </AccordionItem>
              <AccordionItem title="No Smoking">
                <p>Smoking is strictly prohibited in all our vehicles. Any evidence of smoking inside the vehicle will result in a mandatory deep-cleaning fee starting at ₹2,000, depending on severity. This policy applies to all passengers.</p>
              </AccordionItem>
            </div>

            {/* Included / Not Included */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Included &amp; Not Included</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ul className="space-y-2.5">
                  {included.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="capitalize">{f}</span>
                    </li>
                  ))}
                </ul>
                {excluded.length > 0 && (
                  <ul className="space-y-2.5">
                    {excluded.map(f => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-gray-400">
                        <span className="w-4 h-4 shrink-0 flex items-center justify-center text-red-400 font-bold">✕</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Reviews */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Customer Reviews</h2>
                {car.rating > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="font-bold text-amber-700">{car.rating.toFixed(1)}</span>
                    <span className="text-xs text-amber-500">/ 5</span>
                  </div>
                )}
              </div>
              {reviews.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No reviews yet. Be the first to review after your trip!</p>
              ) : (
                <div className="space-y-5">
                  {reviews.slice(0, 5).map(r => (
                    <div key={r._id} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {r.user?.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{r.user?.name}</p>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-gray-600 pl-12 leading-relaxed">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ────────────────────────────────────── */}
          <div className="w-full lg:w-80 xl:w-[360px] shrink-0">
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-md">

              {/* Price + rental type dropdown */}
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-gray-900">
                      ₹{activeType?.price?.toLocaleString()}
                    </span>
                    <span className="text-gray-400 text-sm font-medium">{activeType?.label}</span>
                  </div>

                  {/* Dropdown toggle */}
                  <div className="relative shrink-0" ref={typeDropRef}>
                    <button
                      onClick={() => setTypeDropOpen(o => !o)}
                      className="flex items-center gap-1 text-sm font-medium text-teal-600 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors"
                    >
                      {activeType?.label}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${typeDropOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {typeDropOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-100 rounded-xl shadow-xl py-1 z-50">
                        {RENTAL_TYPES.map(t => (
                          <button
                            key={t.key}
                            onClick={() => { setRentalType(t.key); setTypeDropOpen(false) }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                              rentalType === t.key
                                ? 'bg-teal-50 text-teal-700 font-semibold'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="block font-medium">{t.label}</span>
                            <span className="text-xs text-gray-400">₹{t.price?.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {car.securityDeposit > 0 && (
                  <p className="text-xs text-gray-400 mt-2">+ ₹{car.securityDeposit?.toLocaleString()} refundable deposit</p>
                )}
              </div>

              {/* Inline Booking Form */}
              <div className="px-5 pt-4 pb-5 space-y-4 border-t border-gray-100">

                {/* Full Name */}
                <div>
                  <label htmlFor="cardetail-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    id="cardetail-name"
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 placeholder-gray-400"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="cardetail-email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    id="cardetail-email"
                    type="email"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    placeholder="sample@yourcompany.com"
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 placeholder-gray-400"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="cardetail-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    id="cardetail-phone"
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 placeholder-gray-400"
                  />
                </div>

                {/* Branch Locations */}
                {locations.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cardetail-pickup-branch" className="block text-sm font-medium text-gray-700 mb-1">Pickup Branch</label>
                      <select id="cardetail-pickup-branch" value={formPickupLocation} onChange={e => setFormPickupLocation(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 bg-white">
                        <option value="">— Select branch —</option>
                        {locations.filter(l => l.isPickupAvailable !== false).map(l => (
                          <option key={l._id} value={l._id}>{l.name}, {l.city}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cardetail-drop-branch" className="block text-sm font-medium text-gray-700 mb-1">Drop-off Branch</label>
                      <select id="cardetail-drop-branch" value={formDropLocation} onChange={e => setFormDropLocation(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 bg-white">
                        <option value="">— Same as pickup —</option>
                        {locations.filter(l => l.isDropAvailable !== false).map(l => (
                          <option key={l._id} value={l._id}>{l.name}, {l.city}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Pickup Address */}
                <div>
                  <label htmlFor="cardetail-pickup-address" className="block text-sm font-medium text-gray-700 mb-1">Pickup Address</label>
                  <input
                    id="cardetail-pickup-address"
                    type="text"
                    value={formPickupAddress}
                    onChange={e => setFormPickupAddress(e.target.value)}
                    placeholder="34 Main Street"
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 placeholder-gray-400"
                  />
                </div>

                {/* Pickup Date */}
                <div>
                  <label htmlFor="cardetail-pickup-date" className="block text-sm font-medium text-gray-700 mb-1">Pickup Date</label>
                  <input
                    id="cardetail-pickup-date"
                    type="date"
                    value={formPickupDate}
                    min={today}
                    onChange={e => setFormPickupDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800"
                  />
                </div>

                {/* Pickup Time */}
                <div>
                  <label htmlFor="cardetail-pickup-time" className="block text-sm font-medium text-gray-700 mb-1">Pickup Time</label>
                  <select
                    id="cardetail-pickup-time"
                    value={formPickupTime}
                    onChange={e => setFormPickupTime(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 bg-white"
                  >
                    <option value="">— Please choose an option —</option>
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Per Hour: duration selector */}
                {rentalType === 'hour' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Duration (Hours)</label>
                    <div className="flex flex-wrap gap-2">
                      {HOUR_OPTIONS.map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setFormHours(h)}
                          className={`px-3 py-1.5 rounded text-sm font-semibold border-2 transition-colors ${
                            formHours === h
                              ? 'bg-teal-500 border-teal-500 text-white'
                              : 'border-gray-300 text-gray-600 hover:border-teal-400'
                          }`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per Day + Airport: Drop Off Address */}
                {(rentalType === 'day' || rentalType === 'airport') && (
                  <div>
                    <label htmlFor="cardetail-drop-address" className="block text-sm font-medium text-gray-700 mb-1">Drop Off Address</label>
                    <input
                      id="cardetail-drop-address"
                      type="text"
                      value={formDropAddress}
                      onChange={e => setFormDropAddress(e.target.value)}
                      placeholder={rentalType === 'airport' ? 'Airport Name' : 'Drop-off Location'}
                      className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 placeholder-gray-400"
                    />
                  </div>
                )}

                {/* Per Day: Drop Off Date + Time */}
                {rentalType === 'day' && (
                  <>
                    <div>
                      <label htmlFor="cardetail-drop-date" className="block text-sm font-medium text-gray-700 mb-1">Drop Off Date</label>
                      <input
                        id="cardetail-drop-date"
                        type="date"
                        value={formDropDate}
                        min={formPickupDate || today}
                        onChange={e => setFormDropDate(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800"
                      />
                    </div>
                    <div>
                      <label htmlFor="cardetail-drop-time" className="block text-sm font-medium text-gray-700 mb-1">Drop Off Time</label>
                      <select
                        id="cardetail-drop-time"
                        value={formDropTime}
                        onChange={e => setFormDropTime(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 text-gray-800 bg-white"
                      >
                        <option value="">— Please choose an option —</option>
                        {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {/* Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleFormRequest}
                    disabled={formSubmitting || !car.isAvailable}
                    className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-bold py-3 rounded transition-colors text-sm tracking-wide"
                  >
                    {formSubmitting ? 'Processing…' : 'Request for Booking'}
                  </button>
                  <div className="text-center text-xs text-gray-400 font-medium">OR</div>
                  <button
                    type="button"
                    onClick={handleFormBook}
                    disabled={formSubmitting || !car.isAvailable}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white font-bold py-3 rounded transition-colors text-sm tracking-wide"
                  >
                    {formSubmitting ? 'Processing…' : car.isAvailable ? 'Book Instantly' : 'Currently Unavailable'}
                  </button>
                </div>
              </div>

              {/* Availability Calendar */}
              <AvailabilityCalendar bookedRanges={bookedRanges} />

              {/* Quick specs */}
              <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                {[
                  { label: 'Type', value: car.type },
                  { label: 'Year', value: car.year },
                  { label: 'Seats', value: `${car.seats} passengers` },
                  { label: 'Fuel', value: car.fuelType },
                  { label: 'Transmission', value: car.transmission },
                  { label: 'Color', value: car.color },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{value}</p>
                  </div>
                ))}
              </div>

              {/* Footer: share */}
              <div className="px-5 pb-5 space-y-3">
                {/* Share */}
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </span>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                    <FaFacebookF size={11} />
                  </a>
                  <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out this ${car.brand} ${car.model}!`)}`} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                    <FaTwitter size={11} />
                  </a>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Check out this ${car.brand} ${car.model}: ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white hover:opacity-80 transition-opacity">
                    <FaWhatsapp size={11} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Similar Cars */}
        {similar.length > 0 && (
          <section className="mt-12 pt-8 border-t border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Similar Cars</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {similar.map(c => {
                const img = c.images?.find(i => i.isPrimary) || c.images?.[0]
                return (
                  <Link
                    key={c._id}
                    to={`/cars/${c._id}`}
                    className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
                  >
                    <div className="h-44 bg-gray-100 overflow-hidden relative">
                      {img
                        ? <img src={img.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        : <div className="w-full h-full flex items-center justify-center text-4xl">🚗</div>}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 mb-1">{c.brand} {c.model}</h3>
                      {c.rating > 0 && (
                        <div className="flex items-center gap-1 mb-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < Math.round(c.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                          ))}
                          <span className="text-xs text-gray-400 ml-0.5">{c.reviewCount} reviews</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.seats} Passengers</span>
                        <span className="flex items-center gap-1 capitalize"><Settings className="w-3.5 h-3.5" />{c.transmission}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-gray-900">₹{c.pricePerDay?.toLocaleString()}</span>
                        <span className="text-xs text-gray-400">Per Day</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

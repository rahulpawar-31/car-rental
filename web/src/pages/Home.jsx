import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Search,
  Shield,
  Star,
  Headphones,
  Phone,
  Quote,
} from 'lucide-react'
import { getCars, getFeaturedCars, getCarFilters } from '../api/cars'
import { getLocations } from '../api/locations'
import Spinner from '../components/ui/Spinner'
import CarCard from '../components/ui/CarCard'
import Button from '../components/ui/Button'
import useAuthStore from '../store/authStore'
import { ARTICLES } from '../data/articles'

const WHY_CHOOSE = [
  {
    icon: Shield,
    title: 'Variety of Car Brands',
    desc: 'Choose from an extensive range of top car brands to match your style and budget.',
  },
  {
    icon: Star,
    title: 'Best Rate Guarantee',
    desc: 'We offer the most competitive rates in the market with no hidden charges.',
  },
  {
    icon: Headphones,
    title: 'Awesome Customer Support',
    desc: 'Our dedicated team is available around the clock to assist you anytime.',
  },
]

const TESTIMONIALS = [
  {
    name: 'Priya Sharma',
    location: 'Mumbai',
    rating: 5,
    text: 'Absolutely seamless experience from booking to drop-off. The car was spotless and the pricing was exactly as shown — no hidden fees. Will definitely rent again!',
    avatar: 'PS',
    car: 'Toyota Fortuner',
  },
  {
    name: 'Arjun Mehta',
    location: 'Bangalore',
    rating: 5,
    text: 'I was sceptical at first but the process was surprisingly quick. Got a great deal on an SUV for a weekend trip and the customer support team was incredibly helpful.',
    avatar: 'AM',
    car: 'Mahindra XUV700',
  },
  {
    name: 'Sneha Patel',
    location: 'Ahmedabad',
    rating: 4,
    text: 'Rented a sedan for a business trip. Clean, well-maintained vehicle and super easy pick-up. Minor delay at the location but the team resolved it quickly.',
    avatar: 'SP',
    car: 'Honda City',
  },
  {
    name: 'Rahul Verma',
    location: 'Delhi',
    rating: 5,
    text: 'Best car rental platform in India hands down. The variety of cars is unmatched and the Best Rate Guarantee is real — I checked three other sites.',
    avatar: 'RV',
    car: 'Hyundai Creta',
  },
  {
    name: 'Anita Nair',
    location: 'Kochi',
    rating: 5,
    text: 'Used this service for a family road trip and it was fantastic. The car was comfortable, fuel-efficient, and exactly what was shown in the photos.',
    avatar: 'AN',
    car: 'Kia Seltos',
  },
  {
    name: 'Vikram Singh',
    location: 'Jaipur',
    rating: 4,
    text: "Great selection and competitive prices. The online booking took under 3 minutes. I'll be recommending this to all my colleagues for corporate travel.",
    avatar: 'VS',
    car: 'Maruti Ertiga',
  },
]

const SORT_OPTIONS = [
  { value: 'price-asc', label: 'Price Low to High' },
  { value: 'price-desc', label: 'Price High to Low' },
  { value: 'model-asc', label: 'Sort By Model' },
  { value: 'rating-desc', label: 'Sort By Review Score' },
  { value: '-createdAt', label: 'Newest First' },
]

function ArticleImage({ src, alt }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-300 text-4xl">
        📰
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      onError={() => setError(true)}
    />
  )
}

const TYPE_EMOJI = {
  sedan: '🚗',
  suv: '🚙',
  hatchback: '🚘',
  coupe: '🏎️',
  luxury: '🏎️',
  convertible: '🚗',
  van: '🚐',
  truck: '🚚',
  mpv: '🚐',
  electric: '⚡',
  hybrid: '🌿',
}

export default function Home() {
  const [featuredCars, setFeaturedCars] = useState([])
  const [brandCards, setBrandCards] = useState([])
  const [typeCards, setTypeCards] = useState([])
  const [brands, setBrands] = useState([])
  const [carTypes, setCarTypes] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('price-asc')
  const [pickupLocation, setPickupLocation] = useState('')
  const [dropLocation, setDropLocation] = useState('')
  const navigate = useNavigate()
  const { user } = useAuthStore()

  useEffect(() => {
    Promise.all([getFeaturedCars(), getCars({ limit: 100 }), getCarFilters(), getLocations()])
      .then(([featRes, carsRes, filterRes, locationsRes]) => {
        setFeaturedCars(featRes.data.data.cars)
        setBrands(filterRes.data.data.brands || [])
        setCarTypes(filterRes.data.data.types || [])
        setLocations(locationsRes.data.data.locations || [])

        const allCars = carsRes.data.data.cars

        const brandCount = {}
        const brandImg = {}
        allCars.forEach(car => {
          brandCount[car.brand] = (brandCount[car.brand] || 0) + 1
          if (!brandImg[car.brand]) brandImg[car.brand] = car.images?.[0]?.url || null
        })
        setBrandCards(
          Object.entries(brandImg)
            .filter(([b]) => brandCount[b] >= 2)
            .slice(0, 6)
        )

        const typeCount = {}
        const typeImg = {}
        allCars.forEach(car => {
          typeCount[car.type] = (typeCount[car.type] || 0) + 1
          if (!typeImg[car.type]) typeImg[car.type] = car.images?.[0]?.url || null
        })
        setTypeCards(
          Object.entries(typeImg)
            .filter(([t]) => typeCount[t] >= 2)
            .slice(0, 6)
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = e => {
    e.preventDefault()
    const params = new URLSearchParams()
    // Falls back to dropLocation when only a drop-off branch is chosen --
    // matches Locations.jsx's handleFindCars, which is the other place in
    // the app that turns a pickup/drop pair into this same `location` param.
    const branchId = pickupLocation || dropLocation
    if (branchId) params.set('location', branchId)
    if (brand) params.set('brand', brand)
    if (type) params.set('type', type)
    if (sort) params.set('sort', sort)

    const pickupLocationObj = locations.find(l => l._id === pickupLocation) || null
    const dropLocationObj = locations.find(l => l._id === dropLocation) || null

    navigate(`/cars?${params.toString()}`, {
      state:
        pickupLocationObj || dropLocationObj
          ? { pickupLocation: pickupLocationObj, dropLocation: dropLocationObj }
          : undefined,
    })
  }

  return (
    <div className="bg-white">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative min-h-[580px] md:min-h-[680px] flex items-center justify-center text-white overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/heroes/home.jpg)' }}
        />
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 text-center px-4 w-full max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-3 drop-shadow-lg leading-tight tracking-tight">
            Find Best Car &amp; Limousine
          </h1>
          <p className="text-gray-300 text-base md:text-lg mb-8 drop-shadow italic">
            From as low as ₹499 per day with limited time offer discounts
          </p>

          <form
            onSubmit={handleSearch}
            className="bg-white rounded-2xl shadow-2xl p-4 sm:p-5 text-left"
          >
            {/* Pickup / Drop-off Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label
                  htmlFor="home-pickup-location"
                  className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                >
                  Pickup Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-600 pointer-events-none" />
                  <select
                    id="home-pickup-location"
                    value={pickupLocation}
                    onChange={e => setPickupLocation(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-700 pl-9 pr-8 py-2.5 outline-none appearance-none cursor-pointer focus:border-teal-400 transition-colors"
                  >
                    <option value="">Any Location</option>
                    {locations
                      .filter(l => l.isPickupAvailable !== false)
                      .map(l => (
                        <option key={l._id} value={l._id}>
                          {l.name}, {l.city}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="home-drop-location"
                  className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
                >
                  Drop-off Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-600 pointer-events-none" />
                  <select
                    id="home-drop-location"
                    value={dropLocation}
                    onChange={e => setDropLocation(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-700 pl-9 pr-8 py-2.5 outline-none appearance-none cursor-pointer focus:border-teal-400 transition-colors"
                  >
                    <option value="">Same as pickup</option>
                    {locations
                      .filter(l => l.isDropAvailable !== false)
                      .map(l => (
                        <option key={l._id} value={l._id}>
                          {l.name}, {l.city}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Brand / Type / Sort / Search */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-gray-100">
              <div className="relative flex-1">
                <select
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-600 px-4 py-2.5 outline-none appearance-none cursor-pointer focus:border-teal-400 transition-colors"
                >
                  <option value="">Any Brand</option>
                  {brands.map(b => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              <div className="relative flex-1">
                <select
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-600 px-4 py-2.5 outline-none appearance-none cursor-pointer focus:border-teal-400 transition-colors"
                >
                  <option value="">Any Type</option>
                  {carTypes.map(t => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              <div className="relative flex-1 sm:max-w-[200px]">
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg text-sm text-gray-600 px-4 py-2.5 outline-none appearance-none cursor-pointer focus:border-teal-400 transition-colors"
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              <Button type="submit" size="lg" className="uppercase tracking-widest shrink-0">
                <Search className="w-4 h-4" /> Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Featured Cars ────────────────────────────────────────── */}
      {!loading && featuredCars.length > 0 && (
        <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Featured Cars</h2>
              <p className="text-gray-500">Hand-picked vehicles from our fleet, ready to book</p>
            </div>
            <Link
              to="/cars"
              className="hidden sm:flex items-center gap-1 text-teal-600 font-semibold text-sm hover:text-teal-700 shrink-0"
            >
              View All Cars <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredCars.map(car => (
              <CarCard key={car._id} car={car} />
            ))}
          </div>
        </section>
      )}

      {/* ── Browse by Brand ──────────────────────────────────────── */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            First Class Car Rental &amp; Limousine Services
          </h2>
          <p className="text-gray-500">
            We offer professional car rental &amp; limousine services in our range of high-end
            vehicles
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {brandCards.map(([brandName, imgUrl]) => (
              <button
                key={brandName}
                onClick={() => navigate(`/cars?brand=${encodeURIComponent(brandName)}`)}
                className="relative h-56 rounded-2xl overflow-hidden group bg-gray-800 text-left"
              >
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={brandName}
                    className="w-full h-full object-cover opacity-75 group-hover:opacity-95 transition-all duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-gray-700 to-gray-900">
                    🚗
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute inset-0 bg-teal-500/0 group-hover:bg-teal-500/10 transition-colors duration-300" />
                <span className="absolute bottom-5 left-5 text-white text-xl font-bold drop-shadow">
                  {brandName}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Browse by Type ───────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Find Car by Type</h2>
            <p className="text-gray-500">
              We offer professional car rental &amp; limousine services in our range of high-end
              vehicles
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {typeCards.map(([typeName, imgUrl]) => (
                <button
                  key={typeName}
                  onClick={() => navigate(`/cars?type=${typeName}`)}
                  className="relative h-56 rounded-2xl overflow-hidden group bg-gray-800 text-left"
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={typeName}
                      className="w-full h-full object-cover opacity-75 group-hover:opacity-95 transition-all duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl bg-gradient-to-br from-gray-700 to-gray-900">
                      {TYPE_EMOJI[typeName] || '🚗'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute inset-0 bg-teal-500/0 group-hover:bg-teal-500/10 transition-colors duration-300" />
                  <span className="absolute bottom-5 left-5 text-white text-xl font-bold capitalize drop-shadow">
                    {typeName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Fleet CTA ────────────────────────────────────────────── */}
      <section className="relative py-32 text-white text-center overflow-hidden bg-[#111111]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,_rgba(20,184,166,0.14)_0%,_transparent_70%)]" />
        <div className="relative z-10 max-w-2xl mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Our Fleet, Your Fleet</h2>
          <p className="text-gray-400 mb-6 leading-relaxed">
            We know the difference is in the details and that&apos;s why our car rental services, in
            the tourism and business industry, stand out for their quality and good taste, to offer
            you a unique experience
          </p>
          <p className="text-2xl font-semibold text-teal-400 mb-8 flex items-center justify-center gap-2">
            <Phone className="w-5 h-5" />
            Call Now (91) 1800-000-000
          </p>
          <Button
            variant="primary"
            size="lg"
            className="uppercase tracking-wider"
            onClick={() => navigate('/contact')}
          >
            Request a Quote
          </Button>
        </div>
      </section>

      {/* ── Why Choose Us ────────────────────────────────────────── */}
      <section className="py-20 bg-teal-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Why Choose Us</h2>
            <p className="text-gray-500">
              Explore our first class limousine &amp; car rental services
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {WHY_CHOOSE.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-teal-600" />
                </div>
                <h3 className="text-gray-900 font-bold text-lg mb-3">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Customer Reviews ─────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">What Our Customers Say</h2>
            <p className="text-gray-500">Trusted by thousands of happy renters across India</p>
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
              ))}
              <span className="ml-2 text-gray-600 font-semibold text-sm">
                4.8 / 5 &nbsp;·&nbsp; 2,400+ reviews
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TESTIMONIALS.map(({ name, location, rating, text, avatar, car }) => (
              <div
                key={name}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                <Quote className="w-8 h-8 text-teal-400 shrink-0" />
                <p className="text-gray-600 text-sm leading-relaxed flex-1">{text}</p>
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 fill-gray-200'}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                    <p className="text-xs text-gray-400">
                      {location} &nbsp;·&nbsp; Rented {car}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Articles & Tips ──────────────────────────────────────── */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Articles &amp; Tips</h2>
          <p className="text-gray-500">Explore some of the best tips from around the world</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {ARTICLES.map(article => (
            <Link
              key={article.id}
              to={`/blog/${article.id}`}
              className="group border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow block"
            >
              <div className="h-52 bg-gray-200 overflow-hidden">
                <ArticleImage src={article.image} alt={article.title} />
              </div>
              <div className="p-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {article.date}
                </p>
                <h3 className="text-lg font-bold text-gray-900 mb-3 leading-snug group-hover:text-teal-600 transition-colors">
                  {article.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-5">{article.excerpt}</p>
                <span className="inline-flex items-center gap-1.5 text-sm text-teal-600 font-medium group-hover:text-teal-700 transition-colors">
                  Read More <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Guest Sign-Up CTA (hidden when logged in) ────────────── */}
      {!user && (
        <section className="py-20 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
              Ready to Hit the Road?
            </h2>
            <p className="text-teal-100 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              Create a free account in under 2 minutes and unlock exclusive deals, instant bookings,
              and a seamless rental experience.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="inline-block bg-white text-teal-600 font-bold px-10 py-4 rounded-lg hover:bg-teal-50 transition-colors text-base shadow-lg"
              >
                Create Free Account
              </Link>
              <Link
                to="/login"
                className="inline-block border-2 border-white text-white font-semibold px-10 py-4 rounded-lg hover:bg-white/10 transition-colors text-base"
              >
                Sign In
              </Link>
            </div>
            <p className="mt-6 text-teal-200 text-sm">
              No credit card required &nbsp;·&nbsp; Free forever &nbsp;·&nbsp; Cancel anytime
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

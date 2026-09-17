import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin,
  Clock,
  Phone,
  Search,
  Car,
  ArrowRight,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { getLocations } from '../api/locations'
import Spinner from '../components/ui/Spinner'
import { toast } from 'sonner'

export default function Locations() {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pickup, setPickup] = useState(null)
  const [drop, setDrop] = useState(null)
  const [pickupError, setPickupError] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    getLocations()
      .then(({ data }) => setLocations(data.data.locations || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = locations.filter(
    l =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.city.toLowerCase().includes(search.toLowerCase())
  )

  const handlePickup = loc => {
    if (pickup?._id === loc._id) {
      setPickup(null)
      return
    }
    setPickup(loc)
    setPickupError(false)
    if (drop?._id === loc._id) setDrop(null)
  }

  const handleDrop = loc => {
    if (drop?._id === loc._id) {
      setDrop(null)
      return
    }
    setDrop(loc)
    if (pickup?._id === loc._id) setPickup(null)
  }

  const handleFindCars = () => {
    if (!pickup && !drop) {
      setPickupError(true)
      toast.error('Please select at least one location')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // Use whichever location is set as the branch for car availability search
    const searchBranch = pickup || drop
    const params = new URLSearchParams({ location: searchBranch._id })
    if (pickup && drop && pickup._id !== drop._id) params.set('dropLocation', drop._id)

    navigate(`/cars?${params.toString()}`, {
      state: { pickupLocation: pickup || null, dropLocation: drop || null },
    })
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl font-bold text-gray-900">Choose Your Locations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Select your pickup and/or drop-off location — you can set either one first
          </p>
        </div>
      </div>

      {/* Selected summary bar */}
      <div className="bg-teal-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Pickup */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-teal-200 uppercase tracking-wider font-semibold mb-0.5">
                Pickup
              </p>
              {pickup ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-300 shrink-0" />
                  <span className="font-semibold truncate">
                    {pickup.name}, {pickup.city}
                  </span>
                  <button
                    onClick={() => setPickup(null)}
                    aria-label="Clear pickup location"
                    className="ml-1 text-teal-300 hover:text-white transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : drop ? (
                <p className="text-sm text-teal-300 italic">
                  Same as drop-off — or set a different branch
                </p>
              ) : pickupError ? (
                <div className="flex items-center gap-2 animate-pulse">
                  <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                  <p className="text-sm text-red-300 font-semibold">
                    Select at least one location!
                  </p>
                </div>
              ) : (
                <p className="text-sm text-teal-300 italic">Click a location below to set pickup</p>
              )}
            </div>

            <ArrowRight className="w-5 h-5 text-teal-400 hidden sm:block shrink-0" />

            {/* Drop-off */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-teal-200 uppercase tracking-wider font-semibold mb-0.5">
                Drop-off
              </p>
              {drop ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-300 shrink-0" />
                  <span className="font-semibold truncate">
                    {drop.name}, {drop.city}
                  </span>
                  <button
                    onClick={() => setDrop(null)}
                    aria-label="Clear drop-off location"
                    className="ml-1 text-teal-300 hover:text-white transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-teal-300 italic">Same as pickup (optional)</p>
              )}
            </div>

            {/* Find Cars */}
            <button
              onClick={handleFindCars}
              className="flex items-center gap-2 bg-white text-teal-700 font-bold px-5 py-2.5 rounded-lg hover:bg-teal-50 transition-colors shrink-0 text-sm"
            >
              <Car className="w-4 h-4" /> Find Cars
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="relative max-w-md mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by city or location name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📍</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No locations found</h3>
            <p className="text-sm text-gray-500">Try a different search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(loc => {
              const isPickup = pickup?._id === loc._id
              const isDrop = drop?._id === loc._id
              const canPickup = loc.isPickupAvailable !== false
              const canDrop = loc.isDropAvailable !== false

              return (
                <div
                  key={loc._id}
                  className={`bg-white rounded-2xl border-2 transition-all ${
                    isPickup || isDrop
                      ? 'border-teal-500 shadow-md shadow-teal-100'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {/* Selected badge */}
                  {(isPickup || isDrop) && (
                    <div className="rounded-t-2xl px-4 py-1.5 text-xs font-bold uppercase tracking-wider bg-teal-500 text-white">
                      {isPickup ? '✓ Pickup selected' : '✓ Drop-off selected'}
                    </div>
                  )}

                  <div className="p-5">
                    {loc.image && (
                      <div className="h-36 bg-gray-100 rounded-lg overflow-hidden mb-4">
                        <img
                          src={loc.image}
                          alt={loc.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{loc.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                          <MapPin className="w-3.5 h-3.5" /> {loc.city}, {loc.state}
                        </div>
                      </div>
                      {loc.airportLocation && (
                        <span className="text-xs bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded-full">
                          Airport
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 mb-3">{loc.address}</p>

                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                      {loc.operatingHours?.is24Hours ? (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <Clock className="w-3.5 h-3.5" /> Open 24/7
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {loc.operatingHours?.open} –{' '}
                          {loc.operatingHours?.close}
                        </span>
                      )}
                      {loc.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {loc.phone}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {canPickup && (
                        <button
                          onClick={() => handlePickup(loc)}
                          className={`flex-1 text-xs font-bold py-2 rounded-lg border-2 transition-colors ${
                            isPickup
                              ? 'bg-teal-500 border-teal-500 text-white'
                              : 'border-teal-400 text-teal-600 hover:bg-teal-50'
                          }`}
                        >
                          {isPickup ? '✓ Pickup' : 'Set Pickup'}
                        </button>
                      )}
                      {canDrop && (
                        <button
                          onClick={() => handleDrop(loc)}
                          className={`flex-1 text-xs font-bold py-2 rounded-lg border-2 transition-colors ${
                            isDrop
                              ? 'bg-teal-500 border-teal-500 text-white'
                              : 'border-teal-400 text-teal-600 hover:bg-teal-50'
                          }`}
                        >
                          {isDrop ? '✓ Drop-off' : 'Set Drop-off'}
                        </button>
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

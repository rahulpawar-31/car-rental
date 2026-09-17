import { Link } from 'react-router-dom'
import { Star, Users, Fuel, Settings, MapPin } from 'lucide-react'

export default function CarCard({ car }) {
  const primaryImage = car.images?.find(i => i.isPrimary) || car.images?.[0]

  return (
    <Link
      to={`/cars/${car._id}`}
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow duration-300 group flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] bg-gray-100 overflow-hidden shrink-0">
        {primaryImage ? (
          <img
            src={primaryImage.url}
            alt={`${car.brand} ${car.model}`}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-gray-100 to-gray-200">
            🚗
          </div>
        )}
        {car.isFeatured && (
          <span className="absolute top-2.5 left-2.5 bg-teal-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
            Featured
          </span>
        )}
        {!car.isAvailable && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Title + Rating */}
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <h3 className="font-bold text-gray-900 text-base leading-tight">
              {car.brand} {car.model}
            </h3>
            <p className="text-xs text-gray-400 capitalize mt-0.5">
              {car.type} · {car.year}
            </p>
          </div>
          {car.rating > 0 && (
            <div className="flex items-center gap-1 bg-amber-50 rounded-lg px-2 py-1 shrink-0">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-amber-700">{car.rating?.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Location */}
        {car.location && (
          <p className="flex items-center gap-1 text-xs text-gray-400 mb-3">
            <MapPin className="w-3 h-3 shrink-0" />
            {car.location.city || car.location.name}
          </p>
        )}

        {/* Specs */}
        <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-b border-gray-100 py-3 mb-3">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-teal-500" />
            {car.seats} Seats
          </span>
          <span className="flex items-center gap-1.5 capitalize">
            <Settings className="w-3.5 h-3.5 text-teal-500" />
            {car.transmission}
          </span>
          <span className="flex items-center gap-1.5 capitalize">
            <Fuel className="w-3.5 h-3.5 text-teal-500" />
            {car.fuelType}
          </span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto">
          <div>
            <span className="text-xl font-bold text-gray-900">
              ₹{car.pricePerDay?.toLocaleString()}
            </span>
            <span className="text-xs text-gray-400"> / day</span>
          </div>
          <span className="bg-teal-500 group-hover:bg-teal-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors uppercase tracking-wide">
            Rent Now
          </span>
        </div>
      </div>
    </Link>
  )
}

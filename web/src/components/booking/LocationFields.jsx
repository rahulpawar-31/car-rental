import { MapPin } from 'lucide-react'

export default function LocationFields({
  idPrefix,
  locations,
  pickupLocation,
  onPickupLocationChange,
  dropLocation,
  onDropLocationChange,
  customPickupAddr,
  onCustomPickupAddrChange,
  customDropAddr,
  onCustomDropAddrChange,
  stacked = false,
}) {
  // If there's nothing to select from (API failure, or every branch
  // deactivated), a <select> with only a placeholder option is a dead end --
  // fall back to free text so the user always has some way to say where.
  const noBranches = locations.length === 0

  return (
    <div className={`grid grid-cols-1 gap-5 ${stacked ? '' : 'sm:grid-cols-2'}`}>
      {/* Pickup — shows text input when a drop-off branch is chosen, or when there are no branches to pick from */}
      <div>
        <label
          htmlFor={`${idPrefix}-pickup-location`}
          className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
        >
          Pickup Location
        </label>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
          <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
          {dropLocation || noBranches ? (
            <input
              id={`${idPrefix}-pickup-location`}
              type="text"
              value={customPickupAddr}
              onChange={e => onCustomPickupAddrChange(e.target.value)}
              placeholder="Enter your pickup address…"
              className="flex-1 text-sm outline-none text-gray-800 bg-transparent placeholder-gray-400"
            />
          ) : (
            <select
              id={`${idPrefix}-pickup-location`}
              value={pickupLocation}
              onChange={e => onPickupLocationChange(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
            >
              <option value="">— Select branch —</option>
              {locations
                .filter(l => l.isPickupAvailable !== false)
                .map(l => (
                  <option key={l._id} value={l._id}>
                    {l.name}, {l.city}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {/* Drop-off — shows text input when a pickup branch is chosen, or when there are no branches to pick from */}
      <div>
        <label
          htmlFor={`${idPrefix}-drop-location`}
          className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5"
        >
          Drop-off Location
        </label>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
          <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
          {pickupLocation || noBranches ? (
            <input
              id={`${idPrefix}-drop-location`}
              type="text"
              value={customDropAddr}
              onChange={e => onCustomDropAddrChange(e.target.value)}
              placeholder="Enter your drop-off address…"
              className="flex-1 text-sm outline-none text-gray-800 bg-transparent placeholder-gray-400"
            />
          ) : (
            <select
              id={`${idPrefix}-drop-location`}
              value={dropLocation}
              onChange={e => onDropLocationChange(e.target.value)}
              className="flex-1 text-sm outline-none text-gray-800 bg-transparent"
            >
              <option value="">— Same as pickup —</option>
              {locations
                .filter(l => l.isDropAvailable !== false)
                .map(l => (
                  <option key={l._id} value={l._id}>
                    {l.name}, {l.city}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}

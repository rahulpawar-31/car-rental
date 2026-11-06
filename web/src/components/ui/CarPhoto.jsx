import { useState } from 'react'
import { Car } from 'lucide-react'

// Photos taller than this height/width ratio are portrait shots (a car with sky above and road
// below), not the wide side-on shots the cards were designed around.
const PORTRAIT_RATIO = 1.2

// Where to anchor the crop. Wide photos keep the bottom edge (the car sits low in the frame).
// Portrait photos would lose the whole body that way and show only the wheels, so aim at the
// lower-middle where the car body is.
const WIDE_POSITION = '50% 100%'
const PORTRAIT_POSITION = '50% 72%'

// Stock photos that show a different model from the car they are attached to (issue #88).
// They are swapped for a placeholder so customers are not misled. When the real photo is added,
// upload it under a NEW file name and update the car's image URL, then delete the entry here.
const WRONG_MODEL_PHOTOS = new Set([
  'renault-kwid.jpg',
  'renault-kwid-climber.jpg',
  'tata-altroz.jpg',
  'toyota-glanza.jpg',
  'honda-jazz.jpg',
  'honda-amaze.jpg',
])

const fileName = src => String(src ?? '').split(/[?#]/)[0].split('/').pop()

/**
 * A car photo that fills its box without cropping portrait images down to the bumper.
 * Pass the sizing classes (w-full h-full ...) via className; object-cover is added here.
 */
export default function CarPhoto({ src, className = '', style, onLoad, alt = '', ...props }) {
  // The measured position belongs to the src it was measured for. When the src changes (the car
  // page swaps its hero photo), fall back to the default until the new photo has loaded instead of
  // briefly cropping it with the previous photo's anchor.
  const [measured, setMeasured] = useState({ src: null, position: WIDE_POSITION })
  const position = measured.src === src ? measured.position : WIDE_POSITION

  if (WRONG_MODEL_PHOTOS.has(fileName(props.src))) {
    // @container lets the label hide itself in small thumbnails, where it would not fit.
    return (
      <div
        role="img"
        aria-label={alt ? `${alt}: photo coming soon` : 'Photo coming soon'}
        className={`@container flex flex-col items-center justify-center gap-1 overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 ${className}`}
      >
        <Car className="w-1/4 max-w-10 min-w-3 h-auto" aria-hidden="true" />
        <span className="hidden @[9rem]:block text-xs font-semibold">Photo coming soon</span>
      </div>
    )
  }

  const handleLoad = e => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth && naturalHeight) {
      const portrait = naturalHeight / naturalWidth > PORTRAIT_RATIO
      setMeasured({ src, position: portrait ? PORTRAIT_POSITION : WIDE_POSITION })
    }
    onLoad?.(e)
  }

  return (
    <img
      {...props}
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      style={{ objectPosition: position, ...style }}
      onLoad={handleLoad}
    />
  )
}

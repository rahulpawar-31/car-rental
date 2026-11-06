import { useState } from 'react'

// Photos taller than this height/width ratio are portrait shots (a car with sky above and road
// below), not the wide side-on shots the cards were designed around.
const PORTRAIT_RATIO = 1.2

// Where to anchor the crop. Wide photos keep the bottom edge (the car sits low in the frame).
// Portrait photos would lose the whole body that way and show only the wheels, so aim at the
// lower-middle where the car body is.
const WIDE_POSITION = '50% 100%'
const PORTRAIT_POSITION = '50% 72%'

/**
 * A car photo that fills its box without cropping portrait images down to the bumper.
 * Pass the sizing classes (w-full h-full ...) via className; object-cover is added here.
 */
export default function CarPhoto({ className = '', style, onLoad, alt = '', ...props }) {
  const [position, setPosition] = useState(WIDE_POSITION)

  const handleLoad = e => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth && naturalHeight) {
      setPosition(naturalHeight / naturalWidth > PORTRAIT_RATIO ? PORTRAIT_POSITION : WIDE_POSITION)
    }
    onLoad?.(e)
  }

  return (
    <img
      {...props}
      alt={alt}
      className={`object-cover ${className}`}
      style={{ objectPosition: position, ...style }}
      onLoad={handleLoad}
    />
  )
}

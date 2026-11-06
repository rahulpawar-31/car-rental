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
export default function CarPhoto({ src, className = '', style, onLoad, alt = '', ...props }) {
  // The measured position belongs to the src it was measured for. When the src changes (the car
  // page swaps its hero photo), fall back to the default until the new photo has loaded instead of
  // briefly cropping it with the previous photo's anchor.
  const [measured, setMeasured] = useState({ src: null, position: WIDE_POSITION })
  const position = measured.src === src ? measured.position : WIDE_POSITION

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

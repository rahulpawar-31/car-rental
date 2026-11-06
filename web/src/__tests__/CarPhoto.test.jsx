import { render, screen, fireEvent } from '@testing-library/react'
import CarPhoto from '../components/ui/CarPhoto'

function loadWithSize(img, naturalWidth, naturalHeight) {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true })
  fireEvent.load(img)
}

describe('CarPhoto', () => {
  test('keeps the bottom edge for a wide photo', () => {
    render(<CarPhoto src="/wide.jpg" alt="Swift" />)
    const img = screen.getByAltText('Swift')
    loadWithSize(img, 1600, 1067)
    expect(img.style.objectPosition).toBe('50% 100%')
  })

  test('aims at the car body for a portrait photo instead of the wheels', () => {
    render(<CarPhoto src="/tall.jpg" alt="Kwid" />)
    const img = screen.getByAltText('Kwid')
    loadWithSize(img, 1600, 2400)
    expect(img.style.objectPosition).toBe('50% 72%')
  })

  test('drops the previous photo\'s anchor when the src changes, until the new photo loads', () => {
    const { rerender } = render(<CarPhoto src="/tall.jpg" alt="Kwid" />)
    const img = screen.getByAltText('Kwid')
    loadWithSize(img, 1600, 2400)
    expect(img.style.objectPosition).toBe('50% 72%')

    rerender(<CarPhoto src="/wide.jpg" alt="Kwid" />)
    expect(screen.getByAltText('Kwid').style.objectPosition).toBe('50% 100%')

    loadWithSize(screen.getByAltText('Kwid'), 1600, 1067)
    expect(screen.getByAltText('Kwid').style.objectPosition).toBe('50% 100%')
  })

  test('passes className through and always covers its box', () => {
    render(<CarPhoto src="/a.jpg" alt="A" className="w-full h-full" />)
    expect(screen.getByAltText('A').className).toBe('object-cover w-full h-full')
  })
})

describe('CarPhoto placeholder for photos of the wrong model (#88)', () => {
  test.each([
    '/cars/renault-kwid.jpg',
    '/cars/renault-kwid-climber.jpg',
    '/cars/tata-altroz.jpg',
    '/cars/toyota-glanza.jpg',
    '/cars/honda-jazz.jpg',
    '/cars/honda-amaze.jpg',
    'https://example.com/cars/honda-jazz.jpg?v=2',
  ])('shows "photo coming soon" instead of %s', src => {
    render(<CarPhoto src={src} alt="Some car" className="w-full h-full" />)
    expect(screen.getByRole('img', { name: /photo coming soon/i })).toBeInTheDocument()
    expect(screen.getByText('Photo coming soon')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  test('still shows the real photo for every other car', () => {
    render(<CarPhoto src="/cars/maruti-swift.jpg" alt="Swift" />)
    expect(screen.getByAltText('Swift')).toHaveAttribute('src', '/cars/maruti-swift.jpg')
    expect(screen.queryByText('Photo coming soon')).not.toBeInTheDocument()
  })

  test('does not mistake a similar name for a flagged one', () => {
    render(<CarPhoto src="/cars/honda-jazz-new.jpg" alt="Jazz" />)
    expect(screen.getByAltText('Jazz')).toBeInTheDocument()
  })
})

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

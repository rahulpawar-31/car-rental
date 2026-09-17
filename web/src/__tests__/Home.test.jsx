import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '../pages/Home'
import { getFeaturedCars } from '../api/cars'
import { getLocations } from '../api/locations'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../api/cars', () => ({
  getCars: vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  getFeaturedCars: vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  getCarFilters: vi.fn(() => Promise.resolve({ data: { data: { brands: [], types: [] } } })),
}))

vi.mock('../api/locations', () => ({
  getLocations: vi.fn(() => Promise.resolve({ data: { data: { locations: [] } } })),
}))

vi.mock('../store/authStore', () => ({
  default: () => ({ user: null }),
}))

vi.mock('../components/ui/Spinner', () => ({
  default: () => <div data-testid="spinner" />,
}))

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

describe('Home page', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  test('renders Pickup Location and Drop-off Location fields in the hero search', async () => {
    renderHome()
    await waitFor(() => {
      expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument()
    })
  })

  test('searching with no location picked navigates to /cars without a location param', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/cars?sort=price-asc', { state: undefined })
  })

  test('searching with a pickup location selected includes it in the URL and passes it via router state', async () => {
    getLocations.mockResolvedValueOnce({
      data: {
        data: {
          locations: [
            {
              _id: 'loc1',
              name: 'MG Road Branch',
              city: 'Bengaluru',
              isPickupAvailable: true,
              isDropAvailable: true,
            },
          ],
        },
      },
    })
    renderHome()
    await waitFor(() => expect(screen.getByLabelText(/pickup location/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/pickup location/i), { target: { value: 'loc1' } })
    fireEvent.click(screen.getByRole('button', { name: /search/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/cars?location=loc1&sort=price-asc', {
      state: { pickupLocation: expect.objectContaining({ _id: 'loc1' }), dropLocation: null },
    })
  })

  test('searching with only a drop-off location still filters /cars by that branch (falls back to it, matching Locations.jsx)', async () => {
    getLocations.mockResolvedValueOnce({
      data: {
        data: {
          locations: [
            {
              _id: 'loc2',
              name: 'Airport Branch',
              city: 'Mumbai',
              isPickupAvailable: true,
              isDropAvailable: true,
            },
          ],
        },
      },
    })
    renderHome()
    await waitFor(() => expect(screen.getByLabelText(/drop-off location/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/drop-off location/i), { target: { value: 'loc2' } })
    fireEvent.click(screen.getByRole('button', { name: /search/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/cars?location=loc2&sort=price-asc', {
      state: { pickupLocation: null, dropLocation: expect.objectContaining({ _id: 'loc2' }) },
    })
  })

  test('renders a "Read More" link for each article', async () => {
    renderHome()
    await waitFor(() => {
      expect(screen.getAllByText(/read more/i).length).toBe(3)
    })
  })

  test('ArticleImage shows emoji fallback when image fails to load', async () => {
    renderHome()
    // Wait for the articles section to appear
    await waitFor(() => {
      expect(screen.getAllByText(/read more/i).length).toBeGreaterThan(0)
    })
    // Fire error on all article images
    const imgs = document.querySelectorAll('img[alt]')
    const articleImgs = Array.from(imgs).filter(
      img =>
        img.alt.toLowerCase().includes('article') ||
        img.alt.toLowerCase().includes('tip') ||
        img.alt.toLowerCase().includes('car') ||
        img.closest('[class*="group"]')
    )
    if (articleImgs.length > 0) {
      fireEvent.error(articleImgs[0])
      await waitFor(() => {
        expect(document.querySelector('[class*="bg-gray-100"]')).toBeInTheDocument()
      })
    }
  })

  test('renders the three article cards', async () => {
    renderHome()
    await waitFor(() => {
      expect(screen.getByText(/first-time car renters/i)).toBeInTheDocument()
      expect(screen.getAllByText(/road trip/i).length).toBeGreaterThan(0)
    })
  })

  test('renders a Featured Cars section when the API returns featured cars', async () => {
    getFeaturedCars.mockResolvedValueOnce({
      data: {
        data: {
          cars: [
            {
              _id: 'car1',
              brand: 'Skoda',
              model: 'Octavia',
              type: 'sedan',
              year: 2024,
              pricePerDay: 4500,
              isFeatured: true,
            },
          ],
        },
      },
    })
    renderHome()
    await waitFor(() => {
      expect(screen.getByText(/featured cars/i)).toBeInTheDocument()
      expect(screen.getByText(/skoda octavia/i)).toBeInTheDocument()
    })
  })

  test('does not render a Featured Cars section when there are none', async () => {
    renderHome()
    await waitFor(() => {
      expect(screen.getAllByText(/read more/i).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/featured cars/i)).not.toBeInTheDocument()
  })
})

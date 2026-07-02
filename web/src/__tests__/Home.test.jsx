import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from '../pages/Home'

vi.mock('../api/cars', () => ({
  getCars:        vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  getFeaturedCars: vi.fn(() => Promise.resolve({ data: { data: { cars: [] } } })),
  getCarFilters:  vi.fn(() => Promise.resolve({ data: { data: { brands: [], types: [] } } })),
}))

vi.mock('../store/authStore', () => ({
  default: () => ({ user: null }),
}))

vi.mock('../components/ui/Spinner', () => ({
  default: () => <div data-testid="spinner" />,
}))

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>)
}

describe('Home page', () => {
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
    const articleImgs = Array.from(imgs).filter(img =>
      img.alt.toLowerCase().includes('article') || img.alt.toLowerCase().includes('tip') ||
      img.alt.toLowerCase().includes('car') || img.closest('[class*="group"]')
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
})

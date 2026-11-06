import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Cars from '../pages/Cars'
import { getCars } from '../api/cars'

vi.mock('../api/cars', () => ({
  getCars: vi.fn(),
  getCarFilters: vi.fn(() =>
    Promise.resolve({
      data: {
        data: {
          brands: ['BMW'],
          types: ['sedan', 'suv'],
          fuelTypes: ['petrol'],
          priceRange: { min: 0, max: 10000 },
        },
      },
    })
  ),
}))

vi.mock('../api/locations', () => ({
  getLocationById: vi.fn(() => Promise.resolve({ data: { data: { location: null } } })),
}))

const makeCar = n => ({
  _id: `car${n}`,
  brand: 'BMW',
  model: `M${n}`,
  type: 'sedan',
  pricePerDay: 5000,
  seats: 5,
  fuelType: 'petrol',
  transmission: 'automatic',
  isAvailable: true,
  rating: 0,
  reviewCount: 0,
  images: [],
})

const result = total => ({
  data: {
    data: {
      cars: Array.from({ length: total }, (_, i) => makeCar(i + 1)),
      pagination: { page: 1, limit: 12, total, pages: 1 },
    },
  },
})

// A request the test settles by hand, so the "still loading" state can be observed.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderCars() {
  return render(
    <MemoryRouter>
      <Cars />
    </MemoryRouter>
  )
}

// The "N cars found" line only. (The empty state's "No cars found" heading must not match.)
const foundLabel = () =>
  screen.getByText((_, el) => el?.tagName === 'P' && /^\d+\s+cars\s+found/.test(el.textContent.trim()))
const findFoundLabel = () => waitFor(() => foundLabel())
const typeSelect = () => screen.getAllByRole('combobox').find(s => within(s).queryByText(/suv/i))
const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: /filters/i }))
const drawerButton = () => screen.getByRole('button', { name: /^(show \d+ cars|show cars|updating…)$/i })

describe('Cars result count (#86)', () => {
  beforeEach(() => {
    getCars.mockReset()
  })

  test('the drawer button and the "cars found" label show the same number', async () => {
    getCars.mockResolvedValue(result(5))
    renderCars()

    expect(await findFoundLabel()).toHaveTextContent('5 cars found')
    openDrawer()
    expect(drawerButton()).toHaveTextContent('Show 5 cars')
  })

  test('shows "Updating…" instead of the previous total while the next request is loading', async () => {
    getCars.mockResolvedValueOnce(result(6))
    renderCars()
    await findFoundLabel()
    openDrawer()
    expect(drawerButton()).toHaveTextContent('Show 6 cars')

    const next = deferred()
    getCars.mockReturnValueOnce(next.promise)
    fireEvent.change(typeSelect(), { target: { value: 'suv' } })

    await waitFor(() => expect(drawerButton()).toHaveTextContent('Updating…'))
    expect(screen.queryByText(/show 6 cars/i)).not.toBeInTheDocument()

    next.resolve(result(0))
    await waitFor(() => expect(drawerButton()).toHaveTextContent('Show 0 cars'))
    expect(foundLabel()).toHaveTextContent('0 cars found')
  })

  test('a failed request does not leave the previous cars and total on screen', async () => {
    getCars.mockResolvedValueOnce(result(3))
    renderCars()
    expect(await findFoundLabel()).toHaveTextContent('3 cars found')
    openDrawer()

    getCars.mockRejectedValueOnce(new Error('Network Error'))
    fireEvent.change(typeSelect(), { target: { value: 'suv' } })

    expect(await screen.findAllByText(/could not load cars/i)).not.toHaveLength(0)
    expect(screen.queryByText(/^\d+\s+cars\s+found/)).not.toBeInTheDocument()
    expect(screen.queryByText('M1')).not.toBeInTheDocument()
    expect(drawerButton()).toHaveTextContent('Show cars')
    expect(screen.queryByText(/show 3 cars/i)).not.toBeInTheDocument()
  })

  test('"Try again" loads the cars after a failure', async () => {
    getCars.mockRejectedValueOnce(new Error('Network Error'))
    renderCars()
    const tryAgain = await screen.findByRole('button', { name: /try again/i })

    getCars.mockResolvedValue(result(2)) // set first: the click refetches right away
    fireEvent.click(tryAgain)
    expect(await findFoundLabel()).toHaveTextContent('2 cars found')
    expect(screen.queryByText(/could not load cars/i)).not.toBeInTheDocument()
  })
})

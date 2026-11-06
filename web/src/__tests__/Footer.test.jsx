import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../components/layout/Footer'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// The real store persists to localStorage, which this test environment does not provide.
let mockUser = null
vi.mock('../store/authStore', () => ({
  default: () => ({ user: mockUser }),
}))

function renderFooter() {
  return render(<MemoryRouter><Footer /></MemoryRouter>)
}

describe('Footer', () => {
  beforeEach(() => { vi.clearAllMocks(); mockUser = null })

  test('newsletter form triggers success toast on submit', () => {
    renderFooter()
    const emailInput = screen.getByPlaceholderText(/your email address/i)
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(emailInput.closest('form'))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/subscribing/i))
  })

  test('newsletter input is cleared after submit', () => {
    renderFooter()
    const emailInput = screen.getByPlaceholderText(/your email address/i)
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(emailInput.closest('form'))
    expect(emailInput.value).toBe('')
  })

  test('has no placeholder links that go nowhere', () => {
    renderFooter()
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(0)
    hrefs.forEach(href => expect(href).not.toBe('#'))
  })

  test('links to the real Privacy Policy and Terms of Service pages', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })

  test('shows the Sign Up link to visitors', () => {
    renderFooter()
    expect(screen.getByRole('link', { name: 'Sign Up' })).toBeInTheDocument()
  })

  test('hides the Sign Up link once signed in', () => {
    mockUser = { name: 'Priya' }
    renderFooter()
    expect(screen.queryByRole('link', { name: 'Sign Up' })).not.toBeInTheDocument()
  })

  test('renders copyright notice with current year', () => {
    renderFooter()
    expect(screen.getByText(new RegExp(new Date().getFullYear().toString()))).toBeInTheDocument()
  })
})

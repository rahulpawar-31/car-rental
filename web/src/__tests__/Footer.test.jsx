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

  test('social links do not navigate (preventDefault)', () => {
    renderFooter()
    const socialLinks = screen.getAllByRole('link', { name: /facebook|twitter|instagram|youtube/i })
    expect(socialLinks.length).toBeGreaterThan(0)
    socialLinks.forEach(link => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })

  test('privacy policy and terms links do not navigate', () => {
    renderFooter()
    const privacyLink = screen.getByText(/privacy policy/i)
    const termsLink   = screen.getByText(/terms of service/i)
    ;[privacyLink, termsLink].forEach(link => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
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

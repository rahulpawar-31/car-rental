import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../components/layout/Footer'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function renderFooter() {
  return render(<MemoryRouter><Footer /></MemoryRouter>)
}

describe('Footer', () => {
  beforeEach(() => { vi.clearAllMocks() })

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
    expect(screen.queryByText(/privacy policy|terms of service/i)).not.toBeInTheDocument()
  })

  test('renders copyright notice with current year', () => {
    renderFooter()
    expect(screen.getByText(new RegExp(new Date().getFullYear().toString()))).toBeInTheDocument()
  })
})

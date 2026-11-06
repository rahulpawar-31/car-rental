import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Privacy from '../pages/Privacy'
import Terms from '../pages/Terms'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Privacy Policy page', () => {
  test('has a title, a date and the sections a customer looks for', () => {
    renderAt('/privacy')
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
    for (const heading of ['What we collect', 'How we use it', 'Cookies and browser storage', 'Who we share it with', 'Your choices']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
    }
  })

  test('discloses the contact form and what the browser keeps', () => {
    renderAt('/privacy')
    expect(screen.getByText(/messages you send through the contact form/i)).toBeInTheDocument()
    expect(screen.getByText(/keeps a copy of your account details in its local storage/i)).toBeInTheDocument()
  })

  test('names the services that handle customer data and says how to reach us', () => {
    renderAt('/privacy')
    expect(screen.getByText(/Razorpay, our payment provider/)).toBeInTheDocument()
    expect(screen.getByText(/Cloudinary/)).toBeInTheDocument()
    expect(screen.getAllByText(/support@driveease\.com/).length).toBeGreaterThan(0)
  })
})

describe('Terms of Service page', () => {
  test('has a title, a date and the sections a customer looks for', () => {
    renderAt('/terms')
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
    for (const heading of ['Who can drive', 'Pickup and drop-off', 'Cancelling and refunds', 'Payments']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
    }
  })

  // These three tiers are the rule in api/src/services/booking.js (calculateRefund). If that rule
  // changes, this page has to change with it.
  test('states the cancellation refund tiers', () => {
    renderAt('/terms')
    expect(screen.getByText(/48 hours or more before pickup: full refund/i)).toBeInTheDocument()
    expect(screen.getByText(/between 24 and 48 hours before pickup: 50%/i)).toBeInTheDocument()
    expect(screen.getByText(/less than 24 hours before pickup: no refund/i)).toBeInTheDocument()
  })

  test('does not promise a car is collected only from a branch, and tells pickup-only pickups what to do', () => {
    renderAt('/terms')
    expect(screen.getByText(/or the address you entered in the booking form/i)).toBeInTheDocument()
    expect(screen.queryByText(/branch you chose/i)).not.toBeInTheDocument()
    expect(screen.getByText(/if you pick up at a pickup-only branch, choose a different drop-off branch/i)).toBeInTheDocument()
  })

  test('links on to the other legal page', () => {
    renderAt('/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })
})

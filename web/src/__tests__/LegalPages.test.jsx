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
    for (const heading of ['What we collect', 'How we use it', 'Cookies', 'Who we share it with', 'Your choices']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
    }
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

  test('links on to the other legal page', () => {
    renderAt('/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })
})

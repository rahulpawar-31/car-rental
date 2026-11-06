import { render, screen } from '@testing-library/react'
import App from '../App'

// The real router in App.jsx: the footer links must lead to pages, not to "Page not found".
vi.mock('../store/authStore', () => {
  const state = { user: null, loadUser: vi.fn(), init: vi.fn(), initAuth: vi.fn(), isLoading: false }
  const useAuthStore = selector => (typeof selector === 'function' ? selector(state) : state)
  useAuthStore.getState = () => state
  useAuthStore.subscribe = () => () => {}
  return { default: useAuthStore }
})

describe('legal page routes', () => {
  test.each([
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
  ])('%s renders its page inside the site layout', async (path, title) => {
    window.history.pushState({}, '', path)
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument()
  })
})

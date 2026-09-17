import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '../pages/Login'
import { toast } from 'sonner'

const mockLogin = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../store/authStore', () => ({
  default: () => ({ login: mockLogin, isLoading: false, user: null }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  )
}

describe('Login page', () => {
  beforeEach(() => {
    mockLogin.mockClear()
    mockNavigate.mockClear()
    toast.success.mockClear()
    toast.error.mockClear()
  })

  test('renders email and password fields and a Sign in button', () => {
    renderLogin()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('submitting valid credentials logs in and navigates home', async () => {
    mockLogin.mockResolvedValueOnce({ success: true })
    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'priya@example.com' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'hunter2024' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({ email: 'priya@example.com', password: 'hunter2024' })
    )
    expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true })
    expect(toast.success).toHaveBeenCalled()
  })

  test('shows an error toast and does not navigate when login fails', async () => {
    mockLogin.mockResolvedValueOnce({ success: false, message: 'Invalid credentials' })
    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'priya@example.com' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  test('the password visibility toggle switches the input type', () => {
    renderLogin()
    const passwordInput = screen.getByLabelText(/^password$/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: /show password/i }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument()
  })
})

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from '../pages/ForgotPassword'
import { forgotPassword, verifyOtp, resetPassword } from '../api/auth'
import { toast } from 'sonner'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../api/auth', () => ({
  forgotPassword: vi.fn(() => Promise.resolve({})),
  verifyOtp: vi.fn(() => Promise.resolve({ data: { data: { resetToken: 'reset-token-1' } } })),
  resetPassword: vi.fn(() => Promise.resolve({})),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

function renderForgotPassword() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  )
}

async function advanceToStep2() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'priya@example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: /send otp/i }))
  await waitFor(() => expect(screen.getByLabelText(/enter otp/i)).toBeInTheDocument())
}

async function advanceToStep3() {
  await advanceToStep2()
  fireEvent.change(screen.getByLabelText(/enter otp/i), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: /verify otp/i }))
  await waitFor(() => expect(screen.getByLabelText(/new password/i)).toBeInTheDocument())
}

describe('ForgotPassword page', () => {
  beforeEach(() => {
    forgotPassword.mockClear()
    verifyOtp.mockClear()
    resetPassword.mockClear()
    mockNavigate.mockClear()
  })

  test('step 1 renders an email field and a Send OTP button', () => {
    renderForgotPassword()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send otp/i })).toBeInTheDocument()
  })

  test('submitting an email sends the OTP request and advances to step 2', async () => {
    renderForgotPassword()
    await advanceToStep2()
    expect(forgotPassword).toHaveBeenCalledWith('priya@example.com')
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument()
  })

  test('the Verify OTP button is disabled until 6 digits are entered', async () => {
    renderForgotPassword()
    await advanceToStep2()
    expect(screen.getByRole('button', { name: /verify otp/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/enter otp/i), { target: { value: '123456' } })
    expect(screen.getByRole('button', { name: /verify otp/i })).toBeEnabled()
  })

  test('verifying the OTP advances to step 3 with the returned reset token', async () => {
    renderForgotPassword()
    await advanceToStep3()
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'priya@example.com', otp: '123456' })
    expect(screen.getByText(/choose new password/i)).toBeInTheDocument()
  })

  test('resetting the password submits the reset token and navigates to login', async () => {
    renderForgotPassword()
    await advanceToStep3()
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'newpassword123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        resetToken: 'reset-token-1',
        password: 'newpassword123',
      })
    )
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  test('rejects a new password shorter than 8 characters without calling the API', async () => {
    renderForgotPassword()
    await advanceToStep3()
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

    expect(toast.error).toHaveBeenCalledWith('Password must be at least 8 characters')
    expect(resetPassword).not.toHaveBeenCalled()
  })
})

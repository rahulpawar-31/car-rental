import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Car, ArrowLeft, ShieldCheck, KeyRound, Mail } from 'lucide-react'
import { forgotPassword, verifyOtp, resetPassword } from '../api/auth'
import { getErrorMessage } from '../api/errors'
import Button from '../components/ui/Button'
import { toast } from 'sonner'

export default function ForgotPassword() {
  const [step, setStep] = useState(1) // 1: email, 2: otp, 3: new password
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSendOtp = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
      toast.success('OTP sent to your email')
      setStep(2)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send OTP'))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await verifyOtp({ email, otp })
      setResetToken(data.data.resetToken)
      setStep(3)
    } catch (err) {
      toast.error(getErrorMessage(err, 'Invalid or expired OTP'))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async e => {
    e.preventDefault()
    if (password.length < 8) return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      await resetPassword({ resetToken, password })
      toast.success('Password reset! Please log in.')
      navigate('/login')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reset password'))
    } finally {
      setLoading(false)
    }
  }

  const STEPS = [
    { label: 'Enter email', icon: Mail },
    { label: 'Verify OTP', icon: ShieldCheck },
    { label: 'New password', icon: KeyRound },
  ]

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ──────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-teal-900 flex-col items-center justify-center p-14 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'radial-gradient(circle, #14b8a6 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative z-10 text-center max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center">
              <Car className="w-6 h-6 text-white" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">
              Drive<span className="text-teal-400">Ease</span>
            </span>
          </div>

          <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight">
            Account Recovery
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Reset your password in three simple steps — we'll send a one-time code to your inbox.
          </p>

          <div className="mt-12 space-y-4 text-left">
            {STEPS.map(({ label, icon: Icon }, i) => (
              <div
                key={label}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                  step === i + 1
                    ? 'bg-teal-500/20 border-teal-500/40'
                    : step > i + 1
                      ? 'bg-white/5 border-white/10 opacity-70'
                      : 'bg-white/5 border-white/10 opacity-40'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    step >= i + 1 ? 'bg-teal-500' : 'bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Step {i + 1}</p>
                  <p className="text-white font-semibold text-sm">{label}</p>
                </div>
                {step > i + 1 && (
                  <span className="ml-auto text-teal-400 text-xs font-semibold">Done ✓</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-12 bg-white/5 rounded-2xl p-5 border border-white/10 text-left">
            <ShieldCheck className="w-6 h-6 text-teal-400 mb-3" />
            <p className="text-gray-300 text-sm leading-relaxed">
              Your OTP expires in <span className="text-teal-400 font-semibold">10 minutes</span>.
              Check your spam folder if you don't see it in your inbox.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel: form ────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">
              Drive<span className="text-teal-500">Ease</span>
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">
                {step === 1 && 'Forgot password?'}
                {step === 2 && 'Check your inbox'}
                {step === 3 && 'Choose new password'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {step === 1 && "We'll send a 6-digit OTP to your email"}
                {step === 2 && `OTP sent to ${email}`}
                {step === 3 && 'Choose a strong new password'}
              </p>
            </div>

            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-password-email"
                    className="text-sm font-medium text-gray-700 block mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="forgot-password-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Sending...' : 'Send OTP'}
                </Button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-password-otp"
                    className="text-sm font-medium text-gray-700 block mb-1.5"
                  >
                    Enter OTP
                  </label>
                  <input
                    id="forgot-password-otp"
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/, ''))}
                    placeholder="6-digit code"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 text-center tracking-widest text-lg"
                  />
                </div>
                <Button type="submit" disabled={loading || otp.length < 6} className="w-full">
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Use a different email
                </button>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label
                    htmlFor="forgot-password-new-password"
                    className="text-sm font-medium text-gray-700 block mb-1.5"
                  >
                    New Password
                  </label>
                  <input
                    id="forgot-password-new-password"
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-gray-500 mt-6">
              <Link
                to="/login"
                className="text-teal-600 font-medium hover:underline flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { Eye, EyeOff, Car, Star, Users, MapPin } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { toast } from 'sonner'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const { login, isLoading, user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/home'

  if (user) return <Navigate to={from === '/login' ? '/home' : from} replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await login(form)
    if (result.success) {
      toast.success('Welcome back!')
      navigate(from, { replace: true })
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: branding ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-900 via-gray-800 to-teal-900 flex-col items-center justify-center p-14 relative overflow-hidden">
        {/* subtle grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle, #14b8a6 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

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
            Premium Car Rentals Across India
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Find the perfect car for every journey — flexible dates, instant confirmation.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { label: '500+', sub: 'Cars Available', Icon: Car },
              { label: '10K+', sub: 'Happy Customers', Icon: Users },
              { label: '50+',  sub: 'Locations',       Icon: MapPin },
            ].map(({ label, sub, Icon }) => (
              <div key={sub} className="text-center">
                <Icon className="w-5 h-5 text-teal-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 bg-white/5 rounded-2xl p-5 border border-white/10 text-left">
            <div className="flex gap-1 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-teal-400 text-teal-400" />
              ))}
            </div>
            <p className="text-gray-300 text-sm italic leading-relaxed">
              "Seamless booking experience. Got my car within minutes — highly recommend DriveEase!"
            </p>
            <p className="text-teal-400 text-xs font-semibold mt-3">— Priya S., Mumbai</p>
          </div>
        </div>
      </div>

      {/* ── Right panel: form ────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">
              Drive<span className="text-teal-500">Ease</span>
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
              <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label htmlFor="login-password" className="text-sm font-medium text-gray-700">Password</label>
                  <Link to="/forgot-password" className="text-xs text-teal-600 hover:underline">Forgot password?</Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-teal-500 text-white font-semibold py-2.5 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60 mt-2"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-teal-600 font-medium hover:underline">Sign up</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

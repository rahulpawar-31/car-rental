import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Car, Shield, Clock, CreditCard } from 'lucide-react'
import useAuthStore from '../store/authStore'
import Button from '../components/ui/Button'
import { toast } from 'sonner'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const { register, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    const result = await register(form)
    if (result.success) {
      toast.success('Account created! Welcome to DriveEase.')
      navigate('/home')
    } else {
      toast.error(result.message)
    }
  }

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel: branding ─────────────────────────────────── */}
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
            Join 10,000+ Happy Renters
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Create a free account and start booking premium cars across India today.
          </p>

          <div className="mt-12 space-y-4 text-left">
            {[
              {
                Icon: Shield,
                title: 'Fully Insured',
                desc: 'Every rental includes third-party insurance',
              },
              {
                Icon: Clock,
                title: 'Instant Confirmation',
                desc: 'Book in minutes, drive the same day',
              },
              {
                Icon: CreditCard,
                title: 'Flexible Payment',
                desc: 'Pay online securely via card or UPI',
              },
            ].map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-4 bg-white/5 rounded-2xl p-4 border border-white/10"
              >
                <div className="w-9 h-9 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-teal-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{title}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
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
              <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
              <p className="text-sm text-gray-500 mt-1">Start renting in minutes</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="register-name"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="register-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={set('name')}
                  placeholder="John Doe"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="register-email"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Email
                </label>
                <input
                  id="register-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="register-phone"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Phone
                </label>
                <input
                  id="register-phone"
                  type="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="register-password"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="register-password"
                    type={showPw ? 'text' : 'password'}
                    required
                    value={form.password}
                    onChange={set('password')}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isLoading} className="w-full mt-2">
                {isLoading ? 'Creating account...' : 'Create account'}
              </Button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-teal-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

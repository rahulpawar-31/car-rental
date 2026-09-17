import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Menu, X, User, LogOut, LayoutDashboard, ChevronDown, Phone, MapPin } from 'lucide-react'
import { FaFacebookF, FaTwitter, FaInstagram } from 'react-icons/fa'
import useAuthStore from '../../store/authStore'

const NAV_LINKS = [
  { to: '/home', label: 'Home', exact: true },
  { to: '/cars', label: 'Cars', exact: true },
  { to: '/locations', label: 'Locations', exact: true },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const dropRef = useRef(null)
  const isBookingActive = location.pathname.startsWith('/booking')

  useEffect(() => {
    const handler = e => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    setDropOpen(false)
    setMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="bg-[#111111] text-gray-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-teal-400" />
              184 Main Street East, Mumbai 8007
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-teal-400" />
              1.800.456.8743
            </span>
          </div>
          {/* Mobile: just phone */}
          <span className="flex sm:hidden items-center gap-1.5">
            <Phone className="w-3 h-3 text-teal-400" />
            1.800.456.8743
          </span>
          {/* Social links */}
          <div className="flex items-center gap-3">
            <a
              href="#"
              onClick={e => e.preventDefault()}
              aria-label="Facebook"
              className="w-7 h-7 rounded-full border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-teal-400 transition-colors"
            >
              <FaFacebookF size={12} />
            </a>
            <a
              href="#"
              onClick={e => e.preventDefault()}
              aria-label="Twitter"
              className="w-7 h-7 rounded-full border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-teal-400 transition-colors"
            >
              <FaTwitter size={12} />
            </a>
            <a
              href="#"
              onClick={e => e.preventDefault()}
              aria-label="Instagram"
              className="w-7 h-7 rounded-full border border-gray-600 flex items-center justify-center text-gray-400 hover:text-white hover:border-teal-400 transition-colors"
            >
              <FaInstagram size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* ── Main navbar ─────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[68px]">
            {/* Logo */}
            <Link to="/home" className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1" />
                  <path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1" />
                  <path d="M5 7l1.5-4h11L19 7" />
                  <rect x="5" y="7" width="14" height="10" rx="1" />
                  <circle cx="7.5" cy="17" r="2" fill="white" stroke="white" />
                  <circle cx="16.5" cy="17" r="2" fill="white" stroke="white" />
                </svg>
              </div>
              <span className="font-bold text-xl text-gray-900 tracking-tight">
                Drive<span className="text-teal-500">Ease</span>
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(link => (
                <NavLink
                  key={link.label}
                  to={link.to}
                  end={link.exact}
                  className={({ isActive }) =>
                    `px-4 py-2 text-sm font-medium transition-colors relative group ${
                      isActive ? 'text-teal-500' : 'text-gray-700 hover:text-teal-500'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {link.label}
                      <span
                        className={`absolute bottom-0 left-4 right-4 h-0.5 bg-teal-500 rounded-full transition-transform origin-left ${
                          isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                        }`}
                      />
                    </>
                  )}
                </NavLink>
              ))}

              {/* My Bookings — only for logged-in users */}
              {user && (
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => {
                    const active = isActive || isBookingActive
                    return `px-4 py-2 text-sm font-medium transition-colors relative group ${
                      active ? 'text-teal-500' : 'text-gray-700 hover:text-teal-500'
                    }`
                  }}
                >
                  {({ isActive }) => {
                    const active = isActive || isBookingActive
                    return (
                      <>
                        My Bookings
                        <span
                          className={`absolute bottom-0 left-4 right-4 h-0.5 bg-teal-500 rounded-full transition-transform origin-left ${
                            active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                          }`}
                        />
                      </>
                    )
                  }}
                </NavLink>
              )}
            </div>

            {/* Right side: auth */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <div className="relative" ref={dropRef}>
                  <button
                    onClick={() => setDropOpen(!dropOpen)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-teal-500 transition-colors py-2"
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-teal-100"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white font-semibold text-sm">
                        {user.name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <span>{user.name?.split(' ')[0]}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${dropOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {dropOpen && (
                    <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl py-1.5 z-50">
                      <div className="px-4 py-2 border-b border-gray-100 mb-1">
                        <p className="text-xs font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <Link
                        to="/dashboard"
                        onClick={() => setDropOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4" /> Dashboard
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setDropOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                      >
                        <User className="w-4 h-4" /> Profile
                      </Link>
                      {user.role === 'admin' && (
                        <Link
                          to="/admin"
                          onClick={() => setDropOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-600 transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4" /> Admin Panel
                        </Link>
                      )}
                      <hr className="my-1 border-gray-100" />
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 w-full text-left transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-gray-700 hover:text-teal-500 transition-colors px-3 py-2"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="text-sm font-bold bg-teal-500 hover:bg-teal-600 text-white px-5 py-2 rounded-lg transition-colors"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Mobile toggle */}
            <button
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-4 py-3 space-y-1">
              {NAV_LINKS.map(link => (
                <NavLink
                  key={link.label}
                  to={link.to}
                  end={link.exact}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive ? 'bg-teal-50 text-teal-600' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              {user && (
                <NavLink
                  to="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => {
                    const active = isActive || isBookingActive
                    return `block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      active ? 'bg-teal-50 text-teal-600' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }}
                >
                  My Bookings
                </NavLink>
              )}
            </div>

            <div className="border-t border-gray-100 px-4 py-3">
              {user ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-3 px-3 py-2 mb-2">
                    <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-semibold">
                      {user.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                  >
                    <User className="w-4 h-4" /> Profile
                  </Link>
                  {user.role === 'admin' && (
                    <Link
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
                    >
                      <LayoutDashboard className="w-4 h-4" /> Admin Panel
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-lg w-full text-left"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center py-2.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:border-teal-400 hover:text-teal-600 transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center py-2.5 text-sm font-bold bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MapPin, Mail } from 'lucide-react'
import { FaFacebookF, FaTwitter, FaInstagram, FaYoutube } from 'react-icons/fa'
import { toast } from 'sonner'
import Button from '../ui/Button'

export default function Footer() {
  const [email, setEmail] = useState('')

  const handleSubscribe = e => {
    e.preventDefault()
    toast.success("Thanks for subscribing! We'll keep you posted.")
    setEmail('')
  }

  const noNav = e => e.preventDefault()

  return (
    <footer className="bg-[#111111] text-gray-400">
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* About Us */}
          <div>
            <Link to="/home" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4"
                >
                  <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1" />
                  <path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1" />
                  <path d="M5 7l1.5-4h11L19 7" />
                  <rect x="5" y="7" width="14" height="10" rx="1" />
                  <circle cx="7.5" cy="17" r="2" fill="white" stroke="white" />
                  <circle cx="16.5" cy="17" r="2" fill="white" stroke="white" />
                </svg>
              </div>
              <span className="font-bold text-lg text-white tracking-tight">
                Drive<span className="text-teal-400">Ease</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed mb-5">
              Getting dressed up and traveling with good friends makes for a shared, unforgettable
              experience. Your trusted partner for premium car rentals across India.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                onClick={noNav}
                aria-label="Facebook"
                className="w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:border-teal-400 hover:text-teal-400 transition-colors"
              >
                <FaFacebookF size={14} />
              </a>
              <a
                href="#"
                onClick={noNav}
                aria-label="Twitter"
                className="w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:border-teal-400 hover:text-teal-400 transition-colors"
              >
                <FaTwitter size={14} />
              </a>
              <a
                href="#"
                onClick={noNav}
                aria-label="Instagram"
                className="w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:border-teal-400 hover:text-teal-400 transition-colors"
              >
                <FaInstagram size={14} />
              </a>
              <a
                href="#"
                onClick={noNav}
                aria-label="YouTube"
                className="w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:border-teal-400 hover:text-teal-400 transition-colors"
              >
                <FaYoutube size={14} />
              </a>
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-widest mb-5">
              Contact Info
            </h4>
            <ul className="space-y-3.5 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <div>
                  <p>1.567.124.4227</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <div>
                  <p>184 Main Street East Harbour 8007</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                <div>
                  <a
                    href="mailto:support@driveease.com"
                    className="hover:text-teal-400 transition-colors"
                  >
                    support@driveease.com
                  </a>
                </div>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-widest mb-2">
              Newsletter
            </h4>
            <p className="text-sm mb-5">
              Don&apos;t miss a thing! Sign up to receive daily deals and exclusive offers.
            </p>
            <form onSubmit={handleSubscribe} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your Email Address"
                required
                className="w-full bg-[#1c1c1c] border border-gray-700 text-gray-300 placeholder-gray-600 text-sm px-4 py-3 rounded-lg outline-none focus:border-teal-400 transition-colors"
              />
              <Button type="submit" className="w-full uppercase tracking-wider">
                Subscribe
              </Button>
            </form>

            <div className="mt-8">
              <h4 className="text-white font-bold text-sm uppercase tracking-widest mb-3">
                Quick Links
              </h4>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <Link to="/cars" className="hover:text-teal-400 transition-colors">
                  Browse Cars
                </Link>
                <Link to="/locations" className="hover:text-teal-400 transition-colors">
                  Locations
                </Link>
                <Link to="/about" className="hover:text-teal-400 transition-colors">
                  About Us
                </Link>
                <Link to="/contact" className="hover:text-teal-400 transition-colors">
                  Contact
                </Link>
                <Link to="/dashboard" className="hover:text-teal-400 transition-colors">
                  My Bookings
                </Link>
                <Link to="/register" className="hover:text-teal-400 transition-colors">
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} DriveEase. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <a href="#" onClick={noNav} className="hover:text-gray-400 transition-colors">
              Privacy Policy
            </a>
            <a href="#" onClick={noNav} className="hover:text-gray-400 transition-colors">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

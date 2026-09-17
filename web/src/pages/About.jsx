import { useNavigate } from 'react-router-dom'
import { Shield, Star, Headphones, MapPin, Car, Users, Award, Clock } from 'lucide-react'
import Button from '../components/ui/Button'

const STATS = [
  { value: '500+', label: 'Cars Available', icon: Car },
  { value: '50+', label: 'Locations', icon: MapPin },
  { value: '10K+', label: 'Happy Customers', icon: Users },
  { value: '8+', label: 'Years Experience', icon: Award },
]

const VALUES = [
  {
    icon: Shield,
    title: 'Safety First',
    desc: 'Every vehicle in our fleet is thoroughly inspected, fully insured, and regularly serviced to ensure your safety on every journey.',
  },
  {
    icon: Star,
    title: 'Premium Quality',
    desc: 'We partner with top automotive brands to bring you the finest selection of vehicles — from economy to luxury.',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    desc: 'Our dedicated customer support team is always available, day or night, to assist you with anything you need.',
  },
  {
    icon: Clock,
    title: 'Flexible Rentals',
    desc: "Whether it's a few hours, a day, or a month — our flexible rental plans are designed around your schedule.",
  },
]

const TEAM = [
  { name: 'Arjun Sharma', role: 'CEO & Founder', initial: 'A' },
  { name: 'Priya Mehta', role: 'Head of Operations', initial: 'P' },
  { name: 'Rahul Patel', role: 'Fleet Manager', initial: 'R' },
  { name: 'Sneha Gupta', role: 'Customer Experience', initial: 'S' },
]

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative bg-[#111111] text-white py-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,_rgba(20,184,166,0.14)_0%,_transparent_70%)]" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest mb-3">
            About DriveEase
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
            India&apos;s Most Trusted
            <br />
            Car Rental Platform
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Founded in 2018, DriveEase has been connecting travellers with premium vehicles across
            India. We believe every journey should be comfortable, safe, and memorable.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div
                key={label}
                className="bg-white rounded-2xl border border-gray-200 p-6 text-center"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-teal-500" />
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-teal-500 text-xs font-semibold uppercase tracking-widest mb-3">
              Our Story
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-5">We Started With a Simple Idea</h2>
            <div className="space-y-4 text-gray-600 leading-relaxed">
              <p>
                DriveEase was born out of frustration with complicated, overpriced car rental
                experiences. Our founders, avid travellers themselves, wanted to create a platform
                that put customers first — transparent pricing, quality vehicles, and genuine
                support.
              </p>
              <p>
                Starting with just 20 cars in Mumbai in 2018, we&apos;ve grown to a fleet of over
                500 vehicles across 50+ locations in India. Our technology-first approach lets you
                browse, book, and manage rentals entirely online — no paperwork, no surprises.
              </p>
              <p>
                Today, DriveEase serves over 10,000 happy customers, from business travellers and
                tourists to families and adventure seekers. Whatever your journey, we&apos;ve got
                the perfect car for you.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-teal-500 rounded-2xl p-6 text-white">
              <p className="text-4xl font-bold mb-2">500+</p>
              <p className="text-teal-100 text-sm">Premium vehicles across all categories</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-6 text-white mt-8">
              <p className="text-4xl font-bold mb-2">4.8★</p>
              <p className="text-gray-400 text-sm">Average customer rating</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-6 text-white">
              <p className="text-4xl font-bold mb-2">50+</p>
              <p className="text-gray-400 text-sm">Cities across India</p>
            </div>
            <div className="bg-teal-600 rounded-2xl p-6 text-white mt-8">
              <p className="text-4xl font-bold mb-2">24/7</p>
              <p className="text-teal-100 text-sm">Customer support always on</p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-teal-500 text-xs font-semibold uppercase tracking-widest mb-3">
              What We Stand For
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Our Core Values</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              These principles guide every decision we make, every car we add to our fleet, and
              every interaction with our customers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-teal-500" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-teal-500 text-xs font-semibold uppercase tracking-widest mb-3">
            The People
          </p>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Meet Our Team</h2>
          <p className="text-gray-500">The passionate people behind DriveEase</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {TEAM.map(({ name, role, initial }) => (
            <div key={name} className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                {initial}
              </div>
              <h3 className="font-bold text-gray-900">{name}</h3>
              <p className="text-sm text-gray-500">{role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#111111] text-white py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Ride with Us?</h2>
          <p className="text-gray-400 mb-8">
            Join thousands of satisfied customers. Book your perfect car in minutes.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              variant="primary"
              size="lg"
              className="uppercase tracking-wider"
              onClick={() => navigate('/cars')}
            >
              Browse Cars
            </Button>
            <button
              onClick={() => navigate('/contact')}
              className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-bold px-8 py-3 rounded-lg transition-colors"
            >
              Contact Us
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

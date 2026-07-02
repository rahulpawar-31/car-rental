import { useState } from 'react'
import { Phone, Mail, MapPin, Clock, Send, CheckCircle } from 'lucide-react'
import api from '../api/client'

const CONTACT_INFO = [
  { icon: Phone,   label: 'Phone',   value: '1.800.456.8743',         sub: 'Mon–Fri 9:00–17:00' },
  { icon: Mail,    label: 'Email',   value: 'support@driveease.com',   sub: 'Reply within 24 hours' },
  { icon: MapPin,  label: 'Address', value: '184 Main Street East',    sub: 'Mumbai, Maharashtra 400001' },
  { icon: Clock,   label: 'Hours',   value: 'Mon–Sat 8:00–18:00',     sub: 'Sunday CLOSED' },
]

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sending, setSending]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [errors, setErrors]         = useState({})

  const validate = () => {
    const e = {}
    if (!form.name.trim())    e.name    = 'Name is required'
    if (!form.email.trim())   e.email   = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.subject.trim()) e.subject = 'Subject is required'
    if (!form.message.trim()) e.message = 'Message is required'
    return e
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSending(true)
    try {
      await api.post('/contact', form)
      setSubmittedEmail(form.email)
      setSent(true)
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send message. Please try again.'
      setErrors({ message: msg })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative bg-[#0d0d1a] text-white py-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,_#1e3a5f_0%,_#0d0d1a_70%)]" />
        <div className="relative z-10 text-center px-4">
          <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest mb-3">Get in Touch</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Have a question or need help with your booking? Our team is here for you.
          </p>
        </div>
      </section>

      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* Contact Info */}
          <div className="lg:col-span-2 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">We&apos;d love to hear from you</h2>
              <p className="text-sm text-gray-500">Fill out the form and we&apos;ll get back to you as soon as possible.</p>
            </div>

            <div className="space-y-4">
              {CONTACT_INFO.map(({ icon: Icon, label, value, sub }) => (
                <div key={label} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-teal-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                    <p className="text-xs text-gray-500">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Map placeholder */}
            <div className="rounded-xl overflow-hidden border border-gray-200 h-48 bg-gray-100 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">184 Main Street East, Mumbai</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-8">
              {sent ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-teal-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                  <p className="text-gray-500 mb-6">
                    Thank you for reaching out. We&apos;ll reply to <strong>{submittedEmail}</strong> within 24 hours.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="text-sm text-teal-600 hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 mb-6">Send us a Message</h2>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="contact-name" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Your Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="contact-name"
                          type="text"
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          placeholder="Rahul Sharma"
                          className={`w-full border rounded-lg px-4 py-3 text-sm text-gray-800 outline-none transition-colors ${
                            errors.name ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-teal-400'
                          }`}
                        />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Email Address <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="contact-email"
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          placeholder="rahul@example.com"
                          className={`w-full border rounded-lg px-4 py-3 text-sm text-gray-800 outline-none transition-colors ${
                            errors.email ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-teal-400'
                          }`}
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="contact-subject" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Subject <span className="text-red-400">*</span>
                      </label>
                      <select
                        id="contact-subject"
                        name="subject"
                        value={form.subject}
                        onChange={handleChange}
                        className={`w-full border rounded-lg px-4 py-3 text-sm text-gray-800 outline-none bg-white transition-colors ${
                          errors.subject ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-teal-400'
                        }`}
                      >
                        <option value="">Select a subject...</option>
                        <option>Booking Inquiry</option>
                        <option>Cancellation & Refund</option>
                        <option>Payment Issue</option>
                        <option>Vehicle Complaint</option>
                        <option>Partnership</option>
                        <option>Other</option>
                      </select>
                      {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
                    </div>

                    <div>
                      <label htmlFor="contact-message" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Message <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        value={form.message}
                        onChange={handleChange}
                        rows={5}
                        placeholder="Tell us how we can help..."
                        className={`w-full border rounded-lg px-4 py-3 text-sm text-gray-800 outline-none transition-colors resize-none ${
                          errors.message ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-teal-400'
                        }`}
                      />
                      {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
                    </div>

                    <button
                      type="submit"
                      disabled={sending}
                      className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {sending ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <><Send className="w-4 h-4" /> Send Message</>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

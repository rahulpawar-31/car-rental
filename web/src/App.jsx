import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import useAuthStore from './store/authStore'

import Home from './pages/Home'
import Cars from './pages/Cars'
import CarDetail from './pages/CarDetail'
import Locations from './pages/Locations'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Booking from './pages/Booking'
import Payment from './pages/Payment'
import BookingDetail from './pages/BookingDetail'
import BookingConfirmation from './pages/BookingConfirmation'
import Admin from './pages/Admin'
import About from './pages/About'
import Contact from './pages/Contact'
import BlogPost from './pages/BlogPost'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AppInit() {
  const { user, fetchMe } = useAuthStore()
  useEffect(() => {
    if (user) fetchMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppInit />
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Auth pages — no header/footer */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="/cars" element={<Cars />} />
          <Route path="/cars/:id" element={<CarDetail />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/blog/:id" element={<BlogPost />} />

          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
          <Route path="/booking/:carId" element={
            <ProtectedRoute><Booking /></ProtectedRoute>
          } />
          <Route path="/payment/:bookingId" element={
            <ProtectedRoute><Payment /></ProtectedRoute>
          } />
          <Route path="/bookings/:id" element={
            <ProtectedRoute><BookingDetail /></ProtectedRoute>
          } />
          <Route path="/booking-confirmation/:bookingId" element={
            <ProtectedRoute><BookingConfirmation /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
          } />

          <Route path="*" element={
            <div className="text-center py-24">
              <div className="text-6xl mb-4">🚗</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h1>
              <Link to="/home" className="text-teal-600 underline text-sm">Go home</Link>
            </div>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

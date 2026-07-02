import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Phone, Lock, Save, Heart, MapPin, CreditCard, Star, Calendar, Camera, Trash2, Edit2, X, Check } from 'lucide-react'
import { getProfile, updateProfile, changePassword, saveCar, updateDrivingLicense } from '../api/users'
import { getMyReviews, updateReview, deleteReview } from '../api/reviews'
import api from '../api/client'
import useAuthStore from '../store/authStore'
import { toast } from 'sonner'
import Spinner from '../components/ui/Spinner'
import ConfirmModal from '../components/ui/ConfirmModal'

const TABS = [
  { id: 'info',     label: 'Personal Info',   icon: User },
  { id: 'reviews',  label: 'My Reviews',      icon: Star },
  { id: 'saved',    label: 'Saved Cars',      icon: Heart },
  { id: 'license',  label: 'Driving License', icon: CreditCard },
  { id: 'password', label: 'Change Password', icon: Lock },
]

function InputField({ label, icon: Icon, id, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
        {Icon && <Icon className="w-4 h-4 text-gray-400 shrink-0" />}
        <input id={id} className="flex-1 text-sm text-gray-800 outline-none bg-transparent placeholder-gray-400" {...props} />
      </div>
    </div>
  )
}

export default function Profile() {
  const { user, setUser }       = useAuthStore()
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('info')
  const [profileData, setProfileData] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef          = useRef(null)

  const [form, setForm] = useState({
    name: '', phone: '',
    street: '', city: '', state: '', country: '', zipCode: '',
  })
  const [licenseForm, setLicenseForm] = useState({ number: '', expiryDate: '' })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [reviews, setReviews]               = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [hasLoadedReviews, setHasLoadedReviews] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId]   = useState(null)
  const [editingReview, setEditingReview]   = useState(null)
  const [editComment, setEditComment]       = useState('')
  const [editRating, setEditRating]         = useState(5)

  useEffect(() => {
    getProfile()
      .then(({ data }) => {
        const u = data.data.user
        setProfileData(u)
        setForm({
          name: u.name || '', phone: u.phone || '',
          street: u.address?.street || '', city: u.address?.city || '',
          state: u.address?.state || '', country: u.address?.country || '',
          zipCode: u.address?.zipCode || '',
        })
        setLicenseForm({
          number: u.drivingLicense?.number || '',
          expiryDate: u.drivingLicense?.expiryDate
            ? new Date(u.drivingLicense.expiryDate).toISOString().split('T')[0]
            : '',
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file')
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB')
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const { data } = await api.patch('/users/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUser(data.data.user)
      toast.success('Avatar updated!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  useEffect(() => {
    if (tab === 'reviews' && !hasLoadedReviews && !reviewsLoading) loadReviews()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const loadReviews = async () => {
    setReviewsLoading(true)
    try {
      const { data } = await getMyReviews()
      setReviews(data.data.reviews || [])
      setHasLoadedReviews(true)
    } catch { toast.error('Failed to load reviews') }
    finally { setReviewsLoading(false) }
  }

  const handleEditReview = async (id) => {
    try {
      await updateReview(id, { rating: editRating, comment: editComment })
      setReviews(prev => prev.map(r => r._id === id ? { ...r, rating: editRating, comment: editComment } : r))
      setEditingReview(null)
      toast.success('Review updated!')
    } catch { toast.error('Failed to update review') }
  }

  const handleDeleteReviewConfirmed = async () => {
    const id = deleteConfirmId
    setDeleteConfirmId(null)
    try {
      await deleteReview(id)
      setReviews(prev => prev.filter(r => r._id !== id))
      toast.success('Review deleted')
    } catch { toast.error('Failed to delete review') }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await updateProfile({
        name: form.name,
        phone: form.phone,
        address: {
          street: form.street, city: form.city,
          state: form.state, country: form.country, zipCode: form.zipCode,
        },
      })
      setUser(data.data.user)
      toast.success('Profile updated!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleLicenseSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateDrivingLicense(licenseForm)
      toast.success('Driving license updated!')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update license')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) return toast.error('Passwords do not match')
    if (pwForm.newPassword.length < 8) return toast.error('Minimum 8 characters')
    setSaving(true)
    try {
      await changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      toast.success('Password changed!')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password')
    } finally {
      setSaving(false)
    }
  }

  const handleUnsave = async (carId) => {
    try {
      await saveCar(carId)
      setProfileData(prev => ({ ...prev, savedCars: prev.savedCars.filter(c => c._id !== carId) }))
      toast.success('Removed from saved cars')
    } catch {
      toast.error('Failed to remove car')
    }
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>

  return (
    <>
    {deleteConfirmId && (
      <ConfirmModal
        message="Delete this review? This cannot be undone."
        confirmLabel="Yes, delete"
        onConfirm={handleDeleteReviewConfirmed}
        onCancel={() => setDeleteConfirmId(null)}
      />
    )}
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hidden file input */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 flex items-center gap-5">
        <div className="relative shrink-0">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover ring-2 ring-teal-100" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-2xl">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-gray-900 hover:bg-gray-700 text-white rounded-full flex items-center justify-center transition-colors"
            title="Change avatar"
          >
            {uploadingAvatar ? <Spinner size="xs" /> : <Camera className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900 text-lg">{user?.name}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full capitalize">
              {user?.role}
            </span>
            {profileData?.savedCars?.length > 0 && (
              <span className="text-xs text-gray-400">
                {profileData.savedCars.length} saved car{profileData.savedCars.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {user?.role === 'admin' && (
          <Link to="/admin" className="text-sm bg-gray-900 text-white font-semibold px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            Admin Panel
          </Link>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === id ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Personal Info ─────────────────────────────────── */}
      {tab === 'info' && (
        <form onSubmit={handleProfileSave} className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-teal-500" /> Basic Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField id="profile-name" label="Full Name" icon={User} type="text" required value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Email <span className="normal-case font-normal text-gray-400">(cannot change)</span>
                </label>
                <div className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50 cursor-not-allowed">
                  <Mail className="w-4 h-4 text-gray-300 shrink-0" />
                  <span className="flex-1 text-sm text-gray-400 select-none">{user?.email}</span>
                </div>
              </div>
              <InputField id="profile-phone" label="Phone" icon={Phone} type="tel" value={form.phone} placeholder="+91 98765 43210"
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-500" /> Address
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <InputField id="profile-street" label="Street Address" icon={MapPin} type="text" value={form.street}
                  placeholder="123 Main Street" onChange={e => setForm(p => ({ ...p, street: e.target.value }))} />
              </div>
              <InputField id="profile-city" label="City" type="text" value={form.city}
                placeholder="Mumbai" onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
              <InputField id="profile-state" label="State" type="text" value={form.state}
                placeholder="Maharashtra" onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
              <InputField id="profile-country" label="Country" type="text" value={form.country}
                placeholder="India" onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
              <InputField id="profile-zip" label="ZIP Code" type="text" value={form.zipCode}
                placeholder="400001" onChange={e => setForm(p => ({ ...p, zipCode: e.target.value }))} />
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* ── My Reviews ───────────────────────────────────── */}
      {tab === 'reviews' && (
        <div>
          {reviewsLoading && <div className="flex justify-center py-10"><Spinner size="lg" /></div>}
          {!reviewsLoading && hasLoadedReviews && reviews.length === 0 && (
            <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
              <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No reviews yet</h3>
              <p className="text-sm text-gray-500">Complete a booking and leave your first review.</p>
            </div>
          )}
          <div className="space-y-4">
            {reviews.map(r => (
              <div key={r._id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Link to={`/cars/${r.car?._id}`} className="font-semibold text-gray-900 hover:text-teal-600 text-sm">
                        {r.car?.brand} {r.car?.model}
                      </Link>
                      <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'approved' ? 'bg-green-50 text-green-600' : r.status === 'rejected' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>
                        {r.status}
                      </span>
                    </div>
                    {editingReview === r._id ? (
                      <div className="space-y-3 mt-2">
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(n => (
                            <button key={n} type="button" onClick={() => setEditRating(n)}>
                              <Star className={`w-5 h-5 ${n <= editRating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editComment}
                          onChange={e => setEditComment(e.target.value)}
                          rows={3}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400 resize-none"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleEditReview(r._id)}
                            className="flex items-center gap-1 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-3 py-1.5 rounded-lg">
                            <Check className="w-3.5 h-3.5" /> Save
                          </button>
                          <button onClick={() => setEditingReview(null)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-0.5 mb-1">
                          {[1,2,3,4,5].map(n => (
                            <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                          ))}
                        </div>
                        {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                      </>
                    )}
                  </div>
                  {editingReview !== r._id && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingReview(r._id); setEditRating(r.rating); setEditComment(r.comment || '') }}
                        className="text-gray-400 hover:text-teal-500 transition-colors"
                        title="Edit review"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirmId(r._id)}
                        className="text-gray-400 hover:text-red-500 transition-colors" title="Delete review">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Saved Cars ────────────────────────────────────── */}
      {tab === 'saved' && (
        <div>
          {!profileData?.savedCars?.length ? (
            <div className="text-center py-20 bg-white border border-gray-200 rounded-xl">
              <Heart className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No saved cars yet</h3>
              <p className="text-sm text-gray-500 mb-4">Browse cars and click the heart icon to save them here.</p>
              <Link to="/cars" className="text-sm text-teal-600 font-semibold hover:underline">Browse Cars →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profileData.savedCars.map(car => (
                <div key={car._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
                  <div className="w-28 h-24 bg-gray-100 shrink-0">
                    {car.images?.[0]?.url
                      ? <img src={car.images[0].url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">🚗</div>}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{car.brand} {car.model}</p>
                      {car.rating > 0 && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {car.rating?.toFixed(1)}
                        </p>
                      )}
                      <p className="text-sm font-bold text-teal-600 mt-1">₹{car.pricePerDay?.toLocaleString()}<span className="text-xs font-normal text-gray-400">/day</span></p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Link to={`/cars/${car._id}`}
                        className="text-xs text-teal-600 hover:underline font-medium">
                        View car
                      </Link>
                      <button onClick={() => handleUnsave(car._id)}
                        className="text-xs text-red-500 hover:underline font-medium ml-auto">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Driving License ───────────────────────────────── */}
      {tab === 'license' && (
        <form onSubmit={handleLicenseSave} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <CreditCard className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-700">
              <p className="font-semibold">Driving License Required</p>
              <p className="mt-0.5 text-xs">You must hold a valid driving license to rent a vehicle. License will be verified at pickup.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="profile-license-number" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                License Number <span className="text-red-400">*</span>
              </label>
              <input id="profile-license-number" required value={licenseForm.number}
                onChange={e => setLicenseForm(p => ({ ...p, number: e.target.value }))}
                placeholder="MH1234567890"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400 transition-colors" />
            </div>
            <div>
              <label htmlFor="profile-license-expiry" className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                Expiry Date <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                <input id="profile-license-expiry" required type="date" value={licenseForm.expiryDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setLicenseForm(p => ({ ...p, expiryDate: e.target.value }))}
                  className="flex-1 text-sm outline-none bg-transparent" />
              </div>
            </div>
          </div>

          {profileData?.drivingLicense?.verified && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <span className="text-base">✓</span> Your driving license has been verified
            </div>
          )}

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save License'}
          </button>
        </form>
      )}

      {/* ── Change Password ───────────────────────────────── */}
      {tab === 'password' && (
        <form onSubmit={handlePasswordChange} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          {[
            { label: 'Current Password', key: 'currentPassword', placeholder: '••••••••', id: 'profile-current-password' },
            { label: 'New Password',     key: 'newPassword',     placeholder: 'Min. 8 characters', id: 'profile-new-password' },
            { label: 'Confirm New Password', key: 'confirmPassword', placeholder: 'Re-enter new password', id: 'profile-confirm-password' },
          ].map(({ label, key, placeholder, id }) => (
            <div key={key}>
              <label htmlFor={id} className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">{label}</label>
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2.5 focus-within:border-teal-400 transition-colors">
                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                <input id={id} type="password" required placeholder={placeholder} value={pwForm[key]}
                  onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 text-sm outline-none bg-transparent" />
              </div>
            </div>
          ))}
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white text-sm font-bold px-6 py-2.5 rounded-lg transition-colors">
            <Lock className="w-4 h-4" /> {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      )}
    </div>
    </>
  )
}

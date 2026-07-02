import api from './client'

export const getCars = (params, config) => api.get('/cars', { params, ...config })
export const getCarById = (id) => api.get(`/cars/${id}`)
export const getFeaturedCars = () => api.get('/cars/featured')
export const getCarFilters = () => api.get('/cars/filters')
export const checkAvailability = (id, params) => api.get(`/cars/${id}/availability`, { params })
export const getCarBookedDates = (id) => api.get(`/cars/${id}/booked-dates`)
export const uploadCarDocument = (id, docType, formData) => api.post(`/cars/${id}/documents/${docType}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const verifyCarDocument = (id, docType) => api.patch(`/cars/${id}/documents/${docType}/verify`)

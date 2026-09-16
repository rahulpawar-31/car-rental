import axios from 'axios'
import useAuthStore from '../store/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token))
  failedQueue = []
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    const isAuthEndpoint = original.url?.includes('/auth/login') || original.url?.includes('/auth/register')
    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        const { data } = await axios.post(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh-token`, {}, { withCredentials: true })
        const token = data.data.accessToken
        localStorage.setItem('accessToken', token)
        processQueue(null, token)
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      } catch (e) {
        processQueue(e, null)
        // Route through the store's own clearSession action instead of
        // setState-ing its fields directly, so authStore stays the single
        // writer of its own state (and localStorage stays in sync with it).
        useAuthStore.getState().clearSession()
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api

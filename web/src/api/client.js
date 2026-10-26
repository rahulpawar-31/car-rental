import axios from 'axios'
import useAuthStore from '../store/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error) => {
  failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve())
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    const isAuthEndpoint = original.url?.includes('/auth/login') || original.url?.includes('/auth/register')
    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => {
          // Mark the replay too, or a request that 401s again would start yet another refresh.
          original._retry = true
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        // The server rotates the httpOnly auth cookies; nothing to store client-side.
        await axios.post(`${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh-token`, {}, { withCredentials: true })
        processQueue(null)
        return api(original)
      } catch (e) {
        processQueue(e)
        // Route through the store's own clearSession action instead of
        // setState-ing its fields directly, so authStore stays the single
        // writer of its own state.
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

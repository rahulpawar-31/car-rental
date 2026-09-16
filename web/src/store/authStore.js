import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import { getErrorMessage } from '../api/errors'

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,

      setUser: (user) => set({ user }),
      setToken: (token) => {
        localStorage.setItem('accessToken', token)
        set({ accessToken: token })
      },

      login: async (credentials) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.login(credentials)
          const { user, accessToken } = data.data
          localStorage.setItem('accessToken', accessToken)
          set({ user, accessToken, isLoading: false })
          return { success: true }
        } catch (err) {
          set({ isLoading: false })
          return { success: false, message: getErrorMessage(err, 'Login failed') }
        }
      },

      register: async (userData) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.register(userData)
          const { user, accessToken } = data.data
          localStorage.setItem('accessToken', accessToken)
          set({ user, accessToken, isLoading: false })
          return { success: true }
        } catch (err) {
          set({ isLoading: false })
          return { success: false, message: getErrorMessage(err, 'Registration failed') }
        }
      },

      logout: async () => {
        try { await authApi.logout() } catch { /* ignore logout errors */ }
        localStorage.removeItem('accessToken')
        set({ user: null, accessToken: null })
      },

      fetchMe: async () => {
        try {
          const { data } = await authApi.getMe()
          set({ user: data.data.user })
        } catch {
          set({ user: null, accessToken: null })
          localStorage.removeItem('accessToken')
        }
      },

      isAuthenticated: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'auth',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
    }
  )
)

export default useAuthStore

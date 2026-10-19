import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import { getErrorMessage } from '../api/errors'

// Earlier versions kept the token here; drop any copy left over from a previous session.
try { localStorage.removeItem('accessToken') } catch { /* storage unavailable */ }

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,

      setUser: (user) => set({ user }),

      login: async (credentials) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.login(credentials)
          set({ user: data.data.user, isLoading: false })
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
          set({ user: data.data.user, isLoading: false })
          return { success: true }
        } catch (err) {
          set({ isLoading: false })
          return { success: false, message: getErrorMessage(err, 'Registration failed') }
        }
      },

      // Synchronously clears the local session state without calling the backend. Shared by logout(), fetchMe()'s failure path, and
      // api/client.js's response interceptor, so there's exactly one place
      // that defines what "signed out" looks like.
      clearSession: () => {
        set({ user: null })
      },

      logout: async () => {
        try { await authApi.logout() } catch { /* ignore logout errors */ }
        get().clearSession()
      },

      fetchMe: async () => {
        try {
          const { data } = await authApi.getMe()
          set({ user: data.data.user })
        } catch {
          get().clearSession()
        }
      },

      isAuthenticated: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'auth',
      // The access token lives only in the httpOnly cookie the API sets, so JS (and
      // any XSS payload) can never read it. Only the non-sensitive user is persisted.
      version: 1,
      migrate: (persisted) => ({ user: persisted?.user ?? null }),
      partialize: (state) => ({ user: state.user }),
    }
  )
)

export default useAuthStore

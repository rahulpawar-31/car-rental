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

      // Synchronously clears the local session (state + localStorage) without
      // calling the backend. Shared by logout(), fetchMe()'s failure path, and
      // api/client.js's response interceptor, so there's exactly one place
      // that defines what "signed out" looks like.
      clearSession: () => {
        localStorage.removeItem('accessToken')
        set({ user: null, accessToken: null })
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
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
    }
  )
)

export default useAuthStore

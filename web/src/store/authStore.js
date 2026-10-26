import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as authApi from '../api/auth'
import { getErrorMessage } from '../api/errors'

// Older builds kept the access token in localStorage, where any XSS could read it.
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
          const { user } = data.data
          set({ user, isLoading: false })
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
          const { user } = data.data
          set({ user, isLoading: false })
          return { success: true }
        } catch (err) {
          set({ isLoading: false })
          return { success: false, message: getErrorMessage(err, 'Registration failed') }
        }
      },

      // Synchronously clears the local session without calling the backend. The
      // access/refresh tokens live only in httpOnly cookies (the server clears them on
      // logout), so there is no token for the client to remove. Shared by logout(), fetchMe()'s failure path, and
      // api/client.js's response interceptor, so there's exactly one place
      // that defines what "signed out" looks like.
      clearSession: () => {
        set({ user: null })
      },

      // Resolves { success }. The httpOnly cookies can only be cleared by the server, so if the
      // call fails for a reason other than "already signed out" (offline, 5xx) the session is
      // kept: showing "signed out" while the cookies stay valid is worse than asking to retry.
      logout: async () => {
        try {
          await authApi.logout()
        } catch (err) {
          // 401: the server no longer accepts our cookies. The interceptor may also have cleared
          // the session already (failed refresh). Either way there is nothing left to revoke.
          const signedOutAlready = err?.response?.status === 401 || !get().user
          if (!signedOutAlready) {
            return { success: false, message: getErrorMessage(err, 'Could not log out. Please try again.') }
          }
        }
        get().clearSession()
        return { success: true }
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
      partialize: (state) => ({ user: state.user }),
      // Older builds also persisted `accessToken`; only take `user` from storage so a
      // token left over from before the cookie-only change is never loaded back in.
      merge: (persisted, current) => ({ ...current, user: persisted?.user ?? null }),
    }
  )
)

export default useAuthStore

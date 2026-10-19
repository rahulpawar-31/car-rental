// Same in-memory localStorage stub as authStore.test.js (see the note there): it must be
// installed before authStore.js is imported, because zustand's persist resolves storage eagerly.
vi.hoisted(() => {
  let data = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => { data.set(key, String(value)) },
      removeItem: (key) => { data.delete(key) },
      clear: () => { data = new Map() },
    },
    writable: true,
    configurable: true,
  })
})

import axios from 'axios'
import api from './client'
import useAuthStore from '../store/authStore'

function unauthorized(config) {
  return Object.assign(new Error('401'), { config, response: { status: 401 } })
}

// Swap the underlying adapter so no real network is used; `handler` decides each response.
function useAdapter(handler) {
  api.defaults.adapter = async (config) => handler(config)
}

describe('api client auth', () => {
  afterEach(() => vi.restoreAllMocks())

  test('sends no Authorization header; the httpOnly cookie carries auth', async () => {
    let seen
    useAdapter((config) => {
      seen = config
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    })

    await api.get('/cars')

    expect(seen.headers.Authorization).toBeUndefined()
    expect(api.defaults.withCredentials).toBe(true)
  })

  test('on 401, refreshes via the cookie and retries without storing or sending a token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { accessToken: 'new-jwt' } } })
    const calls = []
    useAdapter((config) => {
      calls.push(config)
      if (calls.length === 1) return Promise.reject(unauthorized(config))
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
    })

    const res = await api.get('/bookings')

    expect(res.data).toEqual({ ok: true })
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh-token'), {}, { withCredentials: true })
    expect(calls).toHaveLength(2)
    expect(calls[1].headers.Authorization).toBeUndefined()
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  test('clears the session when the refresh itself fails', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh 401'))
    useAuthStore.setState({ user: { id: 'u1' } })
    useAdapter((config) => Promise.reject(unauthorized(config)))

    await expect(api.get('/bookings')).rejects.toThrow('refresh 401')

    expect(useAuthStore.getState().user).toBeNull()
  })
})

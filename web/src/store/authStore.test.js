// This Node/jsdom combo's global `localStorage` isn't a working Storage:
// Node's own experimental Web Storage global shadows jsdom's and throws
// without a backing file (`--localstorage-file`). zustand's persist
// middleware resolves `window.localStorage` once, eagerly, when authStore.js
// is first imported, so the stub has to be installed before that import
// runs -- hence `vi.hoisted`, which vitest hoists above all imports.
vi.hoisted(() => {
  let data = new Map()
  const memoryStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
    clear: () => { data = new Map() },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    writable: true,
    configurable: true,
  })
})

import useAuthStore from './authStore'

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}))

import * as authApi from '../api/auth'

function seedSignedInState() {
  useAuthStore.setState({ user: { id: 'u1', name: 'Jane' } })
}

describe('authStore token storage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: false })
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('login() keeps the user but never writes a token to localStorage or the store', async () => {
    authApi.login.mockResolvedValueOnce({
      data: { data: { user: { id: 'u1' }, accessToken: 'secret-jwt' } },
    })

    await useAuthStore.getState().login({ email: 'a@b.co', password: 'pw' })

    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
    expect(useAuthStore.getState().accessToken).toBeUndefined()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('auth')).not.toContain('secret-jwt')
  })
})

describe('authStore clearSession', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: false })
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('resets user to null', () => {
    seedSignedInState()

    useAuthStore.getState().clearSession()

    expect(useAuthStore.getState().user).toBeNull()
  })

  test('logout() clears the session even when the backend logout call rejects', async () => {
    seedSignedInState()
    authApi.logout.mockRejectedValueOnce(new Error('network down'))

    await useAuthStore.getState().logout()

    expect(authApi.logout).toHaveBeenCalled()
    expect(useAuthStore.getState().user).toBeNull()
  })

  test('fetchMe() clears the session (same shape as clearSession) when getMe() fails', async () => {
    seedSignedInState()
    authApi.getMe.mockRejectedValueOnce(new Error('401'))

    await useAuthStore.getState().fetchMe()

    expect(useAuthStore.getState().user).toBeNull()
  })
})

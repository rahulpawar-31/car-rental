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

function persistedAuth() {
  return JSON.parse(localStorage.getItem('auth'))
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

  test('login() persists only the user', async () => {
    authApi.login.mockResolvedValueOnce({
      data: { data: { user: { id: 'u1' }, accessToken: 'secret-jwt' } },
    })

    await useAuthStore.getState().login({ email: 'a@b.co', password: 'pw' })

    expect(persistedAuth().state).toEqual({ user: { id: 'u1' } })
  })

  test('register() keeps the user but never writes a token to localStorage or the store', async () => {
    authApi.register.mockResolvedValueOnce({
      data: { data: { user: { id: 'u2' }, accessToken: 'secret-jwt' } },
    })

    await useAuthStore.getState().register({ email: 'a@b.co' })

    expect(useAuthStore.getState().user).toEqual({ id: 'u2' })
    expect(useAuthStore.getState().accessToken).toBeUndefined()
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(localStorage.getItem('auth')).not.toContain('secret-jwt')
    expect(persistedAuth().state).toEqual({ user: { id: 'u2' } })
  })

  test('rehydrating a state persisted by an older build restores the user but not its stored token', async () => {
    localStorage.setItem(
      'auth',
      JSON.stringify({ state: { user: { id: 'u1' }, accessToken: 'legacy-jwt' }, version: 0 })
    )

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
    expect(useAuthStore.getState().accessToken).toBeUndefined()
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

  test('logout() clears the session once the backend confirms', async () => {
    seedSignedInState()
    authApi.logout.mockResolvedValueOnce({})

    const result = await useAuthStore.getState().logout()

    expect(result).toEqual({ success: true })
    expect(useAuthStore.getState().user).toBeNull()
  })

  test('logout() keeps the session and reports failure when the backend is unreachable', async () => {
    seedSignedInState()
    authApi.logout.mockRejectedValueOnce(new Error('network down'))

    const result = await useAuthStore.getState().logout()

    expect(result.success).toBe(false)
    expect(result.message).toBeTruthy()
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', name: 'Jane' })
  })

  test('logout() keeps the session on a 5xx and surfaces the server message', async () => {
    seedSignedInState()
    authApi.logout.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Boom' } } })

    const result = await useAuthStore.getState().logout()

    expect(result).toEqual({ success: false, message: 'Boom' })
    expect(useAuthStore.getState().user).not.toBeNull()
  })

  test('logout() signs out locally on a 401, since the cookies are already rejected', async () => {
    seedSignedInState()
    authApi.logout.mockRejectedValueOnce({ response: { status: 401 } })

    const result = await useAuthStore.getState().logout()

    expect(result).toEqual({ success: true })
    expect(useAuthStore.getState().user).toBeNull()
  })

  test('logout() counts as signed out when the interceptor already cleared the session', async () => {
    seedSignedInState()
    authApi.logout.mockImplementationOnce(async () => {
      useAuthStore.getState().clearSession()
      throw new Error('refresh failed')
    })

    expect(await useAuthStore.getState().logout()).toEqual({ success: true })
  })

  test('fetchMe() clears the session (same shape as clearSession) when getMe() fails', async () => {
    seedSignedInState()
    authApi.getMe.mockRejectedValueOnce(new Error('401'))

    await useAuthStore.getState().fetchMe()

    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('authStore persisted state from older builds', () => {
  const save = (stored) => localStorage.setItem('auth', JSON.stringify(stored))
  const saved = () => JSON.parse(localStorage.getItem('auth'))

  beforeEach(() => {
    useAuthStore.setState({ user: null, isLoading: false })
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('scrubs a token saved by an older build from storage as soon as the state is loaded', async () => {
    save({ state: { user: { id: 'u1' }, accessToken: 'legacy-jwt' }, version: 0 })

    await useAuthStore.persist.rehydrate()

    expect(localStorage.getItem('auth')).not.toContain('legacy-jwt')
    expect(saved()).toEqual({ state: { user: { id: 'u1' } }, version: 1 })
  })

  test('keeps the user signed in when an older state is migrated', async () => {
    save({ state: { user: { id: 'u1', name: 'Jane' }, accessToken: 'legacy-jwt' }, version: 0 })

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user).toEqual({ id: 'u1', name: 'Jane' })
    expect(useAuthStore.getState().accessToken).toBeUndefined()
  })

  test('treats an older state that has no user as signed out, and still scrubs its token', async () => {
    save({ state: { accessToken: 'legacy-jwt' }, version: 0 })

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('auth')).not.toContain('legacy-jwt')
  })

  test('loads a current-version state as it is, without rewriting it', async () => {
    save({ state: { user: { id: 'u1' } }, version: 1 })
    const before = localStorage.getItem('auth')

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
    expect(localStorage.getItem('auth')).toBe(before)
  })

  test('never loads a token from the stored state, even at the current version', async () => {
    save({ state: { user: { id: 'u1' }, accessToken: 'hand-edited-jwt' }, version: 1 })

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
    expect(useAuthStore.getState().accessToken).toBeUndefined()
  })
})

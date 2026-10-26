import axios from 'axios'
import api from './client'

// One shared spy (not a fresh vi.fn() per getState() call) so tests can assert the session was cleared.
const { clearSession } = vi.hoisted(() => ({ clearSession: vi.fn() }))
vi.mock('../store/authStore', () => ({
  default: { getState: () => ({ clearSession }) },
}))

const unauthorized = (config) =>
  Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, config, data: {} } }))
const ok = (config) => Promise.resolve({ status: 200, data: {}, config, headers: {}, statusText: 'OK' })

describe('api 401 refresh interceptor', () => {
  const originalAdapter = api.defaults.adapter

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
    clearSession.mockClear()
  })

  test('replays a request once after a successful refresh', async () => {
    let calls = 0
    api.defaults.adapter = (config) => (++calls === 1 ? unauthorized(config) : ok(config))
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({})

    const res = await api.get('/bookings')

    expect(res.status).toBe(200)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('a queued request that 401s again after the refresh does not start another refresh', async () => {
    // /a starts the refresh; /b 401s while it is in flight and is queued. After the refresh,
    // /b is replayed and 401s again (e.g. the account was deactivated).
    let releaseRefresh
    const refresh = vi.spyOn(axios, 'post').mockImplementation(
      () => new Promise((resolve) => { releaseRefresh = () => resolve({}) })
    )
    const hits = { '/a': 0, '/b': 0 }
    api.defaults.adapter = (config) => {
      hits[config.url] += 1
      if (config.url === '/b') return unauthorized(config)
      return hits['/a'] === 1 ? unauthorized(config) : ok(config)
    }

    const a = api.get('/a')
    const b = api.get('/b').catch((e) => e)
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(hits['/b']).toBe(1))
    releaseRefresh()

    expect((await a).status).toBe(200)
    expect((await b).response.status).toBe(401)
    expect(hits['/b']).toBe(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test('sends no Authorization header; the httpOnly cookie carries auth', async () => {
    let seen
    api.defaults.adapter = (config) => {
      seen = config
      return ok(config)
    }

    await api.get('/cars')

    expect(seen.headers.Authorization).toBeUndefined()
    expect(api.defaults.withCredentials).toBe(true)
  })

  test('refreshes through the cookie and replays without sending a token', async () => {
    const calls = []
    api.defaults.adapter = (config) => {
      calls.push(config)
      return calls.length === 1 ? unauthorized(config) : ok(config)
    }
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { accessToken: 'new-jwt' } } })

    await api.get('/bookings')

    expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh-token'), {}, { withCredentials: true })
    expect(calls).toHaveLength(2)
    expect(calls[1].headers.Authorization).toBeUndefined()
    expect(clearSession).not.toHaveBeenCalled()
  })

  test('clears the session and surfaces the error when the refresh itself fails', async () => {
    api.defaults.adapter = (config) => unauthorized(config)
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh 401'))

    await expect(api.get('/bookings')).rejects.toThrow('refresh 401')

    expect(clearSession).toHaveBeenCalledTimes(1)
  })
})

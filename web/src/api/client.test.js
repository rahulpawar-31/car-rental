import axios from 'axios'
import api from './client'

vi.mock('../store/authStore', () => ({
  default: { getState: () => ({ clearSession: vi.fn() }) },
}))

const unauthorized = (config) =>
  Promise.reject(Object.assign(new Error('401'), { config, response: { status: 401, config, data: {} } }))
const ok = (config) => Promise.resolve({ status: 200, data: {}, config, headers: {}, statusText: 'OK' })

describe('api 401 refresh interceptor', () => {
  const originalAdapter = api.defaults.adapter

  afterEach(() => {
    api.defaults.adapter = originalAdapter
    vi.restoreAllMocks()
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
})

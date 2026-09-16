import { renderHook, waitFor, act } from '@testing-library/react'
import { useAdminList } from './useAdminList'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'

function okResponse(items, pagination = { total: items.length, pages: 1 }) {
  return Promise.resolve({ data: { data: { widgets: items, pagination } } })
}

describe('useAdminList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetches page 1 on mount, turning empty-string filters into undefined', async () => {
    const fetcher = vi.fn(() => okResponse([{ id: 1 }]))
    const { result } = renderHook(() =>
      useAdminList({ fetcher, itemsKey: 'widgets', initialFilters: { search: '' } })
    )

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith({ page: 1, search: undefined })
    expect(result.current.items).toEqual([{ id: 1 }])
    expect(result.current.pagination).toEqual({ total: 1, pages: 1 })
  })

  test('setPage re-fetches with the new page and keeps current filters', async () => {
    const fetcher = vi.fn(() => okResponse([{ id: 1 }]))
    const { result } = renderHook(() =>
      useAdminList({ fetcher, itemsKey: 'widgets', initialFilters: { status: 'pending' } })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPage(2))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith({ page: 2, status: 'pending' })
  })

  test('setFilter resets to page 1, updates only the given filter key, and re-fetches', async () => {
    const fetcher = vi.fn(() => okResponse([]))
    const { result } = renderHook(() =>
      useAdminList({ fetcher, itemsKey: 'widgets', initialFilters: { status: '', search: '' } })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPage(3))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, status: undefined, search: undefined })

    act(() => result.current.setFilter('status', 'confirmed'))
    expect(result.current.page).toBe(1)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, status: 'confirmed', search: undefined })
  })

  test('setItems patches state locally without triggering a re-fetch', async () => {
    const fetcher = vi.fn(() => okResponse([{ id: 1, active: true }]))
    const { result } = renderHook(() =>
      useAdminList({ fetcher, itemsKey: 'widgets', initialFilters: {} })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetcher).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.setItems(prev => prev.map(x => x.id === 1 ? { ...x, active: false } : x))
    })

    expect(result.current.items).toEqual([{ id: 1, active: false }])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('shows a toast and clears loading when the fetch fails', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('network down')))
    const { result } = renderHook(() =>
      useAdminList({ fetcher, itemsKey: 'widgets', initialFilters: {}, errorMessage: 'Failed to load widgets' })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(toast.error).toHaveBeenCalledWith('Failed to load widgets')
  })
})

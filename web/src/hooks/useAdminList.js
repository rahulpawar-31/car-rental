import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

/**
 * Shared fetch/loading/pagination wiring for the Admin.jsx list sections
 * that share one exact shape: a paginated, filterable admin GET endpoint
 * whose response looks like `{ data: { data: { [itemsKey]: [...], pagination: {...} } } }`,
 * refetched whenever the page or any filter value changes, with each filter
 * change resetting back to page 1.
 *
 * Scoped deliberately — only the Admin.jsx sections that truly match this
 * shape (Users, Bookings, Reviews) use it. Sections with a different shape
 * (no server pagination, combined multi-endpoint loads, client-side
 * filtering, etc.) are left as their own local state/effect.
 *
 * @param {object} opts
 * @param {(params: object) => Promise} opts.fetcher - admin API call, receives `{ page, ...filters }`
 * @param {string} opts.itemsKey - key in the response's `data.data` holding the items array
 * @param {object} [opts.initialFilters] - initial filter values, e.g. `{ search: '', status: '' }`
 * @param {string} [opts.errorMessage] - toast message shown on fetch failure
 */
export function useAdminList({ fetcher, itemsKey, initialFilters = {}, errorMessage = 'Failed to load' }) {
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState(initialFilters)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page }
    for (const key of Object.keys(filters)) {
      params[key] = filters[key] || undefined
    }
    fetcher(params)
      .then(({ data }) => {
        setItems(data.data[itemsKey])
        setPagination(data.data.pagination)
      })
      .catch(() => toast.error(errorMessage))
      .finally(() => setLoading(false))
  }, [fetcher, itemsKey, errorMessage, page, filters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }, [])

  return { items, setItems, pagination, loading, page, setPage, filters, setFilter }
}

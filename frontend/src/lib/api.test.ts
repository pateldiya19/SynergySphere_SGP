import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/api'

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'test-token') })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shares an in-flight GET for the same authenticated path', async () => {
    let resolveFetch!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = apiRequest<{ value: string }>('/api/dashboard')
    const second = apiRequest<{ value: string }>('/api/dashboard')

    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch(
      new Response(JSON.stringify({ data: { value: 'ready' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: 'ready' },
      { value: 'ready' },
    ])
  })

  it('does not coalesce mutating requests', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    )
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      apiRequest('/api/tasks', { method: 'POST', body: '{}' }),
      apiRequest('/api/tasks', { method: 'POST', body: '{}' }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

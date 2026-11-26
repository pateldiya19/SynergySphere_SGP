import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, streamAutopilot } from '@/lib/api'

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

  it('delivers Autopilot SSE tokens and evidence from a successful stream', async () => {
    const stream =
      'event: token\ndata: {"token":"Project "}\n\n' +
      'event: token\ndata: {"token":"is on track."}\n\n' +
      'event: complete\ndata: {"evidence":[{"label":"Health","value":"Healthy"}],"ai":{"configured":true,"provider":"openai","model":"test-model"}}\n\n'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(stream, { status: 200 })))
    )
    const tokens: string[] = []

    await expect(
      streamAutopilot('project-1', 'Status?', token => tokens.push(token))
    ).resolves.toEqual({
      evidence: [{ label: 'Health', value: 'Healthy' }],
      ai: { configured: true, provider: 'openai', model: 'test-model' },
    })
    expect(tokens).toEqual(['Project ', 'is on track.'])
  })

  it('rejects an Autopilot stream error event instead of reporting completion', async () => {
    const stream =
      'event: error\ndata: {"error":"The configured AI provider could not complete this request."}\n\n'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(stream, { status: 200 })))
    )

    await expect(streamAutopilot('project-1', 'Status?', vi.fn())).rejects.toThrow(
      'The configured AI provider could not complete this request.'
    )
  })
})

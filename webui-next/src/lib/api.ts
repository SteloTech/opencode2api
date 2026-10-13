export type ApiError = Error & { status?: number }

export async function api<T>(path: string, options: RequestInit = {}, csrfToken = ''): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  const method = options.method || 'GET'
  if (csrfToken && method !== 'GET' && method !== 'HEAD') headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(path, { ...options, headers })
  if (response.status === 401) throw Object.assign(new Error('登录已失效'), { status: 401 })
  if (response.status === 204) return null as T
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`)
  return data as T
}

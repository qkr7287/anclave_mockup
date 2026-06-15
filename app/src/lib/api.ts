// 얇은 fetch 래퍼 — Hono backend REST 호출. 베이스는 VITE_API_BASE(.env)로 지정.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787'

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return (await res.json()) as T
}

// 쓰기 래퍼 — 신청 생성(POST)·상태 변경(PATCH). body 는 JSON 직렬화.
async function apiSend<T>(method: 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status} ${method} ${path}`)
  return (await res.json()) as T
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiSend<T>('POST', path, body)
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiSend<T>('PATCH', path, body)
}

export { API_BASE }

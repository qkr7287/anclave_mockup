// 얇은 fetch 래퍼 — Hono backend REST 호출. 베이스는 VITE_API_BASE(.env)로 지정.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787'

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  return (await res.json()) as T
}

export { API_BASE }

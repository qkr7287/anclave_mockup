import { apiGet, apiPatch, apiPost } from '../lib/api'
import type { ApiRequest } from '../data/types'

// 4.20/4.19/4.19a API 키 신청 — Hono backend(REST) 연동(gpu-requests 패턴 미러).
//   GET   /api/api-requests       목록
//   GET   /api/api-requests/:id   단건(없으면 404)
//   POST  /api/api-requests       신규 요청(status=pending, id·created_at 서버 생성)
//   PATCH /api/api-requests/:id   { action:'approve'(apiKey 필수)|'reject', ... }  processed_at 서버 now()
// 데모(김가람→svc-doc) 3건은 backend seed 정본. timestamptz(ISO) → 표시 포맷으로 정규화.
export interface ApiRecord extends ApiRequest {
  purpose?: string
  processedBy?: string
  processedAt?: string
}

function fmtStamp(v?: string | null): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function normalize(r: ApiRecord): ApiRecord {
  return { ...r, createdAt: fmtStamp(r.createdAt) ?? r.createdAt, processedAt: fmtStamp(r.processedAt) }
}

export function listApiRequests(): Promise<ApiRecord[]> {
  return apiGet<ApiRecord[]>('/api/api-requests').then((rows) => rows.map(normalize))
}

export function getApiRequest(id: string): Promise<ApiRecord> {
  return apiGet<ApiRecord>(`/api/api-requests/${id}`).then(normalize)
}

export function createApiRequest(input: { requesterUserId: string; serviceId: string; model: string; targetServiceUrl: string; purpose?: string }): Promise<ApiRecord> {
  return apiPost<ApiRecord>('/api/api-requests', input).then(normalize)
}

export function approveApiRequest(id: string, processedBy: string, apiKey: string): Promise<ApiRecord> {
  return apiPatch<ApiRecord>(`/api/api-requests/${id}`, { action: 'approve', processedBy, apiKey }).then(normalize)
}

export function rejectApiRequest(id: string, processedBy: string, rejectReason: string): Promise<ApiRecord> {
  return apiPatch<ApiRecord>(`/api/api-requests/${id}`, { action: 'reject', processedBy, rejectReason }).then(normalize)
}

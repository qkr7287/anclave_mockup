import { apiGet, apiPatch, apiPost } from '../lib/api'
import type { PublishRequest } from '../data/types'

// 4.29/4.9/4.9a 게시 신청 — Hono backend(REST) 연동(gpu-requests 패턴 미러).
//   GET   /api/publish-requests       목록
//   GET   /api/publish-requests/:id   단건(없으면 404)
//   POST  /api/publish-requests       신규 신청(status=pending, id·created_at 서버 생성)
//   PATCH /api/publish-requests/:id   { action:'approve'|'reject', ... }  processed_at 서버 now()
// backend 는 timestamptz 를 ISO 로 반환 → 경계에서 시드 표시 포맷('YYYY-MM-DD HH:mm')으로 정규화.
export interface PubRecord extends PublishRequest {
  adminMemo?: string
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
function normalize(r: PubRecord): PubRecord {
  return { ...r, createdAt: fmtStamp(r.createdAt) ?? r.createdAt, processedAt: fmtStamp(r.processedAt) }
}

export function listPublishRequests(): Promise<PubRecord[]> {
  return apiGet<PubRecord[]>('/api/publish-requests').then((rows) => rows.map(normalize))
}

export function getPublishRequest(id: string): Promise<PubRecord> {
  return apiGet<PubRecord>(`/api/publish-requests/${id}`).then(normalize)
}

export function createPublishRequest(input: { requesterUserId: string; serviceName: string; serviceUrl: string; demoUrl: string; meta: string }): Promise<PubRecord> {
  return apiPost<PubRecord>('/api/publish-requests', input).then(normalize)
}

export function approvePublishRequest(id: string, processedBy: string, adminMemo?: string): Promise<PubRecord> {
  return apiPatch<PubRecord>(`/api/publish-requests/${id}`, { action: 'approve', processedBy, adminMemo }).then(normalize)
}

export function rejectPublishRequest(id: string, processedBy: string, rejectReason: string, adminMemo?: string): Promise<PubRecord> {
  return apiPatch<PubRecord>(`/api/publish-requests/${id}`, { action: 'reject', processedBy, rejectReason, adminMemo }).then(normalize)
}

import { API_BASE, apiGet, apiPatch, apiPost } from '../lib/api'
import type { PublishRequest } from '../data/types'

// 4.29/4.9/4.9a 게시 신청 — Hono backend(REST) 연동(gpu-requests 패턴 미러).
//   GET   /api/publish-requests       목록
//   GET   /api/publish-requests/:id   단건(없으면 404)
//   POST  /api/publish-requests       신규 신청(status=pending, id·created_at 서버 생성)
//   PATCH /api/publish-requests/:id   { action:'approve'|'reject', ... }  processed_at 서버 now()
// backend 는 timestamptz 를 ISO 로 반환 → 경계에서 시드 표시 포맷('YYYY-MM-DD HH:mm')으로 정규화.
export interface PubRecord extends PublishRequest {
  // 신청자가 작성한 마켓 노출 콘텐츠 — 마켓 상세(ServiceDetailCard)와 동일 항목.
  // types.ts PublishRequest(정본)엔 없어 여기서 확장. backend JSON 응답엔 포함.
  overview?: string | null
  apiDesc?: string | null
  features?: string[]
  tags?: string[]
  visibility?: string | null
  demoNote?: string | null
  screenshots?: string[]
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

export function createPublishRequest(input: { requesterUserId: string; serviceName: string; serviceUrl: string; demoUrl: string; meta: string; overview: string; apiDesc: string; features: string[]; tags: string[]; visibility: string; demoNote: string; screenshots: string[] }): Promise<PubRecord> {
  return apiPost<PubRecord>('/api/publish-requests', input).then(normalize)
}

export function approvePublishRequest(id: string, processedBy: string, adminMemo?: string): Promise<PubRecord> {
  return apiPatch<PubRecord>(`/api/publish-requests/${id}`, { action: 'approve', processedBy, adminMemo }).then(normalize)
}

export function rejectPublishRequest(id: string, processedBy: string, rejectReason: string, adminMemo?: string): Promise<PubRecord> {
  return apiPatch<PubRecord>(`/api/publish-requests/${id}`, { action: 'reject', processedBy, rejectReason, adminMemo }).then(normalize)
}

// 4.9a 게시 신청 영구 삭제 — 관리자 전용. publish_requests 행 + (승인 시 생성된) market_services 행을 cascade 제거.
//   DELETE /api/publish-requests/:id   → 200/204(성공) · 404(없음)
// lib/api.ts 에 DELETE 래퍼가 없어 여기서 직접 호출(단일 사용처).
export async function deletePublishRequest(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/publish-requests/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status} DELETE /api/publish-requests/${id}`)
}

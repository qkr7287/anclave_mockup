import { apiGet, apiPatch } from '../lib/api'
import type { GpuRequest } from '../data/types'

// 4.10/4.10a 승인 관리 — Hono backend(REST) 연동.
//   GET   /api/gpu-requests        목록
//   GET   /api/gpu-requests/:id    단건(없으면 404)
//   PATCH /api/gpu-requests/:id    승인/반려(processed_at 은 서버 now())
// backend 는 timestamptz 를 ISO 문자열로, numeric 을 문자열로 반환 →
// 경계에서 시드와 동일한 표시 포맷(createdAt 'YYYY-MM-DD HH:mm', capacity number)으로 정규화해
// 화면 계층(approvals.tsx · approval-detail.tsx)은 시드 시절과 동일한 데이터 모양을 본다.

// ISO('…T…Z') → 로컬 'YYYY-MM-DD HH:mm'. 파싱 불가 시 원본 유지.
function fmtStamp(v?: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 처리일시(접수증 즉시 표시용) — fmtStamp(now)
export function nowStamp(): string {
  return fmtStamp(new Date().toISOString())!
}

function normalize(r: GpuRequest): GpuRequest {
  return {
    ...r,
    capacity: Number(r.capacity),
    createdAt: fmtStamp(r.createdAt) ?? r.createdAt,
    processedAt: fmtStamp(r.processedAt),
  }
}

export function fetchGpuRequests(): Promise<GpuRequest[]> {
  return apiGet<GpuRequest[]>('/api/gpu-requests').then((rows) => rows.map(normalize))
}

export function fetchGpuRequestById(id: string): Promise<GpuRequest> {
  return apiGet<GpuRequest>(`/api/gpu-requests/${id}`).then(normalize)
}

// 승인 — allocated*·자원 제한·관리자 메모. processed_at/by 는 backend 가 기록.
export interface ApprovePayload {
  processedBy: string
  adminMemo?: string
  allocatedServerId?: string
  allocatedGpuId?: string
  allocatedSliceId?: string
  allocatedRamGb?: number
  allocatedStorageGb?: number
  allocatedCpuCores?: number
}
export function approveGpuRequest(id: string, payload: ApprovePayload): Promise<GpuRequest> {
  return apiPatch<GpuRequest>(`/api/gpu-requests/${id}`, { action: 'approve', ...payload }).then(normalize)
}

// 반려 — 사유 필수.
export function rejectGpuRequest(id: string, payload: { processedBy: string; rejectReason: string; adminMemo?: string }): Promise<GpuRequest> {
  return apiPatch<GpuRequest>(`/api/gpu-requests/${id}`, { action: 'reject', ...payload }).then(normalize)
}

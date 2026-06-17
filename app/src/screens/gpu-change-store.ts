import { apiGet, apiPatch, apiPost } from '../lib/api'
import { userById } from '../data'
import type { ChangeType, GpuRequest, GpuServer, Status } from '../data/types'

// 4.11 변경·회수 — Hono backend(REST) 연동.
//   GET   /api/my-allocations?user=        내 할당 자원(승인·할당된 gpu_requests = AllocSpec)
//   GET   /api/gpu-change-requests[?user=] 변경요청 목록(관리자=전체)
//   GET   /api/gpu-change-requests/:id     단건(before/after 중첩)
//   POST  /api/gpu-change-requests         신청
//   PATCH /api/gpu-change-requests/:id     승인/반려(트랜잭션 — 승인 시 대상 할당 갱신/회수)
// backend 는 timestamptz 를 ISO 로, before/after 를 AllocSpec 으로 내려준다(history 는 없음 → 여기서 합성).

export const CHANGE_TYPE_META: Record<ChangeType, { label: string; tone: 'info' | 'ok' | 'warn' | 'danger' | 'neutral'; desc: string }> = {
  change: { label: '변경', tone: 'info', desc: '할당 구성(자원 제한 등) 변경' },
  expand: { label: '확장', tone: 'ok', desc: '자원 용량 확장' },
  migrate: { label: '이전', tone: 'warn', desc: '다른 서버·GPU로 이전' },
  reclaim: { label: '회수', tone: 'danger', desc: '할당 자원 회수(반납)' },
}

export interface AllocSpec {
  requestId?: string
  ownerUserId?: string // 할당 소유자(관리자 전체 할당 조회 시 표시용)
  serverId?: string
  serverHost?: string
  gpuId?: string
  sliceId?: string
  gpuLabel?: string
  ramGb?: number
  storageGb?: number
  cpuCores?: number
  extra?: { label: string; note: string } // 확장 시 추가 자원(카탈로그/선택 자원 레이블)
}

export interface HistoryEntry {
  at: string
  actor: string
  label: string
  detail?: string
  tone?: 'accent' | 'ok' | 'danger' | 'muted'
}

export interface ChangeRequest {
  id: string
  requesterUserId: string
  type: ChangeType
  reason: string
  status: Status
  rejectReason?: string
  createdAt: string
  processedAt?: string
  processedBy?: string
  adminMemo?: string
  before: AllocSpec // 기존(현재) 할당 명세 (target gpu_request 라이브)
  after?: AllocSpec // 변경 후 제안/확정 명세 (reclaim 은 없음)
  history: HistoryEntry[]
}

// 'YYYY-MM-DD HH:mm'
export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ISO('…T…Z') → 로컬 'YYYY-MM-DD HH:mm'. 파싱 불가 시 원본 유지.
function fmtStamp(v?: string | null): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function allocLabel(s: AllocSpec): string {
  return [s.serverHost, s.gpuLabel].filter(Boolean).join(' · ') || '할당 정보 없음'
}

// ── backend 경계 정규화 ──
// 백엔드 AllocSpec 은 미할당 필드를 null 로 보냄 → undefined 로 정리(컴포넌트 emptyText 처리).
function cleanAlloc(a?: AllocSpec | null): AllocSpec {
  if (!a) return {}
  return {
    requestId: a.requestId ?? undefined, ownerUserId: a.ownerUserId ?? undefined, serverId: a.serverId ?? undefined, serverHost: a.serverHost ?? undefined,
    gpuId: a.gpuId ?? undefined, sliceId: a.sliceId ?? undefined, gpuLabel: a.gpuLabel ?? undefined,
    ramGb: a.ramGb ?? undefined, storageGb: a.storageGb ?? undefined, cpuCores: a.cpuCores ?? undefined,
    extra: a.extra ?? undefined,
  }
}

interface RawCR {
  id: string; requesterUserId: string; type: ChangeType; reason?: string | null; status: Status
  rejectReason?: string | null; createdAt: string; processedAt?: string | null; processedBy?: string | null
  adminMemo?: string | null; targetRequestId?: string | null; before?: AllocSpec | null; after?: AllocSpec | null
}

// 처리 히스토리 — 백엔드 미제공이므로 접수(+처리) 이벤트로 합성.
function synthHistory(cr: RawCR): HistoryEntry[] {
  const actor = userById(cr.requesterUserId)?.name ?? cr.requesterUserId
  const h: HistoryEntry[] = [
    { at: fmtStamp(cr.createdAt) ?? cr.createdAt, actor, label: '변경 요청 접수', detail: CHANGE_TYPE_META[cr.type]?.label, tone: 'accent' },
  ]
  if (cr.status !== 'pending') {
    const proc = cr.processedBy ? (userById(cr.processedBy)?.name ?? cr.processedBy) : '시스템 관리'
    h.push({
      at: fmtStamp(cr.processedAt) ?? '', actor: proc,
      label: cr.status === 'approved' ? '승인 처리' : '반려 처리',
      detail: cr.status === 'rejected' ? (cr.rejectReason ?? undefined) : (cr.adminMemo ?? undefined),
      tone: cr.status === 'approved' ? 'ok' : 'danger',
    })
  }
  return h
}

function normalizeCR(cr: RawCR): ChangeRequest {
  return {
    id: cr.id, requesterUserId: cr.requesterUserId, type: cr.type, reason: cr.reason ?? '',
    status: cr.status, rejectReason: cr.rejectReason ?? undefined,
    createdAt: fmtStamp(cr.createdAt) ?? cr.createdAt,
    processedAt: fmtStamp(cr.processedAt), processedBy: cr.processedBy ?? undefined, adminMemo: cr.adminMemo ?? undefined,
    before: cleanAlloc(cr.before),
    after: cr.type === 'reclaim' ? undefined : (cr.after ? cleanAlloc(cr.after) : undefined),
    history: synthHistory(cr),
  }
}

// after AllocSpec → POST/PATCH body 의 after_* 필드
function afterFields(after?: AllocSpec) {
  if (!after) return {}
  return {
    afterServerId: after.serverId, afterGpuId: after.gpuId, afterSliceId: after.sliceId,
    afterRamGb: after.ramGb, afterStorageGb: after.storageGb, afterCpuCores: after.cpuCores,
    afterExtra: after.extra ?? undefined,
  }
}

// 내 할당 자원 — 승인·할당된 내 gpu_requests(AllocSpec). 변경 마법사 '대상 할당'.
export function fetchMyAllocations(userId: string): Promise<AllocSpec[]> {
  return apiGet<AllocSpec[]>(`/api/my-allocations?user=${encodeURIComponent(userId)}`).then((rows) => rows.map((a) => cleanAlloc(a)))
}

// 전체 할당 자원 — 최종 관리자용. /api/my-allocations 는 user 필수·전체 모드 없음이라
// 승인·할당된 모든 gpu_requests 를 fleet(/api/servers) 라벨과 합성해 AllocSpec[] 로 만든다.
export async function fetchAllAllocations(): Promise<AllocSpec[]> {
  const [reqs, fleet] = await Promise.all([
    apiGet<GpuRequest[]>('/api/gpu-requests'),
    apiGet<GpuServer[]>('/api/servers').catch(() => [] as GpuServer[]),
  ])
  return reqs
    .filter((r) => r.status === 'approved' && r.allocatedServerId)
    .map((r) => {
      const server = fleet.find((s) => s.id === r.allocatedServerId)
      const gpu = server?.gpus.find((g) => g.id === r.allocatedGpuId)
      return cleanAlloc({
        requestId: r.id, ownerUserId: r.requesterUserId,
        serverId: r.allocatedServerId, serverHost: server?.host,
        gpuId: r.allocatedGpuId, sliceId: r.allocatedSliceId, gpuLabel: gpu?.name,
        ramGb: r.allocatedRamGb != null ? Number(r.allocatedRamGb) : undefined,
        storageGb: r.allocatedStorageGb != null ? Number(r.allocatedStorageGb) : undefined,
        cpuCores: r.allocatedCpuCores != null ? Number(r.allocatedCpuCores) : undefined,
      })
    })
}

// 변경요청 목록 — userId 있으면 본인, 없으면 전체(관리자).
export function fetchChangeRequests(userId?: string): Promise<ChangeRequest[]> {
  const q = userId ? `?user=${encodeURIComponent(userId)}` : ''
  return apiGet<RawCR[]>(`/api/gpu-change-requests${q}`).then((rows) => rows.map(normalizeCR))
}

export function fetchChangeRequestById(id: string): Promise<ChangeRequest | undefined> {
  return apiGet<RawCR>(`/api/gpu-change-requests/${id}`).then(normalizeCR).catch(() => undefined)
}

// 신규 신청 — 대상 할당(before.requestId)에 대한 변경/회수 (관리자는 전체 할당 대상 가능)
export function createChangeRequest(input: { requesterUserId: string; type: ChangeType; reason: string; before: AllocSpec; after?: AllocSpec }): Promise<ChangeRequest> {
  return apiPost<RawCR>('/api/gpu-change-requests', {
    requesterUserId: input.requesterUserId,
    type: input.type,
    targetRequestId: input.before.requestId,
    reason: input.reason,
    ...afterFields(input.type === 'reclaim' ? undefined : input.after),
  }).then(normalizeCR)
}

// 관리자 심사 — 승인(after 확정 → 대상 할당 갱신) / 반려(사유)
export function reviewChangeRequest(id: string, decision: { action: 'approve' | 'reject'; processedBy: string; adminMemo?: string; after?: AllocSpec; rejectReason?: string }): Promise<ChangeRequest> {
  return apiPatch<RawCR>(`/api/gpu-change-requests/${id}`, {
    action: decision.action,
    processedBy: decision.processedBy,
    adminMemo: decision.adminMemo,
    rejectReason: decision.rejectReason,
    ...(decision.action === 'approve' ? afterFields(decision.after) : {}),
  }).then(normalizeCR)
}

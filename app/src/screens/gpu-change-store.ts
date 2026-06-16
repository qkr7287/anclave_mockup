import { gpuChangeRequests, gpuRequests, serverById, userById } from '../data'
import type { ChangeType, GpuRequest, Status } from '../data/types'

// 4.11 변경·확장·이전·회수 — 목업 store(세션 사본).
// GpuChangeRequest 시드는 {type, reason, status, createdAt}뿐이라, 화면에 필요한
// 확장 필드(대상 할당 before/after · 처리결과 · 히스토리)는 이 레이어에서 합성·보관한다.
// 사용자의 "현재 할당"은 승인된 GPU 신청(allocated*)에서 도출. (백엔드 endpoint 생기면 와이어링)

export const CHANGE_TYPE_META: Record<ChangeType, { label: string; tone: 'info' | 'ok' | 'warn' | 'danger' | 'neutral'; desc: string }> = {
  change: { label: '변경', tone: 'info', desc: '할당 구성(자원 제한 등) 변경' },
  expand: { label: '확장', tone: 'ok', desc: '자원 용량 확장' },
  migrate: { label: '이전', tone: 'warn', desc: '다른 서버·GPU로 이전' },
  reclaim: { label: '회수', tone: 'danger', desc: '할당 자원 회수(반납)' },
}

export interface AllocSpec {
  requestId?: string
  serverId?: string
  serverHost?: string
  gpuId?: string
  gpuLabel?: string
  ramGb?: number
  storageGb?: number
  cpuCores?: number
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
  before: AllocSpec // 기존(현재) 할당 명세
  after?: AllocSpec // 변경 후 제안/확정 명세 (reclaim 은 없음)
  history: HistoryEntry[]
}

// 'YYYY-MM-DD HH:mm'
export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function specFromRequest(r: GpuRequest): AllocSpec {
  const server = r.allocatedServerId ? serverById(r.allocatedServerId) : undefined
  const gpu = server?.gpus.find((g) => g.id === r.allocatedGpuId)
  return {
    requestId: r.id,
    serverId: r.allocatedServerId,
    serverHost: server?.host ?? r.allocatedServerId,
    gpuId: r.allocatedGpuId,
    gpuLabel: gpu?.name ?? r.allocatedGpuId,
    ramGb: r.allocatedRamGb,
    storageGb: r.allocatedStorageGb,
    cpuCores: r.allocatedCpuCores,
  }
}

export function allocLabel(s: AllocSpec): string {
  return [s.serverHost, s.gpuLabel].filter(Boolean).join(' · ') || '할당 정보 없음'
}

// 사용자의 현재 할당 목록 — 승인된 GPU 신청(allocated 서버 존재)
export function allocationsOf(userId: string): AllocSpec[] {
  return gpuRequests
    .filter((r) => r.requesterUserId === userId && r.status === 'approved' && r.allocatedServerId)
    .map(specFromRequest)
}

// 변경요청의 대상(기존) 할당 — 신청자의 첫 승인 할당으로 합성(시드엔 링크 필드 없음)
function inferBefore(userId: string): AllocSpec {
  const allocs = allocationsOf(userId)
  return allocs[0] ?? { ramGb: 64, storageGb: 100, cpuCores: 8 }
}

// 시드 → 세션 ChangeRequest 사본(확장 필드 합성)
function seedToChange(r: { id: string; requesterUserId: string; type: ChangeType; reason: string; status: Status; rejectReason?: string; createdAt: string }): ChangeRequest {
  const before = inferBefore(r.requesterUserId)
  const actorName = userById(r.requesterUserId)?.name ?? r.requesterUserId
  const history: HistoryEntry[] = [
    { at: r.createdAt, actor: actorName, label: '변경 요청 접수', detail: CHANGE_TYPE_META[r.type].label, tone: 'accent' },
  ]
  if (r.status !== 'pending') {
    history.push({
      at: r.createdAt,
      actor: '시스템 관리',
      label: r.status === 'approved' ? '승인 처리' : '반려 처리',
      detail: r.status === 'rejected' ? r.rejectReason : undefined,
      tone: r.status === 'approved' ? 'ok' : 'danger',
    })
  }
  return {
    id: r.id,
    requesterUserId: r.requesterUserId,
    type: r.type,
    reason: r.reason,
    status: r.status,
    rejectReason: r.rejectReason,
    createdAt: r.createdAt,
    processedAt: r.status !== 'pending' ? r.createdAt : undefined,
    processedBy: r.status !== 'pending' ? 'u-admin' : undefined,
    before,
    after: r.type === 'reclaim' ? undefined : { ...before },
    history,
  }
}

let session: ChangeRequest[] = gpuChangeRequests.map(seedToChange)

export function getChangeRequests(): ChangeRequest[] {
  return session
}

export function getChangeRequestsByUser(userId: string): ChangeRequest[] {
  return session.filter((r) => r.requesterUserId === userId)
}

export function getChangeRequestById(id: string): ChangeRequest | undefined {
  return session.find((r) => r.id === id)
}

// 사용자 신규 신청 — 본인 할당 대상 변경/확장/회수
export function createChangeRequest(input: { requesterUserId: string; type: ChangeType; reason: string; before: AllocSpec; after?: AllocSpec }): ChangeRequest {
  const at = nowStamp()
  const seq = String(session.length + 1).padStart(2, '0')
  const actorName = userById(input.requesterUserId)?.name ?? input.requesterUserId
  const cr: ChangeRequest = {
    id: `cr-${Date.now().toString(36)}`,
    requesterUserId: input.requesterUserId,
    type: input.type,
    reason: input.reason,
    status: 'pending',
    createdAt: at,
    before: input.before,
    after: input.type === 'reclaim' ? undefined : input.after,
    history: [{ at, actor: actorName, label: '변경 요청 접수', detail: `${CHANGE_TYPE_META[input.type].label}${seq ? '' : ''}`, tone: 'accent' }],
  }
  session = [cr, ...session]
  return cr
}

// 관리자 심사 — 승인(after 확정) / 반려(사유)
export function reviewChangeRequest(id: string, decision: { action: 'approve' | 'reject'; processedBy: string; processorName: string; adminMemo?: string; after?: AllocSpec; rejectReason?: string }): ChangeRequest | undefined {
  const at = nowStamp()
  session = session.map((r) => {
    if (r.id !== id) return r
    const entry: HistoryEntry =
      decision.action === 'approve'
        ? { at, actor: decision.processorName, label: '승인 처리', detail: decision.adminMemo, tone: 'ok' }
        : { at, actor: decision.processorName, label: '반려 처리', detail: decision.rejectReason, tone: 'danger' }
    return {
      ...r,
      status: decision.action === 'approve' ? 'approved' : 'rejected',
      rejectReason: decision.action === 'reject' ? decision.rejectReason : undefined,
      adminMemo: decision.adminMemo,
      processedAt: at,
      processedBy: decision.processedBy,
      after: decision.action === 'approve' && r.type !== 'reclaim' ? (decision.after ?? r.after) : r.after,
      history: [...r.history, entry],
    }
  })
  return getChangeRequestById(id)
}

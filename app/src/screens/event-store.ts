import { events } from '../data/events'
import { servers, allGpus, gpuRequests, services } from '../data'
import type { EventLog, EventStatus } from '../data/types'
import { usePolling } from '../data/hooks/usePolling'
import type { EventRow, PollState } from '../data/hooks/usePolling'

// 4.21 에러·이벤트 관제 — 목업 store(세션 사본). 다른 *-store(gpu-change-store 등) 패턴.
// 시드 events(읽기 전용)를 세션 배열로 복제해, 상세 드로어의 [해결 처리]를 로컬 반영한다.
// (backend PATCH endpoint 생기면 이 레이어만 REST 로 와이어링 — 화면 계층은 그대로.)

let session: EventLog[] = events.map((e) => ({ ...e }))

export function getEvents(): EventLog[] {
  return session
}

export function getEventById(id: string): EventLog | undefined {
  return session.find((e) => e.id === id)
}

// 이벤트 대상의 서버 id — serverId 가 있으면 그대로, 없으면 gpuId 의 소속 서버로 도출.
export function serverIdOf(e: { gpuId?: string; serverId?: string }): string | undefined {
  if (e.serverId) return e.serverId
  if (e.gpuId) return servers.find((s) => s.gpus.some((g) => g.id === e.gpuId))?.id
  return undefined
}

export interface EventTarget {
  serverId?: string
  gpuId?: string
  label: string // 'srv-XX / GPU3' | 'srv-XX' | '—'
  sub?: string // GPU 모델명 등 보조
}

// 대상 셀/딥링크용 — gpuId 면 'srv-XX / GPU{n}'(서버 내 1-based 인덱스), 아니면 서버 단위.
export function targetOf(e: EventLog): EventTarget {
  const serverId = serverIdOf(e)
  if (e.gpuId) {
    const srv = servers.find((s) => s.gpus.some((g) => g.id === e.gpuId))
    const idx = srv ? srv.gpus.findIndex((g) => g.id === e.gpuId) + 1 : 0
    const gpu = allGpus.find((g) => g.id === e.gpuId)
    return { serverId, gpuId: e.gpuId, label: `${serverId ?? '—'} / GPU${idx || '?'}`, sub: gpu?.model }
  }
  if (serverId) {
    const srv = servers.find((s) => s.id === serverId)
    return { serverId, label: serverId, sub: srv?.host }
  }
  return { label: '—' }
}

// 대상 자원 딥링크 — 관리자는 자원맵, 사용자(B/C)는 본인 '내 할당 자원'(자원맵은 A 전용 라우트).
export function targetPath(e: EventLog, isAdmin: boolean): string | undefined {
  const t = targetOf(e)
  if (!t.serverId && !t.gpuId) return undefined
  if (!isAdmin) return '/dashboard'
  if (t.gpuId && t.serverId) return `/resource-map/${t.serverId}/${t.gpuId}`
  if (t.serverId) return `/resource-map/${t.serverId}`
  return undefined
}

// 사용자가 '소유'한 자원 — assignedUserId(서비스 owner) · MIG 슬라이스 owner · 승인된 GPU 신청 할당.
function myResourceSets(userId: string): { gpuIds: Set<string>; serverIds: Set<string> } {
  const gpuIds = new Set<string>()
  const serverIds = new Set<string>()
  servers.forEach((srv) => {
    srv.gpus.forEach((g) => {
      const mine = g.assignedUserId === userId || (g.slices ?? []).some((sl) => sl.ownerUserId === userId)
      if (mine) {
        gpuIds.add(g.id)
        serverIds.add(srv.id)
      }
    })
  })
  gpuRequests.forEach((r) => {
    if (r.requesterUserId !== userId || r.status !== 'approved') return
    if (r.allocatedGpuId) gpuIds.add(r.allocatedGpuId)
    if (r.allocatedServerId) serverIds.add(r.allocatedServerId)
  })
  return { gpuIds, serverIds }
}

// 사용자(B/C) '내 에러 이벤트' — 본인 소유 GPU/서버에서 발생한 이벤트만.
export function getEventsForUser(userId: string): EventLog[] {
  const { gpuIds, serverIds } = myResourceSets(userId)
  return session.filter((e) => {
    if (e.gpuId) return gpuIds.has(e.gpuId)
    if (e.serverId) return serverIds.has(e.serverId)
    return false
  })
}

// 사용자 소유 서비스명 — 자원 id 없는 이벤트(메시지에 서비스명만)도 본인 것으로 포착.
function myServiceNames(userId: string): string[] {
  return services.filter((s) => s.ownerUserId === userId).map((s) => s.name)
}

// DB(/api/events) · 시드 공용 — 임의 이벤트 행을 사용자 스코프로 필터(A는 호출 안 함).
// 본인 소유 GPU/서버 OR 메시지에 본인 서비스명 포함.
export function filterEventRowsForUser<
  T extends { gpuId?: string | null; serverId?: string | null; message: string },
>(rows: T[], userId: string): T[] {
  const { gpuIds, serverIds } = myResourceSets(userId)
  const names = myServiceNames(userId)
  return rows.filter((e) => {
    if (e.gpuId && gpuIds.has(e.gpuId)) return true
    if (e.serverId && serverIds.has(e.serverId)) return true
    return names.some((n) => e.message.includes(n))
  })
}

// ── DB 배선(읽기) — 목록은 useEvents(이미 존재), 상세는 useEvent. 둘 다 화면은 EventLog 형태로 소비. ──

// 이벤트 단건(상세) — backend /api/events/:id. 목록 EventRow + 처리 필드(superset) · 없으면 404.
export interface EventDetailRow extends EventRow {
  read?: boolean
  assignee?: string
  action?: string
  resolution?: string
}

export function useEvent(id: string | null, intervalMs = 10000): PollState<EventDetailRow> {
  return usePolling<EventDetailRow>(id ? `/api/events/${id}` : null, intervalMs)
}

// 발생일시 정규화 — DB(ISO)는 'YYYY-MM-DD HH:mm' 로, 시드(이미 그 형식)는 그대로.
// 목록 표시·상세 헤더·날짜 필터(slice(0,10))가 일관되게 동작하도록 매핑 경계에서 통일.
function fmtCreatedAt(s: string): string {
  if (!s.includes('T')) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// DB EventRow(+상세 superset) → 화면이 쓰는 EventLog. null→undefined, 누락 필드 기본값.
// 시드 EventLog 를 그대로 넣어도 동일하게 통과(폴백 경로 공용).
export function eventRowToLog(e: EventRow | EventDetailRow | EventLog): EventLog {
  const d = e as EventDetailRow & EventLog
  return {
    id: d.id,
    severity: d.severity,
    status: d.status as EventStatus,
    gpuId: d.gpuId ?? undefined,
    serverId: d.serverId ?? undefined,
    message: d.message,
    createdAt: fmtCreatedAt(d.createdAt),
    read: d.read ?? false,
    assignee: d.assignee ?? undefined,
    action: d.action ?? undefined,
    resolution: d.resolution ?? undefined,
  }
}

// 드로어 진입 시 읽음 처리(로컬).
export function markRead(id: string): void {
  session = session.map((e) => (e.id === id ? { ...e, read: true } : e))
}

// open 이벤트 해결 처리 — status open→resolved, 담당·조치·처리결과 기록.
export function resolveEvent(id: string, input: { assignee?: string; action?: string; resolution: string }): EventLog | undefined {
  session = session.map((e) =>
    e.id === id
      ? {
          ...e,
          status: 'resolved',
          read: true,
          assignee: input.assignee?.trim() || e.assignee,
          action: input.action?.trim() || e.action,
          resolution: input.resolution.trim(),
        }
      : e,
  )
  return getEventById(id)
}

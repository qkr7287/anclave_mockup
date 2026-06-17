import { useEffect, useState } from 'react'
import { servers, allGpus, gpuRequests } from '../data'
import { apiGet } from '../lib/api'
import type { EventLog, EventStatus, Severity } from '../data/types'

// 4.21 에러·이벤트 관제 — 소스를 DB(/api/events)로 와이어링한 세션 store.
//   backend 행을 EventLog 모양으로 정규화해 모듈 세션(session)에 적재 → 화면 계층은
//   기존과 동일한 동기 getter(getEvents/getEventsForUser/getEventById)를 그대로 사용한다.
//   markRead·resolveEvent 는 로컬 세션 반영(backend 이벤트 PATCH endpoint 미제공 — 생기면
//   resolveEvent 만 REST 로 교체, 화면 계층은 불변).

// backend /api/events 행(부분 집합) — read/assignee/resolution 은 미반환(로컬 관리).
interface EventRow {
  id: string
  severity: Severity
  status: string
  message: string
  gpuId: string | null
  serverId: string | null
  createdAt: string
}

// ISO('…T…Z') → 'YYYY-MM-DD HH:mm'(시드 표시 포맷). 파싱 불가 시 원본 유지(이미 포맷됨).
function fmtStamp(v: string): string {
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function normalize(r: EventRow): EventLog {
  return {
    id: r.id,
    severity: r.severity,
    status: (r.status === 'resolved' ? 'resolved' : 'open') as EventStatus,
    gpuId: r.gpuId ?? undefined,
    serverId: r.serverId ?? undefined,
    message: r.message,
    createdAt: fmtStamp(r.createdAt),
    read: false,
  }
}

// 세션 적재 — 앱 라이프사이클 1회 로드(read·resolve 로컬 상태 보존). 새 fleet 은 리로드로 반영.
let session: EventLog[] = []
let loaded = false
let loadPromise: Promise<void> | null = null
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach((fn) => fn())

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (!loadPromise) {
    loadPromise = apiGet<EventRow[]>('/api/events?limit=1000')
      .then((rows) => { session = rows.map(normalize); loaded = true; notify() })
      .catch((e) => { loadPromise = null; throw e })
  }
  return loadPromise
}

// 화면 진입 훅 — 최초 로드 트리거 + 적재 완료 시 재렌더. { ready, error } 반환.
export function useEventStore(): { ready: boolean; error: boolean } {
  const [, force] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    const onChange = () => force((n) => n + 1)
    subscribers.add(onChange)
    ensureLoaded().catch(() => setError(true))
    return () => { subscribers.delete(onChange) }
  }, [])
  return { ready: loaded, error }
}

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

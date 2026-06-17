// 경량 폴링 훅 — react-query 없이 fetch + 주기 갱신(폐쇄망 데모엔 충분).
// 동기 import(static data)를 점진적으로 이 훅으로 교체한다. 로딩/에러는 화면에서 처리.
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../../lib/api'
import { setLiveRequests, setLiveServices, setLiveUsers } from '../../lib/liveData'
import type { Service, User } from '../types'

export interface PollState<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
}

export function usePolling<T>(path: string | null, intervalMs = 5000): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, isLoading: true })
  const alive = useRef(true)

  useEffect(() => {
    if (!path) return
    alive.current = true
    const tick = () =>
      apiGet<T>(path)
        .then((d) => { if (alive.current) setState({ data: d, error: null, isLoading: false }) })
        .catch((e) => { if (alive.current) setState((s) => ({ ...s, error: e as Error, isLoading: false })) })
    tick()
    const id = setInterval(tick, intervalMs)
    return () => { alive.current = false; clearInterval(id) }
  }, [path, intervalMs])

  return state
}

// 텔레메트리 멀티메트릭 시계열 — backend /api/telemetry/series. [{ts, <metric>: number...}]
export interface SeriesPoint {
  ts: string
  [metric: string]: number | string
}

export function useTelemetrySeries(
  kind: string,
  metrics: string,
  range = '3h',
  agg: 'avg' | 'sum' = 'avg',
  intervalMs = 5000,
  id?: string | null,
): PollState<SeriesPoint[]> {
  // id 명시했는데 아직 undefined/null(할당 로딩 전 등) → 호출 보류
  const idPart = id === undefined ? '' : id === null ? null : `&id=${encodeURIComponent(id)}`
  const path = idPart === null ? null : `/api/telemetry/series?kind=${kind}&metrics=${metrics}&range=${range}&agg=${agg}${idPart}`
  return usePolling<SeriesPoint[]>(path, intervalMs)
}

// GPU 자원 신청 — backend /api/gpu-requests. userId 지정 시 그 사람 신청만(B/C), 없으면 전체(A).
export interface GpuRequestRow {
  id: string
  requesterUserId: string
  capacity: number | string
  capacityUnit: 'card' | 'slice'
  models: string[]
  serviceName: string | null
  purpose: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejectReason: string | null
  createdAt: string
}

export function useGpuRequests(userId?: string, intervalMs = 5000): PollState<GpuRequestRow[]> {
  const path = `/api/gpu-requests${userId ? `?user=${encodeURIComponent(userId)}` : ''}`
  return usePolling<GpuRequestRow[]>(path, intervalMs)
}

// 내 할당 — backend /api/allocations?user=. 4.5 내 할당 자원.
export interface AllocationRow {
  serviceId: string
  serviceName: string
  modelId: string | null
  usageCount: number
  gpuId: string | null
  serverId: string | null
  gpuModel: string | null
  vramGb: number | null
  allocMode: string | null
  serverHost: string | null
}

export function useAllocations(userId: string | null, intervalMs = 5000): PollState<AllocationRow[]> {
  return usePolling<AllocationRow[]>(userId ? `/api/allocations?user=${encodeURIComponent(userId)}` : null, intervalMs)
}

// 이벤트 로그 — backend /api/events. 4.5/4.21.
export interface EventRow {
  id: string
  severity: 'critical' | 'warn' | 'info' | 'recovered'
  status: string
  message: string
  gpuId: string | null
  serverId: string | null
  createdAt: string
}

export function useEvents(opts: { gpuId?: string; serverId?: string; limit?: number } = {}, intervalMs = 10000): PollState<EventRow[]> {
  const q = new URLSearchParams()
  if (opts.gpuId) q.set('gpuId', opts.gpuId)
  if (opts.serverId) q.set('serverId', opts.serverId)
  q.set('limit', String(opts.limit ?? 8))
  return usePolling<EventRow[]>(`/api/events?${q.toString()}`, intervalMs)
}

// 내 서비스 토큰 사용량 — backend /api/service-tokens. 4.5 토큰차트.
export interface ServiceTokens {
  services: { id: string; name: string; modelId: string | null }[]
  bars: number[][]
  max: number
  total: number
  calls: number
}

export function useServiceTokens(userId: string | null, intervalMs = 10000): PollState<ServiceTokens> {
  return usePolling<ServiceTokens>(userId ? `/api/service-tokens?user=${encodeURIComponent(userId)}` : null, intervalMs)
}

// 표시명 마스터 — backend /api/users · /api/services. id→이름 조회용(g4·activation 등 공용).
export function useUsers(intervalMs = 30000): PollState<User[]> {
  return usePolling<User[]>('/api/users', intervalMs)
}
export function useServicesList(intervalMs = 30000): PollState<Service[]> {
  return usePolling<Service[]>('/api/services', intervalMs)
}

// liveData 런타임 캐시 하이드레이션 — users/services/requests 를 DB로 채워
// 순수 lookup(userById·gpuServices·serviceOfSlice)이 DB 표시명을 쓰게 한다.
// useMemo 로 자식 렌더 전에 동기 반영(미스/다운 시 seed 유지).
export function useLiveData(): { ready: boolean } {
  const users = useUsers()
  const services = useServicesList()
  const requests = useGpuRequests()
  useMemo(() => {
    setLiveUsers(users.data)
    setLiveServices(services.data)
    setLiveRequests(requests.data)
  }, [users.data, services.data, requests.data])
  return { ready: !!(users.data && services.data) }
}

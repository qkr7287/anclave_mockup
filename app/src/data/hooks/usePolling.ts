// 경량 폴링 훅 — react-query 없이 fetch + 주기 갱신(폐쇄망 데모엔 충분).
// 동기 import(static data)를 점진적으로 이 훅으로 교체한다. 로딩/에러는 화면에서 처리.
import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../../lib/api'

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
): PollState<SeriesPoint[]> {
  const path = `/api/telemetry/series?kind=${kind}&metrics=${metrics}&range=${range}&agg=${agg}`
  return usePolling<SeriesPoint[]>(path, intervalMs)
}

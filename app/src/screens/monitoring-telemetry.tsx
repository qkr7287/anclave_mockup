// G11 · 4.7 관제 모니터링 — 텔레메트리 밴드 계약 + 조회범위 Context + 폴링 훅.
// 백엔드 계약(병렬 작업): GET /api/telemetry/band?kind=&id=&metrics=&range=
//   응답: [{ ts: ISO, <metric>: avg, <metric>_min, <metric>_max }, ...]  // 빈 데이터 []
// 공유 src/lib/api.ts·src/data/hooks 는 백엔드 워크트리 소유라 이 화면에선
// 편집 불가 → 동일 계약을 화면-로컬로 둔다. 실 api.ts 도착 시 여기서 re-export.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// ───────────────────────── 조회범위 / 단위(권장페어 고정) ─────────────────────────

export const RANGES = ['10m', '2h', '1d', '30d'] as const
export type Range = (typeof RANGES)[number]

export const RANGE_LABEL: Record<Range, string> = {
  '10m': '10분',
  '2h': '2시간',
  '1d': '1일',
  '30d': '1달',
}
// 범위만 선택 · 단위 자동(읽기전용).
export const UNIT_BY_RANGE: Record<Range, string> = {
  '10m': '10초',
  '2h': '1분',
  '1d': '30분',
  '30d': '6시간',
}
// polling intervalMs = 범위의 단위.
export const INTERVAL_BY_RANGE: Record<Range, number> = {
  '10m': 10_000,
  '2h': 60_000,
  '1d': 1_800_000,
  '30d': 21_600_000,
}

const RANGE_SEC: Record<Range, number> = { '10m': 600, '2h': 7200, '1d': 86_400, '30d': 2_592_000 }
const UNIT_SEC: Record<Range, number> = { '10m': 10, '2h': 60, '1d': 1800, '30d': 21_600 }
// 범위초/단위초 + 1 → 포인트 수. 토글 시 점 개수 변화(61·121·49·121).
export const POINTS_BY_RANGE: Record<Range, number> = Object.fromEntries(
  RANGES.map((r) => [r, Math.round(RANGE_SEC[r] / UNIT_SEC[r]) + 1]),
) as Record<Range, number>

// ───────────────────────── 계약 타입 + fetch + 폴백 목 ─────────────────────────

export interface BandPoint {
  ts: string
  [metric: string]: number | string // m · m_min · m_max
}

export interface BandQuery {
  kind: string
  id: string
  metrics: string[]
  range: Range
  /** dev 목 폴백 기준값(metric→base). 실연동 시 무시됨. */
  bases?: Record<string, number>
}

// 결정적 파동(Math.random 미사용 → 렌더/폴 사이 흔들림 없음).
// 주파수를 윈도 비율(p=0~1)에 고정 → 포인트 수와 무관하게 매크로 추세 유지.
function wave(base: number, amp: number, seed: number, i: number, n: number): number {
  const p = n <= 1 ? 0 : i / (n - 1)
  const TAU = Math.PI * 2
  return (
    base +
    Math.sin(p * TAU * 1.3 + seed) * amp * 0.5 +
    Math.sin(p * TAU * 3.5 + seed * 1.7) * amp * 0.24 +
    Math.sin(p * TAU * 9 + seed) * amp * 0.15 +
    Math.sin(p * TAU * 22 + seed * 0.5) * amp * 0.09 +
    (((i * 9301 + Math.round(seed) * 49297) % 233) / 233 - 0.5) * amp * 0.36
  )
}

function seedOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997
  return h
}

// 고정 앵커 — 결정적·레이아웃 안정(폴백 목은 시간이 흐르지 않아도 무방).
const ANCHOR_MS = Date.parse('2026-06-12T15:30:00')

export function mockBand(metrics: string[], range: Range, bases?: Record<string, number>): BandPoint[] {
  const n = POINTS_BY_RANGE[range]
  const stepMs = UNIT_SEC[range] * 1000
  const r1 = (v: number) => Math.round(v * 10) / 10
  return Array.from({ length: n }, (_, i) => {
    const row: BandPoint = { ts: new Date(ANCHOR_MS - (n - 1 - i) * stepMs).toISOString() }
    for (const m of metrics) {
      const base = bases?.[m] ?? 50
      const amp = Math.max(2, base * 0.18)
      const seed = seedOf(m + range)
      const avg = Math.max(0, wave(base, amp, seed, i, n)) // 버킷 평균(mean)
      const spread = amp * 0.5 + Math.abs(wave(0, amp * 0.4, seed + 5, i, n))
      // 일부러 비대칭(위 1.15·아래 0.8) — 평균(mean)이 밴드 중앙(midrange)과 다름을 드러냄.
      row[m] = r1(avg)
      row[`${m}_max`] = r1(avg + spread * 1.15)
      row[`${m}_min`] = r1(Math.max(0, avg - spread * 0.8))
    }
    return row
  })
}

export async function fetchBand(q: BandQuery): Promise<BandPoint[]> {
  const params = new URLSearchParams({
    kind: q.kind,
    id: q.id,
    metrics: q.metrics.join(','),
    range: q.range,
  })
  try {
    const res = await fetch(`/api/telemetry/band?${params}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`band ${res.status}`)
    const json: unknown = await res.json()
    if (!Array.isArray(json)) throw new Error('band: not an array')
    return json as BandPoint[] // 빈 데이터 [] 그대로 통과
  } catch {
    // 백엔드 미연동(dev:server 부재) → 계약 형태 목 데이터.
    return mockBand(q.metrics, q.range, q.bases)
  }
}

// ───────────────────────── 조회범위 Context(전 위젯 공유) ─────────────────────────

interface RangeCtx {
  range: Range
  unit: string
  setRange: (r: Range) => void
}
const Ctx = createContext<RangeCtx | null>(null)

export function RangeProvider({ children, initial = '10m' }: { children: ReactNode; initial?: Range }) {
  const [range, setRange] = useState<Range>(initial)
  const value = useMemo<RangeCtx>(() => ({ range, unit: UNIT_BY_RANGE[range], setRange }), [range])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRange(): RangeCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRange must be used within RangeProvider')
  return v
}

// ───────────────────────── 폴링 훅 ─────────────────────────

// 주기적 재조회. fetcher·initial은 호출부에서 memoize(조회범위·메트릭 키 기준) →
// 키가 바뀌면 effect가 재실행되며 데이터를 initial로 즉시 리셋(잔상·점개수 불일치 방지).
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  initial: T,
): { data: T; loading: boolean; error: unknown } {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  // initial(=조회범위·메트릭 키) 변경 시 렌더 단계에서 즉시 리셋 — 잔상·점개수
  // 불일치 방지. React 권장 패턴(effect 내 동기 setState 회피).
  const [prevInitial, setPrevInitial] = useState(initial)
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setData(initial)
    setLoading(true)
    setError(null)
  }

  useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        const next = await fetcher()
        if (alive) {
          setData(next)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    const id = window.setInterval(run, intervalMs)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [fetcher, intervalMs])

  return { data, loading, error }
}

// 밴드 시계열 훅 — range는 Context값, intervalMs는 범위의 단위.
export function useTelemetryBand(
  kind: string,
  id: string,
  metrics: string[],
  bases?: Record<string, number>,
): { data: BandPoint[]; range: Range; unit: string; loading: boolean; error: unknown } {
  const { range, unit } = useRange()
  const metricsKey = metrics.join(',')
  const basesKey = bases
    ? Object.entries(bases)
        .map(([k, v]) => `${k}:${v}`)
        .join('|')
    : ''

  const initial = useMemo(
    () => mockBand(metrics, range, bases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metricsKey, range, basesKey],
  )
  const fetcher = useMemo(
    () => () => fetchBand({ kind, id, metrics, range, bases }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, id, metricsKey, range, basesKey],
  )
  const { data, loading, error } = usePolling<BandPoint[]>(fetcher, INTERVAL_BY_RANGE[range], initial)
  return { data, range, unit, loading, error }
}

// ───────────────────────── 차트 라벨 유틸 ─────────────────────────

const pad2 = (v: number) => String(v).padStart(2, '0')
// X축/툴팁 시각 포맷 — 30d는 MM/DD, 그 외 HH:MM.
export function tsLabel(range: Range): (iso: string) => string {
  return (iso) => {
    const d = new Date(iso)
    if (range === '30d') return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
}

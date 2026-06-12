import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

// 공용 밴드 차트(Bollinger 스타일) — 버킷 min~max 밴드 + 평균선. G11 관제에서 추출.
// 시간축 라벨은 xTickFormatter 주입(레이어 역전 방지 — screens 의 range 로직을 모름).

export interface BandPoint {
  ts: string
  [metric: string]: number | string
}
export interface BandSeries { key: string; name: string; color: string; yAxisId: string }
export interface BandAxis { id: string; orientation?: 'left' | 'right'; domain: [number, number]; ticks: number[]; width: number; suffix?: string }

const MUTED = 'var(--c-muted)'
const axisTick = { fontSize: 10, fill: MUTED }

// Figma 스타일 툴팁 — 시간 헤더 + 시리즈별 [최저·평균·최고] 가로 컴팩트 표.
// 세로로 길면 패널 overflow에 잘리므로 가로 그리드로 높이를 최소화한다.
// 평균선(Line)의 data row에서 m / m_min / m_max 를 읽음. 밴드 Area(함수 dataKey)는 제외.
// 평균(avg)은 버킷 샘플의 mean(계약 값 그대로) — (최고+최저)/2(중간값)와 다름.
interface TipEntry { name?: string; value?: number; color?: string; dataKey?: unknown; payload?: Record<string, number | string> }
function ChartTooltip({
  active,
  payload,
  label,
  fmt,
  labelFmt,
}: {
  active?: boolean
  payload?: TipEntry[]
  label?: string
  fmt: (key: string, v: number) => string
  labelFmt?: (l: string) => string
}) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => typeof p.dataKey === 'string' && p.name) // 밴드 Area(함수 dataKey·name 없음) 제외
  if (!rows.length) return null
  const numCell: CSSProperties = { fontSize: 12, textAlign: 'right' }
  const headCell: CSSProperties = { fontSize: 10, textAlign: 'right', color: MUTED }
  return (
    <div style={{ background: 'var(--toast-bg)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '8px 11px', boxShadow: 'var(--shadow-pop)' }}>
      <div className="font-bold" style={{ fontSize: 13, marginBottom: 6 }}>{labelFmt ? labelFmt(label ?? '') : label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', columnGap: 14, rowGap: 5, alignItems: 'center' }}>
        <span />
        <span style={headCell}>최저</span>
        <span style={headCell}>평균</span>
        <span style={headCell}>최고</span>
        {rows.map((p, i) => {
          const key = p.dataKey as string
          const row = p.payload ?? {}
          const hi = Number(row[`${key}_max`])
          const lo = Number(row[`${key}_min`])
          const hasBand = Number.isFinite(hi) && Number.isFinite(lo)
          return (
            <Fragment key={i}>
              <span className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
                <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: p.color }} />
                <span className="truncate" style={{ maxWidth: 104 }}>{p.name}</span>
              </span>
              <span className="text-muted tabular-nums" style={numCell}>{hasBand ? fmt(key, lo) : ''}</span>
              <span className="font-bold tabular-nums" style={numCell}>{fmt(key, p.value ?? 0)}</span>
              <span className="text-muted tabular-nums" style={numCell}>{hasBand ? fmt(key, hi) : ''}</span>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

interface BandChartProps {
  data: BandPoint[]
  series: BandSeries[]
  axes: BandAxis[]
  xTickFormatter: (ts: string) => string
  fmt: (key: string, v: number) => string
  margin?: { top: number; right: number; bottom: number; left: number }
}

export function BandChart({ data, series, axes, xTickFormatter, fmt, margin }: BandChartProps) {
  const n = data.length
  const interval = n > 1 ? Math.max(0, Math.ceil(n / 6) - 1) : 0
  // 모든 범위에 데이터 점 표시 — 밀도에 따라 반지름만 축소(촘촘해도 뭉치지 않게).
  const dotR = n <= 50 ? 2.2 : n <= 90 ? 1.9 : 1.3
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={margin ?? { top: 8, right: 8, bottom: 0, left: -10 }}>
        <CartesianGrid vertical={false} stroke="var(--c-border)" />
        <XAxis dataKey="ts" tickFormatter={xTickFormatter} tick={axisTick} tickLine={false} axisLine={false} interval={interval} minTickGap={20} />
        {axes.map((a) => (
          <YAxis
            key={a.id}
            yAxisId={a.id}
            orientation={a.orientation}
            domain={a.domain}
            ticks={a.ticks}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={a.width}
            tickFormatter={a.suffix ? (v) => `${v}${a.suffix}` : undefined}
          />
        ))}
        <Tooltip content={<ChartTooltip fmt={fmt} labelFmt={xTickFormatter} />} cursor={{ stroke: 'rgba(148,163,184,.3)' }} wrapperStyle={{ zIndex: 50 }} />
        {/* 밴드(min~max) — 먼저 그려 라인 뒤로. 겹침은 fillOpacity 낮게. */}
        {series.map((s) => (
          <Area
            key={`${s.key}-band`}
            yAxisId={s.yAxisId}
            type="linear"
            dataKey={(d: BandPoint) => [d[`${s.key}_min`], d[`${s.key}_max`]]}
            fill={s.color}
            fillOpacity={0.15}
            stroke="none"
            isAnimationActive={false}
            connectNulls
            activeDot={false}
          />
        ))}
        {/* 평균선 — 밴드 위 */}
        {series.map((s) => (
          <Line
            key={`${s.key}-line`}
            yAxisId={s.yAxisId}
            type="linear"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: dotR, fill: s.color, strokeWidth: 0 }}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

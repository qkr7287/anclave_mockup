import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { SparkLine } from '../charts/SparkLine'

interface KpiStatProps {
  label: string
  /** number면 count-up 적용, ReactNode면 그대로 */
  value: ReactNode | number
  unit?: string
  delta?: string
  deltaTone?: 'ok' | 'danger' | 'muted' | 'warn'
  /** 미니 스파크라인 데이터(보조요소 1종). 프로젝트 정책: 가로 채움 막대 금지 → 숫자/스파크/게이지만 */
  spark?: number[]
  /** 우측 미니 반원 게이지(0~100, 보조요소 1종) */
  gauge?: number
  /** 우측 미니 꺾은선(추이) — gauge 대체. 값 스케일 무관(자체 정규화) */
  trend?: number[]
  /** 미니 꺾은선 임계선(데이터와 같은 스케일) */
  trendThreshold?: number
  /** 미니 꺾은선 호버 값 포맷 */
  trendFmt?: (v: number) => string
  /** 게이지/추이 색(기본 deltaTone색) */
  gaugeColor?: string
  /** 보조수치(적정·한도 등) 예: "적정 ≤80%" */
  sub?: string
  /** 직접 보조요소 주입 */
  aux?: ReactNode
  icon?: ReactNode
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Q7 count-up — ease-out(1-(1-p)^3) ~900ms. reduced-motion이면 즉시 최종값.
function useCountUp(target: number): number {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0))
  const ref = useRef(target)
  ref.current = target
  useEffect(() => {
    if (reducedMotion()) {
      setV(target)
      return
    }
    let raf = 0
    let startT = 0
    const dur = 900
    const tick = (now: number) => {
      if (!startT) startT = now
      const p = Math.min(1, (now - startT) / dur)
      setV(ref.current * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setV(ref.current)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function toneColor(tone: 'ok' | 'danger' | 'muted' | 'warn'): string {
  return tone === 'ok'
    ? 'var(--c-ok)'
    : tone === 'danger'
      ? 'var(--c-danger)'
      : tone === 'warn'
        ? 'var(--c-warn)'
        : 'var(--c-accent)'
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const W = 100
  const H = 20
  const top = Math.max(1, ...data)
  const bot = Math.min(...data)
  const span = Math.max(1, top - bot)
  const n = data.length
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (val: number) => 2 + (1 - (val - bot) / span) * (H - 4)
  const line = data.map((val, i) => `${x(i)},${y(val)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden>
      <polygon points={area} fill={color} opacity={0.14} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Q5 반원 아크 게이지 — 컨테이너를 꽉 채움(라인차트처럼 responsive). viewBox 0 0 72 44.
function MiniGauge({ value, color }: { value: number; color: string }) {
  const r = 30
  const cx = 36
  const cy = 38
  const ratio = Math.min(1, Math.max(0, value / 100))
  const theta = Math.PI * (1 - ratio)
  const ex = cx + r * Math.cos(theta)
  const ey = cy - r * Math.sin(theta)
  return (
    <svg viewBox="0 0 72 44" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--c-track)" strokeWidth={8} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" />
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 17, fontWeight: 800, fill: 'var(--c-text)' }}>
        {Math.round(value)}
      </text>
    </svg>
  )
}

// Q3 지표 카드 — 라벨 / 값 27px·800(count-up) / 단위 / 델타 + [스파크·바·게이지·보조수치 중 1개+].
// 높이 96~120px 고정으로 같은 행 카드 정렬(Q25). 숫자만 덩그러니 금지 — 보조요소 필수.
export function KpiStat({
  label,
  value,
  unit,
  delta,
  deltaTone = 'muted',
  spark,
  gauge,
  trend,
  trendThreshold,
  trendFmt,
  gaugeColor,
  sub,
  aux,
  icon,
}: KpiStatProps) {
  const isNum = typeof value === 'number'
  const counted = useCountUp(isNum ? (value as number) : 0)
  const shown: ReactNode = isNum ? Math.round(counted).toLocaleString('en-US') : (value as ReactNode)

  const deltaColor =
    deltaTone === 'ok' ? 'var(--c-ok)' : deltaTone === 'danger' ? 'var(--c-danger)' : deltaTone === 'warn' ? 'var(--c-warn)' : 'var(--c-muted)'
  const auxColor = toneColor(deltaTone)
  const gColor = gaugeColor ?? auxColor

  // 추이 모드 — 좌: 라벨+값(글씨 너비) / 우: 긴 미니 꺾은선 + 하단 [델타 좌·실제값 우]
  const hasTrend = trend != null && trend.length > 1
  if (hasTrend) {
    return (
      <div className="bg-card2 border border-line rounded-xl min-w-0 flex items-stretch hover-lift"
        style={{ padding: '12px 14px', gap: 14, boxShadow: 'var(--shadow-card)', minHeight: 96, maxHeight: 120, overflow: 'hidden' }}>
        {/* 좌 — 라벨 / 값 / 델타 · 보조수치(값 아래) */}
        <div className="flex flex-col justify-center shrink-0 min-w-0" style={{ width: 128 }}>
          <span className="text-muted font-semibold truncate" style={{ fontSize: 14, lineHeight: 1.2 }}>{label}</span>
          <div className="flex items-baseline gap-1" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.05 }}>{shown}</span>
            {unit && <span className="text-muted" style={{ fontSize: 13 }}>{unit}</span>}
          </div>
          {delta && <span className="font-semibold truncate" style={{ fontSize: 13, color: deltaColor, lineHeight: 1.3, marginTop: 2 }}>{delta}</span>}
          {sub && <span className="text-muted truncate" style={{ fontSize: 13, lineHeight: 1.25 }}>{sub}</span>}
        </div>
        {/* 우 — SparkLine 꽉 채움(d3 기본 톤 라인 + area fill + peak 마커 + 임계 점선 + 호버 툴팁) */}
        <div className="flex-1 min-w-0 min-h-0 flex items-stretch">
          <SparkLine data={trend} color={gColor} height={40} fill peak threshold={trendThreshold} fmt={trendFmt ?? ((v) => String(Math.round(v)))} />
        </div>
      </div>
    )
  }

  // 게이지 모드 — 카드를 행으로, 게이지가 우측에서 세로 꽉 채움
  if (gauge != null) {
    return (
      <div className="bg-card2 border border-line rounded-xl min-w-0 flex items-stretch gap-2 hover-lift"
        style={{ padding: '12px 14px', boxShadow: 'var(--shadow-card)', minHeight: 96, maxHeight: 120, overflow: 'hidden' }}>
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <span className="text-muted font-semibold truncate" style={{ fontSize: 14, lineHeight: 1.2 }}>{label}</span>
          <div className="flex items-baseline gap-1.5" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.05 }}>{shown}</span>
            {unit && <span className="text-muted" style={{ fontSize: 14 }}>{unit}</span>}
          </div>
          {sub && <span className="text-muted truncate" style={{ fontSize: 14, lineHeight: 1.25, marginTop: 1 }}>{sub}</span>}
        </div>
        <div className="shrink-0 flex flex-col items-center justify-center" style={{ width: 78 }}>
          <div className="flex-1 min-h-0 w-full flex items-center"><MiniGauge value={gauge} color={gColor} /></div>
          {delta && <span className="font-semibold shrink-0" style={{ fontSize: 14, color: deltaColor, lineHeight: 1.1 }}>{delta}</span>}
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-card2 border border-line rounded-xl min-w-0 flex flex-col hover-lift"
      style={{ padding: '12px 14px', boxShadow: 'var(--shadow-card)', minHeight: 96, maxHeight: 120, overflow: 'hidden' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted font-semibold truncate" style={{ fontSize: 14, lineHeight: 1.2 }}>{label}</span>
            {icon && <span className="text-muted shrink-0">{icon}</span>}
          </div>
          <div className="flex items-baseline gap-1.5" style={{ marginTop: 3 }}>
            <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.05 }}>{shown}</span>
            {unit && <span className="text-muted" style={{ fontSize: 14 }}>{unit}</span>}
            {delta && (
              <span className="ml-auto shrink-0 font-semibold" style={{ fontSize: 14, color: deltaColor }}>{delta}</span>
            )}
          </div>
          {sub && <span className="text-muted truncate" style={{ fontSize: 14, lineHeight: 1.25, marginTop: 1 }}>{sub}</span>}
        </div>
      </div>

      <div className="mt-auto" style={{ paddingTop: 6 }}>
        {spark && spark.length > 1 ? <Spark data={spark} color={auxColor} /> : aux}
      </div>
    </div>
  )
}

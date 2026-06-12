import { useId } from 'react'

// KPI 카드용 미니 라인차트 — d3 line-chart 기본 톤(얇고 깔끔한 단일 라인 + 옅은 area).
// SVG 는 preserveAspectRatio="none" 으로 가로로 늘어나므로:
//  - 라인 두께는 vectorEffect="non-scaling-stroke" 로 고정
//  - peak 마커는 SVG <circle> 이 타원이 되는 함정 → HTML <span> 오버레이로 그림

interface SparkLineProps {
  data: number[]
  color: string // 시리즈 색(기존 토큰/hex 그대로 받음)
  height?: number // default 26
  threshold?: number // 임계치 — 미지정 시 관련 요소 전부 미표시
  peak?: boolean // 범위 내 최댓값 마커 (default off)
}

const W = 100 // viewBox 가로(고정) — 가로는 100% 스트레치
const PAD = 2 // 상하 여백(라인 잘림 방지)

// Fritsch–Carlson monotone cubic — 오버슈트 없는 부드러운 곡선 path.
function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n === 1) return `M${xs[0]},${ys[0]}`
  const dx: number[] = [], slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i])
    slope.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const m: number[] = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / slope[i]
    const b = m[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) { // 단조성 한계 초과 → 접선 축소(오버슈트 방지)
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * slope[i]
      m[i + 1] = t * b * slope[i]
    }
  }
  const r = (v: number) => Math.round(v * 100) / 100
  let d = `M${r(xs[0])},${r(ys[0])}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${r(xs[i] + h)},${r(ys[i] + m[i] * h)} ${r(xs[i + 1] - h)},${r(ys[i + 1] - m[i + 1] * h)} ${r(xs[i + 1])},${r(ys[i + 1])}`
  }
  return d
}

export function SparkLine({ data, color, height = 26, threshold, peak = false }: SparkLineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '') // url(#…) 안전 + 카드 동시 렌더 id 충돌 방지
  const n = data.length
  if (n === 0) return <div style={{ height }} aria-hidden /> // 레이아웃 고정 — 높이 흔들림 금지

  // y 도메인 — threshold 포함(점선이 항상 보이게)
  const hasTh = threshold !== undefined
  let top = Math.max(...data)
  let bot = Math.min(...data)
  if (hasTh) {
    top = Math.max(top, threshold)
    bot = Math.min(bot, threshold)
  }
  const span = Math.max(0.01, top - bot)
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (v: number) => PAD + (1 - (v - bot) / span) * (height - PAD * 2)

  const xs = data.map((_, i) => x(i))
  const ys = data.map((v) => y(v))
  const line = monotonePath(xs, ys)
  const area = `${line} L${W},${height} L0,${height} Z`

  // peak 마커 — 최댓값(첫 발생) 위치. % 가로 + px 세로(HTML 오버레이라 정원 유지).
  const peakIdx = peak ? data.indexOf(Math.max(...data)) : -1

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} aria-hidden>
        <defs>
          <linearGradient id={`spark-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
          {hasTh && (
            <clipPath id={`spark-over-${uid}`}>
              {/* 임계치 위쪽(y 0 ~ y(threshold))만 — 초과 구간 강조용 */}
              <rect x={0} y={0} width={W} height={Math.max(0, y(threshold))} />
            </clipPath>
          )}
        </defs>
        <path d={area} fill={`url(#spark-fill-${uid})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hasTh && (
          <>
            {/* 같은 라인을 위험색으로 한 번 더 — 임계치 위쪽만 클립 */}
            <path d={line} fill="none" stroke="var(--c-danger)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#spark-over-${uid})`} />
            <line x1={0} x2={W} y1={y(threshold)} y2={y(threshold)} stroke="var(--c-danger)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {peakIdx >= 0 && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `${(peakIdx / Math.max(1, n - 1)) * 100}%`,
            top: y(data[peakIdx]),
            transform: 'translate(-50%,-50%)',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: color,
            border: '1px solid var(--c-card2)',
          }}
        />
      )}
    </div>
  )
}

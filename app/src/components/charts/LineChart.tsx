interface LineChartProps {
  data: number[]
  max?: number
  height?: number
  color?: string
}

// Q15 영역 라인 차트 — 미니멀 축 없음 · area + line. viewBox 0 0 440 170.
export function LineChart({ data, max, height = 150, color = 'var(--c-accent)' }: LineChartProps) {
  const W = 440
  const H = 170
  const padL = 8
  const padR = 12
  const padT = 12
  const padB = 14
  const top = max ?? Math.max(1, ...data)
  const n = data.length
  const x = (i: number) =>
    n <= 1 ? padL : padL + (i * (W - padL - padR)) / (n - 1)
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB)
  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const areaPts = `${padL},${H - padB} ${linePts} ${x(n - 1)},${H - padB}`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="추이 라인 차트"
    >
      <polygon points={areaPts} fill="rgba(110,168,254,.14)" />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

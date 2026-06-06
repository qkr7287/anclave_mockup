interface ArcGaugeProps {
  value: number
  max?: number
  label?: string
  unit?: string
  color?: string
  size?: number
}

// Q5 반원 아크 게이지 — viewBox 0 0 120 70, r=46, center(60,58), θ=π(1-v/max).
export function ArcGauge({
  value,
  max = 100,
  label,
  unit = '%',
  color = 'var(--c-accent)',
  size = 120,
}: ArcGaugeProps) {
  const r = 46
  const cx = 60
  const cy = 58
  const ratio = Math.min(1, Math.max(0, value / max))
  const theta = Math.PI * (1 - ratio)
  const ex = cx + r * Math.cos(theta)
  const ey = cy - r * Math.sin(theta)
  const startX = cx - r
  const startY = cy
  const large = 0 // 반원이라 항상 0

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 120 70" style={{ width: size, height: (size * 70) / 120 }} role="img" aria-label={label ?? '게이지'}>
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--c-track)"
          strokeWidth={9}
          strokeLinecap="round"
        />
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
        />
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: 'var(--c-text)' }}>
          {Math.round(value)}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--c-muted)' }}>
          {unit}
        </text>
      </svg>
      {label && (
        <span className="text-muted" style={{ fontSize: 14 }}>
          {label}
        </span>
      )}
    </div>
  )
}

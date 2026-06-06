import type { ReactNode } from 'react'

interface KpiStatProps {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  deltaTone?: 'ok' | 'danger' | 'muted'
  /** 0~100 진행 바 */
  bar?: number
  icon?: ReactNode
}

// Q3 지표 카드 — 타이틀 14px muted / 값 27px·800 / 단위 14px / 델타 / 진행 바.
export function KpiStat({
  label,
  value,
  unit,
  delta,
  deltaTone = 'muted',
  bar,
  icon,
}: KpiStatProps) {
  const deltaColor =
    deltaTone === 'ok'
      ? 'var(--c-ok)'
      : deltaTone === 'danger'
        ? 'var(--c-danger)'
        : 'var(--c-muted)'
  return (
    <div
      className="bg-card2 border border-line rounded-xl min-w-0"
      style={{ padding: '15px 16px', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted font-semibold truncate" style={{ fontSize: 14 }}>
          {label}
        </span>
        {icon && <span className="text-accent shrink-0">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px' }}>
          {value}
        </span>
        {unit && (
          <span className="text-muted" style={{ fontSize: 14 }}>
            {unit}
          </span>
        )}
        {delta && (
          <span className="ml-auto" style={{ fontSize: 14, color: deltaColor }}>
            {delta}
          </span>
        )}
      </div>
      {bar != null && (
        <div
          className="mt-2.5 rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--c-soft)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, bar))}%`,
              background: 'var(--c-accent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

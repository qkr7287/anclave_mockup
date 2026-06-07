import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Series {
  data: number[]
  color?: string
  label?: string
}

interface LineChartProps {
  data?: number[]
  series?: Series[]
  max?: number
  color?: string
  labels?: string[]
}

// Q15 영역 라인 — Recharts ResponsiveContainer로 컨테이너를 가로·세로 꽉 채움(빈 공간 0).
export function LineChart({ data, series, max = 100, color = 'var(--c-accent)', labels }: LineChartProps) {
  const all: Series[] = series ?? [{ data: data ?? [], color }]
  const n = Math.max(...all.map((s) => s.data.length), 1)
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | string> = { x: labels?.[i] ?? `${i}` }
    all.forEach((s, si) => (row[`s${si}`] = s.data[i] ?? 0))
    return row
  })
  const single = all.length === 1
  const tickStep = Math.max(1, Math.floor((n - 1) / 2))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
        <defs>
          {all.map((s, si) => (
            <linearGradient key={si} id={`lc-grad-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? color} stopOpacity={single ? 0.28 : 0.14} />
              <stop offset="100%" stopColor={s.color ?? color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeWidth={1} />
        <XAxis dataKey="x" interval={tickStep - 1} tick={{ fontSize: 10, fill: 'var(--c-muted)' }} tickLine={false} axisLine={false} minTickGap={10} />
        <YAxis domain={[0, max]} ticks={[0, 40, 80]} tick={{ fontSize: 10, fill: 'var(--c-muted)' }} tickLine={false} axisLine={false} width={34} />
        <Tooltip
          contentStyle={{ background: 'var(--toast-bg)', border: '1px solid var(--c-border)', borderRadius: 8, fontSize: 12, padding: '6px 9px' }}
          labelStyle={{ color: 'var(--c-muted)', fontSize: 11 }}
          itemStyle={{ padding: 0 }}
          cursor={{ stroke: 'rgba(255,255,255,.18)', strokeDasharray: '3 3' }}
        />
        {all.map((s, si) => (
          <Area
            key={si}
            type="linear"
            dataKey={`s${si}`}
            name={s.label ?? `S${si}`}
            stroke={s.color ?? color}
            strokeWidth={2.4}
            fill={`url(#lc-grad-${si})`}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

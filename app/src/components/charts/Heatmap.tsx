interface HeatmapRow {
  label: string
  values: number[] // 셀 util(0~100)
}

interface HeatmapProps {
  rows: HeatmapRow[]
  colLabels: string[]
}

// Q5 헬스 히트맵 — 행=서버 열=GPU · util 색(블루퍼플 결).
function cellColor(util: number): string {
  if (util <= 0) return '#1a212c'
  return `rgba(110,168,254,${(0.22 + (util / 100) * 0.78).toFixed(3)})`
}

export function Heatmap({ rows, colLabels }: HeatmapProps) {
  return (
    <div className="min-w-0">
      <div className="flex" style={{ paddingLeft: 62, gap: 4 }}>
        {colLabels.map((c) => (
          <div key={c} className="flex-1 text-center text-muted" style={{ fontSize: 10 }}>
            {c}
          </div>
        ))}
      </div>
      <div className="flex flex-col" style={{ gap: 4, marginTop: 4 }}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-center" style={{ gap: 4 }}>
            <div className="text-muted truncate" style={{ width: 56, fontSize: 14, fontWeight: 600 }}>
              {r.label}
            </div>
            {r.values.map((v, i) => (
              <div
                key={i}
                className="flex-1 flex items-center justify-center rounded-md"
                style={{
                  aspectRatio: '1.5',
                  background: cellColor(v),
                  color: v > 55 ? '#0a0d12' : 'var(--c-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
                title={`${r.label} · ${colLabels[i]} · ${v}%`}
              >
                {v > 0 ? v : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

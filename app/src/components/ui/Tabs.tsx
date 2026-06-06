export interface TabItem {
  key: string
  label: string
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
}

// Q4 언더라인 탭 — 활성 border-bottom accent, 14px(Q28).
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="font-semibold"
            style={{
              padding: '9px 14px',
              fontSize: 14,
              color: on ? 'var(--c-text)' : 'var(--c-muted)',
              borderBottom: `2px solid ${on ? 'var(--c-accent)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

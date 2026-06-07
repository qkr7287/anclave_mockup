// Q24 확정 컨트롤 — 토글 스위치 (38×22, on=accent).
interface SwitchProps {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
}

export function Switch({ on, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative inline-flex items-center shrink-0 transition-colors"
      style={{ width: 38, height: 22, borderRadius: 12, background: on ? 'var(--c-accent)' : '#39424f' }}
    >
      <span
        className="absolute rounded-full transition-all"
        style={{ width: 18, height: 18, background: '#fff', top: 2, left: on ? 18 : 2 }}
      />
    </button>
  )
}

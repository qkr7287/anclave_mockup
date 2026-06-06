import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
  info: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  neutral: { bg: 'var(--accent-soft)', fg: 'var(--c-muted)' },
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  dot?: boolean
}

// Q4 채움형 배지 — inline-flex · gap6 · padding 3x11 · radius20 · 14px(Q28 floor)
export function Badge({ tone = 'neutral', children, dot = true }: BadgeProps) {
  const t = TONES[tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, padding: '3px 11px', fontSize: 14 }}
    >
      {dot && (
        <span
          className="rounded-full"
          style={{ width: 6, height: 6, background: 'currentColor' }}
        />
      )}
      {children}
    </span>
  )
}

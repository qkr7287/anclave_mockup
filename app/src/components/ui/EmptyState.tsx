import type { ReactNode } from 'react'
import { InboxIcon } from '@heroicons/react/24/solid'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  cta?: ReactNode
  /** 에러/권한없음 톤 */
  tone?: 'default' | 'danger'
}

// Q6/Q12 빈상태·에러 — 아이콘박스 + 타이틀 + 설명 + CTA. 센터 컬럼.
export function EmptyState({ title, description, icon, cta, tone = 'default' }: EmptyStateProps) {
  const danger = tone === 'danger'
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 11, padding: '24px 12px' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
          border: `1px solid ${danger ? 'var(--c-danger)' : 'rgba(110,168,254,.25)'}`,
          color: danger ? 'var(--c-danger)' : 'var(--c-accent)',
        }}
      >
        {icon ?? <InboxIcon width={26} height={26} />}
      </div>
      <div className="font-bold" style={{ fontSize: 15 }}>
        {title}
      </div>
      {description && (
        <p className="text-muted" style={{ fontSize: 14, maxWidth: 300 }}>
          {description}
        </p>
      )}
      {cta}
    </div>
  )
}

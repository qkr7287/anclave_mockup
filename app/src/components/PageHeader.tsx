import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  screen: string
  desc?: string
  action?: ReactNode
  back?: ReactNode
}

// 공통 페이지 헤더 — H2 18px + 화면번호 + 설명 + 우측 액션 슬롯.
export function PageHeader({ title, screen, desc, action, back }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex flex-col" style={{ gap: 4 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          {back}
          <h2 className="font-bold" style={{ fontSize: 18 }}>{title}</h2>
          <span className="text-muted font-mono" style={{ fontSize: 14, padding: '1px 7px', borderRadius: 6, background: 'var(--c-soft)' }}>{screen}</span>
        </div>
        {desc && <p className="text-muted" style={{ fontSize: 14 }}>{desc}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}

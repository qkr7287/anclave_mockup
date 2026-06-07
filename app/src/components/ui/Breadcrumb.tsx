import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '@heroicons/react/24/solid'

export interface Crumb {
  label: string
  to?: string // 없으면 현재(마지막) 항목
}

// Q2 브레드크럼 — 드릴다운 경로(전체 서버 › 서버 › GPU). 14px(Q28 floor).
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center flex-wrap min-w-0" style={{ gap: 4, fontSize: 14 }} aria-label="브레드크럼">
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRightIcon width={13} height={13} className="text-muted shrink-0" />}
          {it.to ? (
            <Link to={it.to} className="text-muted hover:text-text transition-colors truncate">{it.label}</Link>
          ) : (
            <span className="font-semibold truncate">{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

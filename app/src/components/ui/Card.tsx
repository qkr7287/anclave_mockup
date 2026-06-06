import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  title?: ReactNode
  action?: ReactNode
  /** 본문 패딩 제거(표 등 가장자리까지 채울 때) */
  flush?: boolean
}

// Q3 솔리드 카드 — bg-card2 + border + radius12 + shadow. 영역 고정(Q25).
export function Card({ children, className = '', style, title, action, flush }: CardProps) {
  return (
    <section
      className={`bg-card2 border border-line rounded-xl overflow-hidden flex flex-col min-w-0 ${className}`}
      style={{ boxShadow: 'var(--shadow-card)', ...style }}
    >
      {title != null && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
          <h3 className="text-[14px] font-bold truncate">{title}</h3>
          {action}
        </header>
      )}
      <div className={`min-w-0 ${flush ? '' : 'p-[14px]'} ${title == null ? '' : 'flex-1'}`}>
        {children}
      </div>
    </section>
  )
}

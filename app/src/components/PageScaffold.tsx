import type { ReactNode } from 'react'

interface PageScaffoldProps {
  screen: string // 4.x
  title: string
  desc: string
  /** Goal 2/3에서 채울 핵심 구성요소 미리보기(스켈레톤 단계) */
  preview?: string[]
  children?: ReactNode
}

// 화면 공통 스캐폴드 — 페이지 헤더(H2 18px + 화면번호 + 설명) + 본문.
export function PageScaffold({ screen, title, desc, preview, children }: PageScaffoldProps) {
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16 }}>
      <header className="flex flex-col" style={{ gap: 4 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <h2 className="font-bold" style={{ fontSize: 18 }}>
            {title}
          </h2>
          <span
            className="text-muted font-mono"
            style={{ fontSize: 14, padding: '1px 7px', borderRadius: 6, background: 'var(--c-soft)' }}
          >
            {screen}
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: 14 }}>
          {desc}
        </p>
      </header>

      {children ?? (
        <div
          className="bg-card2 border border-line rounded-xl"
          style={{ padding: 18, boxShadow: 'var(--shadow-card)' }}
        >
          <div className="text-muted" style={{ fontSize: 14 }}>
            이 화면은 다음 단계(/goal Goal 2·3)에서 더미 데이터로 채워져요.
          </div>
          {preview && preview.length > 0 && (
            <ul className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {preview.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 border border-line rounded-lg text-muted"
                  style={{ padding: '10px 12px', fontSize: 14, background: 'var(--c-soft)' }}
                >
                  <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: 'var(--c-accent)' }} />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

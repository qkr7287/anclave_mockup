import type { ReactNode } from 'react'

interface PageShellProps {
  screen: string // 4.x
  title: string
  desc?: string
  /** 헤더 우측 액션(버튼 등) */
  actions?: ReactNode
  /** KPI행 슬롯 — KpiStat 3~4개. above-fold 첫 정보영역. */
  kpis?: ReactNode
  /** 본문(섹션 그리드 슬롯) */
  children?: ReactNode
}

// 밀도 페이지 템플릿 — 모든 화면이 재사용해 above-fold 영역 ≥4를 기본 충족(편차 차단).
// 헤더(H2 18px + 화면번호 + 설명 + 액션) → KPI행 슬롯 → 섹션 그리드 슬롯.
export function PageShell({ screen, title, desc, actions, kpis, children }: PageShellProps) {
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16 }}>
      <header className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
            <h2 className="font-bold truncate" style={{ fontSize: 18 }}>
              {title}
            </h2>
            <span
              className="text-muted font-mono shrink-0"
              style={{ fontSize: 14, padding: '1px 7px', borderRadius: 6, background: 'var(--c-soft)' }}
            >
              {screen}
            </span>
          </div>
          {desc && (
            <p className="text-muted" style={{ fontSize: 14 }}>
              {desc}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>

      {kpis && (
        <div
          className="grid stagger"
          style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))' }}
        >
          {kpis}
        </div>
      )}

      {children}
    </div>
  )
}

interface SectionGridProps {
  /** 메인(넓은) 컬럼 */
  main: ReactNode
  /** 보조(좁은) 컬럼 */
  side?: ReactNode
  /** 메인:보조 비율(기본 2:1). 보조 없으면 무시 */
  ratio?: string
}

// 섹션 그리드 슬롯 — 메인/보조 2열(min-width:0로 침범 차단). 1024 이하 1열 스택.
export function SectionGrid({ main, side, ratio = '2fr 1fr' }: SectionGridProps) {
  if (!side) return <div className="min-w-0">{main}</div>
  return (
    <div
      className="grid items-start min-w-0 section-grid"
      style={{ gap: 16, gridTemplateColumns: ratio }}
    >
      <div className="min-w-0 flex flex-col" style={{ gap: 16 }}>
        {main}
      </div>
      <div className="min-w-0 flex flex-col" style={{ gap: 16 }}>
        {side}
      </div>
    </div>
  )
}

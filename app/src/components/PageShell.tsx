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
  /** 무스크롤 모드(모니터링) — 100vh 고정, 본문 flex-1, 내부 스크롤만 */
  fill?: boolean
  /** 헤더 위 추가 영역(StepBack 등) */
  pre?: ReactNode
  /** 제목 헤더 생략(전역 헤더 브레드크럼과 중복 제거 — Figma 매칭) */
  bare?: boolean
}

// 밀도 페이지 템플릿 — 모든 화면이 재사용해 above-fold 영역 ≥4를 기본 충족(편차 차단).
// 헤더(H2 18px + 화면번호 + 설명 + 액션) → KPI행 슬롯 → 섹션 그리드 슬롯.
export function PageShell({ title, desc, actions, kpis, children, fill, pre, bare }: PageShellProps) {
  if (fill) {
    return (
      <div className="flex flex-col min-w-0 h-full" style={{ gap: 12, overflow: 'hidden' }}>
        {pre && <div className="shrink-0">{pre}</div>}
        {!bare && (
          <header className="flex items-start justify-between gap-3 min-w-0 shrink-0">
            <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
              <h2 className="font-bold truncate" style={{ fontSize: 18 }}>{title}</h2>
              {desc && <p className="text-muted truncate" style={{ fontSize: 14 }}>{desc}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>
        )}
        {kpis && (
          <div className="grid stagger shrink-0" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))' }}>
            {kpis}
          </div>
        )}
        <div className="flex-1 min-h-0 min-w-0">{children}</div>
      </div>
    )
  }
  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 16 }}>
      <header className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
          <h2 className="font-bold truncate" style={{ fontSize: 18 }}>
            {title}
          </h2>
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

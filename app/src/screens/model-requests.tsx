import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  FunnelIcon,
  EyeIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button, EmptyState, KpiStat, useToast } from '../components/ui'
import type { ModelRequest, ModelStage } from '../data/types'
import { useRole } from '../lib/role'
import { STAGE_META, useModelRequests } from './model-requests-shared'

// G5 · 4.14 모델 신청 관리 — A·B·C 공유 테이블. 페이지·테이블 외형은 g2 자원 신청현황(4.6)과 통일.
// 사용자(B/C)는 등록 신청만, 관리자(A)가 검토→반입(스캔)→명세→배포.

type IconType = ComponentType<SVGProps<SVGSVGElement>>

// ── KPI 정의(상태색 아이콘박스 + 카운트) — g2 StatKpi 패턴 ──
interface KpiDef { label: string; desc: string; num: string; box: string; Icon: IconType; value: number }

// ── 단계 배지(soft 배경 + semantic 색) — g2 StatBadge 패턴, stage 5종 ──
const STAGE_TONE: Record<ModelStage, { bg: string; fg: string }> = {
  requested: { bg: 'var(--c-soft)', fg: 'var(--c-muted)' },
  scanning: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  scanned: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  deployed: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  rejected: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}
function StageBadge({ stage }: { stage: ModelStage }) {
  const t = STAGE_TONE[stage]
  return (
    <span
      className="inline-flex items-center rounded-[7px] font-semibold whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, padding: '3px 12px', fontSize: 14, lineHeight: 1.35 }}
    >
      {STAGE_META[stage].label}
    </span>
  )
}

// 테이블 액션 펠릿(아이콘 + 라벨) — g2 ActionLink
function ActionLink({ label, accent, Icon, onClick, disabled }: { label: string; accent?: boolean; Icon: IconType; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:enabled:scale-95 whitespace-nowrap hover:enabled:shadow-[0_1px_3px_rgba(0,0,0,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ fontSize: 14, padding: '5px 10px', background: accent ? 'var(--accent-soft)' : 'var(--c-soft)', color: accent ? 'var(--c-accent)' : 'var(--c-muted)' }}
    >
      <Icon style={{ width: 14, height: 14, opacity: 0.9 }} />
      {label}
    </button>
  )
}

// 필터 입력 박스(공통 외형) — g2 FieldBox
function FieldBox({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`flex items-center bg-card2 border border-line rounded-[8px] transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`}
      style={{ height: 38, padding: '0 13px', ...style }}
    >
      {children}
    </div>
  )
}

// 드롭다운(라벨·값·화살표 클릭 시 네이티브 select) — g2 FilterSelect
function FilterSelect({ label, value, onChange, options, width }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; width: number }) {
  const cur = options.find((o) => o.value === value)?.label ?? value
  return (
    <div className="relative flex items-center bg-card2 border border-line rounded-[8px] gap-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 38, padding: '0 13px', width }}>
      <span className="text-muted shrink-0 pointer-events-none" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-text font-medium ml-auto pointer-events-none truncate" style={{ fontSize: 14 }}>{cur}</span>
      <ChevronDownIcon className="shrink-0 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--c-muted)' }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ fontSize: 14 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function PageBtn({ children, active, onClick, disabled }: { children: ReactNode; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-[7px] font-medium transition-[transform,background-color] duration-100 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-soft active:enabled:scale-90"
      style={{ width: 30, height: 30, fontSize: 14, background: active ? 'var(--c-accent)' : 'transparent', color: active ? 'var(--c-onaccent)' : 'var(--c-muted)', fontWeight: active ? 600 : 500 }}
    >
      {children}
    </button>
  )
}

// ── 필터(신청자 제거 — B/C 는 본인 신청만 보이므로 불필요) ──
interface Filter { q: string; stage: string; start: string; end: string }
const EMPTY_FILTER: Filter = { q: '', stage: '전체', start: '', end: '' }
function matchReq(r: ModelRequest, f: Filter): boolean {
  if (f.q.trim() && !`${r.modelName} ${r.reason}`.toLowerCase().includes(f.q.trim().toLowerCase())) return false
  if (f.stage !== '전체' && r.stage !== f.stage) return false
  const d = r.createdAt.slice(0, 10)
  if (f.start && d < f.start) return false
  if (f.end && d > f.end) return false
  return true
}

const COLS: { key: string; label: string; width?: number }[] = [
  { key: 'name', label: '모델명', width: 220 },
  { key: 'kind', label: '종류', width: 120 },
  { key: 'reason', label: '요청 사유' },
  { key: 'date', label: '신청일', width: 150 },
  { key: 'stage', label: '단계', width: 116 },
  { key: 'action', label: '액션', width: 168 },
]

export function ModelRequests() {
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin, user } = useRole()
  const allRequests = useModelRequests()
  // 사용자(B/C)는 본인 신청만, 관리자(A)는 전체.
  const requests = useMemo(() => (isAdmin ? allRequests : allRequests.filter((r) => r.requesterUserId === user.id)), [allRequests, isAdmin, user.id])

  const [q, setQ] = useState('')
  const [stageF, setStageF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [applied, setApplied] = useState<Filter>(EMPTY_FILTER)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    requests.forEach((r) => { c[r.stage] = (c[r.stage] ?? 0) + 1 })
    return c
  }, [requests])
  const pending = (counts.requested ?? 0) + (counts.scanning ?? 0) + (counts.scanned ?? 0)
  const kpis: KpiDef[] = [
    { label: '전체 신청', desc: '전체 모델 신청 건수', num: 'var(--c-accent)', box: 'var(--accent-soft)', Icon: DocumentTextIcon, value: requests.length },
    { label: '대기 · 진행', desc: '신청됨 · 스캔중 · 스캔완료', num: 'var(--c-warn)', box: 'var(--warn-soft)', Icon: ClockIcon, value: pending },
    { label: '배포', desc: '카탈로그 등록 완료', num: 'var(--c-ok)', box: 'var(--ok-soft)', Icon: CheckCircleIcon, value: counts.deployed ?? 0 },
    { label: '반려', desc: '보안점검 실패 등', num: 'var(--c-danger)', box: 'var(--danger-soft)', Icon: XCircleIcon, value: counts.rejected ?? 0 },
  ]

  const stageOpts = [
    { value: '전체', label: '전체' },
    { value: 'requested', label: '신청됨' },
    { value: 'scanning', label: '스캔중' },
    { value: 'scanned', label: '스캔완료' },
    { value: 'deployed', label: '배포' },
    { value: 'rejected', label: '반려' },
  ]

  const hasFilter = applied.q.trim() !== '' || applied.stage !== '전체' || applied.start !== '' || applied.end !== ''
  const dirty = q !== applied.q || stageF !== applied.stage || dateStart !== applied.start || dateEnd !== applied.end
  const view = useMemo(() => requests.filter((r) => matchReq(r, applied)), [requests, applied])
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next: Filter = { q, stage: stageF, start: dateStart, end: dateEnd }
    setApplied(next)
    setPage(1)
    const cnt = requests.filter((r) => matchReq(r, next)).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => {
    setQ(''); setStageF('전체'); setDateStart(''); setDateEnd('')
    setApplied(EMPTY_FILTER); setPage(1)
  }

  // 신규: 관리자=반입(model-import), 사용자=신청(model-request-new).
  const onNew = () => navigate(isAdmin ? '/models/requests/import' : '/models/requests/new')
  // 사용자(B/C)와 배포완료 건은 상세 페이지로, 관리자의 미배포(처리 대상) 건은 바로 반입 마법사로.
  const onRow = (r: ModelRequest) =>
    navigate(isAdmin && r.stage !== 'deployed' ? `/models/requests/import?id=${r.id}` : `/models/requests/${r.id}`)

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full">
      {/* 1) 헤더 */}
      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>모델 신청 관리</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          {isAdmin
            ? '모델 등록 신청을 검토하고, 반입·보안점검·명세 등록을 거쳐 카탈로그에 배포합니다.'
            : '카탈로그에 없는 모델 등록을 신청합니다. 반입·보안점검·배포는 관리자가 처리합니다.'}
        </p>
      </header>

      {/* 2) KPI 4카드 — 상태색 아이콘박스 + 카운트 */}
      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {kpis.map((s) => (
          <KpiStat
            key={s.label}
            label={s.label}
            value={s.value}
            sub={s.desc}
            icon={
              <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: s.box, color: s.num }}>
                <s.Icon style={{ width: 17, height: 17 }} />
              </span>
            }
          />
        ))}
      </div>

      {/* 3) 검색 및 필터 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop: 28, padding: '14px 19px' }}>
        <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <FieldBox className="gap-2" style={{ width: 300 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
                className="bg-transparent min-w-0 flex-1 text-text"
                style={{ fontSize: 14, outline: 'none', border: 'none', boxShadow: 'none' }}
                placeholder="모델명, 사유 검색"
              />
              <button type="button" onClick={applyFilters} aria-label="검색" className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-soft active:scale-90" style={{ width: 24, height: 24, color: 'var(--c-muted)', margin: '0 -5px 0 0' }}>
                <MagnifyingGlassIcon style={{ width: 17, height: 17 }} />
              </button>
            </FieldBox>
            <FilterSelect label="단계" value={stageF} onChange={setStageF} options={stageOpts} width={168} />
            <FieldBox className="gap-1.5" style={{ width: 320 }}>
              <CalendarDaysIcon style={{ width: 18, height: 18, color: 'var(--c-muted)', flexShrink: 0 }} />
              <input type="date" value={dateStart} max={dateEnd || undefined} onChange={(e) => setDateStart(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>~</span>
              <input type="date" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
            </FieldBox>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={resetFilters} className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] transition-[transform,background-color] duration-100 hover:bg-soft active:scale-[0.97]" style={{ height: 38, padding: '0 16px' }}>
              <ArrowPathIcon style={{ width: 16, height: 16, color: 'var(--c-muted)' }} />
              <span className="text-text font-medium" style={{ fontSize: 14 }}>초기화</span>
            </button>
            <button type="button" onClick={applyFilters} className="relative flex items-center gap-2 rounded-[8px] text-onaccent btn-sweep transition-transform duration-100 hover:brightness-105 active:scale-[0.97]" style={{ height: 38, padding: '0 16px', background: 'var(--c-accent)', boxShadow: dirty ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
              <FunnelIcon style={{ width: 15, height: 15 }} />
              <span className="font-semibold" style={{ fontSize: 14 }}>필터 적용</span>
              {dirty && <span className="absolute rounded-full" style={{ top: -4, right: -4, width: 9, height: 9, background: 'var(--c-warn)', border: '2px solid var(--c-card2)' }} />}
            </button>
          </div>
        </div>
      </section>

      {/* 4) 신청 목록 테이블 — 화면 하단까지 채움 */}
      <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ marginTop: 11 }}>
        <div className="flex items-center justify-between gap-3 shrink-0" style={{ padding: '16px 24px' }}>
          <h2 className="font-bold text-text" style={{ fontSize: 16 }}>신청 목록</h2>
          <Button onClick={onNew}>
            <PlusIcon style={{ width: 16, height: 16 }} />
            신규 모델 신청
          </Button>
        </div>

        {requests.length === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <EmptyState
              icon={<DocumentTextIcon width={26} height={26} />}
              title="아직 신청된 모델이 없어요"
              description="신규 모델 신청으로 등록을 요청하면 진행 단계를 이곳에서 확인할 수 있어요."
              cta={<Button onClick={onNew}>신규 모델 신청</Button>}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup>
                {COLS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                  {COLS.map((c, i) => (
                    <th key={c.key} className="text-muted font-medium whitespace-nowrap" style={{ textAlign: 'left', fontSize: 14, padding: '0 0 12px', paddingLeft: i === 0 ? 24 : 0, paddingRight: i === COLS.length - 1 ? 24 : 0 }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="text-muted text-center" style={{ fontSize: 14, padding: '40px 0' }}>
                      검색 결과가 없어요. 검색어나 필터를 조정해보세요.
                    </td>
                  </tr>
                )}
                {pageRows.map((r) => {
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => onRow(r)}
                      style={{ borderBottom: '1px solid var(--c-border-s)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="align-middle truncate text-text font-medium" style={{ fontSize: 14, padding: '15px 0', paddingLeft: 24 }}>{r.modelName}</td>
                      <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>{r.kind ?? '—'}</td>
                      <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0', lineHeight: 1.4 }}>{r.reason}</td>
                      <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>{r.createdAt.slice(0, 10)}</td>
                      <td className="align-middle" style={{ padding: '15px 0' }}><StageBadge stage={r.stage} /></td>
                      <td className="align-middle" style={{ padding: '15px 0', paddingRight: 24 }}>
                        <ActionLink label="상세 보기" Icon={EyeIcon} onClick={(e) => { e.stopPropagation(); onRow(r) }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 푸터 — 전체 N건 · 페이지네이션 · 페이지 크기 */}
        {requests.length > 0 && (
          <div className="flex items-center justify-between gap-3 shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 24px' }}>
            <span className="text-muted shrink-0" style={{ fontSize: 14 }}>
              {hasFilter ? `${view.length}건 표시` : `전체 ${requests.length}건`}
              {view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}
            </span>
            <div className="flex items-center" style={{ gap: 6 }}>
              <PageBtn onClick={() => setPage(1)} disabled={curPage === 1}>«</PageBtn>
              <PageBtn onClick={() => setPage(curPage - 1)} disabled={curPage === 1}>‹</PageBtn>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <PageBtn key={p} active={p === curPage} onClick={() => setPage(p)}>{p}</PageBtn>
              ))}
              <PageBtn onClick={() => setPage(curPage + 1)} disabled={curPage === pageCount}>›</PageBtn>
              <PageBtn onClick={() => setPage(pageCount)} disabled={curPage === pageCount}>»</PageBtn>
            </div>
            <div className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] shrink-0" style={{ height: 32, padding: '0 13px' }}>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="bg-transparent outline-none text-muted font-medium cursor-pointer" style={{ fontSize: 14, appearance: 'none' }}>
                <option value={10}>10건씩 보기</option>
                <option value={20}>20건씩 보기</option>
                <option value={50}>50건씩 보기</option>
              </select>
              <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--c-muted)' }} />
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

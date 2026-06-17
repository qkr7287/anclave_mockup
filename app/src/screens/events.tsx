import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BellAlertIcon,
  CalendarDaysIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FireIcon,
  InboxStackIcon,
  MagnifyingGlassIcon,
  ServerStackIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { Badge, EmptyState, KpiStat, SeverityBadge } from '../components/ui'
import { useRole } from '../lib/role'
import { userById } from '../data'
import type { EventLog, EventStatus, Severity } from '../data/types'
import {
  type Col,
  FieldBox,
  FilterSelect,
  Pagination,
  useMutedFix,
} from './approvals'
import {
  eventRowToLog,
  filterEventRowsForUser,
  getEvents,
  getEventsForUser,
  targetOf,
  targetPath,
} from './event-store'
import { useEvents } from '../data/hooks/usePolling'
import { EventDetail } from './event-detail'

// ⑤ 에러 · 이벤트 관제 (4.21) — 5188 자원 신청현황(4.6/4.10) 톤 풀 화면.
//   A(관리자)=전체 이벤트 · B/C(사용자)=본인 할당 자원 이벤트('내 에러 이벤트')만.
//   목록·필터·상세 드로어(open 건 해결 처리 → 세션 store 로컬 반영). 라우트/레지스트리는 등록 완료.

const SEV_FROM_KO: Record<string, Severity> = { 위험: 'critical', 경고: 'warn', 정보: 'info', 복구: 'recovered' }
// 자원맵 KPI 딥링크(/events?severity=critical) → 심각도 필터 초기값 매핑.
const KO_FROM_SEV: Record<string, string> = { critical: '위험', warn: '경고', info: '정보', recovered: '복구' }
const SEV_RANK: Record<Severity, number> = { critical: 0, warn: 1, info: 2, recovered: 3 }
const EVST_FROM_KO: Record<string, EventStatus> = { 미해결: 'open', 해결: 'resolved' }

const COLS: Col[] = [
  { key: 'severity', label: '심각도', width: 96 },
  { key: 'message', label: '메시지', width: 340 },
  { key: 'target', label: '대상', width: 168 },
  { key: 'date', label: '발생일시', width: 140 },
  { key: 'status', label: '상태', width: 104 },
  { key: 'assignee', label: '담당', width: 112 },
  { key: 'action', label: '액션', width: 120, align: 'right' },
]

// KpiStat 아이콘 — soft 배경 박스(approvals 스탯카드와 동일 외형).
function StatIcon({ Icon, box, color }: { Icon: typeof FireIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

// open=미해결(경고) · resolved=해결(성공) 상태 배지.
function EventStatusBadge({ status }: { status: EventStatus }) {
  return status === 'open' ? <Badge tone="warn">미해결</Badge> : <Badge tone="ok">해결</Badge>
}

// 목록 액션 펠릿 — open=처리(accent) · resolved=상세(muted). (approvals ReviewPill 톤)
function ActionPill({ open, onClick }: { open: boolean; onClick: (e: React.MouseEvent) => void }) {
  const Icon = open ? WrenchScrewdriverIcon : EyeIcon
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{ fontSize: 14, padding: '5px 12px', background: open ? 'var(--accent-soft)' : 'var(--c-soft)', color: open ? 'var(--c-accent)' : 'var(--c-muted)' }}
    >
      <Icon style={{ width: 14, height: 14, opacity: 0.9 }} />
      {open ? '처리' : '상세'}
    </button>
  )
}

// ════════════════════════════ 4.21 에러 · 이벤트 관제 ════════════════════════════

export function Events() {
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { user, isAdmin } = useRole()

  // 상세는 팝업이 아니라 별도 페이지 — ?detail=<id> 로 전체 화면 전환(브라우저 뒤로가기로 목록 복귀).
  const [searchParams, setSearchParams] = useSearchParams()
  const detailId = searchParams.get('detail')

  const [q, setQ] = useState('')
  // 심각도 필터 초기값 — ?severity= 딥링크(자원맵 위험 KPI 카드)면 그 값으로, 없으면 '전체'.
  const [sevF, setSevF] = useState(() => {
    const sevParam = searchParams.get('severity')
    return sevParam && KO_FROM_SEV[sevParam] ? KO_FROM_SEV[sevParam] : '전체'
  })
  const [statusF, setStatusF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 목록 = DB(/api/events). A=전체 · B/C=본인 자원 이벤트(클라 스코프 필터).
  // data null(로딩)·backend 다운 → 시드 폴백(화면 유지). detailId 변동 시 재계산(폴백 경로의 로컬 처리 반영).
  const { data: dbEvents } = useEvents({ limit: 100 })
  const scoped = useMemo<EventLog[]>(() => {
    const rows = dbEvents
      ? (isAdmin ? dbEvents : filterEventRowsForUser(dbEvents, user.id))
      : (isAdmin ? getEvents() : getEventsForUser(user.id))
    return rows.map(eventRowToLog)
  }, [dbEvents, isAdmin, user.id, detailId])

  const counts = useMemo(() => ({
    total: scoped.length,
    critical: scoped.filter((e) => e.severity === 'critical').length,
    warn: scoped.filter((e) => e.severity === 'warn').length,
    open: scoped.filter((e) => e.status === 'open').length,
  }), [scoped])

  const view = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return scoped
      .filter((e) => {
        if (ql) {
          const t = targetOf(e)
          if (!`${e.message} ${t.label} ${t.sub ?? ''}`.toLowerCase().includes(ql)) return false
        }
        if (sevF !== '전체' && e.severity !== SEV_FROM_KO[sevF]) return false
        if (statusF !== '전체' && e.status !== EVST_FROM_KO[statusF]) return false
        const d = e.createdAt.slice(0, 10)
        if (dateStart && d < dateStart) return false
        if (dateEnd && d > dateEnd) return false
        return true
      })
      // 기본 정렬 — 미해결(open) 우선 → 심각도(critical) 우선 → 최신
      .sort((a, b) =>
        (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) ||
        SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
        b.createdAt.localeCompare(a.createdAt),
      )
  }, [scoped, q, sevF, statusF, dateStart, dateEnd])

  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = q.trim() !== '' || sevF !== '전체' || statusF !== '전체' || dateStart !== '' || dateEnd !== ''

  const resetFilters = () => { setQ(''); setSevF('전체'); setStatusF('전체'); setDateStart(''); setDateEnd(''); setPage(1) }

  // 행/액션 클릭 → 별도 상세 페이지로 이동(?detail=<id> · 히스토리 push → 뒤로가기 복귀).
  const openEvent = (e: EventLog) => setSearchParams({ detail: e.id })

  // 상세 페이지 — 목록 위가 아니라 화면 전체를 상세로 교체(팝업 아님). 닫으면 detail 파라미터 제거.
  if (detailId) {
    return <EventDetail id={detailId} onBack={() => setSearchParams({})} />
  }

  // 미해결 0건(전체가 해결됨) — 필터 없이 빈 미해결 뷰일 때 안내(빈 상태 5). !hasFilter 면 statusF='전체'.
  const allResolved = scoped.length > 0 && counts.open === 0 && !hasFilter
  const emptyText = scoped.length === 0
    ? (isAdmin ? '발생한 이벤트가 없어요.' : '내 할당 자원에서 발생한 이벤트가 없어요.')
    : statusF === '미해결' && view.length === 0
      ? '처리할 이벤트가 없어요. 모든 이벤트가 해결되었어요.'
      : hasFilter
        ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.'
        : '표시할 이벤트가 없어요.'

  return (
    <div data-events className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`
        [data-events]{user-select:none;-webkit-user-select:none}
        [data-events] button:not(:disabled),[data-events] a,[data-events] select,[data-events] tr.cursor-pointer{cursor:pointer}
        [data-events] button:disabled{cursor:not-allowed}
        [data-events] input,[data-events] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      `}</style>

      <header className="flex flex-col min-w-0 shrink-0">
        <div className="flex items-center" style={{ gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90"
            style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>에러 · 이벤트 관제</h1>
          <span className="inline-flex items-center rounded-[7px] font-semibold shrink-0" style={{ fontSize: 13, padding: '3px 10px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            {isAdmin ? '전체 이벤트' : '내 에러 이벤트'}
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          {isAdmin
            ? '전체 자원에서 발생한 에러·이벤트를 추적하고, 미해결 건을 상세에서 처리합니다.'
            : '본인 할당 자원에서 발생한 에러·이벤트를 확인하고 처리 상태를 추적합니다.'}
        </p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        <KpiStat label="전체" value={counts.total} unit="건" sub="범위 내 전체 이벤트" icon={<StatIcon Icon={BellAlertIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
        <div style={{ color: 'var(--c-danger)' }}>
          <KpiStat label="위험" value={counts.critical} unit="건" delta={counts.critical > 0 ? '즉시 확인' : undefined} deltaTone="danger" sub="critical 심각도 이벤트" icon={<StatIcon Icon={FireIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
        </div>
        <KpiStat label="경고" value={counts.warn} unit="건" sub="warn 심각도 이벤트" icon={<StatIcon Icon={ExclamationTriangleIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
        <div style={{ color: 'var(--c-warn)' }}>
          <KpiStat label="미해결" value={counts.open} unit="건" delta={counts.open > 0 ? '처리 필요' : '모두 처리됨'} deltaTone={counts.open > 0 ? 'warn' : 'ok'} sub="open 상태(처리 대기)" icon={<StatIcon Icon={InboxStackIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
        </div>
      </div>

      {/* 검색 및 필터 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop: 18, padding: '14px 19px' }}>
        <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <FieldBox className="gap-2" style={{ width: 300 }}>
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} placeholder="메시지, 대상 검색" />
              <MagnifyingGlassIcon style={{ width: 17, height: 17, color: 'var(--c-muted)', flexShrink: 0 }} />
            </FieldBox>
            <FilterSelect label="심각도" value={sevF} onChange={(v) => { setSevF(v); setPage(1) }} options={['전체', '위험', '경고', '정보', '복구']} width={150} />
            <FilterSelect label="상태" value={statusF} onChange={(v) => { setStatusF(v); setPage(1) }} options={['전체', '미해결', '해결']} width={150} />
            <FieldBox className="gap-1.5" style={{ width: 308 }}>
              <CalendarDaysIcon style={{ width: 18, height: 18, color: 'var(--c-muted)', flexShrink: 0 }} />
              <input type="date" value={dateStart} max={dateEnd || undefined} onChange={(e) => { setDateStart(e.target.value); setPage(1) }} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>~</span>
              <input type="date" value={dateEnd} min={dateStart || undefined} onChange={(e) => { setDateEnd(e.target.value); setPage(1) }} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
            </FieldBox>
          </div>
          <button type="button" onClick={resetFilters} className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] transition-[transform,background-color] duration-100 hover:bg-soft active:scale-[0.97] shrink-0" style={{ height: 38, padding: '0 16px' }}>
            <ArrowPathIcon style={{ width: 16, height: 16, color: 'var(--c-muted)' }} />
            <span className="text-text font-medium" style={{ fontSize: 14 }}>초기화</span>
          </button>
        </div>
      </section>

      {/* 이벤트 테이블 (4.6 톤 셸 — 영역 높이 고정·헤더 안정) */}
      <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ marginTop: 18 }}>
        <div className="flex items-center justify-between gap-3 shrink-0 border-b border-line" style={{ padding: '15px 24px' }}>
          <h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}>
            <ServerStackIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />이벤트 로그
          </h2>
          {counts.open > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-[7px] font-semibold shrink-0" style={{ fontSize: 13, padding: '3px 10px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>
              미해결 {counts.open}건
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup>{COLS.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                {COLS.map((c, i) => (
                  <th key={c.key} className="text-muted font-medium whitespace-nowrap" style={{ textAlign: c.align ?? 'left', fontSize: 14, padding: '13px 0', paddingLeft: i === 0 ? 24 : 0, paddingRight: i === COLS.length - 1 ? 24 : 0 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ padding: '36px 0' }}>
                  <EmptyState
                    icon={<InboxStackIcon width={26} height={26} />}
                    title={allResolved ? '처리할 이벤트가 없어요' : emptyText}
                    description={allResolved ? '미해결 이벤트가 없어요. 모든 이벤트가 처리되었어요.' : undefined}
                  />
                </td></tr>
              )}
              {pageRows.map((e) => {
                const t = targetOf(e)
                return (
                  <tr key={e.id} className="cursor-pointer" onClick={() => openEvent(e)} style={{ borderBottom: '1px solid var(--c-border-s)' }} onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--accent-soft)')} onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}>
                    <td className="align-middle" style={{ padding: '14px 0', paddingLeft: 24 }}><SeverityBadge severity={e.severity} /></td>
                    <td className="align-middle" style={{ padding: '14px 16px 14px 0' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {!e.read && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: 'var(--c-accent)' }} aria-label="안읽음" />}
                        <span className="text-text font-medium line-clamp-2" style={{ fontSize: 14, lineHeight: 1.4 }}>{e.message}</span>
                      </div>
                    </td>
                    <td className="align-middle" style={{ padding: '14px 16px 14px 0' }}>
                      {t.serverId || t.gpuId ? (
                        <button type="button" onClick={(ev) => { ev.stopPropagation(); const p = targetPath(e, isAdmin); if (p) navigate(p) }} className="inline-flex items-center gap-1 rounded-[7px] font-medium transition-[background-color,color] hover:bg-[var(--accent-soft)] hover:text-[color:var(--c-accent)]" style={{ fontSize: 14, padding: '3px 7px', margin: '0 -7px', color: 'var(--c-text)' }}>
                          <CpuChipIcon style={{ width: 14, height: 14, color: 'var(--c-muted)' }} />
                          <span className="truncate">{t.label}</span>
                        </button>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 14 }}>—</span>
                      )}
                    </td>
                    <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '14px 0' }}>{e.createdAt}</td>
                    <td className="align-middle" style={{ padding: '14px 0' }}><EventStatusBadge status={e.status} /></td>
                    <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '14px 16px 14px 0' }}>{e.assignee ? (userById(e.assignee)?.name ?? e.assignee) : '—'}</td>
                    <td className="align-middle" style={{ padding: '14px 0', paddingRight: 24 }}>
                      <div className="flex items-center justify-end"><ActionPill open={e.status === 'open'} onClick={(ev) => { ev.stopPropagation(); openEvent(e) }} /></div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          label={<>{hasFilter ? `${view.length}건 표시` : `전체 ${scoped.length}건`}{view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}</>}
          page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
        />
      </section>
    </div>
  )
}

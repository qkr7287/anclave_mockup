import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { FoundationPage } from '../components/FoundationPage'
import { KpiStat, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { userById } from '../data'
import type { ChangeType, Status } from '../data/types'
import {
  type Col,
  DetailLink,
  FieldBox,
  FilterSelect,
  Pagination,
  RequesterCell,
  StatBadge,
  TableCard,
  teamOf,
  useMutedFix,
} from './approvals'
import { CHANGE_TYPE_META, getChangeRequests, getChangeRequestsByUser, allocLabel } from './gpu-change-store'
import type { ChangeRequest } from './gpu-change-store'

// G3 · 할당 관리 — 4.8 신청 관리 · 4.11 변경·확장·이전·회수. (4.9·4.10=approvals)

export function Requests() {
  return (
    <FoundationPage
      screen="4.8"
      title="신청 관리"
      desc="API · GPU 번들 · 게시 신청 작성, 상태 추적 (B=C)."
      group={2}
      roles={['A', 'B', 'C']}
      planned={['Tabs[API / GPU 번들 / 게시]', 'GPU 마법사(세로 스텝 · 공문 첨부)', '내 신청 테이블 + 상태 배지']}
    />
  )
}

// ════════════════════════════════ 4.11 변경 · 확장 · 이전 · 회수 ════════════════════════════════

const STATUS_FROM_KO: Record<string, Status> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' }
const TYPE_FROM_KO: Record<string, ChangeType> = { 변경: 'change', 확장: 'expand', 이전: 'migrate', 회수: 'reclaim' }
const TYPE_TONE_BG: Record<ChangeType, { bg: string; fg: string }> = {
  change: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  expand: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  migrate: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  reclaim: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}

function StatIcon({ Icon, box, color }: { Icon: typeof ClockIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

// 유형 배지(변경·확장·이전·회수)
function TypeBadge({ type }: { type: ChangeType }) {
  const c = TYPE_TONE_BG[type]
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] font-semibold whitespace-nowrap" style={{ background: c.bg, color: c.fg, padding: '3px 11px', minWidth: 50, fontSize: 14, lineHeight: 1.35 }}>
      {CHANGE_TYPE_META[type].label}
    </span>
  )
}

// 심사 pill(관리자 대기 건)
function ReviewPill({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ fontSize: 14, padding: '5px 12px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
      <ClipboardDocumentCheckIcon style={{ width: 14, height: 14, opacity: 0.9 }} />심사
    </button>
  )
}

interface ChangeRow extends ChangeRequest {
  requesterName: string
  team: string
  target: string
}

function toRow(r: ChangeRequest): ChangeRow {
  return { ...r, requesterName: userById(r.requesterUserId)?.name ?? r.requesterUserId, team: teamOf(r.requesterUserId), target: allocLabel(r.before) }
}

const CHANGE_COLS: Col[] = [
  { key: 'requester', label: '신청자', width: 150 },
  { key: 'type', label: '유형', width: 92 },
  { key: 'target', label: '대상 할당', width: 188 },
  { key: 'reason', label: '요청 사유', width: 300 },
  { key: 'date', label: '신청일', width: 140 },
  { key: 'status', label: '상태', width: 104 },
  { key: 'action', label: '액션', width: 116 },
]

export function GpuChange() {
  const { user, isAdmin } = useRole()
  const toast = useToast()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()

  const rows = useMemo<ChangeRow[]>(() => {
    const src = isAdmin ? getChangeRequests() : getChangeRequestsByUser(user.id)
    return src.map(toRow)
  }, [isAdmin, user.id])

  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [typeF, setTypeF] = useState('전체')
  const [applied, setApplied] = useState({ q: '', status: '전체', type: '전체' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => {
    const today = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const d = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      processedToday: rows.filter((r) => r.processedAt?.startsWith(d)).length,
    }
  }, [rows])

  const match = (r: ChangeRow) => {
    if (applied.q.trim() && !`${r.requesterName} ${r.team} ${r.target} ${r.reason} ${CHANGE_TYPE_META[r.type].label}`.toLowerCase().includes(applied.q.trim().toLowerCase())) return false
    if (applied.status !== '전체' && r.status !== STATUS_FROM_KO[applied.status]) return false
    if (applied.type !== '전체' && r.type !== TYPE_FROM_KO[applied.type]) return false
    return true
  }
  const view = rows.filter(match).sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt))
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = applied.q.trim() !== '' || applied.status !== '전체' || applied.type !== '전체'
  const dirty = q !== applied.q || statusF !== applied.status || typeF !== applied.type

  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next = { q, status: statusF, type: typeF }
    setApplied(next)
    const cnt = rows.filter((r) => {
      if (next.q.trim() && !`${r.requesterName} ${r.team} ${r.target} ${r.reason} ${CHANGE_TYPE_META[r.type].label}`.toLowerCase().includes(next.q.trim().toLowerCase())) return false
      if (next.status !== '전체' && r.status !== STATUS_FROM_KO[next.status]) return false
      if (next.type !== '전체' && r.type !== TYPE_FROM_KO[next.type]) return false
      return true
    }).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => { setQ(''); setStatusF('전체'); setTypeF('전체'); setApplied({ q: '', status: '전체', type: '전체' }) }

  const open = (r: ChangeRow) => navigate(`/requests/gpu-change/${r.id}`)

  return (
    <div data-approvals className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`
        [data-approvals]{user-select:none;-webkit-user-select:none}
        [data-approvals] button:not(:disabled),[data-approvals] a,[data-approvals] select,[data-approvals] tr.cursor-pointer{cursor:pointer}
        [data-approvals] button:disabled{cursor:not-allowed}
        [data-approvals] input,[data-approvals] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      `}</style>

      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>{isAdmin ? '할당 변경 관리' : '변경 · 확장 · 회수 신청'}</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          {isAdmin
            ? '사용자가 신청한 변경 · 확장 · 이전 · 회수 요청을 검토하고 승인 또는 반려합니다.'
            : '내 할당 자원에 대한 변경 · 확장 · 회수를 신청하고 처리 상태를 확인합니다.'}
        </p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        <div style={{ color: 'var(--c-warn)' }}>
          <KpiStat label="대기" value={counts.pending} unit="건" delta={counts.pending > 0 ? '검토 필요' : undefined} deltaTone="warn" sub="검토 대기 중인 요청" icon={<StatIcon Icon={ClockIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
        </div>
        <KpiStat label="승인" value={counts.approved} unit="건" sub="승인 및 반영 완료" icon={<StatIcon Icon={CheckCircleIcon} box="var(--ok-soft)" color="var(--c-ok)" />} />
        <KpiStat label="반려" value={counts.rejected} unit="건" sub="반려된 요청 건" icon={<StatIcon Icon={XCircleIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
        <KpiStat label="오늘 처리" value={counts.processedToday} unit="건" sub="오늘 처리한 건" icon={<StatIcon Icon={BoltIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
      </div>

      {/* 검색 및 필터 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop: 18, padding: '14px 19px' }}>
        <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <FieldBox className="gap-2" style={{ width: 308 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }} className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} placeholder="신청자, 대상 할당, 사유 검색" />
              <button type="button" onClick={applyFilters} aria-label="검색" className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-soft active:scale-90" style={{ width: 24, height: 24, color: 'var(--c-muted)', margin: '0 -5px 0 0' }}>
                <MagnifyingGlassIcon style={{ width: 17, height: 17 }} />
              </button>
            </FieldBox>
            <FilterSelect label="상태" value={statusF} onChange={setStatusF} options={['전체', '대기', '승인', '반려']} width={168} />
            <FilterSelect label="유형" value={typeF} onChange={setTypeF} options={['전체', '변경', '확장', '이전', '회수']} width={188} />
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

      <TableCard
        headerLeft={
          <div className="flex items-center justify-between w-full gap-3">
            <h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><ArrowsRightLeftIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />{isAdmin ? '변경 요청' : '내 변경 요청'}</h2>
            {!isAdmin && (
              <button type="button" onClick={() => navigate('/requests/gpu-change/new')} className="inline-flex items-center gap-1.5 rounded-[9px] text-onaccent btn-sweep font-semibold transition-transform duration-100 hover:brightness-105 active:scale-[0.97]" style={{ height: 38, padding: '0 15px', fontSize: 14, background: 'var(--c-accent)' }}>
                <PlusIcon style={{ width: 16, height: 16 }} />신규 변경 · 확장 · 회수 요청
              </button>
            )}
          </div>
        }
        cols={CHANGE_COLS}
        rows={pageRows}
        onRowClick={open}
        empty={hasFilter ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.' : isAdmin ? '대기 중인 변경 요청이 없어요.' : '신청한 변경 요청이 없어요. 신규 요청을 작성해보세요.'}
        cells={(r) => (
          <>
            <td className="align-middle" style={{ padding: '15px 0', paddingLeft: 24 }}><RequesterCell name={r.requesterName} team={r.team} /></td>
            <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}><TypeBadge type={r.type} /></td>
            <td className="align-middle text-muted truncate" style={{ fontSize: 14, padding: '15px 16px 15px 0' }}>{r.target}</td>
            <td className="align-middle text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0', lineHeight: 1.4 }}><span className="line-clamp-2">{r.reason}</span></td>
            <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>{r.createdAt}</td>
            <td className="align-middle" style={{ padding: '15px 0' }}><StatBadge status={r.status} /></td>
            <td className="align-middle" style={{ padding: '15px 0', paddingRight: 24 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                {isAdmin && r.status === 'pending'
                  ? <ReviewPill onClick={(e) => { e.stopPropagation(); open(r) }} />
                  : <DetailLink onClick={(e) => { e.stopPropagation(); open(r) }} />}
              </div>
            </td>
          </>
        )}
        footer={<Pagination label={<>전체 {view.length}건 · {view.length ? (curPage - 1) * pageSize + 1 : 0}–{Math.min(curPage * pageSize, view.length)}</>} page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} />}
      />
    </div>
  )
}

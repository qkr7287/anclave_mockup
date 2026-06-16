import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BoltIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  CpuChipIcon,
  EyeIcon,
  FunnelIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  Squares2X2Icon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { KpiStat, useToast } from '../components/ui'
import { useTheme } from '../lib/theme'
import {
  allGpus,
  allSlices,
  modelById,
  services,
  userById,
} from '../data'
import type { GpuRequest, Status } from '../data/types'
import { fetchGpuRequests } from './approval-store'
import { listPublishRequests, type PubRecord } from './publish-store'

// G4 · 승인 관리 — 게시·GPU "분리" 스펙.
//  · ApprovalsGpu  (4.10 · /admin/approvals/gpu · 할당 관리 그룹) = "승인 관리"
//      = 4.6 자원 신청현황의 관리자 버전 → GPU 자원 신청 승인만.
//        stat 4카드 · 검색/필터 · 신청 테이블 · 검토 드로어(승인 시 헥사곤 서버 선택 / 반려 사유).
//  · ApprovalsPublish (4.9 · /admin/approvals/publish · 마켓플레이스 그룹) = "게시 승인 관리"
//      = 마켓 게시(서비스 노출) 신청 승인 — 더 단순. 상세 드로어(서비스 메타) · 승인=노출 / 반려=사유.
//  더미 = src/data 시드(읽기 전용) · 테마 토큰(다크/라이트) · 14px floor · 프로그레스 바 없음 · 셸 우리 것.
//  (라우트·App.tsx·routes는 메인에서 연결 완료 — 이 파일만 수정.)

// 다크 테마 muted(#525872)가 본문에 너무 어두워 4.6과 동일하게 톤 보정
export function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

const STATUS_KO: Record<Status, string> = { pending: '대기', approved: '승인', rejected: '반려' }
const BADGE: Record<Status, { bg: string; fg: string }> = {
  pending: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  approved: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  rejected: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}
const STATUS_FROM_KO: Record<string, Status> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' }

// 신청자 소속 부서 — user.department(조직도) 사용.
export function teamOf(userId: string): string {
  return userById(userId)?.department ?? '미지정'
}

// ════════════════════════════════════ 공통 프리미티브(4.6 톤) ════════════════════════════════════

export function StatBadge({ status }: { status: Status }) {
  const b = BADGE[status]
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] font-semibold whitespace-nowrap" style={{ background: b.bg, color: b.fg, padding: '3px 12px', minWidth: 56, fontSize: 14, lineHeight: 1.35 }}>
      {STATUS_KO[status]}
    </span>
  )
}

interface StatDef { label: string; value: number; desc: string; num: string; box: string; Icon: typeof ClockIcon }

// KpiStat 아이콘 — soft 배경 박스(g2 RequestStatus 스탯카드와 동일 외형: 30px·radius9·semantic soft)
function StatIcon({ Icon, box, color }: { Icon: typeof ClockIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

export function FieldBox({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`flex items-center bg-card2 border border-line rounded-[8px] transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`} style={{ height: 38, padding: '0 13px', ...style }}>
      {children}
    </div>
  )
}

export function FilterSelect({ label, value, onChange, options, width }: { label: string; value: string; onChange: (v: string) => void; options: string[]; width: number }) {
  return (
    <div className="relative flex items-center bg-card2 border border-line rounded-[8px] gap-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 38, padding: '0 13px', width }}>
      <span className="text-muted shrink-0 pointer-events-none" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-text font-medium ml-auto pointer-events-none truncate" style={{ fontSize: 14 }}>{value}</span>
      <ChevronDownIcon className="shrink-0 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--c-muted)' }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ fontSize: 14 }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function PageBtn({ children, active, onClick, disabled }: { children: ReactNode; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex items-center justify-center rounded-[7px] font-medium transition-[transform,background-color] duration-100 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-soft active:enabled:scale-90" style={{ width: 30, height: 30, fontSize: 14, background: active ? 'var(--c-accent)' : 'transparent', color: active ? 'var(--c-onaccent)' : 'var(--c-muted)', fontWeight: active ? 600 : 500 }}>
      {children}
    </button>
  )
}

function ReviewPill({ pending, onClick }: { pending: boolean; onClick: (e: React.MouseEvent) => void }) {
  const Icon = pending ? ClipboardDocumentCheckIcon : EyeIcon
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ fontSize: 14, padding: '5px 12px', background: pending ? 'var(--accent-soft)' : 'var(--c-soft)', color: pending ? 'var(--c-accent)' : 'var(--c-muted)' }}>
      <Icon style={{ width: 14, height: 14, opacity: 0.9 }} />
      {pending ? '심사' : '상세'}
    </button>
  )
}

// 신청자 셀(아바타 + 이름/팀) — 두 테이블 공통
export function RequesterCell({ name, team }: { name: string; team: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--c-accent)', fontSize: 14, fontWeight: 700 }}>{name.slice(0, 1)}</span>
      <div className="min-w-0">
        <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{name}</div>
        <div className="truncate text-muted" style={{ fontSize: 14 }}>{team}</div>
      </div>
    </div>
  )
}

function StatusCell({ status }: { status: Status }) {
  return <StatBadge status={status} />
}

export interface Col { key: string; label: string; width: number; align?: 'center' | 'right' }

// 신청 목록 테이블 카드(헤더 + 표 + 푸터) — GPU/게시 두 화면 공통 셸
export function TableCard<T extends { id: string; status: Status }>({ headerLeft, cols, rows, cells, onRowClick, empty, footer }: {
  headerLeft: ReactNode
  cols: Col[]
  rows: T[]
  cells: (r: T) => ReactNode
  onRowClick: (r: T) => void
  empty: string
  footer: ReactNode
}) {
  return (
    <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ marginTop: 18 }}>
      <div className="flex items-center justify-between gap-3 shrink-0 border-b border-line" style={{ padding: '15px 24px' }}>{headerLeft}</div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup>{cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
              {cols.map((c, i) => (
                <th key={c.key} className="text-muted font-medium whitespace-nowrap" style={{ textAlign: c.align ?? 'left', fontSize: 14, padding: '13px 0', paddingLeft: i === 0 ? 24 : 0, paddingRight: i === cols.length - 1 ? 24 : 0 }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} className="text-muted text-center" style={{ fontSize: 14, padding: '40px 0' }}>{empty}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)} style={{ borderBottom: '1px solid var(--c-border-s)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                {cells(r)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  )
}

export function Pagination({ label, page, pageCount, setPage, pageSize, setPageSize }: {
  label: ReactNode
  page: number
  pageCount: number
  setPage: (n: number) => void
  pageSize: number
  setPageSize: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 24px' }}>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{label}</span>
      <div className="flex items-center" style={{ gap: 6 }}>
        <PageBtn onClick={() => setPage(1)} disabled={page === 1}>«</PageBtn>
        <PageBtn onClick={() => setPage(page - 1)} disabled={page === 1}>‹</PageBtn>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
          <PageBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
        ))}
        <PageBtn onClick={() => setPage(page + 1)} disabled={page === pageCount}>›</PageBtn>
        <PageBtn onClick={() => setPage(pageCount)} disabled={page === pageCount}>»</PageBtn>
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
  )
}

// 목록 행 기본 필드(PubRow의 베이스). 심사는 4.9a 전용 페이지(publish-detail.tsx)로 승격.
interface DrawerRow { id: string; requester: string; team: string; email: string; status: Status; rejectReason?: string }

// 검색·상태·기간 필터 바(GPU=기간 포함 / 게시=기간 생략) — date 슬롯 옵션
function FilterBar({ q, setQ, statusF, setStatusF, dateStart, setDateStart, dateEnd, setDateEnd, withDate, dirty, onApply, onReset, placeholder, marginTop = 32 }: {
  q: string; setQ: (v: string) => void
  statusF: string; setStatusF: (v: string) => void
  dateStart: string; setDateStart: (v: string) => void
  dateEnd: string; setDateEnd: (v: string) => void
  withDate: boolean; dirty: boolean
  onApply: () => void; onReset: () => void; placeholder: string
  marginTop?: number // 위에 스트립이 있으면 줄여 리듬 맞춤(기본 32)
}) {
  return (
    <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop, padding: '14px 19px' }}>
      <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
        <div className="flex items-center gap-4 min-w-0 flex-wrap">
          <FieldBox className="gap-2" style={{ width: 320 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onApply() }} className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} placeholder={placeholder} />
            <button type="button" onClick={onApply} aria-label="검색" className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-soft active:scale-90" style={{ width: 24, height: 24, color: 'var(--c-muted)', margin: '0 -5px 0 0' }}>
              <MagnifyingGlassIcon style={{ width: 17, height: 17 }} />
            </button>
          </FieldBox>
          <FilterSelect label="상태" value={statusF} onChange={setStatusF} options={['전체', '대기', '승인', '반려']} width={168} />
          {withDate && (
            <FieldBox className="gap-1.5" style={{ width: 326 }}>
              <CalendarDaysIcon style={{ width: 18, height: 18, color: 'var(--c-muted)', flexShrink: 0 }} />
              <input type="date" value={dateStart} max={dateEnd || undefined} onChange={(e) => setDateStart(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>~</span>
              <input type="date" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
            </FieldBox>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={onReset} className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] transition-[transform,background-color] duration-100 hover:bg-soft active:scale-[0.97]" style={{ height: 38, padding: '0 16px' }}>
            <ArrowPathIcon style={{ width: 16, height: 16, color: 'var(--c-muted)' }} />
            <span className="text-text font-medium" style={{ fontSize: 14 }}>초기화</span>
          </button>
          <button type="button" onClick={onApply} className="relative flex items-center gap-2 rounded-[8px] text-onaccent btn-sweep transition-transform duration-100 hover:brightness-105 active:scale-[0.97]" style={{ height: 38, padding: '0 16px', background: 'var(--c-accent)', boxShadow: dirty ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
            <FunnelIcon style={{ width: 15, height: 15 }} />
            <span className="font-semibold" style={{ fontSize: 14 }}>필터 적용</span>
            {dirty && <span className="absolute rounded-full" style={{ top: -4, right: -4, width: 9, height: 9, background: 'var(--c-warn)', border: '2px solid var(--c-card2)' }} />}
          </button>
        </div>
      </div>
    </section>
  )
}

// ════════════════════════════════ 4.10 승인 관리 (GPU 자원 · 할당 관리) ════════════════════════════════

interface GpuRow {
  id: string
  requester: string
  team: string
  status: Status
  resource: string
  model: string
  serviceName: string
  reason: string
  period?: string
  date: string
  processedAt?: string
}

function gpuRow(r: GpuRequest): GpuRow {
  const u = userById(r.requesterUserId)
  const unit = r.capacityUnit === 'card' ? '카드' : '슬라이스'
  return {
    id: r.id,
    requester: u?.name ?? r.requesterUserId,
    team: teamOf(r.requesterUserId),
    status: r.status,
    resource: `${r.capacity} ${unit}`,
    model: r.models.map((m) => modelById(m)?.name ?? m).join(', '),
    serviceName: r.serviceName,
    reason: r.purpose,
    period: r.period,
    date: r.createdAt,
    processedAt: r.processedAt,
  }
}

const GPU_COLS: Col[] = [
  { key: 'requester', label: '신청자', width: 150 },
  { key: 'resource', label: '자원 / 모델', width: 200 },
  { key: 'reason', label: '요청 사유', width: 236 },
  { key: 'period', label: '기간', width: 84 },
  { key: 'date', label: '신청일', width: 140 },
  { key: 'status', label: '상태', width: 120 },
  { key: 'action', label: '액션', width: 132 },
]

// 자원 잔여 현황(시드 정적 파생) — 미할당 cluster GPU·전 슬라이스 미점유 MIG GPU = 잔여 카드
const FREE_GPU_CARDS = allGpus.filter((g) =>
  g.allocMode === 'cluster' ? !g.assignedServiceId : (g.slices ?? []).every((s) => !s.ownerUserId),
).length
const FREE_SLICES = allSlices.filter((s) => !s.ownerUserId).length
const TOTAL_UNITS = allGpus.filter((g) => g.allocMode === 'cluster').length + allSlices.length
const FREE_UNITS = allGpus.filter((g) => g.allocMode === 'cluster' && !g.assignedServiceId).length + FREE_SLICES
const CLUSTER_AVAIL = Math.round((FREE_UNITS / Math.max(1, TOTAL_UNITS)) * 100)
// 전체·할당(= 전체 − 잔여) — 스트립에서 잔여를 전체 대비로 보여주기 위함
const TOTAL_GPU_CARDS = allGpus.length
const ALLOC_GPU_CARDS = TOTAL_GPU_CARDS - FREE_GPU_CARDS
const TOTAL_SLICES = allSlices.length
const ALLOC_SLICES = TOTAL_SLICES - FREE_SLICES
const CLUSTER_ALLOC = 100 - CLUSTER_AVAIL

// 모든 행 공통 "상세 보기" — 대기는 상세에서 심사, 처리 완료는 조회. (4.6 자원 신청현황 ActionLink 펠릿 스타일)
export function DetailLink({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:bg-[var(--accent-soft)] hover:text-[color:var(--c-accent)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{ fontSize: 14, padding: '5px 10px', background: 'var(--c-soft)', color: 'var(--c-muted)' }}
    >
      <EyeIcon style={{ width: 14, height: 14, opacity: 0.9 }} />
      상세 보기
    </button>
  )
}

// KPI 아래 자원 잔여 현황 스트립 — 1행 고정(64px), 펼침 없음.
// 좌(제목 앵커) · 중(라벨/값 2줄 밀도 지표) · 우(CTA) 컨텍스트 바 구성 — 떠 있는 숫자 방지.
function StripMetric({ label, value, unit, secondary }: { label: string; value: number; unit: string; secondary: string }) {
  return (
    <div className="flex flex-col justify-center shrink-0" style={{ gap: 2 }}>
      <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.25 }}>{label}</span>
      <span className="flex items-baseline" style={{ gap: 5 }}>
        <span className="font-bold text-text" style={{ fontSize: 20, letterSpacing: '-0.3px', lineHeight: 1.1 }}>{value}</span>
        <span className="text-muted" style={{ fontSize: 13, fontWeight: 500 }}>{unit}</span>
        <span className="text-muted" style={{ fontSize: 12.5, marginLeft: 3 }}>{secondary}</span>
      </span>
    </div>
  )
}

function ResourceStrip({ onMap }: { onMap: () => void }) {
  const divider = <span className="shrink-0" style={{ width: 1, height: 34, background: 'var(--c-border)' }} />
  return (
    <section className="bg-card2 border border-line rounded-[14px] shrink-0 flex items-center" style={{ height: 64, marginTop: 18, padding: '0 16px 0 20px', gap: 22, boxShadow: 'var(--shadow-card)' }}>
      {/* 좌 — 제목 앵커(부제로 '잔여율' 의미 설명) */}
      <div className="flex items-center shrink-0" style={{ gap: 12 }}>
        <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
          <Squares2X2Icon width={20} height={20} />
        </span>
        <div className="flex flex-col" style={{ gap: 1 }}>
          <span className="font-bold text-text" style={{ fontSize: 14.5, lineHeight: 1.25 }}>자원 잔여 현황</span>
          <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.25 }}>승인 시 배치 가능한 여유 자원</span>
        </div>
      </div>
      {divider}
      {/* 중 — 지표 묶음(라벨/값 2줄 + 전체·할당 보조) */}
      <div className="flex items-center" style={{ gap: 22 }}>
        <StripMetric label="잔여 GPU" value={FREE_GPU_CARDS} unit="카드" secondary={`전체 ${TOTAL_GPU_CARDS} · 할당 ${ALLOC_GPU_CARDS}`} />
        {divider}
        <StripMetric label="잔여 MIG 슬라이스" value={FREE_SLICES} unit="개" secondary={`전체 ${TOTAL_SLICES} · 할당 ${ALLOC_SLICES}`} />
        {divider}
        {/* 잔여율 = 전체 할당 가능 단위 중 비어 있는 비율(= 100 − 할당률) */}
        <StripMetric label="잔여율" value={CLUSTER_AVAIL} unit="%" secondary={`할당 ${CLUSTER_ALLOC}%`} />
      </div>
      {/* 우 — CTA(accent-soft 칩으로 우측 균형) */}
      <button type="button" onClick={onMap} className="ml-auto shrink-0 inline-flex items-center gap-1 font-semibold rounded-[9px] transition-[filter,transform] duration-100 hover:brightness-105 active:scale-[0.97]" style={{ fontSize: 14, padding: '8px 14px', color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>
        자원맵 보기<ChevronRightIcon width={15} height={15} />
      </button>
    </section>
  )
}

export function ApprovalsGpu() {
  const toast = useToast()
  const mutedFix = useMutedFix()
  const navigate = useNavigate()
  // backend(REST)에서 GPU 신청 목록 로드 — 4.10a 상세에서 처리하면 목록 복귀 시 재조회로 반영
  const [rows, setRows] = useState<GpuRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let alive = true
    fetchGpuRequests()
      .then((data) => { if (alive) { setRows(data.map(gpuRow)); setLoadError(false) } })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [applied, setApplied] = useState({ q: '', status: '전체', start: '', end: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      processedToday: rows.filter((r) => r.processedAt?.startsWith(today)).length,
    }
  }, [rows])

  const match = (r: GpuRow) => {
    if (applied.q.trim() && !`${r.requester} ${r.team} ${r.resource} ${r.model} ${r.reason} ${r.serviceName}`.toLowerCase().includes(applied.q.trim().toLowerCase())) return false
    if (applied.status !== '전체' && r.status !== STATUS_FROM_KO[applied.status]) return false
    const d = r.date.slice(0, 10)
    if (applied.start && d < applied.start) return false
    if (applied.end && d > applied.end) return false
    return true
  }
  // 기본 정렬 — 대기 우선 + 신청일 desc
  const view = rows
    .filter(match)
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.date.localeCompare(a.date))
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = applied.q.trim() !== '' || applied.status !== '전체' || applied.start !== '' || applied.end !== ''
  const dirty = q !== applied.q || statusF !== applied.status || dateStart !== applied.start || dateEnd !== applied.end

  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next = { q, status: statusF, start: dateStart, end: dateEnd }
    setApplied(next)
    const cnt = rows.filter((r) => {
      if (next.q.trim() && !`${r.requester} ${r.team} ${r.resource} ${r.model} ${r.reason} ${r.serviceName}`.toLowerCase().includes(next.q.trim().toLowerCase())) return false
      if (next.status !== '전체' && r.status !== STATUS_FROM_KO[next.status]) return false
      const d = r.date.slice(0, 10)
      if (next.start && d < next.start) return false
      if (next.end && d > next.end) return false
      return true
    }).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => { setQ(''); setStatusF('전체'); setDateStart(''); setDateEnd(''); setApplied({ q: '', status: '전체', start: '', end: '' }) }

  // 심사·상세 모두 4.10a 전용 페이지에서 — 행/액션 클릭 시 이동
  const openDetail = (r: GpuRow) => navigate(`/admin/approvals/gpu/${r.id}`)

  return (
    <div data-approvals className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      {/* 디테일 — 정적 텍스트 선택/드래그 차단 · 클릭 요소 pointer 커서 · 입력은 선택 유지 */}
      <style>{`
        [data-approvals]{user-select:none;-webkit-user-select:none}
        [data-approvals] button:not(:disabled),[data-approvals] a,[data-approvals] select,[data-approvals] tr.cursor-pointer{cursor:pointer}
        [data-approvals] button:disabled{cursor:not-allowed}
        [data-approvals] input,[data-approvals] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
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
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>승인 관리</h1>
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>GPU 자원 신청을 검토하고 승인(서버 할당) 또는 반려합니다. 대기 신청을 선택해 상세를 확인하세요.</p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {/* 대기 — 값 색이 컨테이너 색을 상속해 경고색 강조 */}
        <div style={{ color: 'var(--c-warn)' }}>
          <KpiStat label="대기" value={counts.pending} unit="건" delta={counts.pending > 0 ? '검토 필요' : undefined} deltaTone="warn" sub="검토 대기 중인 GPU 신청" icon={<StatIcon Icon={ClockIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
        </div>
        <KpiStat label="승인" value={counts.approved} unit="건" sub="승인 및 서버 할당 완료" icon={<StatIcon Icon={CheckCircleIcon} box="var(--ok-soft)" color="var(--c-ok)" />} />
        <KpiStat label="반려" value={counts.rejected} unit="건" sub="반려된 신청 건" icon={<StatIcon Icon={XCircleIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
        <KpiStat label="오늘 처리" value={counts.processedToday} unit="건" sub="오늘 검토 처리한 건" icon={<StatIcon Icon={BoltIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
      </div>

      <ResourceStrip onMap={() => navigate('/resource-map')} />

      <FilterBar q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} dateStart={dateStart} setDateStart={setDateStart} dateEnd={dateEnd} setDateEnd={setDateEnd} withDate dirty={dirty} onApply={applyFilters} onReset={resetFilters} placeholder="신청자, 자원, 모델, 사유 검색" marginTop={18} />

      <TableCard
        headerLeft={<h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><CpuChipIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />GPU 자원 신청</h2>}
        cols={GPU_COLS}
        rows={pageRows}
        onRowClick={openDetail}
        empty={loading ? '신청 목록을 불러오는 중…' : loadError ? '목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.' : hasFilter ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.' : '대기 중인 GPU 신청이 없어요.'}
        cells={(r) => (
          <>
            <td className="align-middle" style={{ padding: '15px 0', paddingLeft: 24 }}><RequesterCell name={r.requester} team={r.team} /></td>
            <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}>
              <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{r.resource}</div>
              <div className="truncate text-muted" style={{ fontSize: 14 }}>{r.model}</div>
            </td>
            <td className="align-middle text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0', lineHeight: 1.4 }}><span className="line-clamp-2">{r.reason}</span></td>
            <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0' }}>{r.period ?? '—'}</td>
            <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>{r.date}</td>
            <td className="align-middle" style={{ padding: '15px 0' }}><StatusCell status={r.status} /></td>
            <td className="align-middle" style={{ padding: '15px 0', paddingRight: 24 }}><div className="flex items-center" style={{ gap: 6 }}><DetailLink onClick={(e) => { e.stopPropagation(); openDetail(r) }} /></div></td>
          </>
        )}
        footer={
          <Pagination
            label={<>{hasFilter ? `${view.length}건 표시` : `전체 ${rows.length}건`}{view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}</>}
            page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          />
        }
      />
    </div>
  )
}

// ════════════════════════════════ 4.9 게시 승인 관리 (마켓 노출 · 마켓플레이스) ════════════════════════════════

interface PubRow extends DrawerRow {
  serviceName: string
  kind: string
  model: string
  hasApi: boolean
  tags: string[]
  usage: number
  usageRank: number
  intro: string
  serviceUrl: string
  demoUrl: string
  reason: string
  date: string
  processedAt?: string
}

function pubRow(r: PubRecord): PubRow {
  const u = userById(r.requesterUserId)
  const svc = services.find((s) => s.name === r.serviceName)
  const [metaKind, metaModel] = (r.meta || '').split('·').map((s) => s.trim())
  const kind = svc?.kind ?? metaKind ?? '서비스'
  const model = svc ? (modelById(svc.model)?.name ?? metaModel ?? '—') : (metaModel ?? '—')
  return {
    id: r.id,
    requester: u?.name ?? r.requesterUserId,
    team: teamOf(r.requesterUserId),
    email: u?.email ?? '—',
    status: r.status,
    rejectReason: r.rejectReason,
    serviceName: r.serviceName,
    kind,
    model,
    hasApi: svc?.hasApi ?? false,
    tags: svc?.tags ?? [],
    usage: svc?.usageCount ?? 0,
    usageRank: svc?.usageRank ?? 0,
    intro: svc?.description ?? '',
    serviceUrl: r.serviceUrl,
    demoUrl: r.demoUrl,
    reason: `${kind} 서비스를 마켓플레이스에 노출(게시)하기 위한 승인 요청`,
    date: r.createdAt,
    processedAt: r.processedAt,
  }
}

const PUB_COLS: Col[] = [
  { key: 'service', label: '서비스', width: 220 },
  { key: 'requester', label: '신청자', width: 160 },
  { key: 'kind', label: '종류 / 모델', width: 230 },
  { key: 'date', label: '신청일', width: 152 },
  { key: 'status', label: '상태', width: 128 },
  { key: 'action', label: '액션', width: 120, align: 'right' },
]

export function ApprovalsPublish() {
  const toast = useToast()
  const mutedFix = useMutedFix()
  const navigate = useNavigate()
  // 목록은 세션 스토어에서 로드 — 심사 페이지(publish-detail)에서 처리하면 목록 복귀 시 재마운트로 반영.
  const [rows] = useState<PubRow[]>(() => listPublishRequests().map(pubRow))
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [applied, setApplied] = useState({ q: '', status: '전체', start: '', end: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      processedToday: rows.filter((r) => r.processedAt?.startsWith(today)).length,
    }
  }, [rows])

  const STAT_CARDS: StatDef[] = [
    { label: '대기', value: counts.pending, desc: '게시 검토 대기 중', num: 'var(--c-warn)', box: 'var(--warn-soft)', Icon: ClockIcon },
    { label: '게시 중', value: counts.approved, desc: '마켓 노출 중인 서비스', num: 'var(--c-ok)', box: 'var(--ok-soft)', Icon: GlobeAltIcon },
    { label: '반려', value: counts.rejected, desc: '반려된 게시 신청', num: 'var(--c-danger)', box: 'var(--danger-soft)', Icon: XCircleIcon },
    { label: '오늘 처리', value: counts.processedToday, desc: '오늘 검토 처리한 건', num: 'var(--c-accent)', box: 'var(--accent-soft)', Icon: BoltIcon },
  ]

  const match = (r: PubRow) => {
    if (applied.q.trim() && !`${r.serviceName} ${r.requester} ${r.team} ${r.kind} ${r.model}`.toLowerCase().includes(applied.q.trim().toLowerCase())) return false
    if (applied.status !== '전체' && r.status !== STATUS_FROM_KO[applied.status]) return false
    const d = r.date.slice(0, 10)
    if (applied.start && d < applied.start) return false
    if (applied.end && d > applied.end) return false
    return true
  }
  const view = rows.filter(match)
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = applied.q.trim() !== '' || applied.status !== '전체' || applied.start !== '' || applied.end !== ''
  const dirty = q !== applied.q || statusF !== applied.status || dateStart !== applied.start || dateEnd !== applied.end

  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next = { q, status: statusF, start: dateStart, end: dateEnd }
    setApplied(next)
    const cnt = rows.filter((r) => {
      if (next.q.trim() && !`${r.serviceName} ${r.requester} ${r.team} ${r.kind} ${r.model}`.toLowerCase().includes(next.q.trim().toLowerCase())) return false
      if (next.status !== '전체' && r.status !== STATUS_FROM_KO[next.status]) return false
      const d = r.date.slice(0, 10)
      if (next.start && d < next.start) return false
      if (next.end && d > next.end) return false
      return true
    }).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => { setQ(''); setStatusF('전체'); setDateStart(''); setDateEnd(''); setApplied({ q: '', status: '전체', start: '', end: '' }) }

  // 심사·상세 모두 4.9a 전용 페이지에서 — 행/액션 클릭 시 이동(처리 결과는 publish-store 공유).
  const openDetail = (r: PubRow) => navigate(`/admin/approvals/publish/${r.id}`)

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <header className="flex flex-col min-w-0 shrink-0">
        <div className="flex items-center" style={{ gap: 10 }}>
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={() => navigate(-1)}
            className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors shrink-0"
            style={{ width: 34, height: 34 }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>게시 승인 관리</h1>
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>마켓플레이스에 노출(게시)될 서비스 신청을 검토하고 승인 또는 반려합니다.</p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {STAT_CARDS.map((s) => (
          <KpiStat key={s.label} label={s.label} value={s.value} sub={s.desc} icon={<StatIcon Icon={s.Icon} box={s.box} color={s.num} />} />
        ))}
      </div>

      <FilterBar q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} dateStart={dateStart} setDateStart={setDateStart} dateEnd={dateEnd} setDateEnd={setDateEnd} withDate dirty={dirty} onApply={applyFilters} onReset={resetFilters} placeholder="서비스명, 신청자, 모델 검색" />

      <TableCard
        headerLeft={<h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><MegaphoneIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />마켓 게시 신청</h2>}
        cols={PUB_COLS}
        rows={pageRows}
        onRowClick={openDetail}
        empty={hasFilter ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.' : '대기 중인 게시 신청이 없어요.'}
        cells={(r) => (
          <>
            <td className="align-middle" style={{ padding: '14px 0', paddingLeft: 24 }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}><MegaphoneIcon style={{ width: 16, height: 16 }} /></span>
                <div className="min-w-0">
                  <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{r.serviceName}</div>
                  <div className="truncate text-muted" style={{ fontSize: 14 }}>{r.hasApi ? 'API 제공' : '웹 UI'}</div>
                </div>
              </div>
            </td>
            <td className="align-middle" style={{ padding: '14px 16px 14px 0' }}><RequesterCell name={r.requester} team={r.team} /></td>
            <td className="align-middle" style={{ padding: '14px 16px 14px 0' }}>
              <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{r.kind}</div>
              <div className="truncate text-muted" style={{ fontSize: 14 }}>{r.model}</div>
            </td>
            <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '14px 0' }}>{r.date}</td>
            <td className="align-middle" style={{ padding: '14px 0' }}><StatusCell status={r.status} /></td>
            <td className="align-middle" style={{ padding: '14px 0', paddingRight: 24 }}><div className="flex items-center justify-end"><ReviewPill pending={r.status === 'pending'} onClick={(e) => { e.stopPropagation(); openDetail(r) }} /></div></td>
          </>
        )}
        footer={
          <Pagination
            label={<>{hasFilter ? `${view.length}건 표시` : `전체 ${rows.length}건`}{view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}</>}
            page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          />
        }
      />
    </div>
  )
}

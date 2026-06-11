import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BoltIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  CpuChipIcon,
  EyeIcon,
  FunnelIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { HealthBadge, useToast } from '../components/ui'
import { Hexagon } from '../components/charts/Hexagon'
import { useTheme } from '../lib/theme'
import {
  gpuRequests,
  modelById,
  publishRequests,
  serverById,
  servers,
  services,
  userById,
} from '../data'
import type { GpuRequest, PublishRequest, Status } from '../data/types'

// G4 · 승인 관리 — 게시·GPU "분리" 스펙.
//  · ApprovalsGpu  (4.10 · /admin/approvals/gpu · 할당 관리 그룹) = "승인 관리"
//      = 4.6 자원 신청현황의 관리자 버전 → GPU 자원 신청 승인만.
//        stat 4카드 · 검색/필터 · 신청 테이블 · 검토 드로어(승인 시 헥사곤 서버 선택 / 반려 사유).
//  · ApprovalsPublish (4.9 · /admin/approvals/publish · 마켓플레이스 그룹) = "게시 승인 관리"
//      = 마켓 게시(서비스 노출) 신청 승인 — 더 단순. 상세 드로어(서비스 메타) · 승인=노출 / 반려=사유.
//  더미 = src/data 시드(읽기 전용) · 테마 토큰(다크/라이트) · 14px floor · 프로그레스 바 없음 · 셸 우리 것.
//  (라우트·App.tsx·routes는 메인에서 연결 완료 — 이 파일만 수정.)

// 다크 테마 muted(#525872)가 본문에 너무 어두워 4.6과 동일하게 톤 보정
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

const STATUS_KO: Record<Status, string> = { pending: '대기', approved: '승인', rejected: '반려' }
const STATUS_SUB: Record<Status, string> = { pending: '검토 대기', approved: '승인 완료', rejected: '반려됨' }
const BADGE: Record<Status, { bg: string; fg: string }> = {
  pending: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  approved: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  rejected: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}
const STATUS_FROM_KO: Record<string, Status> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' }

// 신청자 표시용 소속 팀(시드엔 없음 → id 기반 안정적 합성)
const TEAMS = ['플랫폼팀', 'AI 연구팀', '서비스개발팀', '데이터팀', '클라우드인프라팀', 'MLOps팀']
function teamOf(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return TEAMS[h % TEAMS.length]
}

// ════════════════════════════════════ 공통 프리미티브(4.6 톤) ════════════════════════════════════

function StatBadge({ status }: { status: Status }) {
  const b = BADGE[status]
  return (
    <span className="inline-flex items-center rounded-[7px] font-semibold whitespace-nowrap" style={{ background: b.bg, color: b.fg, padding: '3px 12px', fontSize: 14, lineHeight: 1.35 }}>
      {STATUS_KO[status]}
    </span>
  )
}

interface StatDef { label: string; value: number; desc: string; num: string; box: string; Icon: typeof ClockIcon }

function StatCard({ s }: { s: StatDef }) {
  const { Icon } = s
  return (
    <div className="relative bg-card2 border border-line rounded-[14px] overflow-hidden hover-lift" style={{ height: 128, boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-start" style={{ gap: 16, padding: 23 }}>
        <span className="flex items-center justify-center shrink-0 rounded-[14px]" style={{ width: 56, height: 56, background: s.box, color: s.num }}>
          <Icon style={{ width: 28, height: 28 }} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-text" style={{ fontSize: 15, lineHeight: 1.3 }}>{s.label}</span>
          <span className="font-bold" style={{ fontSize: 30, lineHeight: 1.2, color: s.num, letterSpacing: '-0.5px', marginTop: 2 }}>{s.value}</span>
        </div>
      </div>
      <span className="absolute text-muted truncate" style={{ left: 23, right: 16, bottom: 15, fontSize: 14, lineHeight: 1 }}>{s.desc}</span>
    </div>
  )
}

function FieldBox({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`flex items-center bg-card2 border border-line rounded-[8px] transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`} style={{ height: 38, padding: '0 13px', ...style }}>
      {children}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, width }: { label: string; value: string; onChange: (v: string) => void; options: string[]; width: number }) {
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
      {pending ? '검토' : '상세'}
    </button>
  )
}

// 신청자 셀(아바타 + 이름/팀) — 두 테이블 공통
function RequesterCell({ name, team }: { name: string; team: string }) {
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
  return (
    <div className="flex flex-col items-start" style={{ gap: 5 }}>
      <StatBadge status={status} />
      <span className="text-muted" style={{ fontSize: 14 }}>{STATUS_SUB[status]}</span>
    </div>
  )
}

interface Col { key: string; label: string; width: number; align?: 'right' }

// 신청 목록 테이블 카드(헤더 + 표 + 푸터) — GPU/게시 두 화면 공통 셸
function TableCard<T extends { id: string; status: Status }>({ headerLeft, cols, rows, cells, onRowClick, empty, footer }: {
  headerLeft: ReactNode
  cols: Col[]
  rows: T[]
  cells: (r: T) => ReactNode
  onRowClick: (r: T) => void
  empty: string
  footer: ReactNode
}) {
  return (
    <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ marginTop: 11 }}>
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

function Pagination({ label, page, pageCount, setPage, pageSize, setPageSize }: {
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

// ── 드로어 라벨-값 / 섹션 / 버튼 ──
function KV({ k, v, vColor }: { k: string; v: ReactNode; vColor?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 text-muted" style={{ width: 80, fontSize: 14 }}>{k}</span>
      <span className="min-w-0 flex-1 font-medium" style={{ fontSize: 14, color: vColor ?? 'var(--c-text)', lineHeight: 1.45, wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-line" style={{ background: 'var(--c-card)', padding: '14px 16px' }}>
      <h3 className="font-bold text-text" style={{ fontSize: 14.5, marginBottom: 12 }}>{title}</h3>
      <div className="flex flex-col" style={{ gap: 11 }}>{children}</div>
    </section>
  )
}

function DrawerBtn({ children, variant, full, disabled, onClick }: { children: ReactNode; variant: 'primary' | 'danger' | 'ghost'; full?: boolean; disabled?: boolean; onClick: () => void }) {
  const style: React.CSSProperties =
    variant === 'primary' ? { background: 'var(--c-accent)', color: 'var(--c-onaccent)' }
      : variant === 'danger' ? { background: 'var(--danger-soft)', color: 'var(--c-danger)' }
        : { background: 'transparent', color: 'var(--c-text)', border: '1px solid var(--c-border)' }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 font-semibold rounded-[8px] transition-[transform,filter,opacity] duration-100 enabled:active:scale-[0.97] enabled:hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed ${full ? 'flex-1' : ''}`} style={{ height: 40, padding: '0 18px', fontSize: 14, ...style }}>
      {children}
    </button>
  )
}

type DrawerMode = 'view' | 'reject' | 'approve'

interface DrawerRow { id: string; requester: string; team: string; email: string; status: Status; rejectReason?: string; serverId?: string }

// 헥사곤 서버 선택 항목 — 부하 음영(util band) · 유휴=빗금
const SERVER_HEX = servers.map((s, i) => {
  const utils = s.gpus.map((g) => g.smUtil)
  const usage = utils.length ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length) : 0
  return { id: s.id, usage, free: s.health === 'inactive', label: String(i + 1).padStart(2, '0'), sublabel: s.health === 'inactive' ? '유휴' : `${usage}%` }
})

// ── 검토 드로어(공통) — 상세 + 승인/반려. needsServer면 승인 시 헥사곤 서버 선택. ──
function ReviewDrawer({ row, typeLabel, TypeIcon, detail, reasonText, attachmentName, needsServer, approveLabel, resultExtra, onClose, onApprove, onReject }: {
  row: DrawerRow | null
  typeLabel: string
  TypeIcon: typeof CpuChipIcon
  detail: ReactNode
  reasonText: string
  attachmentName?: string
  needsServer: boolean
  approveLabel: string
  resultExtra?: ReactNode
  onClose: () => void
  onApprove: (serverId?: string) => void
  onReject: (reason: string) => void
}) {
  const toast = useToast()
  const [mode, setMode] = useState<DrawerMode>('view')
  const [reason, setReason] = useState('')
  const [serverId, setServerId] = useState<string | null>(null)

  useEffect(() => { setMode('view'); setReason(''); setServerId(null) }, [row?.id])
  useEffect(() => {
    if (!row) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [row, onClose])

  if (!row) return null
  const pending = row.status === 'pending'
  const selectedServer = serverId ? serverById(serverId) : null

  const clickApprove = () => { if (needsServer) setMode('approve'); else onApprove() }

  return (
    <div className="fixed inset-0 z-50" style={{ background: 'var(--dim)' }} onClick={onClose} role="presentation">
      <aside className="absolute top-0 right-0 bottom-0 bg-card2 border-l border-line flex flex-col anim-fade" style={{ width: 504, maxWidth: '94vw', boxShadow: 'var(--shadow-pop)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="flex items-center justify-between gap-3 shrink-0 border-b border-line" style={{ padding: '16px 20px' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="font-bold text-text truncate" style={{ fontSize: 17 }}>신청 검토</h2>
            <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{row.id.toUpperCase()}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-muted hover:text-text shrink-0"><XMarkIcon width={20} height={20} /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ padding: 20, gap: 14 }}>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
              <TypeIcon width={14} height={14} />{typeLabel}
            </span>
            <StatBadge status={row.status} />
          </div>

          <DrawerSection title="신청자">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center shrink-0" style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--c-accent)', color: 'var(--c-onaccent)', fontSize: 16, fontWeight: 800 }}>{row.requester.slice(0, 1)}</span>
              <div className="min-w-0">
                <div className="font-semibold text-text truncate" style={{ fontSize: 14.5 }}>{row.requester} · {row.team}</div>
                <div className="text-muted truncate" style={{ fontSize: 14 }}>{row.email}</div>
              </div>
            </div>
          </DrawerSection>

          <DrawerSection title="신청 내용">{detail}</DrawerSection>

          <DrawerSection title="요청 사유">
            <p style={{ fontSize: 14, color: 'var(--c-text)', lineHeight: 1.55 }}>{reasonText}</p>
          </DrawerSection>

          {attachmentName && (
            <DrawerSection title="첨부 공문">
              <div className="flex items-center gap-2.5 rounded-[8px] border border-line" style={{ background: 'var(--c-card)', height: 36, padding: '0 11px' }}>
                <span className="flex items-center justify-center shrink-0 font-bold" style={{ width: 18, height: 18, borderRadius: 3, background: '#e8413a', color: '#fff', fontSize: 7 }}>PDF</span>
                <span className="flex-1 truncate font-medium text-text" style={{ fontSize: 14 }}>{attachmentName}</span>
                <button type="button" onClick={() => toast.push('공문 다운로드 (목업)', 'info')} className="shrink-0 text-muted hover:text-text transition-transform active:scale-90" aria-label="다운로드"><ArrowDownTrayIcon width={15} height={15} /></button>
              </div>
            </DrawerSection>
          )}

          {row.status === 'approved' && (
            <DrawerSection title="처리 결과">
              <KV k="결과" v="승인 완료" vColor="var(--c-ok)" />
              {resultExtra}
            </DrawerSection>
          )}
          {row.status === 'rejected' && (
            <DrawerSection title="처리 결과">
              <KV k="결과" v="반려됨" vColor="var(--c-danger)" />
              <KV k="반려 사유" v={row.rejectReason || '—'} />
            </DrawerSection>
          )}

          {mode === 'reject' && (
            <DrawerSection title="반려 사유">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 알림으로 전달됩니다." className="w-full rounded-[8px] border text-text" style={{ background: 'var(--c-bg)', borderColor: reason.trim() ? 'var(--c-border)' : 'var(--c-danger)', height: 96, padding: 12, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
              <span className="text-muted self-end" style={{ fontSize: 14 }}>{reason.length}/300</span>
            </DrawerSection>
          )}

          {mode === 'approve' && needsServer && (
            <DrawerSection title="할당 서버 선택">
              <p className="text-muted" style={{ fontSize: 14, marginTop: -2 }}>승인 시 신청 자원을 배치할 서버를 선택하세요. (음영 = 현재 부하)</p>
              <div className="flex justify-center" style={{ padding: '6px 0' }}>
                <Hexagon items={SERVER_HEX} perRow={4} tileWidth={68} tileHeight={78} selectedId={serverId ?? undefined} onSelect={setServerId} />
              </div>
              {selectedServer ? (
                <div className="rounded-[8px] border border-line flex items-center gap-3" style={{ background: 'var(--c-card)', padding: '10px 12px' }}>
                  <CpuChipIcon width={18} height={18} style={{ color: 'var(--c-accent)' }} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text truncate" style={{ fontSize: 14 }}>{selectedServer.host} · GPU {selectedServer.gpus.length}장</div>
                    <div className="text-muted truncate" style={{ fontSize: 14 }}>{selectedServer.note}</div>
                  </div>
                  <HealthBadge health={selectedServer.health} />
                </div>
              ) : (
                <p className="text-muted text-center" style={{ fontSize: 14 }}>서버를 선택해주세요.</p>
              )}
            </DrawerSection>
          )}
        </div>

        {pending && (
          <footer className="flex items-center gap-2.5 shrink-0 border-t border-line" style={{ padding: '14px 20px' }}>
            {mode === 'view' && (
              <>
                <DrawerBtn variant="danger" full onClick={() => setMode('reject')}><XCircleIcon width={16} height={16} />반려</DrawerBtn>
                <DrawerBtn variant="primary" full onClick={clickApprove}><CheckCircleIcon width={16} height={16} />승인</DrawerBtn>
              </>
            )}
            {mode === 'reject' && (
              <>
                <DrawerBtn variant="ghost" onClick={() => { setMode('view'); setReason('') }}>취소</DrawerBtn>
                <DrawerBtn variant="danger" full disabled={!reason.trim()} onClick={() => reason.trim() && onReject(reason.trim())}><XCircleIcon width={16} height={16} />반려 확정</DrawerBtn>
              </>
            )}
            {mode === 'approve' && needsServer && (
              <>
                <DrawerBtn variant="ghost" onClick={() => { setMode('view'); setServerId(null) }}>취소</DrawerBtn>
                <DrawerBtn variant="primary" full disabled={!serverId} onClick={() => serverId && onApprove(serverId)}><CheckCircleIcon width={16} height={16} />{approveLabel}</DrawerBtn>
              </>
            )}
          </footer>
        )}
        {!pending && (
          <footer className="flex items-center justify-end shrink-0 border-t border-line" style={{ padding: '14px 20px' }}>
            <DrawerBtn variant="ghost" onClick={onClose}>닫기</DrawerBtn>
          </footer>
        )}
      </aside>
    </div>
  )
}

// 검색·상태·기간 필터 바(GPU=기간 포함 / 게시=기간 생략) — date 슬롯 옵션
function FilterBar({ q, setQ, statusF, setStatusF, dateStart, setDateStart, dateEnd, setDateEnd, withDate, dirty, onApply, onReset, placeholder }: {
  q: string; setQ: (v: string) => void
  statusF: string; setStatusF: (v: string) => void
  dateStart: string; setDateStart: (v: string) => void
  dateEnd: string; setDateEnd: (v: string) => void
  withDate: boolean; dirty: boolean
  onApply: () => void; onReset: () => void; placeholder: string
}) {
  return (
    <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop: 32, padding: '14px 19px' }}>
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

interface GpuRow extends DrawerRow {
  resource: string
  model: string
  serviceName: string
  env: string
  addons: string[]
  reason: string
  date: string
  attachmentName?: string
}

function gpuRow(r: GpuRequest): GpuRow {
  const u = userById(r.requesterUserId)
  const unit = r.capacityUnit === 'card' ? '카드' : '슬라이스'
  return {
    id: r.id,
    requester: u?.name ?? r.requesterUserId,
    team: teamOf(r.requesterUserId),
    email: u?.email ?? '—',
    status: r.status,
    rejectReason: r.rejectReason,
    resource: `${r.capacity} ${unit}`,
    model: r.models.map((m) => modelById(m)?.name ?? m).join(', '),
    serviceName: r.serviceName,
    env: r.env,
    addons: r.addons,
    reason: r.purpose,
    date: r.createdAt,
    attachmentName: r.attachmentUrl ? r.attachmentUrl.split('/').pop() : undefined,
  }
}

const GPU_COLS: Col[] = [
  { key: 'requester', label: '신청자', width: 156 },
  { key: 'resource', label: '자원 / 모델', width: 220 },
  { key: 'reason', label: '요청 사유', width: 280 },
  { key: 'date', label: '신청일', width: 152 },
  { key: 'status', label: '상태', width: 128 },
  { key: 'action', label: '액션', width: 120, align: 'right' },
]

export function ApprovalsGpu() {
  const toast = useToast()
  const mutedFix = useMutedFix()
  const [rows, setRows] = useState<GpuRow[]>(() => gpuRequests.map(gpuRow))
  const [reviewRow, setReviewRow] = useState<GpuRow | null>(null)
  const [processedToday, setProcessedToday] = useState(0)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [applied, setApplied] = useState({ q: '', status: '전체', start: '', end: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows])

  const STAT_CARDS: StatDef[] = [
    { label: '대기', value: counts.pending, desc: '검토 대기 중인 GPU 신청', num: 'var(--c-warn)', box: 'var(--warn-soft)', Icon: ClockIcon },
    { label: '승인', value: counts.approved, desc: '승인 및 서버 할당 완료', num: 'var(--c-ok)', box: 'var(--ok-soft)', Icon: CheckCircleIcon },
    { label: '반려', value: counts.rejected, desc: '반려된 신청 건', num: 'var(--c-danger)', box: 'var(--danger-soft)', Icon: XCircleIcon },
    { label: '오늘 처리', value: processedToday, desc: '이번 세션 검토 처리 건', num: 'var(--c-accent)', box: 'var(--accent-soft)', Icon: BoltIcon },
  ]

  const match = (r: GpuRow) => {
    if (applied.q.trim() && !`${r.requester} ${r.team} ${r.resource} ${r.model} ${r.reason} ${r.serviceName}`.toLowerCase().includes(applied.q.trim().toLowerCase())) return false
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

  const approve = (row: GpuRow, serverId?: string) => {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'approved', serverId } : r)))
    setProcessedToday((n) => n + 1)
    setReviewRow(null)
    const where = serverId ? ` · ${serverById(serverId)?.host} 할당` : ''
    toast.push(`${row.requester}님의 GPU 신청을 승인했어요${where}. 신청자에게 알림이 전송됩니다.`, 'ok')
  }
  const reject = (row: GpuRow, reason: string) => {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'rejected', rejectReason: reason } : r)))
    setProcessedToday((n) => n + 1)
    setReviewRow(null)
    toast.push(`${row.requester}님의 신청을 반려했어요. 사유가 알림으로 전송됩니다.`, 'warn')
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>승인 관리</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>GPU 자원 신청을 검토하고 승인(서버 할당) 또는 반려합니다. 대기 신청을 선택해 상세를 확인하세요.</p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {STAT_CARDS.map((s) => <StatCard key={s.label} s={s} />)}
      </div>

      <FilterBar q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} dateStart={dateStart} setDateStart={setDateStart} dateEnd={dateEnd} setDateEnd={setDateEnd} withDate dirty={dirty} onApply={applyFilters} onReset={resetFilters} placeholder="신청자, 자원, 모델, 사유 검색" />

      <TableCard
        headerLeft={<h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><CpuChipIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />GPU 자원 신청</h2>}
        cols={GPU_COLS}
        rows={pageRows}
        onRowClick={setReviewRow}
        empty={hasFilter ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.' : '대기 중인 GPU 신청이 없어요.'}
        cells={(r) => (
          <>
            <td className="align-middle" style={{ padding: '14px 0', paddingLeft: 24 }}><RequesterCell name={r.requester} team={r.team} /></td>
            <td className="align-middle" style={{ padding: '14px 16px 14px 0' }}>
              <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{r.resource}</div>
              <div className="truncate text-muted" style={{ fontSize: 14 }}>{r.model}</div>
            </td>
            <td className="align-middle text-muted" style={{ fontSize: 14, padding: '14px 16px 14px 0', lineHeight: 1.4 }}><span className="line-clamp-2">{r.reason}</span></td>
            <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '14px 0' }}>{r.date}</td>
            <td className="align-middle" style={{ padding: '14px 0' }}><StatusCell status={r.status} /></td>
            <td className="align-middle" style={{ padding: '14px 0', paddingRight: 24 }}><div className="flex items-center justify-end"><ReviewPill pending={r.status === 'pending'} onClick={(e) => { e.stopPropagation(); setReviewRow(r) }} /></div></td>
          </>
        )}
        footer={
          <Pagination
            label={<>{hasFilter ? `${view.length}건 표시` : `전체 ${rows.length}건`}{view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}</>}
            page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          />
        }
      />

      <ReviewDrawer
        row={reviewRow}
        typeLabel="GPU 승인"
        TypeIcon={CpuChipIcon}
        detail={reviewRow && (
          <>
            <KV k="요청 자원" v={reviewRow.resource} />
            <KV k="모델" v={reviewRow.model} />
            <KV k="서비스명" v={reviewRow.serviceName} />
            <KV k="운영 환경" v={reviewRow.env || '—'} />
            <KV k="부가 옵션" v={reviewRow.addons.length ? reviewRow.addons.join(', ') : '없음'} />
            <KV k="신청일" v={reviewRow.date} />
          </>
        )}
        reasonText={reviewRow?.reason ?? ''}
        attachmentName={reviewRow?.attachmentName}
        needsServer
        approveLabel="승인 · 할당"
        resultExtra={reviewRow?.serverId ? <KV k="할당 서버" v={serverById(reviewRow.serverId)?.host ?? reviewRow.serverId} /> : undefined}
        onClose={() => setReviewRow(null)}
        onApprove={(serverId) => reviewRow && approve(reviewRow, serverId)}
        onReject={(reason) => reviewRow && reject(reviewRow, reason)}
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
  serviceUrl: string
  demoUrl: string
  reason: string
  date: string
}

function pubRow(r: PublishRequest): PubRow {
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
    serviceUrl: r.serviceUrl,
    demoUrl: r.demoUrl,
    reason: `${kind} 서비스를 마켓플레이스에 노출(게시)하기 위한 승인 요청`,
    date: r.createdAt,
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
  const [rows, setRows] = useState<PubRow[]>(() => publishRequests.map(pubRow))
  const [reviewRow, setReviewRow] = useState<PubRow | null>(null)
  const [processedToday, setProcessedToday] = useState(0)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [applied, setApplied] = useState({ q: '', status: '전체' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows])

  const STAT_CARDS: StatDef[] = [
    { label: '대기', value: counts.pending, desc: '게시 검토 대기 중', num: 'var(--c-warn)', box: 'var(--warn-soft)', Icon: ClockIcon },
    { label: '게시 중', value: counts.approved, desc: '마켓 노출 중인 서비스', num: 'var(--c-ok)', box: 'var(--ok-soft)', Icon: GlobeAltIcon },
    { label: '반려', value: counts.rejected, desc: '반려된 게시 신청', num: 'var(--c-danger)', box: 'var(--danger-soft)', Icon: XCircleIcon },
    { label: '오늘 처리', value: processedToday, desc: '이번 세션 검토 처리 건', num: 'var(--c-accent)', box: 'var(--accent-soft)', Icon: BoltIcon },
  ]

  const match = (r: PubRow) => {
    if (applied.q.trim() && !`${r.serviceName} ${r.requester} ${r.team} ${r.kind} ${r.model}`.toLowerCase().includes(applied.q.trim().toLowerCase())) return false
    if (applied.status !== '전체' && r.status !== STATUS_FROM_KO[applied.status]) return false
    return true
  }
  const view = rows.filter(match)
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = applied.q.trim() !== '' || applied.status !== '전체'
  const dirty = q !== applied.q || statusF !== applied.status

  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next = { q, status: statusF }
    setApplied(next)
    const cnt = rows.filter((r) => {
      if (next.q.trim() && !`${r.serviceName} ${r.requester} ${r.team} ${r.kind} ${r.model}`.toLowerCase().includes(next.q.trim().toLowerCase())) return false
      if (next.status !== '전체' && r.status !== STATUS_FROM_KO[next.status]) return false
      return true
    }).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => { setQ(''); setStatusF('전체'); setApplied({ q: '', status: '전체' }) }

  const approve = (row: PubRow) => {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'approved' } : r)))
    setProcessedToday((n) => n + 1)
    setReviewRow(null)
    toast.push(`${row.serviceName} 게시를 승인했어요. 마켓플레이스에 노출됩니다.`, 'ok')
  }
  const reject = (row: PubRow, reason: string) => {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'rejected', rejectReason: reason } : r)))
    setProcessedToday((n) => n + 1)
    setReviewRow(null)
    toast.push(`${row.serviceName} 게시를 반려했어요. 사유가 알림으로 전송됩니다.`, 'warn')
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>게시 승인 관리</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>마켓플레이스에 노출(게시)될 서비스 신청을 검토하고 승인 또는 반려합니다.</p>
      </header>

      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {STAT_CARDS.map((s) => <StatCard key={s.label} s={s} />)}
      </div>

      <FilterBar q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} dateStart="" setDateStart={() => {}} dateEnd="" setDateEnd={() => {}} withDate={false} dirty={dirty} onApply={applyFilters} onReset={resetFilters} placeholder="서비스명, 신청자, 모델 검색" />

      <TableCard
        headerLeft={<h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><MegaphoneIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />마켓 게시 신청</h2>}
        cols={PUB_COLS}
        rows={pageRows}
        onRowClick={setReviewRow}
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
            <td className="align-middle" style={{ padding: '14px 0', paddingRight: 24 }}><div className="flex items-center justify-end"><ReviewPill pending={r.status === 'pending'} onClick={(e) => { e.stopPropagation(); setReviewRow(r) }} /></div></td>
          </>
        )}
        footer={
          <Pagination
            label={<>{hasFilter ? `${view.length}건 표시` : `전체 ${rows.length}건`}{view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}</>}
            page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}
          />
        }
      />

      <ReviewDrawer
        row={reviewRow}
        typeLabel="게시 승인"
        TypeIcon={MegaphoneIcon}
        detail={reviewRow && (
          <>
            <KV k="서비스명" v={reviewRow.serviceName} />
            <KV k="종류 / 모델" v={`${reviewRow.kind} · ${reviewRow.model}`} />
            <KV k="API 제공" v={reviewRow.hasApi ? '예' : '아니오 (웹 UI)'} />
            <KV k="태그" v={reviewRow.tags.length ? reviewRow.tags.join(', ') : '—'} />
            <KV k="누적 호출" v={reviewRow.usage ? `${reviewRow.usage.toLocaleString('en-US')}회` : '신규'} />
            <KV k="서비스 URL" v={<span style={{ color: 'var(--c-accent)' }}>{reviewRow.serviceUrl}</span>} />
            <KV k="데모 URL" v={<span style={{ color: 'var(--c-accent)' }}>{reviewRow.demoUrl}</span>} />
            <KV k="신청일" v={reviewRow.date} />
          </>
        )}
        reasonText={reviewRow?.reason ?? ''}
        needsServer={false}
        approveLabel="승인 · 게시"
        resultExtra={<KV k="게시" v="마켓플레이스 노출 완료" />}
        onClose={() => setReviewRow(null)}
        onApprove={() => reviewRow && approve(reviewRow)}
        onReject={(reason) => reviewRow && reject(reviewRow, reason)}
      />
    </div>
  )
}

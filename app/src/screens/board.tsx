import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowPathIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PencilSquareIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid'
import { Modal, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import {
  FieldBox,
  FilterSelect,
  Pagination,
  RequesterCell,
  teamOf,
  useMutedFix,
} from './approvals'
import {
  type BoardCategory,
  type BoardPost,
  type ManualTag,
  type NoticeTag,
  type QnaTopic,
  MANUAL_TAGS,
  NOTICE_TAGS,
  QNA_TOPIC_META,
  answerStateOf,
  authorName,
  createPost,
  getPosts,
} from './board-store'

// ⑥ 게시판 · 공지 (4.23)
// 탭[공지 / 문의·Q&A / 매뉴얼] · 글쓰기 · 답변됨 배지 · 상세 모달.
// 사용자(B=C): 공지·매뉴얼 열람 + 문의 작성/확인. 관리자(A): 공지·매뉴얼 작성 + 문의 답변.
// 디자인 정합 = 4.10/4.11 승인·변경 화면(헤더 → 컨텍스트 → 검색·필터 → 테이블 카드 → 페이지네이션).

type TabKey = BoardCategory

const TABS: { key: TabKey; label: string; Icon: typeof MegaphoneIcon }[] = [
  { key: 'notice', label: '공지사항', Icon: MegaphoneIcon },
  { key: 'qna', label: '문의 · Q&A', Icon: ChatBubbleLeftRightIcon },
  { key: 'manual', label: '매뉴얼', Icon: BookOpenIcon },
]

const NOTICE_TAG_TONE: Record<NoticeTag, { bg: string; fg: string }> = {
  일반: { bg: 'var(--c-soft)', fg: 'var(--c-muted)' },
  점검: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  정책: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  긴급: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}
const TOPIC_TONE: Record<QnaTopic, { bg: string; fg: string }> = {
  general: { bg: 'var(--c-soft)', fg: 'var(--c-muted)' },
  model: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  tech: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  account: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
}

// 'YYYY-MM-DD HH:mm' → 'YYYY-MM-DD' (목록은 날짜만)
const dateOnly = (s: string) => s.slice(0, 10)

// ──────────────────────────── 작은 프리미티브 ────────────────────────────

function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg, padding: '3px 10px', fontSize: 13, lineHeight: 1.35 }}>
      {children}
    </span>
  )
}

function AnswerBadge({ answered }: { answered: boolean }) {
  return answered ? (
    <span className="inline-flex items-center gap-1 rounded-[7px] font-semibold whitespace-nowrap" style={{ background: 'var(--ok-soft)', color: 'var(--c-ok)', padding: '3px 10px', fontSize: 13, lineHeight: 1.35 }}>
      <CheckCircleIcon style={{ width: 13, height: 13 }} />답변 완료
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-[7px] font-semibold whitespace-nowrap" style={{ background: 'var(--warn-soft)', color: 'var(--c-warn)', padding: '3px 10px', fontSize: 13, lineHeight: 1.35 }}>
      <ClockIcon style={{ width: 13, height: 13 }} />답변 대기
    </span>
  )
}

function ActionPill({ label, Icon, accent, onClick }: { label: string; Icon: typeof EyeIcon; accent?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ fontSize: 14, padding: '5px 11px', background: accent ? 'var(--accent-soft)' : 'var(--c-soft)', color: accent ? 'var(--c-accent)' : 'var(--c-muted)' }}>
      <Icon style={{ width: 14, height: 14, opacity: 0.9 }} />{label}
    </button>
  )
}

// ──────────────────────────── 테이블 카드(보드 전용) ────────────────────────────

interface Col { key: string; label: string; width: number; align?: 'center' | 'right' }

function BoardTable({ headerLeft, cols, rows, renderRow, empty, footer }: {
  headerLeft: ReactNode
  cols: Col[]
  rows: BoardPost[]
  renderRow: (p: BoardPost) => ReactNode
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
            {rows.map(renderRow)}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  )
}

function Row({ post, pinned, onOpen, children }: { post: BoardPost; pinned?: boolean; onOpen: (p: BoardPost) => void; children: ReactNode }) {
  return (
    <tr
      key={post.id}
      className="cursor-pointer"
      onClick={() => onOpen(post)}
      style={{ borderBottom: '1px solid var(--c-border-s)', background: pinned ? 'var(--c-soft)' : 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = pinned ? 'var(--c-soft)' : 'transparent')}
    >
      {children}
    </tr>
  )
}

// ──────────────────────────── 글쓰기 모달 ────────────────────────────

function WriteModal({ open, category, onClose, onSubmit }: {
  open: boolean
  category: BoardCategory
  onClose: () => void
  onSubmit: (v: { title: string; body: string; noticeTag?: NoticeTag; pinned?: boolean; topic?: QnaTopic; manualTag?: ManualTag }) => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [noticeTag, setNoticeTag] = useState<NoticeTag>('일반')
  const [pinned, setPinned] = useState(false)
  const [topic, setTopic] = useState<QnaTopic>('general')
  const [manualTag, setManualTag] = useState<ManualTag>('시작하기')

  // 열릴 때마다 초기화
  useEffect(() => {
    if (open) { setTitle(''); setBody(''); setNoticeTag('일반'); setPinned(false); setTopic('general'); setManualTag('시작하기') }
  }, [open, category])

  const heading = category === 'notice' ? '공지 작성' : category === 'qna' ? '문의 작성' : '매뉴얼 등록'
  const placeholder = category === 'notice' ? '공지 제목을 입력하세요' : category === 'qna' ? '문의 제목을 입력하세요' : '매뉴얼 제목을 입력하세요'
  const bodyPlaceholder = category === 'qna' ? '문의 내용을 구체적으로 작성해 주세요. 관련 신청 ID·환경 정보를 함께 적어주시면 빠른 답변에 도움이 됩니다.' : '내용을 입력하세요'
  const valid = title.trim().length > 0 && body.trim().length > 0

  const labelCls = 'block text-muted font-medium'
  const labelStyle = { fontSize: 13, marginBottom: 6 } as const
  const inputStyle = { height: 38, padding: '0 13px', fontSize: 14 } as const

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={<span className="flex items-center gap-2"><PencilSquareIcon style={{ width: 16, height: 16, color: 'var(--c-accent)' }} />{heading}</span>}
      footer={
        <>
          <button type="button" onClick={onClose} className="bg-card2 border border-line rounded-[8px] font-medium text-text transition-[background-color,transform] hover:bg-soft active:scale-[0.97]" style={{ height: 36, padding: '0 16px', fontSize: 14 }}>취소</button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit({ title, body, noticeTag, pinned, topic, manualTag })}
            className="rounded-[8px] text-onaccent btn-sweep font-semibold transition-[filter,transform] hover:enabled:brightness-105 active:enabled:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ height: 36, padding: '0 18px', fontSize: 14, background: 'var(--c-accent)' }}
          >
            {category === 'qna' ? '문의 등록' : '등록'}
          </button>
        </>
      }
    >
      <div className="flex flex-col" style={{ gap: 16 }}>
        {/* 카테고리별 메타 */}
        {category === 'notice' && (
          <div className="flex items-end" style={{ gap: 14 }}>
            <div className="flex-1 min-w-0">
              <label className={labelCls} style={labelStyle}>말머리</label>
              <SelectBox value={noticeTag} onChange={(v) => setNoticeTag(v as NoticeTag)} options={[...NOTICE_TAGS]} />
            </div>
            <label className="flex items-center gap-2 select-none cursor-pointer" style={{ height: 38, paddingLeft: 2 }}>
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="cursor-pointer" style={{ width: 16, height: 16, accentColor: 'var(--c-accent)' }} />
              <span className="text-text font-medium" style={{ fontSize: 14 }}>상단 고정</span>
            </label>
          </div>
        )}
        {category === 'qna' && (
          <div>
            <label className={labelCls} style={labelStyle}>분류</label>
            <SelectBox value={topic} onChange={(v) => setTopic(v as QnaTopic)} options={(Object.keys(QNA_TOPIC_META) as QnaTopic[]).map((k) => k)} render={(k) => QNA_TOPIC_META[k as QnaTopic].label} />
          </div>
        )}
        {category === 'manual' && (
          <div>
            <label className={labelCls} style={labelStyle}>분류</label>
            <SelectBox value={manualTag} onChange={(v) => setManualTag(v as ManualTag)} options={[...MANUAL_TAGS]} />
          </div>
        )}

        <div>
          <label className={labelCls} style={labelStyle}>제목</label>
          <FieldBox><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} className="bg-transparent w-full text-text" style={{ ...inputStyle, padding: 0, height: '100%', outline: 'none', border: 'none' }} /></FieldBox>
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>내용</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={bodyPlaceholder} className="bg-card2 border border-line rounded-[8px] w-full text-text resize-none transition-[border-color,box-shadow] focus:border-[color:var(--c-accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ minHeight: 150, padding: '11px 13px', fontSize: 14, lineHeight: 1.55, outline: 'none' }} />
        </div>
      </div>
    </Modal>
  )
}

// 모달 전용 셀렉트(FilterSelect 톤, label 없이 풀폭)
function SelectBox({ value, onChange, options, render }: { value: string; onChange: (v: string) => void; options: string[]; render?: (v: string) => string }) {
  return (
    <div className="relative flex items-center bg-card2 border border-line rounded-[8px] gap-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 38, padding: '0 13px' }}>
      <span className="text-text font-medium pointer-events-none truncate" style={{ fontSize: 14 }}>{render ? render(value) : value}</span>
      <ChevronDownIcon className="shrink-0 pointer-events-none ml-auto" style={{ width: 15, height: 15, color: 'var(--c-muted)' }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ fontSize: 14 }}>
        {options.map((o) => <option key={o} value={o}>{render ? render(o) : o}</option>)}
      </select>
    </div>
  )
}

// ──────────────────────────── 컨텍스트 스트립(탭별) ────────────────────────────

function StatChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col justify-center shrink-0" style={{ gap: 2 }}>
      <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.25 }}>{label}</span>
      <span className="font-bold" style={{ fontSize: 20, letterSpacing: '-0.3px', lineHeight: 1.1, color: tone }}>{value}<span className="text-muted font-medium" style={{ fontSize: 13, marginLeft: 4 }}>건</span></span>
    </div>
  )
}

function ContextStrip({ tab, posts, myPending }: { tab: TabKey; posts: BoardPost[]; myPending: number }) {
  const divider = <span className="shrink-0" style={{ width: 1, height: 34, background: 'var(--c-border)' }} />

  if (tab === 'qna') {
    const pending = posts.filter((p) => answerStateOf(p) === 'pending').length
    const answered = posts.length - pending
    return (
      <section className="bg-card2 border border-line rounded-[14px] shrink-0 flex items-center" style={{ height: 64, marginTop: 18, padding: '0 20px', gap: 22, boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center shrink-0" style={{ gap: 12 }}>
          <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}><ChatBubbleLeftRightIcon width={20} height={20} /></span>
          <div className="flex flex-col" style={{ gap: 1 }}>
            <span className="font-bold text-text" style={{ fontSize: 14.5, lineHeight: 1.25 }}>문의 현황</span>
            <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.25 }}>모델 도입·기술·계정 문의와 답변 상태</span>
          </div>
        </div>
        {divider}
        <div className="flex items-center" style={{ gap: 22 }}>
          <StatChip label="답변 대기" value={pending} tone="var(--c-warn)" />
          {divider}
          <StatChip label="답변 완료" value={answered} tone="var(--c-ok)" />
          {divider}
          <StatChip label="내 문의" value={myPending} tone="var(--c-text)" />
        </div>
      </section>
    )
  }

  // 공지 — 최신 고정 공지 강조
  if (tab === 'notice') {
    const top = posts.find((p) => p.pinned) ?? posts[0]
    if (!top) return null
    return (
      <section className="bg-card2 border border-line rounded-[14px] shrink-0 flex items-center" style={{ height: 64, marginTop: 18, padding: '0 20px', gap: 14, boxShadow: 'var(--shadow-card)' }}>
        <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 38, height: 38, background: top.noticeTag ? NOTICE_TAG_TONE[top.noticeTag].bg : 'var(--accent-soft)', color: top.noticeTag ? NOTICE_TAG_TONE[top.noticeTag].fg : 'var(--c-accent)' }}>
          <MapPinSolid width={18} height={18} />
        </span>
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.2 }}>고정 공지</span>
          <span className="font-bold text-text truncate" style={{ fontSize: 14.5, lineHeight: 1.25 }}>{top.title}</span>
        </div>
        <span className="ml-auto shrink-0 text-muted" style={{ fontSize: 13 }}>{dateOnly(top.createdAt)}</span>
      </section>
    )
  }

  return null
}

// ──────────────────────────── 메인 ────────────────────────────

const NOTICE_COLS: Col[] = [
  { key: 'title', label: '제목', width: 560 },
  { key: 'author', label: '작성자', width: 170 },
  { key: 'date', label: '작성일', width: 130 },
  { key: 'views', label: '조회', width: 90, align: 'right' },
]
const QNA_COLS: Col[] = [
  { key: 'title', label: '제목', width: 420 },
  { key: 'author', label: '작성자', width: 160 },
  { key: 'topic', label: '분류', width: 110 },
  { key: 'date', label: '작성일', width: 124 },
  { key: 'status', label: '상태', width: 116 },
  { key: 'action', label: '', width: 96, align: 'right' },
]
const MANUAL_COLS: Col[] = [
  { key: 'title', label: '문서', width: 480 },
  { key: 'tag', label: '분류', width: 150 },
  { key: 'updated', label: '업데이트', width: 140 },
  { key: 'views', label: '조회', width: 90, align: 'right' },
]

export function Board() {
  const { user, isAdmin } = useRole()
  const toast = useToast()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()

  const [tab, setTab] = useState<TabKey>('notice')
  const [bump, setBump] = useState(0) // store 변경 후 재계산 트리거
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('전체') // 카테고리(말머리/분류) 필터
  const [statusF, setStatusF] = useState('전체') // qna 답변 상태
  const [applied, setApplied] = useState({ q: '', cat: '전체', status: '전체' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [writeOpen, setWriteOpen] = useState(false)

  // 탭 전환 시 필터·페이지 초기화
  useEffect(() => { setQ(''); setCat('전체'); setStatusF('전체'); setApplied({ q: '', cat: '전체', status: '전체' }); setPage(1) }, [tab])
  useEffect(() => { setPage(1) }, [applied, pageSize])

  // getPosts는 가변 모듈 상태를 읽음 — bump 증가 시 재렌더로 재계산(useMemo 부적합)
  void bump
  const posts = getPosts(tab)
  const myPending = getPosts('qna').filter((p) => p.authorUserId === user.id).length

  // 필터 옵션(탭별)
  const catOptions = tab === 'notice' ? ['전체', ...NOTICE_TAGS]
    : tab === 'qna' ? ['전체', ...(Object.keys(QNA_TOPIC_META) as QnaTopic[]).map((k) => QNA_TOPIC_META[k].label)]
    : ['전체', ...MANUAL_TAGS]

  const catMatch = (p: BoardPost, val: string) => {
    if (val === '전체') return true
    if (tab === 'notice') return p.noticeTag === val
    if (tab === 'qna') return p.topic ? QNA_TOPIC_META[p.topic].label === val : false
    return p.manualTag === val
  }

  const match = (p: BoardPost, f: { q: string; cat: string; status: string }) => {
    if (f.q.trim() && !`${p.title} ${p.body} ${authorName(p.authorUserId)}`.toLowerCase().includes(f.q.trim().toLowerCase())) return false
    if (!catMatch(p, f.cat)) return false
    if (tab === 'qna' && f.status !== '전체') {
      const want = f.status === '답변 완료' ? 'answered' : 'pending'
      if (answerStateOf(p) !== want) return false
    }
    return true
  }

  // 정렬 — 공지: 고정 우선 + 최신. qna: 대기 우선 + 최신. manual: 업데이트 최신.
  const sorted = [...posts].sort((a, b) => {
    if (tab === 'notice') return Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt)
    if (tab === 'qna') return (answerStateOf(a) === 'pending' ? 0 : 1) - (answerStateOf(b) === 'pending' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)
    return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
  })
  const view = sorted.filter((p) => match(p, applied))
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)
  const hasFilter = applied.q.trim() !== '' || applied.cat !== '전체' || applied.status !== '전체'
  const dirty = q !== applied.q || cat !== applied.cat || statusF !== applied.status

  const applyFilters = () => {
    const next = { q, cat, status: statusF }
    setApplied(next)
    const cnt = sorted.filter((p) => match(p, next)).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => { setQ(''); setCat('전체'); setStatusF('전체'); setApplied({ q: '', cat: '전체', status: '전체' }) }

  const openDetail = (p: BoardPost) => navigate(`/board/${p.id}`)

  const submitWrite = (v: { title: string; body: string; noticeTag?: NoticeTag; pinned?: boolean; topic?: QnaTopic; manualTag?: ManualTag }) => {
    createPost({ category: tab, title: v.title, body: v.body, authorUserId: user.id, noticeTag: v.noticeTag, pinned: v.pinned, topic: v.topic, manualTag: v.manualTag })
    setWriteOpen(false)
    setBump((n) => n + 1)
    toast.push(tab === 'qna' ? '문의를 등록했어요.' : tab === 'notice' ? '공지를 등록했어요.' : '매뉴얼을 등록했어요.', 'info')
  }

  // 글쓰기 권한 — 공지·매뉴얼=관리자, 문의=전원
  const canWrite = tab === 'qna' || isAdmin
  const writeLabel = tab === 'notice' ? '공지 작성' : tab === 'qna' ? '문의하기' : '매뉴얼 등록'

  const headerIcon = TABS.find((t) => t.key === tab)!.Icon
  const HeaderIcon = headerIcon

  return (
    <div data-board className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`
        [data-board]{user-select:none;-webkit-user-select:none}
        [data-board] button:not(:disabled),[data-board] a,[data-board] select,[data-board] label,[data-board] tr.cursor-pointer{cursor:pointer}
        [data-board] button:disabled{cursor:not-allowed}
        [data-board] input,[data-board] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      `}</style>

      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>게시판 · 공지</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          {isAdmin
            ? '공지·매뉴얼을 작성·관리하고 사용자 문의에 답변합니다.'
            : '공지와 매뉴얼을 확인하고, 자원·모델 도입 등 문의를 남길 수 있습니다.'}
        </p>
      </header>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-line shrink-0" style={{ marginTop: 22 }}>
        {TABS.map((t) => {
          const on = t.key === tab
          const Icon = t.Icon
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className="flex items-center gap-2 font-semibold transition-colors" style={{ padding: '10px 16px', fontSize: 14, color: on ? 'var(--c-text)' : 'var(--c-muted)', borderBottom: `2px solid ${on ? 'var(--c-accent)' : 'transparent'}`, marginBottom: -1 }}>
              <Icon style={{ width: 16, height: 16, color: on ? 'var(--c-accent)' : 'var(--c-muted)' }} />{t.label}
            </button>
          )
        })}
      </div>

      <ContextStrip tab={tab} posts={posts} myPending={myPending} />

      {/* 검색 및 필터 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ marginTop: 18, padding: '14px 19px' }}>
        <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <FieldBox className="gap-2" style={{ width: 308 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }} className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} placeholder={tab === 'manual' ? '문서 제목, 내용 검색' : '제목, 내용, 작성자 검색'} />
              <button type="button" onClick={applyFilters} aria-label="검색" className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-soft active:scale-90" style={{ width: 24, height: 24, color: 'var(--c-muted)', margin: '0 -5px 0 0' }}>
                <MagnifyingGlassIcon style={{ width: 17, height: 17 }} />
              </button>
            </FieldBox>
            <FilterSelect label={tab === 'qna' ? '분류' : tab === 'notice' ? '말머리' : '분류'} value={cat} onChange={setCat} options={catOptions} width={178} />
            {tab === 'qna' && <FilterSelect label="상태" value={statusF} onChange={setStatusF} options={['전체', '답변 완료', '답변 대기']} width={178} />}
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

      <BoardTable
        headerLeft={
          <div className="flex items-center justify-between w-full gap-3">
            <h2 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 16 }}><HeaderIcon style={{ width: 18, height: 18, color: 'var(--c-accent)' }} />{TABS.find((t) => t.key === tab)!.label}</h2>
            {canWrite && (
              <button type="button" onClick={() => setWriteOpen(true)} className="inline-flex items-center gap-1.5 rounded-[9px] text-onaccent btn-sweep font-semibold transition-transform duration-100 hover:brightness-105 active:scale-[0.97]" style={{ height: 38, padding: '0 15px', fontSize: 14, background: 'var(--c-accent)' }}>
                <PlusIcon style={{ width: 16, height: 16 }} />{writeLabel}
              </button>
            )}
          </div>
        }
        cols={tab === 'notice' ? NOTICE_COLS : tab === 'qna' ? QNA_COLS : MANUAL_COLS}
        rows={pageRows}
        empty={hasFilter ? '검색 결과가 없어요. 검색어나 필터를 조정해보세요.' : tab === 'qna' ? '등록된 문의가 없어요. 첫 문의를 남겨보세요.' : tab === 'notice' ? '등록된 공지가 없어요.' : '등록된 매뉴얼이 없어요.'}
        renderRow={(p) => (
          <Row key={p.id} post={p} pinned={tab === 'notice' && p.pinned} onOpen={openDetail}>
            {tab === 'notice' && (
              <>
                <td className="align-middle" style={{ padding: '15px 16px 15px 24px' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {p.pinned && <MapPinSolid style={{ width: 14, height: 14, color: 'var(--c-danger)', flexShrink: 0 }} />}
                    {p.noticeTag && <Pill bg={NOTICE_TAG_TONE[p.noticeTag].bg} fg={NOTICE_TAG_TONE[p.noticeTag].fg}>{p.noticeTag}</Pill>}
                    <span className="truncate text-text font-medium" style={{ fontSize: 14 }}>{p.title}</span>
                  </div>
                </td>
                <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}><RequesterCell name={authorName(p.authorUserId)} team={teamOf(p.authorUserId)} /></td>
                <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>{dateOnly(p.createdAt)}</td>
                <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 24px 15px 0', textAlign: 'right' }}>{p.views.toLocaleString()}</td>
              </>
            )}
            {tab === 'qna' && (
              <>
                <td className="align-middle" style={{ padding: '15px 16px 15px 24px' }}>
                  <span className="truncate text-text font-medium block" style={{ fontSize: 14 }}>{p.title}</span>
                </td>
                <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}><RequesterCell name={authorName(p.authorUserId)} team={teamOf(p.authorUserId)} /></td>
                <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}>{p.topic && <Pill bg={TOPIC_TONE[p.topic].bg} fg={TOPIC_TONE[p.topic].fg}>{QNA_TOPIC_META[p.topic].label}</Pill>}</td>
                <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0' }}>{dateOnly(p.createdAt)}</td>
                <td className="align-middle" style={{ padding: '15px 0' }}><AnswerBadge answered={answerStateOf(p) === 'answered'} /></td>
                <td className="align-middle" style={{ padding: '15px 24px 15px 0', textAlign: 'right' }}>
                  <div className="flex items-center justify-end">
                    {isAdmin && answerStateOf(p) === 'pending'
                      ? <ActionPill label="답변" Icon={PencilSquareIcon} accent onClick={(e) => { e.stopPropagation(); openDetail(p) }} />
                      : <ActionPill label="상세" Icon={EyeIcon} onClick={(e) => { e.stopPropagation(); openDetail(p) }} />}
                  </div>
                </td>
              </>
            )}
            {tab === 'manual' && (
              <>
                <td className="align-middle" style={{ padding: '15px 16px 15px 24px' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}><BookOpenIcon style={{ width: 17, height: 17 }} /></span>
                    <div className="min-w-0">
                      <div className="truncate text-text font-medium" style={{ fontSize: 14 }}>{p.title}</div>
                      <div className="truncate text-muted" style={{ fontSize: 14 }}>{p.body}</div>
                    </div>
                  </div>
                </td>
                <td className="align-middle" style={{ padding: '15px 16px 15px 0' }}>{p.manualTag && <Pill bg="var(--accent-soft)" fg="var(--c-accent)">{p.manualTag}</Pill>}</td>
                <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0' }}>{dateOnly(p.updatedAt ?? p.createdAt)}</td>
                <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 24px 15px 0', textAlign: 'right' }}>{p.views.toLocaleString()}</td>
              </>
            )}
          </Row>
        )}
        footer={<Pagination label={<>전체 {view.length}건{view.length > 0 && <> · {(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, view.length)}</>}</>} page={curPage} pageCount={pageCount} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} />}
      />

      <WriteModal open={writeOpen} category={tab} onClose={() => setWriteOpen(false)} onSubmit={submitWrite} />
    </div>
  )
}

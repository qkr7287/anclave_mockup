import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  ListBulletIcon,
  MegaphoneIcon,
  PaperClipIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid'
import { Button, EmptyState, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { teamOf, useMutedFix } from './approvals'
import {
  type BoardCategory,
  type BoardPost,
  type NoticeTag,
  type QnaTopic,
  QNA_TOPIC_META,
  answerPost,
  answerStateOf,
  authorName,
  getPostById,
  sortedPosts,
  viewPost,
} from './board-store'

// 4.23a 게시글 상세 — 2단 고정 프레임(가용 영역 꽉 채움, 크기 불변).
//   좌: 글 본문(헤더 + 스크롤 본문 + 첨부 + 답변).  우: 게시글 정보 + 같은 게시판 글 목록(현재 글 강조).
//   풀블리드 밴드 · 디자인 토큰(다크/라이트) · 폰트 14px floor.

const SIDEBAR_W = 324
const PAD_X = 34

const CAT_META: Record<BoardCategory, { label: string; Icon: typeof MegaphoneIcon; listLabel: string }> = {
  notice: { label: '공지사항', Icon: MegaphoneIcon, listLabel: '공지 목록' },
  qna: { label: '문의 · Q&A', Icon: ChatBubbleLeftRightIcon, listLabel: '문의 목록' },
  manual: { label: '매뉴얼', Icon: BookOpenIcon, listLabel: '매뉴얼 목록' },
}

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

const dateOnly = (s: string) => s.slice(0, 10)

function Pill({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] font-semibold whitespace-nowrap" style={{ background: bg, color: fg, padding: '4px 12px', fontSize: 14, lineHeight: 1.3 }}>
      {children}
    </span>
  )
}

function AnswerBadge({ answered }: { answered: boolean }) {
  return answered ? (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] font-semibold whitespace-nowrap" style={{ background: 'var(--ok-soft)', color: 'var(--c-ok)', padding: '4px 11px', fontSize: 14, lineHeight: 1.3 }}>
      <CheckCircleIcon style={{ width: 15, height: 15 }} />답변 완료
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] font-semibold whitespace-nowrap" style={{ background: 'var(--warn-soft)', color: 'var(--c-warn)', padding: '4px 11px', fontSize: 14, lineHeight: 1.3 }}>
      <ClockIcon style={{ width: 15, height: 15 }} />답변 대기
    </span>
  )
}

function Avatar({ userId, size }: { userId: string; size: number }) {
  return (
    <span className="flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: Math.round(size / 3.2), background: 'var(--accent-soft)', color: 'var(--c-accent)', fontSize: 14, fontWeight: 700 }}>
      {authorName(userId).slice(0, 1)}
    </span>
  )
}

// 사이드바 정보 행(라벨/값)
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ minHeight: 30 }}>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-text font-medium text-right min-w-0 truncate" style={{ fontSize: 14 }}>{children}</span>
    </div>
  )
}

// 같은 게시판 글 목록 행
function ListItem({ post, active, onGo, refEl }: { post: BoardPost; active: boolean; onGo: (id: string) => void; refEl?: (el: HTMLButtonElement | null) => void }) {
  const pinned = post.category === 'notice' && post.pinned
  return (
    <button
      ref={refEl}
      type="button"
      onClick={() => onGo(post.id)}
      className="flex flex-col w-full text-left transition-colors"
      style={{ padding: '11px 16px', gap: 4, borderLeft: `3px solid ${active ? 'var(--c-accent)' : 'transparent'}`, background: active ? 'var(--accent-soft)' : 'transparent' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--c-soft)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {pinned && <MapPinSolid style={{ width: 12, height: 12, color: 'var(--c-danger)', flexShrink: 0 }} />}
        <span className="truncate" style={{ fontSize: 14, lineHeight: 1.35, color: active ? 'var(--c-accent)' : 'var(--c-text)', fontWeight: active ? 700 : 500 }}>{post.title}</span>
      </span>
      <span className="flex items-center text-muted" style={{ fontSize: 14, gap: 10 }}>
        <span>{dateOnly(post.updatedAt ?? post.createdAt)}</span>
        <span className="flex items-center gap-1"><EyeIcon style={{ width: 13, height: 13 }} />{post.views.toLocaleString()}</span>
        {post.category === 'qna' && (
          <span className="ml-auto font-semibold" style={{ color: answerStateOf(post) === 'answered' ? 'var(--c-ok)' : 'var(--c-warn)' }}>
            {answerStateOf(post) === 'answered' ? '답변완료' : '대기'}
          </span>
        )}
      </span>
    </button>
  )
}

export function BoardDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { isAdmin } = useRole()
  const mutedFix = useMutedFix()

  const [bump, setBump] = useState(0)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  // 조회수 +1 — StrictMode 이중 실행 가드(글 단위 1회). id 바뀌면 다시 카운트.
  const counted = useRef<string | null>(null)
  useEffect(() => {
    if (id && counted.current !== id) {
      counted.current = id
      viewPost(id)
      setBump((n) => n + 1)
    }
  }, [id])

  // id 변경 시: 답변 편집 초기화 + 본문 스크롤 최상단 + 목록의 현재 글로 스크롤
  const bodyRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    setEditing(false); setDraft('')
    bodyRef.current?.scrollTo({ top: 0 })
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [id])

  void bump
  const post: BoardPost | undefined = getPostById(id)

  if (!post) {
    return (
      <div className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <EmptyState title="게시글을 찾을 수 없어요" description="삭제되었거나 주소가 잘못된 글이에요." cta={<Button onClick={() => navigate('/board')}>게시판으로</Button>} />
      </div>
    )
  }

  const cat = CAT_META[post.category]
  const CatIcon = cat.Icon
  const isQna = post.category === 'qna'
  const answered = answerStateOf(post) === 'answered'
  const siblings = sortedPosts(post.category)

  const catBadge =
    post.category === 'notice' && post.noticeTag ? <Pill bg={NOTICE_TAG_TONE[post.noticeTag].bg} fg={NOTICE_TAG_TONE[post.noticeTag].fg}>{post.noticeTag}</Pill>
    : isQna && post.topic ? <Pill bg={TOPIC_TONE[post.topic].bg} fg={TOPIC_TONE[post.topic].fg}>{QNA_TOPIC_META[post.topic].label}</Pill>
    : post.category === 'manual' && post.manualTag ? <Pill bg="var(--accent-soft)" fg="var(--c-accent)">{post.manualTag}</Pill>
    : null

  const goPost = (pid: string) => navigate(`/board/${pid}`)

  const submitAnswer = () => {
    if (!draft.trim()) return
    answerPost(post.id, draft, 'u-admin')
    toast.push(answered ? '답변을 수정했어요.' : '답변을 등록했어요.', 'info')
    setEditing(false); setDraft('')
    setBump((n) => n + 1)
  }
  const startEdit = () => { setDraft(post.answer?.body ?? ''); setEditing(true) }

  return (
    <div data-board className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`
        [data-board]{user-select:none;-webkit-user-select:none}
        [data-board] button:not(:disabled),[data-board] a{cursor:pointer}
        [data-board] button:disabled{cursor:not-allowed}
        [data-board] input,[data-board] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      `}</style>

      {/* 툴바 */}
      <header className="flex items-center justify-between shrink-0" style={{ gap: 12, marginBottom: 18 }}>
        <div className="flex items-center min-w-0" style={{ gap: 12 }}>
          <button type="button" onClick={() => navigate('/board')} aria-label="뒤로 가기" className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90" style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}>
            <ArrowLeftIcon style={{ width: 18, height: 18 }} />
          </button>
          <h1 className="font-bold text-text flex items-center gap-2" style={{ fontSize: 21, lineHeight: 1.2 }}>
            <CatIcon style={{ width: 19, height: 19, color: 'var(--c-accent)' }} />{cat.label}
          </h1>
        </div>
        <button type="button" onClick={() => navigate('/board')} className="inline-flex items-center gap-1.5 bg-card2 border border-line rounded-[9px] font-medium text-text transition-[background-color,transform] duration-100 hover:bg-soft active:scale-[0.97]" style={{ height: 38, padding: '0 15px', fontSize: 14 }}>
          <ListBulletIcon style={{ width: 16, height: 16, color: 'var(--c-muted)' }} />목록
        </button>
      </header>

      {/* 2단 — 가용 영역 꽉 채움(flex-1) */}
      <div className="flex-1 min-h-0 flex" style={{ gap: 18 }}>
        {/* 좌: 글 본문 */}
        <article className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-w-0" style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* 헤더 — 제목 */}
          <div className="shrink-0" style={{ padding: `26px ${PAD_X}px 0` }}>
            <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
              {post.category === 'notice' && post.pinned && (
                <span className="inline-flex items-center gap-1 rounded-[7px] font-semibold" style={{ background: 'var(--danger-soft)', color: 'var(--c-danger)', padding: '4px 10px', fontSize: 14 }}>
                  <MapPinSolid style={{ width: 13, height: 13 }} />고정
                </span>
              )}
              {catBadge}
            </div>
            <h2 className="font-bold text-text" style={{ fontSize: 26, lineHeight: 1.32, marginTop: 13, letterSpacing: '-0.4px' }}>{post.title}</h2>
          </div>
          {/* 메타 밴드 */}
          <div className="shrink-0 flex items-center justify-between flex-wrap" style={{ gap: 12, marginTop: 18, padding: `13px ${PAD_X}px`, borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', background: 'var(--c-card)' }}>
            <div className="flex items-center" style={{ gap: 11 }}>
              <Avatar userId={post.authorUserId} size={34} />
              <div className="flex flex-col" style={{ gap: 2 }}>
                <span className="text-text font-semibold" style={{ fontSize: 14, lineHeight: 1.2 }}>{authorName(post.authorUserId)}</span>
                <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>{teamOf(post.authorUserId)}</span>
              </div>
            </div>
            <div className="flex items-center flex-wrap text-muted" style={{ gap: 18, fontSize: 14 }}>
              <span className="flex items-center gap-1.5"><ClockIcon style={{ width: 15, height: 15 }} />{post.createdAt}</span>
              <span className="flex items-center gap-1.5"><EyeIcon style={{ width: 15, height: 15 }} />조회 {post.views.toLocaleString()}</span>
            </div>
          </div>

          {/* 본문 — 내부 스크롤 */}
          <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto" style={{ padding: `28px ${PAD_X}px` }}>
            <div className="w-full" style={{ maxWidth: 820 }}>
              <p className="text-text" style={{ fontSize: 15, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{post.body}</p>

              {/* 첨부파일 */}
              {post.attachments && post.attachments.length > 0 && (
                <div className="rounded-[12px] border border-line" style={{ marginTop: 28, padding: '14px 16px', background: 'var(--c-card)' }}>
                  <div className="flex items-center gap-1.5 text-muted font-semibold" style={{ fontSize: 14, marginBottom: 10 }}>
                    <PaperClipIcon style={{ width: 15, height: 15 }} />첨부파일 {post.attachments.length}
                  </div>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {post.attachments.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => toast.push('목업 환경이라 파일 다운로드는 지원하지 않아요.', 'info')}
                        className="flex items-center gap-2.5 rounded-[9px] border border-line bg-card2 text-left transition-[background-color,transform] duration-100 hover:bg-soft active:scale-[0.99]"
                        style={{ padding: '10px 13px' }}
                      >
                        <span className="flex items-center justify-center shrink-0 rounded-[8px]" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
                          <DocumentArrowDownIcon style={{ width: 17, height: 17 }} />
                        </span>
                        <span className="truncate flex-1 min-w-0 text-text font-medium" style={{ fontSize: 14 }}>{f.name}</span>
                        <span className="shrink-0 text-muted" style={{ fontSize: 14 }}>{f.size}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 문의 답변 */}
              {isQna && (
                <div style={{ marginTop: 30, paddingTop: 24, borderTop: '1px solid var(--c-border)' }}>
                  <div className="flex items-center justify-between gap-3" style={{ marginBottom: 14 }}>
                    <span className="flex items-center gap-2 font-bold text-text" style={{ fontSize: 15 }}>
                      <ChatBubbleLeftRightIcon style={{ width: 17, height: 17, color: 'var(--c-accent)' }} />관리자 답변
                    </span>
                    <AnswerBadge answered={answered} />
                  </div>

                  {answered && !editing && (
                    <div className="rounded-[12px]" style={{ background: 'var(--accent-soft)', padding: '16px 18px' }}>
                      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 11 }}>
                        <span className="flex items-center" style={{ gap: 9 }}>
                          <Avatar userId={post.answer!.byUserId} size={28} />
                          <span className="flex flex-col" style={{ gap: 1 }}>
                            <span className="text-text font-semibold" style={{ fontSize: 14, lineHeight: 1.2 }}>{authorName(post.answer!.byUserId)}</span>
                            <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>{teamOf(post.answer!.byUserId)} · {post.answer!.at}</span>
                          </span>
                        </span>
                        {isAdmin && (
                          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1 text-muted hover:text-text font-medium transition-colors" style={{ fontSize: 14 }}>
                            <PencilSquareIcon style={{ width: 14, height: 14 }} />수정
                          </button>
                        )}
                      </div>
                      <p className="text-text" style={{ fontSize: 15, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{post.answer!.body}</p>
                    </div>
                  )}

                  {isAdmin && (!answered || editing) && (
                    <div className="flex flex-col" style={{ gap: 12 }}>
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus placeholder="답변 내용을 입력하세요. 신청 ID·환경 정보가 있으면 함께 안내해 주세요." className="bg-card2 border border-line rounded-[10px] w-full text-text resize-none transition-[border-color,box-shadow] focus:border-[color:var(--c-accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ minHeight: 130, padding: '13px 15px', fontSize: 15, lineHeight: 1.6, outline: 'none' }} />
                      <div className="flex items-center justify-end gap-2">
                        {editing && <Button variant="ghost" onClick={() => { setEditing(false); setDraft('') }}>취소</Button>}
                        <Button onClick={submitAnswer} disabled={!draft.trim()}>{answered ? '답변 수정' : '답변 등록'}</Button>
                      </div>
                    </div>
                  )}

                  {!isAdmin && !answered && (
                    <div className="flex items-center gap-2 rounded-[12px] text-muted" style={{ background: 'var(--c-soft)', padding: '16px 18px', fontSize: 14 }}>
                      <ClockIcon style={{ width: 17, height: 17, color: 'var(--c-warn)', flexShrink: 0 }} />관리자 답변을 기다리고 있어요. 답변이 등록되면 알려드릴게요.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </article>

        {/* 우: 정보 + 같은 게시판 글 목록 */}
        <aside className="shrink-0 flex flex-col" style={{ width: SIDEBAR_W, gap: 14 }}>
          {/* 게시글 정보 */}
          <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '16px 18px' }}>
            <h3 className="font-bold text-text" style={{ fontSize: 14.5, marginBottom: 12 }}>게시글 정보</h3>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <InfoRow label={isQna ? '분류' : post.category === 'notice' ? '말머리' : '구분'}>
                {catBadge ?? cat.label}
              </InfoRow>
              <InfoRow label="작성자">
                <span className="inline-flex items-center" style={{ gap: 7 }}><Avatar userId={post.authorUserId} size={22} />{authorName(post.authorUserId)}</span>
              </InfoRow>
              <InfoRow label="작성일">{post.createdAt}</InfoRow>
              {post.category === 'manual' && post.updatedAt && <InfoRow label="수정일">{post.updatedAt}</InfoRow>}
              <InfoRow label="조회수">{post.views.toLocaleString()}회</InfoRow>
              <InfoRow label="첨부">{post.attachments?.length ? `${post.attachments.length}개` : '-'}</InfoRow>
              {isQna && <InfoRow label="상태"><AnswerBadge answered={answered} /></InfoRow>}
            </div>
          </section>

          {/* 같은 게시판 글 목록 */}
          <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="shrink-0 flex items-center justify-between border-b border-line" style={{ padding: '13px 18px' }}>
              <h3 className="font-bold text-text" style={{ fontSize: 14.5 }}>{cat.label}</h3>
              <span className="text-muted" style={{ fontSize: 14 }}>{siblings.length}건</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '6px 0' }}>
              {siblings.map((p) => (
                <ListItem key={p.id} post={p} active={p.id === post.id} onGo={goPost} refEl={p.id === post.id ? (el) => { activeItemRef.current = el } : undefined} />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

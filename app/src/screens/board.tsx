import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, Button, Tabs, Modal, EmptyState, useToast } from '../components/ui'
import { boardPosts } from '../data/admin'
import { userById } from '../data/users'
import type { BoardPost } from '../data/types'

const TAB_LABEL: Record<BoardPost['tab'], string> = { notice: '공지', qna: '문의 · Q&A', manual: '매뉴얼' }

// ── 4.23 게시판 · 공지 ────────────────────────────────────
export function Board() {
  const toast = useToast()
  const [tab, setTab] = useState<BoardPost['tab']>('notice')
  const [detail, setDetail] = useState<BoardPost | null>(null)
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const rows = boardPosts.filter((p) => p.tab === tab)
  const submit = () => { if (!title.trim()) return; toast.push('글이 등록됐어요.', 'ok'); setWriting(false); setTitle(''); setBody('') }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="게시판 · 공지" screen="4.23" action={<Button variant="primary" onClick={() => setWriting(true)}><PencilSquareIcon width={15} height={15} />글쓰기</Button>} />
      <Tabs tabs={(['notice', 'qna', 'manual'] as const).map((t) => ({ key: t, label: TAB_LABEL[t] }))} active={tab} onChange={(k) => setTab(k as BoardPost['tab'])} />
      <Card flush>
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState title="글이 없어요" description="첫 글을 작성해 보세요." /></div>
        ) : (
          <div className="flex flex-col">
            {rows.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setDetail(p)} className="flex items-center gap-3 text-left hover:bg-[var(--accent-soft)]" style={{ padding: '11px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--c-border-s)' }}>
                <span className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 14 }}>{p.title}</span>
                {p.tab === 'qna' && p.answered && <Badge tone="ok" dot={false}>답변됨</Badge>}
                <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{userById(p.authorId)?.name}</span>
                <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{p.createdAt.slice(0, 10)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Modal open={detail != null} onClose={() => setDetail(null)} title={detail?.title ?? ''} footer={<Button variant="outline" onClick={() => setDetail(null)}>닫기</Button>}>
        {detail && (
          <div className="flex flex-col" style={{ gap: 8, fontSize: 14 }}>
            <div className="text-muted">{userById(detail.authorId)?.name} · {detail.createdAt}{detail.tab === 'qna' && detail.answered ? ' · 답변 완료' : ''}</div>
            <p>{detail.body}</p>
          </div>
        )}
      </Modal>

      <Modal open={writing} onClose={() => setWriting(false)} title="글쓰기" footer={<><Button variant="ghost" onClick={() => setWriting(false)}>취소</Button><Button variant="primary" onClick={submit}>등록</Button></>}>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, height: 36, padding: '0 11px' }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="내용" rows={4} className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 11px', resize: 'none' }} />
        </div>
      </Modal>
    </div>
  )
}

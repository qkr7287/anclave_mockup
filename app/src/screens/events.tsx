import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, SeverityBadge, Button, Drawer, EmptyState } from '../components/ui'
import { events, notifications } from '../data/events'
import { serverById } from '../data/servers'
import type { EventLog, Severity, NotiCategory } from '../data/types'

const SEV_COLOR: Record<Severity, string> = { critical: 'var(--c-danger)', warn: 'var(--c-warn)', info: 'var(--c-accent)', recovered: 'var(--c-ok)' }
const SEV_LABEL: Record<Severity, string> = { critical: '위험', warn: '경고', info: '정보', recovered: '복구' }

// ── 4.21 에러 · 이벤트 관제 ───────────────────────────────
export function Events() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | Severity>('all')
  const [sel, setSel] = useState<EventLog | null>(null)
  const [readAll, setReadAll] = useState(false)

  const rows = events.filter((e) => filter === 'all' || e.severity === filter)
  const unread = events.filter((e) => !e.read && !readAll).length

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="에러 · 이벤트 관제" screen="4.21" action={<Button variant="ghost" onClick={() => setReadAll(true)}>모두 읽음</Button>} />

      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        {(['all', 'critical', 'warn', 'info', 'recovered'] as const).map((s) => {
          const on = filter === s
          return (
            <button key={s} type="button" onClick={() => setFilter(s)} className="inline-flex items-center gap-1.5 rounded-full border transition-colors" style={{ fontSize: 14, padding: '5px 11px', color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', borderColor: on ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>
              {s !== 'all' && <span className="rounded-full" style={{ width: 7, height: 7, background: SEV_COLOR[s] }} />}
              {s === 'all' ? `전체 ${unread > 0 ? `· 안읽음 ${unread}` : ''}` : SEV_LABEL[s]}
            </button>
          )
        })}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="이벤트가 없어요" description="조건에 맞는 이벤트가 없어요." />
        ) : (
          <div style={{ position: 'relative', paddingLeft: 18 }}>
            <span style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: 'var(--c-border)' }} />
            {rows.map((e) => {
              const isUnread = !e.read && !readAll
              return (
                <button key={e.id} type="button" onClick={() => setSel(e)} className="block w-full text-left" style={{ position: 'relative', padding: '0 0 16px 16px', opacity: isUnread ? 1 : 0.62 }}>
                  <span style={{ position: 'absolute', left: -18, top: 3, width: 10, height: 10, borderRadius: '50%', background: SEV_COLOR[e.severity], border: '2px solid var(--c-bg)' }} />
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate" style={{ fontSize: 14 }}>{e.message}</span>
                    {isUnread && <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: 'var(--c-accent)' }} />}
                    <span className="text-muted ml-auto shrink-0" style={{ fontSize: 14 }}>{e.createdAt}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>{serverById(e.serverId ?? '')?.host ?? '-'}{e.gpuId ? ` · ${e.gpuId}` : ''} · {SEV_LABEL[e.severity]}</div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <Drawer open={sel != null} onClose={() => setSel(null)} title="이벤트 상세">
        {sel && (
          <div className="flex flex-col" style={{ gap: 12, fontSize: 14 }}>
            <div className="flex items-center gap-2"><SeverityBadge severity={sel.severity} /><Badge tone={sel.status === 'open' ? 'warn' : 'ok'} dot={false}>{sel.status === 'open' ? '미해결' : '해결'}</Badge></div>
            <div>{sel.message}</div>
            <Detail label="발생 시각" value={sel.createdAt} />
            <Detail label="서버" value={serverById(sel.serverId ?? '')?.host ?? '-'} />
            {sel.assignee && <Detail label="담당" value={sel.assignee} />}
            {sel.action && <Detail label="조치" value={sel.action} />}
            {sel.resolution && <Detail label="해결" value={sel.resolution} />}
            {sel.gpuId && sel.serverId && <Button variant="primary" onClick={() => navigate(`/resource-map/${sel.serverId}/${sel.gpuId}`)}>문제 GPU 보기</Button>}
          </div>
        )}
      </Drawer>
    </div>
  )
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted shrink-0">{label}</span><span className="truncate text-right">{value}</span></div>
}

// ── 4.22 알림 센터 ────────────────────────────────────────
const CAT_LABEL: Record<NotiCategory, string> = { alloc: '할당 · 승인', health: '헬스 · 에러', reclaim: '회수 권고' }
const CAT_TONE: Record<NotiCategory, 'info' | 'danger' | 'warn'> = { alloc: 'info', health: 'danger', reclaim: 'warn' }
export function Notifications() {
  const navigate = useNavigate()
  const [cat, setCat] = useState<'all' | NotiCategory>('all')
  const [readAll, setReadAll] = useState(false)
  const rows = notifications.filter((n) => cat === 'all' || n.category === cat)

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="알림 센터" screen="4.22" action={<Button variant="ghost" onClick={() => setReadAll(true)}>모두 읽음</Button>} />
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        {(['all', 'alloc', 'health', 'reclaim'] as const).map((c) => { const on = cat === c; return <button key={c} type="button" onClick={() => setCat(c)} className="rounded-full border transition-colors" style={{ fontSize: 14, padding: '5px 12px', color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', borderColor: on ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>{c === 'all' ? '전체' : CAT_LABEL[c]}</button> })}
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState title="알림이 없어요" description="새 알림이 오면 여기에 표시돼요." /></div>
        ) : (
          <div className="flex flex-col">
            {rows.map((n, i) => {
              const isUnread = !n.read && !readAll
              return (
                <button key={n.id} type="button" onClick={() => n.link && navigate(n.link)} className="flex items-center gap-3 text-left hover:bg-[var(--accent-soft)]" style={{ padding: '11px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--c-border-s)', opacity: isUnread ? 1 : 0.6 }}>
                  <span className="shrink-0"><Badge tone={CAT_TONE[n.category]} dot={false}>{CAT_LABEL[n.category]}</Badge></span>
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>{n.message}</span>
                  {isUnread && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: 'var(--c-accent)' }} />}
                  <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{n.createdAt}</span>
                </button>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

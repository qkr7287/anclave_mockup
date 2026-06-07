import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, EmptyState, Switch, useBriefLoad, SkeletonRows } from '../components/ui'
import { auditLogs } from '../data/audit'
import { accessPolicies } from '../data/admin'
import { userById } from '../data/users'

// ── 4.24 감사 로그 (A) ────────────────────────────────────
export function AuditLogScreen() {
  const loading = useBriefLoad()
  const [q, setQ] = useState('')
  const rows = auditLogs.filter((a) => {
    const u = userById(a.actorUserId)?.name ?? ''
    return `${u} ${a.action} ${a.target}`.toLowerCase().includes(q.toLowerCase())
  })

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="감사 로그" screen="4.24" desc="콘솔 접속 · API 호출 · 권한/할당 변경 행위를 추적해요." action={<Badge tone="info" dot={false}>1년+ 보관</Badge>} />
      <Card
        title={`행위 기록 ${rows.length}`}
        action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사용자 · 행위 · 대상 검색…" className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, height: 32, padding: '0 11px', minWidth: 200 }} />}
        flush
      >
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={8} /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 16 }}><EmptyState title="조건에 맞는 기록이 없어요" description="검색어를 바꿔 보세요." /></div>
        ) : (
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '20%' }} /><col style={{ width: '16%' }} /><col style={{ width: '24%' }} /><col style={{ width: '28%' }} /><col style={{ width: '12%' }} /></colgroup>
            <thead><tr style={{ background: 'var(--th-bg)' }}>{['시각', '사용자', '행위', '대상', 'IP'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.createdAt}</td>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{userById(a.actorUserId)?.name}</td>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.action}</td>
                  <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.target}</td>
                  <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

// ── 4.25 접근통제 · 권한 (A) ──────────────────────────────
export function AccessControl() {
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(accessPolicies.map((p) => [p.id, p.allow])))
  const groups: { role: 'admin' | 'user'; label: string }[] = [{ role: 'admin', label: '최종관리자 (A)' }, { role: 'user', label: '실무 · 사용자 (B=C)' }]

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="접근통제 · 권한" screen="4.25" desc="역할별 자원·기능 접근 정책을 관리해요. 기본값은 거부(deny)예요." />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        {groups.map((g) => (
          <Card key={g.role} title={g.label}>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {accessPolicies.filter((p) => p.role === g.role).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-line" style={{ padding: '9px 11px' }}>
                  <span className="truncate" style={{ fontSize: 14 }}>{p.resource}</span>
                  <Switch on={state[p.id]} onChange={(v) => setState((s) => ({ ...s, [p.id]: v }))} label={p.resource} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

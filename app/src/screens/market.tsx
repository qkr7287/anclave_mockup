import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ClipboardDocumentIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, StatusBadge, Button, EmptyState, Tabs, KpiStat, StepBack, useToast } from '../components/ui'
import { LineChart } from '../components/charts'
import { useRole } from '../lib/role'
import { services, serviceById } from '../data/services'
import { modelById } from '../data/models'
import { userById } from '../data/users'
import { apiRequests, apiKeyUsages } from '../data/requests'
import { activationStats } from '../data/audit'
import { series, fmtCompact, fmtNum } from '../lib/metrics'

// ── 4.17 마켓플레이스 ─────────────────────────────────────
export function Marketplace() {
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('all')
  const tags = useMemo(() => Array.from(new Set(services.flatMap((s) => s.tags))), [])
  const maxUsage = Math.max(...services.map((s) => s.usageCount))
  const rows = services.filter((s) => (tag === 'all' || s.tags.includes(tag)) && s.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.usageRank - b.usageRank)
  const request = (name: string) => toast.push(`${name} API 요청을 보냈어요. 승인 후 키가 발급돼요.`, 'ok')

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="마켓플레이스" screen="4.17" />
      <Card
        title={`AI 서비스 ${rows.length}`}
        action={
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="서비스명 검색…" className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, height: 32, padding: '0 11px', minWidth: 160 }} />
            <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
              {['all', ...tags].map((t) => { const on = tag === t; return <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full border transition-colors" style={{ fontSize: 14, padding: '5px 12px', color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', borderColor: on ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>{t === 'all' ? '전체' : t}</button> })}
            </div>
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="조건에 맞는 결과가 없어요" description="검색어나 태그를 바꿔 보세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup><col style={{ width: '6%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} /><col style={{ width: '8%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '14%' }} /></colgroup>
              <thead><tr style={{ background: 'var(--th-bg)' }}>{['#', '서비스', '종류', 'API', '모델', '사용량', ''].map((h, i) => <th key={i} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 14px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/marketplace/${s.id}`)} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                    <td className="text-muted" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{s.usageRank}</td>
                    <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{s.name}</td>
                    <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{s.kind}</td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{s.hasApi ? <Badge tone="ok" dot={false}>API</Badge> : <span className="text-muted" style={{ fontSize: 14 }}>—</span>}</td>
                    <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{modelById(s.model)?.name}</td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="rounded-full overflow-hidden shrink-0" style={{ height: 6, width: 70, background: 'var(--c-soft)' }}><div className="h-full rounded-full" style={{ width: `${(s.usageCount / maxUsage) * 100}%`, background: 'var(--c-accent)' }} /></div>
                        <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{fmtCompact(s.usageCount)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{s.hasApi && <Button variant="outline" onClick={(e) => { e.stopPropagation(); request(s.name) }}>API 요청</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── 4.18 서비스(AI) 상세 ──────────────────────────────────
export function ServiceDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const svc = serviceById(id)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  if (!svc) return <div className="flex items-center justify-center" style={{ minHeight: 320 }}><EmptyState title="서비스를 찾을 수 없어요" cta={<Button variant="outline" onClick={() => navigate('/marketplace')}>마켓으로</Button>} /></div>

  const usage = apiKeyUsages.find((k) => k.serviceId === svc.id)
  const run = () => {
    if (!input.trim()) return
    setBusy(true); setOutput('')
    window.setTimeout(() => { setBusy(false); setOutput(`[${svc.name}] 응답(데모): "${input.slice(0, 40)}" 에 대한 ${modelById(svc.model)?.name} 추론 결과 예시입니다.`) }, 700)
  }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title={svc.name} screen="4.18" back={<StepBack to="/marketplace" label="마켓" />} action={svc.hasApi ? <Badge tone="ok" dot={false}>API</Badge> : undefined} />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <Card title="서비스 정보">
          <div className="flex flex-col" style={{ gap: 10, fontSize: 14 }}>
            <Row label="종류" value={svc.kind} />
            <Row label="모델" value={modelById(svc.model)?.name ?? svc.model} />
            <Row label="소유자" value={userById(svc.ownerUserId)?.name ?? ''} />
            <Row label="서비스 URL" value={svc.serviceUrl} />
            <Row label="테스트 URL" value={svc.testUrl} />
            <div className="text-muted" style={{ marginTop: 4 }}>{svc.description}</div>
            <Button variant="outline" onClick={() => navigate('/board')}>매뉴얼 보기</Button>
          </div>
        </Card>
        <div className="flex flex-col" style={{ gap: 16 }}>
          {usage && (
            <Card title="key별 사용량">
              <LineChart data={usage.calls} height={120} />
              <div className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>최근 호출 {fmtNum(usage.calls[usage.calls.length - 1])} · 연결 {usage.connections}</div>
            </Card>
          )}
          <Card title="플레이그라운드">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="프롬프트를 입력하고 체험해 보세요." rows={3} className="w-full bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, padding: '8px 10px', resize: 'none' }} />
            <div className="flex justify-end mt-2"><Button variant="primary" onClick={run} disabled={busy}>{busy ? '추론 중…' : '보내기'}</Button></div>
            <div className="rounded-lg border border-line mt-2" style={{ padding: '10px 12px', fontSize: 14, minHeight: 64, background: 'var(--c-soft)', color: output ? 'var(--c-text)' : 'var(--c-muted)' }}>
              {busy ? '응답을 기다리는 중…' : output || '입력 후 보내기를 누르면 더미 응답이 표시돼요.'}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted shrink-0">{label}</span><span className="truncate text-right">{value}</span></div>
}

// ── 4.19 API 연동 (B · 받은 API 승인) ─────────────────────
export function ApiApprovals() {
  const toast = useToast()
  const { user, isAdmin } = useRole()
  const [issued, setIssued] = useState<Record<string, string>>({})

  const received = apiRequests.filter((r) => isAdmin || serviceById(r.serviceId)?.ownerUserId === user.id)
  const pending = received.filter((r) => r.status === 'pending' && !issued[r.id])
  const myKeys = apiKeyUsages.filter((k) => isAdmin || serviceById(k.serviceId)?.ownerUserId === user.id)

  const approve = (id: string, serviceId: string) => {
    const key = `ak_live_${serviceId.replace('svc-', '')}_${id}xx`
    setIssued((s) => ({ ...s, [id]: key }))
    toast.push('API 키를 발급했어요. 신청자에게 전달됐어요.', 'ok')
  }
  const copy = (key: string) => { try { void navigator.clipboard?.writeText(key) } catch { /* noop */ } toast.push('키를 복사했어요.', 'info') }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="API 연동" screen="4.19" desc="받은 API 신청을 승인하고 키를 발급·관리해요." action={<Badge tone="warn">대기 {pending.length}</Badge>} />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}>
        <Card title="받은 API 신청">
          {received.length === 0 ? (
            <EmptyState title="받은 신청이 없어요" description="내 서비스에 대한 API 신청이 들어오면 여기에 표시돼요." />
          ) : (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {received.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '9px 11px' }}>
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontSize: 14 }}>{userById(r.requesterUserId)?.name} · {serviceById(r.serviceId)?.name}</div>
                    <div className="text-muted truncate" style={{ fontSize: 14 }}>{issued[r.id] ?? r.apiKey ?? r.targetServiceUrl}</div>
                  </div>
                  <div className="shrink-0">
                    {issued[r.id] || r.status === 'approved' ? (
                      <button type="button" onClick={() => copy(issued[r.id] ?? r.apiKey ?? '')} className="flex items-center gap-1 text-accent" style={{ fontSize: 14 }}><ClipboardDocumentIcon width={15} height={15} />키 복사</button>
                    ) : r.status === 'rejected' ? <StatusBadge status="rejected" /> : <Button variant="primary" onClick={() => approve(r.id, r.serviceId)}>승인 · 키 발급</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="발급 키 · 호출량">
          {myKeys.length === 0 ? (
            <EmptyState title="발급된 키가 없어요" description="신청을 승인하면 키가 생성돼요." />
          ) : (
            <div className="flex flex-col" style={{ gap: 12 }}>
              {myKeys.map((k) => (
                <div key={k.keyId} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1" style={{ fontSize: 14 }}>
                    <span className="font-semibold truncate">{serviceById(k.serviceId)?.name}</span>
                    <span className="text-muted shrink-0">{fmtNum(k.calls[k.calls.length - 1])} 호출 · {k.connections} 연결</span>
                  </div>
                  <LineChart data={k.calls} height={56} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── 4.20 활성화 대시보드 ──────────────────────────────────
export function Activation() {
  const [tab, setTab] = useState('publisher')
  const totalTokens = activationStats.reduce((a, s) => a + s.tokens, 0)
  const totalCalls = activationStats.reduce((a, s) => a + s.calls, 0)
  const consumers = new Set(activationStats.map((s) => s.consumerUserId)).size

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="활성화 대시보드" screen="4.20" desc="AI 활성화·토큰을 발행자 / 소비자 / 관리자 관점으로 봐요." />
      <Tabs tabs={[{ key: 'publisher', label: '발행자' }, { key: 'consumer', label: '소비자' }, { key: 'admin', label: '관리자' }]} active={tab} onChange={setTab} />
      <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <KpiStat label="활성 소비자" value={consumers} unit="명" />
        <KpiStat label="총 토큰" value={fmtCompact(totalTokens)} />
        <KpiStat label="총 호출" value={fmtCompact(totalCalls)} />
      </div>
      {tab !== 'admin' ? (
        <Card title={tab === 'publisher' ? '발행 서비스 토큰 추이' : '내 소비 토큰 추이'}>
          <LineChart data={series(tab === 'publisher' ? 21 : 42, 24, totalTokens / 60, totalTokens / 22)} height={160} />
        </Card>
      ) : (
        <Card title="활성화 귀속 (모델 × 소비자 × 시간)" flush>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /><col style={{ width: '20%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr style={{ background: 'var(--th-bg)' }}>{['서비스', '모델', '소비자', '토큰', '호출'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {activationStats.map((s, i) => (
                <tr key={i} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{serviceById(s.serviceId)?.name}</td>
                  <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{modelById(s.modelId)?.name}</td>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{userById(s.consumerUserId)?.name}</td>
                  <td style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{fmtCompact(s.tokens)}</td>
                  <td style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{fmtNum(s.calls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

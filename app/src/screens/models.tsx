import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlusIcon, CheckCircleIcon, ArrowUpTrayIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '../components/PageHeader'
import { Card, Badge, StatusBadge, Button, EmptyState, StepBack, useToast } from '../components/ui'
import { LineChart } from '../components/charts'
import { useRole } from '../lib/role'
import { models, modelById } from '../data/models'
import { services } from '../data/services'
import { allGpus } from '../data/servers'
import { agents } from '../data/admin'
import { modelImports } from '../data/audit'
import { serverById } from '../data/servers'
import { series, fmtCompact } from '../lib/metrics'
import type { ModelKind } from '../data/types'

// 검색 + 종류 칩 필터 (Q20)
function SearchFilter({ q, setQ, kinds, kind, setKind, placeholder }: { q: string; setQ: (v: string) => void; kinds: string[]; kind: string; setKind: (v: 'all' | ModelKind) => void; placeholder: string }) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="bg-soft border border-line rounded-lg text-text placeholder:text-muted" style={{ fontSize: 14, height: 32, padding: '0 11px', flex: 1, minWidth: 170, maxWidth: 240 }} />
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        {['all', ...kinds].map((k) => {
          const on = kind === k
          return <button key={k} type="button" onClick={() => setKind(k as 'all' | ModelKind)} className="rounded-full border transition-colors" style={{ fontSize: 14, padding: '5px 12px', color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', borderColor: on ? 'rgba(110,168,254,.45)' : 'var(--c-border)' }}>{k === 'all' ? '전체' : k}</button>
        })}
      </div>
    </div>
  )
}

function UsageBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="rounded-full overflow-hidden shrink-0" style={{ height: 6, width: 90, background: 'var(--c-soft)' }}>
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: 'var(--c-accent)' }} />
      </div>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{fmtCompact(value)}</span>
    </div>
  )
}

// ── 4.12 모델 카탈로그 ────────────────────────────────────
export function ModelCatalog() {
  const navigate = useNavigate()
  const { isAdmin } = useRole()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | ModelKind>('all')
  const kinds = useMemo(() => Array.from(new Set(models.map((m) => m.kind))), [])
  const maxUsage = Math.max(...models.map((m) => m.usageCount))
  const rows = models.filter((m) => (kind === 'all' || m.kind === kind) && m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.usageRank - b.usageRank)

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="모델 카탈로그" screen="4.12" action={isAdmin ? <Button variant="primary" onClick={() => navigate('/admin/models/new')}><PlusIcon width={15} height={15} />신규 모델 반입</Button> : undefined} />
      <Card title={`등록 모델 ${rows.length}`} action={<SearchFilter q={q} setQ={setQ} kinds={kinds} kind={kind} setKind={setKind} placeholder="모델명 검색…" />}>
        {rows.length === 0 ? (
          <EmptyState title="조건에 맞는 결과가 없어요" description="검색어나 필터를 바꿔 보세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup><col style={{ width: '8%' }} /><col style={{ width: '28%' }} /><col style={{ width: '18%' }} /><col style={{ width: '24%' }} /><col style={{ width: '22%' }} /></colgroup>
              <thead><tr style={{ background: 'var(--th-bg)' }}>{['#', '모델명', '종류', '사용량(인기)', '부가서비스'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 14px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((m, i) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/models/${m.id}`)} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                    <td className="text-muted" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{m.usageRank}</td>
                    <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{m.name}</td>
                    <td style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}><Badge tone="info" dot={false}>{m.kind}</Badge></td>
                    <td style={{ padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}><UsageBar value={m.usageCount} max={maxUsage} /></td>
                    <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{m.addons.join(' · ')}</td>
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

// ── 4.13 모델 상세 ────────────────────────────────────────
export function ModelDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const model = modelById(id)
  if (!model) return <div className="flex items-center justify-center" style={{ minHeight: 320 }}><EmptyState title="모델을 찾을 수 없어요" cta={<Button variant="outline" onClick={() => navigate('/models')}>카탈로그로</Button>} /></div>

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title={model.name} screen="4.13" back={<StepBack to="/models" label="카탈로그" />} action={<Button variant="primary" onClick={() => navigate('/requests')}>이 모델로 GPU 신청</Button>} />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <Card title="메타데이터">
          <div className="flex flex-col" style={{ gap: 10 }}>
            <Meta label="종류" value={model.kind} />
            <Meta label="파라미터" value={model.params} />
            <Meta label="권장 GPU" value={model.recommendedGpu} />
            <Meta label="라이선스" value={model.license} />
            <Meta label="부가서비스" value={model.addons.join(' · ')} />
            <Meta label="사용량 순위" value={`#${model.usageRank} · ${fmtCompact(model.usageCount)}`} />
            <div className="text-muted" style={{ fontSize: 14, marginTop: 4 }}>{model.description}</div>
          </div>
        </Card>
        <Card title="사용 추이">
          <LineChart data={series(model.usageRank + 5, 24, model.usageCount / 40, model.usageCount / 18)} height={170} />
          <div className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>최근 24시간 호출 추이</div>
        </Card>
      </div>
    </div>
  )
}
function Meta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted shrink-0" style={{ fontSize: 14 }}>{label}</span><span className="truncate text-right" style={{ fontSize: 14 }}>{value}</span></div>
}

// ── 4.14 신규 모델 반입 (A · 보안 점검) ───────────────────
const SCAN_STEPS = ['safetensors 형식 확인', 'modelscan 악성 코드 검사', 'picklescan 검사', '체크섬 검증']
export function ModelImportNew() {
  const toast = useToast()
  const [uploaded, setUploaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [doneSteps, setDoneSteps] = useState(0)

  const runScan = () => {
    setProgress(0); setDoneSteps(0)
    let p = 0
    const iv = window.setInterval(() => {
      p += 5
      setProgress(p)
      setDoneSteps(Math.min(SCAN_STEPS.length, Math.floor((p / 100) * SCAN_STEPS.length)))
      if (p >= 100) { window.clearInterval(iv); setDoneSteps(SCAN_STEPS.length); toast.push('보안 점검 통과 · 카탈로그에 등록됐어요.', 'ok') }
    }, 120)
  }

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="신규 모델 반입" screen="4.14" desc="폐쇄망 오프라인 반입 — 격리 업로드 후 보안 점검을 통과해야 등록돼요." />
      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <Card title="격리 업로드 · 보안 점검">
          {!uploaded ? (
            <EmptyState icon={<ArrowUpTrayIcon width={26} height={26} />} title="모델 파일을 업로드해 주세요" description="safetensors 형식만 허용돼요. 업로드 후 자동으로 보안 점검을 진행해요." cta={<Button variant="primary" onClick={() => setUploaded(true)}>파일 선택 (qwen2.5-72b.safetensors)</Button>} />
          ) : (
            <div className="flex flex-col" style={{ gap: 12 }}>
              <div className="flex items-center justify-between rounded-lg border border-line" style={{ padding: '8px 11px', fontSize: 14 }}>
                <span className="truncate">qwen2.5-72b.safetensors</span>
                <Badge tone="info" dot={false}>격리됨</Badge>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 8, background: 'var(--c-soft)' }}><div className="h-full" style={{ width: `${progress}%`, background: 'var(--c-accent)', transition: 'width .1s' }} /></div>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {SCAN_STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-2" style={{ fontSize: 14 }}>
                    {i < doneSteps ? <CheckCircleIcon width={16} height={16} style={{ color: 'var(--c-ok)' }} /> : <span className="rounded-full" style={{ width: 16, height: 16, border: '2px solid var(--c-border)' }} />}
                    <span style={{ color: i < doneSteps ? 'var(--c-text)' : 'var(--c-muted)' }}>{s}</span>
                  </div>
                ))}
              </div>
              <Button variant="primary" onClick={runScan} disabled={progress > 0 && progress < 100}>{progress === 0 ? '보안 점검 실행' : progress < 100 ? '점검 중…' : '점검 완료'}</Button>
            </div>
          )}
        </Card>

        <Card title="반입 이력" flush>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '44%' }} /><col style={{ width: '18%' }} /><col style={{ width: '20%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr style={{ background: 'var(--th-bg)' }}>{['파일', '형식', '스캔', '상태'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {modelImports.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.fileName}</td>
                  <td style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.format}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.scan === 'pass' ? <Badge tone="ok" dot={false}>통과</Badge> : m.scan === 'fail' ? <Badge tone="danger" dot={false}>실패</Badge> : <Badge tone="warn" dot={false}>진행</Badge>}</td>
                  <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}

// ── 4.15 내 모델 (B=C) ────────────────────────────────────
export function MyModels() {
  const navigate = useNavigate()
  const { user } = useRole()
  const myModelIds = new Set<string>()
  allGpus.flatMap((g) => g.slices ?? []).filter((s) => s.ownerUserId === user.id).forEach((s) => s.modelId && myModelIds.add(s.modelId))
  services.filter((s) => s.ownerUserId === user.id).forEach((s) => myModelIds.add(s.model))
  const myModels = models.filter((m) => myModelIds.has(m.id))

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="내 모델" screen="4.15" desc="내가 쓰는 모델 목록 — 새 모델 도입이 필요하면 게시판에 문의해 주세요." action={<Button variant="outline" onClick={() => navigate('/board')}>게시판 문의</Button>} />
      {myModels.length === 0 ? (
        <Card><EmptyState title="쓰는 모델이 없어요" description="카탈로그에서 모델을 둘러보거나, 도입이 필요하면 게시판에 문의해 주세요." cta={<Button variant="primary" onClick={() => navigate('/models')}>카탈로그 보기</Button>} /></Card>
      ) : (
        <Card title={`내 모델 ${myModels.length}`} flush>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '36%' }} /><col style={{ width: '22%' }} /><col style={{ width: '24%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead><tr style={{ background: 'var(--th-bg)' }}>{['모델명', '종류', '권장 GPU', '사용량'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {myModels.map((m, i) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/models/${m.id}`)} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.name}</td>
                  <td style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.kind}</td>
                  <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{m.recommendedGpu}</td>
                  <td className="text-muted" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{fmtCompact(m.usageCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── 4.16 데몬 · 에이전트 관리 (A) ─────────────────────────
export function Agents() {
  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title="데몬 · 에이전트 관리" screen="4.16" desc="노드 합류 시 에이전트가 자동 배포돼요. 버전·상태를 점검해요." action={<Badge tone={agents.some((a) => a.status === 'down') ? 'danger' : 'ok'}>{agents.filter((a) => a.status === 'active').length} / {agents.length} 활성</Badge>} />
      <Card flush>
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup><col style={{ width: '22%' }} /><col style={{ width: '24%' }} /><col style={{ width: '18%' }} /><col style={{ width: '16%' }} /><col style={{ width: '20%' }} /></colgroup>
          <thead><tr style={{ background: 'var(--th-bg)' }}>{['노드', '서버', '버전', '상태', '배포 시각'].map((h) => <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 12px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.id} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                <td className="truncate font-semibold" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.nodeId}</td>
                <td className="text-muted truncate" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{serverById(a.serverId)?.host ?? a.serverId}</td>
                <td style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.version}</td>
                <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.status === 'active' ? <Badge tone="ok">활성</Badge> : a.status === 'stale' ? <Badge tone="warn">구버전</Badge> : <Badge tone="danger">오프라인</Badge>}</td>
                <td className="text-muted" style={{ fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)' }}>{a.deployedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

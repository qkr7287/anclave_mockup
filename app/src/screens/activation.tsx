import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  KeyIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  XMarkIcon,
  MegaphoneIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  LinkIcon,
  ShieldCheckIcon,
  ClockIcon,
  GlobeAltIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  RocketLaunchIcon,
  CheckBadgeIcon,
  CpuChipIcon,
  Squares2X2Icon,
  SignalIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { PageShell, SectionGrid } from '../components/PageShell'
import {
  Card,
  KpiStat,
  Table,
  Button,
  Badge,
  StatusBadge,
  EmptyState,
  useToast,
} from '../components/ui'
import type { Column } from '../components/ui'
import { useRole } from '../lib/role'
import {
  services,
  apiRequests,
  apiKeyUsages,
  publishRequests,
  userById,
  serviceById,
  modelById,
} from '../data'
import type { ApiRequest, PublishRequest as PublishReq, Status } from '../data/types'

// G9 · 마켓 사용자 액션 — 4.19 API 연동(B·소유자) · 4.29 서비스 게시 신청(B=C).
// 더미는 src/data 시드(services·apiRequests·apiKeyUsages·publishRequests)를 정본으로 사용.

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const SERIES_COLORS = ['var(--c-accent)', 'var(--c-accent2)', '#d29922', '#f85149']

const fmtInt = (n: number) => n.toLocaleString('en-US')
const maskKey = (k: string) => (k.length > 14 ? `${k.slice(0, 12)}••••${k.slice(-4)}` : k)
const randomKey = (slug: string) => {
  const hex = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `ak_live_${slug}_${hex}`
}

// ════════════════════════ 4.19 API 연동 (B · 소유자) ════════════════════════

// 받은 API 신청 인박스 — 동료가 내 서비스를 호출하려고 보낸 키 발급 요청.
export function ApiApprovals() {
  const { push: toast } = useToast()
  const [reqs, setReqs] = useState<ApiRequest[]>(() => apiRequests.map((r) => ({ ...r })))

  const approve = (id: string) => {
    setReqs((cur) =>
      cur.map((r) => {
        if (r.id !== id) return r
        const slug = serviceById(r.serviceId)?.name.split('-')[0] ?? 'svc'
        const apiKey = randomKey(slug)
        return { ...r, status: 'approved', apiKey }
      }),
    )
    toast('API 키를 발급했어요. 신청자에게 알림이 전송됩니다.', 'ok')
  }

  const reject = (id: string) => {
    setReqs((cur) =>
      cur.map((r) =>
        r.id === id ? { ...r, status: 'rejected', rejectReason: '대상 서비스 URL이 사내망에서 확인되지 않아요.' } : r,
      ),
    )
    toast('신청을 반려했어요.', 'warn')
  }

  const copyKey = (key: string) => {
    navigator.clipboard?.writeText(key).then(
      () => toast('API 키를 클립보드에 복사했어요.', 'info'),
      () => toast('복사에 실패했어요. 수동으로 선택해 복사해 주세요.', 'danger'),
    )
  }

  // ── 집계(라이브 상태 기반) ──────────────────────────────
  const pending = reqs.filter((r) => r.status === 'pending').length
  const issuedKeys = reqs.filter((r) => r.status === 'approved' && r.apiKey).length
  const dailyTotals = useMemo(
    () => DAYS.map((_, i) => apiKeyUsages.reduce((sum, u) => sum + (u.calls[i] ?? 0), 0)),
    [],
  )
  const weeklyTotal = dailyTotals.reduce((a, b) => a + b, 0)
  const connections = apiKeyUsages.reduce((a, u) => a + u.connections, 0)
  const keyTotals = apiKeyUsages.map((u) => u.calls.reduce((a, b) => a + b, 0))
  const wow = dailyTotals[0] > 0 ? Math.round(((dailyTotals[6] - dailyTotals[0]) / dailyTotals[0]) * 100) : 0
  const backlog = reqs.length > 0 ? Math.round((pending / reqs.length) * 100) : 0
  const successRate = 99.4

  const approvedKeys = reqs.filter((r) => r.status === 'approved' && r.apiKey)

  const columns: Column<ApiRequest>[] = [
    {
      key: 'requester',
      header: '신청자',
      width: '15%',
      render: (r) => {
        const u = userById(r.requesterUserId)
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate">{u?.name ?? r.requesterUserId}</span>
            <span className="text-muted truncate" style={{ fontSize: 13 }}>{u?.email ?? ''}</span>
          </div>
        )
      },
    },
    {
      key: 'service',
      header: '대상 서비스',
      width: '17%',
      render: (r) => {
        const s = serviceById(r.serviceId)
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate">{s?.name ?? r.serviceId}</span>
            <span className="text-muted truncate" style={{ fontSize: 13 }}>{modelById(r.model)?.name ?? r.model}</span>
          </div>
        )
      },
    },
    {
      key: 'target',
      header: '연동 대상 URL',
      width: '22%',
      render: (r) => (
        <span className="text-muted truncate" style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{r.targetServiceUrl}</span>
      ),
    },
    {
      key: 'created',
      header: '신청일',
      width: '12%',
      render: (r) => <span className="text-muted" style={{ fontSize: 13 }}>{r.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '9%',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'action',
      header: '검토 / 키',
      width: '25%',
      align: 'right',
      render: (r) => {
        if (r.status === 'pending') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="primary" onClick={() => approve(r.id)} style={{ padding: '5px 12px', fontSize: 13 }}>
                <CheckIcon width={14} height={14} /> 승인 · 발급
              </Button>
              <Button variant="danger" onClick={() => reject(r.id)} style={{ padding: '5px 12px', fontSize: 13 }}>
                반려
              </Button>
            </div>
          )
        }
        if (r.status === 'approved' && r.apiKey) {
          return (
            <button
              type="button"
              onClick={() => copyKey(r.apiKey!)}
              className="inline-flex items-center gap-1.5 rounded-lg float-right max-w-full"
              style={{ padding: '5px 10px', fontSize: 13, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
              title="API 키 복사"
            >
              <KeyIcon width={13} height={13} className="text-accent shrink-0" />
              <span className="truncate" style={{ fontFamily: 'var(--font-mono)' }}>{maskKey(r.apiKey)}</span>
              <ClipboardDocumentIcon width={14} height={14} className="text-muted shrink-0" />
            </button>
          )
        }
        return (
          <span className="text-muted truncate inline-block max-w-full" style={{ fontSize: 13 }} title={r.rejectReason}>
            {r.rejectReason ?? '반려됨'}
          </span>
        )
      },
    },
  ]

  return (
    <PageShell
      screen="4.19"
      title="API 연동"
      desc="내 서비스에 들어온 API 키 발급 신청을 검토하고 호출 현황을 관리해요. (실무관리자 · 소유자)"
      actions={
        <Badge tone={pending > 0 ? 'warn' : 'ok'}>{pending > 0 ? `검토 대기 ${pending}건` : '검토 대기 없음'}</Badge>
      }
      kpis={
        <>
          <KpiStat
            label="발급 API 키"
            value={issuedKeys}
            unit="개"
            sub={`활성 연결 ${connections}`}
            deltaTone="ok"
            spark={keyTotals}
            icon={<KeyIcon width={18} height={18} />}
          />
          <KpiStat
            label="검토 대기 신청"
            value={pending}
            unit="건"
            sub={`누적 신청 ${reqs.length}건`}
            delta={pending > 0 ? '검토 필요' : '처리 완료'}
            deltaTone={pending > 0 ? 'warn' : 'ok'}
            gauge={backlog}
            gaugeColor="var(--c-warn)"
          />
          <KpiStat
            label="총 호출 · 이번 주"
            value={weeklyTotal}
            unit="회"
            delta={`${wow >= 0 ? '▲' : '▼'} ${Math.abs(wow)}% WoW`}
            deltaTone={wow >= 0 ? 'ok' : 'danger'}
            trend={dailyTotals}
            trendFmt={(v) => `${fmtInt(Math.round(v))}회`}
          />
          <KpiStat
            label="평균 응답 성공률"
            value={successRate}
            unit="%"
            sub="최근 7일 · p95 0.9s"
            delta="안정"
            deltaTone="ok"
            gauge={successRate}
            gaugeColor="var(--c-ok)"
          />
        </>
      }
    >
      <SectionGrid
        ratio="1.62fr 1fr"
        main={
          <>
            <Card
              flush
              title={
                <span className="flex items-center gap-2">
                  받은 API 신청
                  <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{reqs.length}</span>
                </span>
              }
              action={<span className="text-muted" style={{ fontSize: 13 }}>승인 시 즉시 키 발급 · 행에서 복사</span>}
            >
              <Table columns={columns} rows={reqs} rowKey={(r) => r.id} empty="아직 받은 API 신청이 없어요." />
            </Card>

            <Card
              title="호출량 추이 · 최근 7일"
              action={
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
                  {apiKeyUsages.map((u, i) => (
                    <span key={u.keyId} className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>
                      <span className="rounded-full" style={{ width: 8, height: 8, background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                      {serviceById(u.serviceId)?.name ?? u.keyId}
                    </span>
                  ))}
                </div>
              }
            >
              <div style={{ height: 224 }}>
                <CallTrend />
              </div>
            </Card>
          </>
        }
        side={
          <>
            <Card
              flush
              title={
                <span className="flex items-center gap-2">
                  <KeyIcon width={15} height={15} className="text-accent" /> 발급된 키
                  <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{approvedKeys.length}</span>
                </span>
              }
            >
              {approvedKeys.length === 0 ? (
                <EmptyState title="발급된 키가 없어요" description="받은 신청을 승인하면 키가 여기에 표시돼요." />
              ) : (
                <div className="flex flex-col">
                  {approvedKeys.map((r, i) => {
                    const usage = apiKeyUsages.find((u) => u.keyId === r.apiKey)
                    const total = usage ? usage.calls.reduce((a, b) => a + b, 0) : 0
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3"
                        style={{ padding: '11px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--c-border-s)' }}
                      >
                        <div className="flex flex-col min-w-0 flex-1" style={{ gap: 3 }}>
                          <span className="font-semibold truncate" style={{ fontSize: 14 }}>{serviceById(r.serviceId)?.name ?? r.serviceId}</span>
                          <span className="text-muted truncate" style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>{maskKey(r.apiKey!)}</span>
                          <span className="text-muted" style={{ fontSize: 12 }}>
                            {usage ? `호출 ${fmtInt(total)}회 · 연결 ${usage.connections}` : '집계 대기 중'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyKey(r.apiKey!)}
                          className="flex items-center justify-center rounded-lg shrink-0"
                          style={{ width: 32, height: 32, background: 'var(--c-soft)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
                          title="키 복사"
                          aria-label="API 키 복사"
                        >
                          <ClipboardDocumentIcon width={15} height={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card title={<span className="flex items-center gap-2"><BoltIcon width={15} height={15} className="text-accent" /> API 연동 가이드</span>}>
              <ol className="flex flex-col" style={{ gap: 12 }}>
                {GUIDE_STEPS.map((g, i) => (
                  <li key={g.title} className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center rounded-md shrink-0 font-bold" style={{ width: 22, height: 22, fontSize: 13, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{i + 1}</span>
                    <div className="flex flex-col min-w-0" style={{ gap: 3 }}>
                      <span className="font-semibold" style={{ fontSize: 14 }}>{g.title}</span>
                      <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{g.body}</span>
                      {g.code && (
                        <code className="rounded-md" style={{ marginTop: 2, padding: '6px 9px', fontSize: 12.5, background: 'var(--c-soft)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{g.code}</code>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-2" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--c-border-s)' }}>
                <ShieldCheckIcon width={15} height={15} className="text-accent shrink-0" />
                <span className="text-muted" style={{ fontSize: 12.5 }}>키는 사내망에서만 유효해요. 분당 600회 호출 한도가 적용됩니다.</span>
              </div>
            </Card>
          </>
        }
      />
    </PageShell>
  )
}

const GUIDE_STEPS = [
  { title: '키 발급', body: '받은 신청을 승인하면 신청자에게 키가 전달돼요. 분실 시 재발급하세요.', code: '' },
  { title: '엔드포인트 호출', body: '서비스 URL에 Bearer 인증으로 요청을 보냅니다.', code: 'POST {service_url}/v1/chat\nAuthorization: Bearer ak_live_…' },
  { title: '응답 처리', body: 'JSON 응답과 SSE 스트리밍을 지원합니다. 호출량은 위 차트에서 확인하세요.', code: '' },
]

// 4.19 — 호출량 area 차트(다중 키). 호출 수는 천 단위라 공통 LineChart(0~80축) 대신 자체 축 사용.
function CallTrend() {
  const rows = DAYS.map((d, i) => {
    const row: Record<string, number | string> = { x: d }
    apiKeyUsages.forEach((u, si) => (row[`s${si}`] = u.calls[i] ?? 0))
    return row
  })
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <defs>
          {apiKeyUsages.map((_, si) => (
            <linearGradient key={si} id={`call-grad-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[si % SERIES_COLORS.length]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES_COLORS[si % SERIES_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeWidth={1} />
        <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--c-muted)' }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--c-muted)' }}
          tickLine={false}
          axisLine={false}
          width={42}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`)}
        />
        <Tooltip
          contentStyle={{ background: 'var(--toast-bg)', border: '1px solid var(--c-border)', borderRadius: 8, fontSize: 12, padding: '6px 9px' }}
          labelStyle={{ color: 'var(--c-muted)', fontSize: 11 }}
          formatter={((value: number, _n: unknown, item: { dataKey?: string | number }) => {
            const si = Number(String(item?.dataKey ?? 's0').slice(1))
            return [`${fmtInt(Number(value))}회`, serviceById(apiKeyUsages[si]?.serviceId)?.name ?? `S${si}`]
          }) as never}
          cursor={{ stroke: 'rgba(255,255,255,.18)', strokeDasharray: '3 3' }}
        />
        {apiKeyUsages.map((_, si) => (
          <Area
            key={si}
            type="monotone"
            dataKey={`s${si}`}
            stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
            strokeWidth={2.2}
            fill={`url(#call-grad-${si})`}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ════════════════════════ 4.29 서비스 게시 신청 (B = C) ════════════════════════

interface PubItem extends PublishReq {
  visibility?: string
  pricing?: string
  isNew?: boolean
}

type Visibility = 'org' | 'team' | 'link'
type Pricing = 'free' | 'subscription' | 'usage'

const VIS_OPTS: { key: Visibility; label: string; icon: typeof GlobeAltIcon; desc: string }[] = [
  { key: 'org', label: '전사 공개', icon: GlobeAltIcon, desc: '모든 사내 사용자' },
  { key: 'team', label: '팀 한정', icon: UserGroupIcon, desc: '소속 부서만' },
  { key: 'link', label: '링크 보유자', icon: LinkIcon, desc: '주소를 받은 사람' },
]
const PRICE_OPTS: { key: Pricing; label: string }[] = [
  { key: 'free', label: '무료' },
  { key: 'subscription', label: '구독형' },
  { key: 'usage', label: '종량제' },
]
const VIS_LABEL: Record<string, string> = { org: '전사 공개', team: '팀 한정', link: '링크 보유자' }
const PRICE_LABEL: Record<string, string> = { free: '무료', subscription: '구독형', usage: '종량제' }

const KIND_ICON: Record<string, typeof CpuChipIcon> = {
  LLM: CpuChipIcon,
  Code: Squares2X2Icon,
  Embedding: SignalIcon,
  STT: SignalIcon,
  Image: RocketLaunchIcon,
  'Vision-Language': RocketLaunchIcon,
}

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 사용자가 자기가 배포한 AI 서비스를 마켓플레이스에 게시 신청 → 관리자 4.9 게시 승인으로.
export function PublishRequest() {
  const { push: toast } = useToast()
  const { user } = useRole()
  const [items, setItems] = useState<PubItem[]>(() => publishRequests.map((p) => ({ ...p })))
  const [seq, setSeq] = useState(1)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [intro, setIntro] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('org')
  const [pricing, setPricing] = useState<Pricing>('free')
  const [price, setPrice] = useState('')
  const [demoUrl, setDemoUrl] = useState('')

  const selected = selectedId ? serviceById(selectedId) : undefined

  // 서비스별 현재 게시 상태(이름 매칭) — 카드 배지·중복 신청 표시용.
  const statusByName = useMemo(() => {
    const map = new Map<string, Status>()
    for (const p of items) {
      const cur = map.get(p.serviceName)
      // 우선순위: approved > pending > rejected
      if (!cur || (cur === 'rejected' && p.status !== 'rejected') || (cur === 'pending' && p.status === 'approved')) {
        map.set(p.serviceName, p.status)
      }
    }
    return map
  }, [items])

  const approved = items.filter((p) => p.status === 'approved').length
  const pending = items.filter((p) => p.status === 'pending').length
  const rejected = items.filter((p) => p.status === 'rejected').length
  const apiCount = services.filter((s) => s.hasApi).length
  const publishRate = services.length > 0 ? Math.round((approved / services.length) * 100) : 0

  const selectService = (id: string) => {
    setSelectedId(id)
    const s = serviceById(id)
    setIntro(s?.description ?? '')
    setTags(s?.tags ?? [])
    setDemoUrl(s?.testUrl ?? s?.serviceUrl ?? '')
  }

  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags((cur) => [...cur, t])
    setTagDraft('')
  }

  const reset = () => {
    setSelectedId(null)
    setIntro('')
    setTags([])
    setTagDraft('')
    setVisibility('org')
    setPricing('free')
    setPrice('')
    setDemoUrl('')
  }

  const canSubmit = !!selected && intro.trim().length >= 10

  const submit = () => {
    if (!selected) return
    const priceTxt = pricing === 'free' ? '무료' : `${PRICE_LABEL[pricing]}${price ? ` ${price}` : ''}`
    const item: PubItem = {
      id: `pr-new-${seq}`,
      requesterUserId: user.id,
      serviceName: selected.name,
      serviceUrl: selected.serviceUrl,
      demoUrl: demoUrl || selected.serviceUrl,
      meta: `${modelById(selected.model)?.name ?? selected.model} · ${VIS_LABEL[visibility]} · ${priceTxt}`,
      status: 'pending',
      createdAt: nowStamp(),
      visibility,
      pricing,
      isNew: true,
    }
    setItems((cur) => [item, ...cur])
    setSeq((n) => n + 1)
    toast('게시 신청을 접수했어요. 관리자 검토 후 마켓에 노출됩니다.', 'ok')
    reset()
  }

  return (
    <PageShell
      screen="4.29"
      title="서비스 게시 신청"
      desc="내가 배포한 AI 서비스를 마켓플레이스에 게시 신청해요. 관리자 검토(게시 승인) 후 마켓에 노출됩니다."
      actions={<Badge tone={pending > 0 ? 'warn' : 'ok'}>{pending > 0 ? `검토 대기 ${pending}건` : '검토 대기 없음'}</Badge>}
      kpis={
        <>
          <KpiStat
            label="내 배포 서비스"
            value={services.length}
            unit="개"
            sub={`API 제공 ${apiCount}`}
            deltaTone="ok"
            spark={services.map((s) => s.usageCount)}
            icon={<RocketLaunchIcon width={18} height={18} />}
          />
          <KpiStat
            label="게시 승인 · 노출 중"
            value={approved}
            unit="개"
            sub="마켓 노출 중"
            delta="공개됨"
            deltaTone="ok"
            gauge={publishRate}
            gaugeColor="var(--c-ok)"
          />
          <KpiStat
            label="검토 대기"
            value={pending}
            unit="건"
            sub="관리자 게시 승인 대기"
            delta={pending > 0 ? '검토 중' : '없음'}
            deltaTone={pending > 0 ? 'warn' : 'ok'}
            icon={<ClockIcon width={18} height={18} />}
          />
          <KpiStat
            label="반려"
            value={rejected}
            unit="건"
            sub="사유 확인 후 재신청"
            delta={rejected > 0 ? '확인 필요' : '없음'}
            deltaTone={rejected > 0 ? 'danger' : 'muted'}
            icon={<XMarkIcon width={18} height={18} />}
          />
        </>
      }
    >
      <SectionGrid
        ratio="1.5fr 1fr"
        main={
          <>
            <Card
              title={<span className="flex items-center gap-2"><Squares2X2Icon width={15} height={15} className="text-accent" /> 게시할 서비스 선택</span>}
              action={selected ? <span className="text-accent" style={{ fontSize: 13 }}>{selected.name} 선택됨</span> : <span className="text-muted" style={{ fontSize: 13 }}>배포된 서비스에서 선택</span>}
            >
              <div className="grid" style={{ gap: 11, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
                {services.map((s) => {
                  const st = statusByName.get(s.name)
                  const on = selectedId === s.id
                  const Glyph = KIND_ICON[modelById(s.model)?.kind ?? ''] ?? CpuChipIcon
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectService(s.id)}
                      className="flex flex-col text-left rounded-xl transition-colors"
                      style={{
                        padding: 13,
                        gap: 9,
                        background: on ? 'var(--accent-soft)' : 'var(--c-soft)',
                        border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`,
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
                          <Glyph width={18} height={18} />
                        </span>
                        <div className="flex flex-col min-w-0 flex-1" style={{ gap: 1 }}>
                          <span className="font-bold truncate" style={{ fontSize: 14 }}>{s.name}</span>
                          <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{modelById(s.model)?.name ?? s.model}</span>
                        </div>
                        {on && <CheckBadgeIcon width={18} height={18} className="text-accent shrink-0" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {st ? (
                          <StatusBadge status={st} />
                        ) : (
                          <span className="rounded-md" style={{ padding: '2px 8px', fontSize: 12, fontWeight: 600, background: 'var(--c-active)', color: 'var(--c-muted)' }}>미게시</span>
                        )}
                        <span className="rounded-md" style={{ padding: '2px 8px', fontSize: 12, color: 'var(--c-muted)', background: 'var(--c-card)' }}>{s.hasApi ? 'API' : '콘솔'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card title={<span className="flex items-center gap-2"><MegaphoneIcon width={15} height={15} className="text-accent" /> 게시 정보 입력</span>}>
              {!selected ? (
                <EmptyState title="먼저 서비스를 선택하세요" description="위에서 게시할 배포 서비스를 고르면 정보 입력 폼이 채워져요." />
              ) : (
                <div className="flex flex-col" style={{ gap: 16 }}>
                  <Field label="서비스 소개" hint={`${intro.trim().length}/최소 10자`}>
                    <textarea
                      value={intro}
                      onChange={(e) => setIntro(e.target.value)}
                      rows={3}
                      placeholder="마켓플레이스 방문자에게 보일 서비스 소개를 작성하세요."
                      className="w-full rounded-lg outline-none resize-none"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="태그" hint="Enter로 추가 · 칩 클릭 시 제거">
                    <div className="flex flex-wrap items-center gap-2 rounded-lg" style={{ padding: '8px 10px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>
                      {tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                          className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
                          style={{ padding: '3px 8px', fontSize: 13, fontWeight: 600, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}
                        >
                          #{t}<XMarkIcon width={12} height={12} />
                        </button>
                      ))}
                      <input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                        placeholder={tags.length ? '' : '태그 입력 후 Enter'}
                        className="bg-transparent outline-none flex-1 min-w-[100px]"
                        style={{ fontSize: 14, color: 'var(--c-text)' }}
                        aria-label="태그 입력"
                      />
                    </div>
                  </Field>

                  <Field label="공개 범위">
                    <div className="grid" style={{ gap: 9, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {VIS_OPTS.map((o) => {
                        const on = visibility === o.key
                        const Glyph = o.icon
                        return (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => setVisibility(o.key)}
                            className="flex flex-col items-start rounded-lg transition-colors"
                            style={{ padding: '10px 12px', gap: 4, background: on ? 'var(--accent-soft)' : 'var(--c-soft)', border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}` }}
                          >
                            <span className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 14, color: on ? 'var(--c-accent)' : 'var(--c-text)' }}>
                              <Glyph width={15} height={15} /> {o.label}
                            </span>
                            <span className="text-muted" style={{ fontSize: 12.5 }}>{o.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <div className="grid" style={{ gap: 16, gridTemplateColumns: '1fr 1fr' }}>
                    <Field label="요금제">
                      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                        {PRICE_OPTS.map((o) => {
                          const on = pricing === o.key
                          return (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => setPricing(o.key)}
                              className="flex-1 font-semibold transition-colors"
                              style={{ padding: '9px 4px', fontSize: 13.5, background: on ? 'var(--c-accent)' : 'transparent', color: on ? 'var(--c-onaccent)' : 'var(--c-muted)' }}
                            >
                              {o.label}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <Field label="가격" hint={pricing === 'free' ? '무료는 입력 불필요' : ''}>
                      <div className="flex items-center gap-2 rounded-lg" style={{ padding: '0 12px', background: pricing === 'free' ? 'var(--c-active)' : 'var(--c-soft)', border: '1px solid var(--c-border)', opacity: pricing === 'free' ? 0.6 : 1 }}>
                        <CurrencyDollarIcon width={15} height={15} className="text-muted shrink-0" />
                        <input
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          disabled={pricing === 'free'}
                          placeholder={pricing === 'subscription' ? '월 50,000원' : '1K 토큰당 2원'}
                          className="bg-transparent outline-none w-full"
                          style={{ padding: '9px 0', fontSize: 14, color: 'var(--c-text)' }}
                        />
                      </div>
                    </Field>
                  </div>

                  <Field label="데모 / 플레이그라운드 URL">
                    <input
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="http://svc.anclave.local/…/playground"
                      className="w-full rounded-lg outline-none"
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13.5 }}
                    />
                  </Field>

                  <div className="flex items-center justify-between gap-3" style={{ paddingTop: 4 }}>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>
                      {canSubmit ? '검토 후 마켓플레이스에 노출됩니다.' : '서비스 선택과 10자 이상 소개가 필요해요.'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" onClick={reset}>초기화</Button>
                      <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                        <MegaphoneIcon width={15} height={15} /> 게시 신청
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </>
        }
        side={
          <>
            <Card
              flush
              title={
                <span className="flex items-center gap-2">
                  내 게시 신청 상태
                  <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{items.length}</span>
                </span>
              }
            >
              {items.length === 0 ? (
                <EmptyState title="신청 내역이 없어요" description="서비스를 선택해 첫 게시 신청을 보내보세요." />
              ) : (
                <div className="flex flex-col">
                  {items.map((p, i) => (
                    <div key={p.id} className="flex flex-col" style={{ padding: '12px 14px', gap: 7, borderTop: i === 0 ? 'none' : '1px solid var(--c-border-s)', background: p.isNew ? 'var(--accent-soft)' : 'transparent' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate" style={{ fontSize: 14 }}>{p.serviceName}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{p.meta}</span>
                      <div className="flex items-center gap-1.5 text-muted" style={{ fontSize: 12 }}>
                        <ClockIcon width={12} height={12} /> {p.createdAt}
                      </div>
                      {p.status === 'rejected' && p.rejectReason && (
                        <span className="rounded-md" style={{ padding: '6px 9px', fontSize: 12.5, lineHeight: 1.45, color: 'var(--c-danger)', background: 'var(--danger-soft)' }}>{p.rejectReason}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title={<span className="flex items-center gap-2"><ArrowTrendingUpIcon width={15} height={15} className="text-accent" /> 게시 절차</span>}>
              <ol className="flex flex-col" style={{ gap: 11 }}>
                {PUBLISH_STEPS.map((s, i) => (
                  <li key={s.title} className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center rounded-md shrink-0 font-bold" style={{ width: 22, height: 22, fontSize: 13, background: i === 2 ? 'var(--warn-soft)' : 'var(--accent-soft)', color: i === 2 ? 'var(--c-warn)' : 'var(--c-accent)' }}>{i + 1}</span>
                    <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
                      <span className="font-semibold" style={{ fontSize: 14 }}>{s.title}</span>
                      <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{s.body}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex items-center gap-2" style={{ marginTop: 13, paddingTop: 12, borderTop: '1px solid var(--c-border-s)' }}>
                <TagIcon width={15} height={15} className="text-accent shrink-0" />
                <span className="text-muted" style={{ fontSize: 12.5 }}>소개·태그가 충실할수록 검토가 빨라요.</span>
              </div>
            </Card>
          </>
        }
      />
    </PageShell>
  )
}

const PUBLISH_STEPS = [
  { title: '서비스 선택', body: '할당받은 GPU에 배포한 서비스 중 하나를 고릅니다.' },
  { title: '게시 정보 입력', body: '소개·태그·공개 범위·요금을 작성해 신청합니다.' },
  { title: '관리자 게시 승인', body: '관리자가 게시 승인(4.9)에서 검토해 승인/반려합니다.' },
  { title: '마켓 노출', body: '승인되면 마켓플레이스 목록에 노출돼 동료가 사용합니다.' },
]

const inputStyle: CSSProperties = {
  padding: '9px 12px',
  fontSize: 14,
  background: 'var(--c-soft)',
  border: '1px solid var(--c-border)',
  color: 'var(--c-text)',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 7 }}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold" style={{ fontSize: 14 }}>{label}</span>
        {hint && <span className="text-muted" style={{ fontSize: 12.5 }}>{hint}</span>}
      </span>
      {children}
    </label>
  )
}

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  KeyIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  PlusIcon,
  MegaphoneIcon,
  SignalIcon,
  CpuChipIcon,
  InboxArrowDownIcon,
  ClockIcon,
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
  Modal,
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

// G9 · 내 마켓 활동 관점 — 4.19 API 신청 관리(B·소유자): 내 서비스에 온 key 신청 관리 + 서비스별 발급 요약.
//                       4.29 서비스 게시 신청(B=C): 자원 신청현황(4.6) 톤의 깔끔한 내 신청 목록 + 신규 신청 모달.
// 더미는 src/data 시드(apiRequests·apiKeyUsages·publishRequests·services)를 정본으로 사용.

const fmtInt = (n: number) => n.toLocaleString('en-US')
const maskKey = (k: string) => (k.length > 14 ? `${k.slice(0, 12)}••••${k.slice(-4)}` : k)
const randomKey = (slug: string) => {
  const hex = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `ak_live_${slug}_${hex}`
}

// ════════════════════════ 4.19 API 신청 관리 (B · 소유자) ════════════════════════
// 내가 마켓에 올린 서비스에 대해 다른 사용자가 요청한 API key 신청을 승인·관리한다.

export function ApiApprovals() {
  const { push: toast } = useToast()
  const [reqs, setReqs] = useState<ApiRequest[]>(() => apiRequests.map((r) => ({ ...r })))

  // 내 API 서비스(마켓에 올린, API 제공) — 발급 요약의 단위.
  const apiServices = useMemo(() => services.filter((s) => s.hasApi), [])
  const usageOf = (sid: string) => apiKeyUsages.find((u) => u.serviceId === sid)
  const issuedOf = (sid: string) => reqs.filter((r) => r.status === 'approved' && r.serviceId === sid).length

  const approve = (id: string) => {
    setReqs((cur) =>
      cur.map((r) => {
        if (r.id !== id) return r
        const slug = serviceById(r.serviceId)?.name.split('-')[0] ?? 'svc'
        return { ...r, status: 'approved', apiKey: randomKey(slug) }
      }),
    )
    toast('API 키를 발급했어요. 신청자에게 알림이 전송됩니다.', 'ok')
  }

  const reject = (id: string) => {
    setReqs((cur) =>
      cur.map((r) => (r.id === id ? { ...r, status: 'rejected', rejectReason: '대상 서비스 URL이 사내망에서 확인되지 않아요.' } : r)),
    )
    toast('신청을 반려했어요.', 'warn')
  }

  const copyKey = (key: string) => {
    navigator.clipboard?.writeText(key).then(
      () => toast('API 키를 클립보드에 복사했어요.', 'info'),
      () => toast('복사에 실패했어요. 수동으로 선택해 복사해 주세요.', 'danger'),
    )
  }

  const pending = reqs.filter((r) => r.status === 'pending').length
  const totalIssued = reqs.filter((r) => r.status === 'approved').length
  const activeConnections = apiServices.reduce((a, s) => a + (usageOf(s.id)?.connections ?? 0), 0)
  const issuedSpark = apiServices.map((s) => issuedOf(s.id) || 0.001)
  const connSpark = apiServices.map((s) => usageOf(s.id)?.connections ?? 0)
  const backlog = reqs.length > 0 ? Math.round((pending / reqs.length) * 100) : 0

  const columns: Column<ApiRequest>[] = [
    {
      key: 'requester',
      header: '요청자',
      width: '20%',
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
      width: '22%',
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
      key: 'created',
      header: '신청일',
      width: '14%',
      render: (r) => <span className="text-muted" style={{ fontSize: 13 }}>{r.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '10%',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'action',
      header: '검토 · 키',
      width: '34%',
      align: 'right',
      render: (r) => {
        if (r.status === 'pending') {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="primary" onClick={() => approve(r.id)} style={{ padding: '5px 12px', fontSize: 13 }}>
                <CheckIcon width={14} height={14} /> 승인 · 발급
              </Button>
              <Button variant="danger" onClick={() => reject(r.id)} style={{ padding: '5px 12px', fontSize: 13 }}>반려</Button>
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
      title="API 신청 관리"
      desc="내가 마켓에 올린 서비스에 들어온 API 키 신청을 검토·발급하고, 서비스별 발급 현황을 관리해요. (소유자)"
      actions={<Badge tone={pending > 0 ? 'warn' : 'ok'}>{pending > 0 ? `대기 신청 ${pending}건` : '대기 신청 없음'}</Badge>}
      kpis={
        <>
          <KpiStat
            label="총 발급 키"
            value={totalIssued}
            unit="개"
            sub={`내 API 서비스 ${apiServices.length}개`}
            deltaTone="ok"
            spark={issuedSpark}
            icon={<KeyIcon width={18} height={18} />}
          />
          <KpiStat
            label="대기 신청"
            value={pending}
            unit="건"
            sub={`누적 신청 ${reqs.length}건`}
            delta={pending > 0 ? '검토 필요' : '처리 완료'}
            deltaTone={pending > 0 ? 'warn' : 'ok'}
            gauge={backlog}
            gaugeColor="var(--c-warn)"
          />
          <KpiStat
            label="활성 연결"
            value={activeConnections}
            unit="개"
            sub="내 서비스 소비자 연결"
            deltaTone="ok"
            spark={connSpark}
            icon={<SignalIcon width={18} height={18} />}
          />
        </>
      }
    >
      <SectionGrid
        ratio="1.55fr 1fr"
        main={
          <Card
            flush
            title={
              <span className="flex items-center gap-2">
                <InboxArrowDownIcon width={15} height={15} className="text-accent" /> 받은 API 키 신청
                <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{reqs.length}</span>
              </span>
            }
            action={<span className="text-muted" style={{ fontSize: 13 }}>승인 시 즉시 키 발급 · 행에서 복사</span>}
          >
            <Table columns={columns} rows={reqs} rowKey={(r) => r.id} empty="아직 받은 API 키 신청이 없어요." />
          </Card>
        }
        side={
          <Card
            flush
            title={
              <span className="flex items-center gap-2">
                <CpuChipIcon width={15} height={15} className="text-accent" /> 서비스별 발급 현황
                <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{apiServices.length}</span>
              </span>
            }
          >
            <div className="flex flex-col">
              {apiServices.map((s, i) => {
                const usage = usageOf(s.id)
                const issued = issuedOf(s.id)
                const weekly = usage ? usage.calls.reduce((a, b) => a + b, 0) : 0
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3"
                    style={{ padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--c-border-s)' }}
                  >
                    <div className="flex flex-col min-w-0 flex-1" style={{ gap: 3 }}>
                      <span className="font-semibold truncate" style={{ fontSize: 14 }}>{s.name}</span>
                      <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{modelById(s.model)?.name ?? s.model}</span>
                      <div className="flex items-center gap-2" style={{ marginTop: 1 }}>
                        <span className="rounded-md whitespace-nowrap" style={{ padding: '2px 8px', fontSize: 12, fontWeight: 700, color: issued > 0 ? 'var(--c-accent)' : 'var(--c-muted)', background: issued > 0 ? 'var(--accent-soft)' : 'var(--c-active)' }}>
                          발급 {issued}개
                        </span>
                        <span className="flex items-center gap-1 text-muted whitespace-nowrap" style={{ fontSize: 12 }}>
                          <SignalIcon width={12} height={12} /> 연결 {usage?.connections ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0" style={{ gap: 4, width: 92 }}>
                      {usage ? (
                        <>
                          <MiniSpark data={usage.calls} />
                          <span className="text-muted whitespace-nowrap" style={{ fontSize: 11.5 }}>주 {fmtInt(weekly)}회</span>
                        </>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>호출 없음</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        }
      />
    </PageShell>
  )
}

// 서비스별 주간 호출 미니 스파크(가로 채움 막대 아님 — 꺾은선 면적).
function MiniSpark({ data }: { data: number[] }) {
  const W = 88, H = 26
  const top = Math.max(1, ...data)
  const bot = Math.min(...data)
  const span = Math.max(1, top - bot)
  const n = data.length
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (v: number) => 2 + (1 - (v - bot) / span) * (H - 4)
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: W, height: H, display: 'block' }} aria-hidden>
      <polygon points={area} fill="var(--c-accent)" opacity={0.13} />
      <polyline points={line} fill="none" stroke="var(--c-accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ════════════════════════ 4.29 서비스 게시 신청 (B = C) ════════════════════════
// 자원 신청현황(4.6) 톤 — '내가 신청한 게시 목록' 중심 + 신규 게시 신청 모달.

interface PubItem extends PublishReq {
  isNew?: boolean
}

const VIS_OPTS = ['전사 공개', '팀 한정', '링크 보유자']
const PRICE_OPTS = ['무료', '구독형', '종량제']

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const STATUS_FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
]

export function PublishRequest() {
  const { push: toast } = useToast()
  const { user } = useRole()
  const [items, setItems] = useState<PubItem[]>(() => publishRequests.map((p) => ({ ...p })))
  const [seq, setSeq] = useState(1)
  const [filter, setFilter] = useState<'all' | Status>('all')

  // 신규 신청 모달
  const [open, setOpen] = useState(false)
  const [svcId, setSvcId] = useState('')
  const [intro, setIntro] = useState('')
  const [visibility, setVisibility] = useState(VIS_OPTS[0])
  const [pricing, setPricing] = useState(PRICE_OPTS[0])

  const counts = {
    all: items.length,
    pending: items.filter((p) => p.status === 'pending').length,
    approved: items.filter((p) => p.status === 'approved').length,
    rejected: items.filter((p) => p.status === 'rejected').length,
  }
  const shown = filter === 'all' ? items : items.filter((p) => p.status === filter)

  const openModal = () => {
    setSvcId('')
    setIntro('')
    setVisibility(VIS_OPTS[0])
    setPricing(PRICE_OPTS[0])
    setOpen(true)
  }

  const selected = svcId ? serviceById(svcId) : undefined
  const canSubmit = !!selected && intro.trim().length >= 10

  const submit = () => {
    if (!selected) return
    const item: PubItem = {
      id: `pr-new-${seq}`,
      requesterUserId: user.id,
      serviceName: selected.name,
      serviceUrl: selected.serviceUrl,
      demoUrl: selected.testUrl ?? selected.serviceUrl,
      meta: `${modelById(selected.model)?.name ?? selected.model} · ${visibility} · ${pricing}`,
      status: 'pending',
      createdAt: nowStamp(),
      isNew: true,
    }
    setItems((cur) => [item, ...cur])
    setSeq((n) => n + 1)
    setOpen(false)
    toast('게시 신청을 접수했어요. 관리자 검토 후 마켓에 노출됩니다.', 'ok')
  }

  const columns: Column<PubItem>[] = [
    {
      key: 'service',
      header: '서비스',
      width: '26%',
      render: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            <MegaphoneIcon width={16} height={16} />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate">{p.serviceName}</span>
            {p.isNew && <span className="text-accent" style={{ fontSize: 12 }}>방금 신청</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'meta',
      header: '게시 정보',
      width: '34%',
      render: (p) => <span className="text-muted truncate" style={{ fontSize: 13.5 }}>{p.meta}</span>,
    },
    {
      key: 'created',
      header: '신청일',
      width: '16%',
      render: (p) => <span className="text-muted" style={{ fontSize: 13 }}>{p.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '12%',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'note',
      header: '비고',
      width: '12%',
      align: 'right',
      render: (p) =>
        p.status === 'rejected' && p.rejectReason ? (
          <span className="text-danger truncate inline-block max-w-full" style={{ fontSize: 13 }} title={p.rejectReason}>반려 사유</span>
        ) : p.status === 'approved' ? (
          <span className="text-muted" style={{ fontSize: 13 }}>마켓 노출</span>
        ) : (
          <span className="text-muted" style={{ fontSize: 13 }}>검토 중</span>
        ),
    },
  ]

  return (
    <>
      <PageShell
        screen="4.29"
        title="서비스 게시 신청"
        desc="내가 배포한 AI 서비스를 마켓플레이스에 게시 신청해요. 관리자 검토(게시 승인) 후 마켓에 노출됩니다."
        actions={
          <Button variant="primary" onClick={openModal}>
            <PlusIcon width={15} height={15} /> 신규 게시 신청
          </Button>
        }
        kpis={
          <>
            <StatTile label="전체 신청" value={counts.all} tone="accent" active={filter === 'all'} onClick={() => setFilter('all')} />
            <StatTile label="검토 대기" value={counts.pending} tone="warn" active={filter === 'pending'} onClick={() => setFilter('pending')} />
            <StatTile label="승인 · 노출" value={counts.approved} tone="ok" active={filter === 'approved'} onClick={() => setFilter('approved')} />
            <StatTile label="반려" value={counts.rejected} tone="danger" active={filter === 'rejected'} onClick={() => setFilter('rejected')} />
          </>
        }
      >
        <Card
          flush
          title={
            <span className="flex items-center gap-2">
              내 게시 신청
              <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{shown.length}</span>
            </span>
          }
          action={
            <div className="flex items-center gap-1.5">
              {STATUS_FILTERS.map((f) => {
                const on = filter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className="rounded-lg whitespace-nowrap transition-colors"
                    style={{ padding: '4px 11px', fontSize: 13, fontWeight: 600, color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}` }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          }
        >
          {shown.length === 0 ? (
            <EmptyState
              title="신청 내역이 없어요"
              description="배포한 서비스를 골라 첫 게시 신청을 보내보세요."
              cta={<Button variant="primary" onClick={openModal}><PlusIcon width={15} height={15} /> 신규 게시 신청</Button>}
            />
          ) : (
            <Table columns={columns} rows={shown} rowKey={(p) => p.id} />
          )}
        </Card>
      </PageShell>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="신규 게시 신청"
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="primary" onClick={submit} disabled={!canSubmit}>
              <MegaphoneIcon width={15} height={15} /> 게시 신청
            </Button>
          </>
        }
      >
        <div className="flex flex-col" style={{ gap: 15 }}>
          <ModalField label="배포 서비스">
            <div className="relative">
              <select value={svcId} onChange={(e) => setSvcId(e.target.value)} className="appearance-none w-full rounded-lg outline-none cursor-pointer" style={{ ...inputStyle, paddingRight: 32 }}>
                <option value="" style={{ color: '#111' }}>게시할 서비스를 선택하세요</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id} style={{ color: '#111' }}>{s.name} · {modelById(s.model)?.name ?? s.model}</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted" style={{ fontSize: 12 }}>▾</span>
            </div>
          </ModalField>

          <ModalField label="서비스 소개" hint={`${intro.trim().length}/최소 10자`}>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={3}
              placeholder={selected ? '마켓플레이스 방문자에게 보일 소개를 작성하세요.' : '먼저 서비스를 선택하세요.'}
              className="w-full rounded-lg outline-none resize-none"
              style={inputStyle}
            />
          </ModalField>

          <div className="grid" style={{ gap: 15, gridTemplateColumns: '1fr 1fr' }}>
            <ModalField label="공개 범위">
              <div className="relative">
                <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="appearance-none w-full rounded-lg outline-none cursor-pointer" style={{ ...inputStyle, paddingRight: 32 }}>
                  {VIS_OPTS.map((o) => <option key={o} value={o} style={{ color: '#111' }}>{o}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted" style={{ fontSize: 12 }}>▾</span>
              </div>
            </ModalField>
            <ModalField label="요금제">
              <div className="relative">
                <select value={pricing} onChange={(e) => setPricing(e.target.value)} className="appearance-none w-full rounded-lg outline-none cursor-pointer" style={{ ...inputStyle, paddingRight: 32 }}>
                  {PRICE_OPTS.map((o) => <option key={o} value={o} style={{ color: '#111' }}>{o}</option>)}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted" style={{ fontSize: 12 }}>▾</span>
              </div>
            </ModalField>
          </div>

          <div className="flex items-center gap-2 rounded-lg" style={{ padding: '9px 12px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>
            <ClockIcon width={15} height={15} className="text-accent shrink-0" />
            <span className="text-muted" style={{ fontSize: 12.5 }}>신청하면 관리자 게시 승인(4.9) 검토 후 마켓플레이스에 노출됩니다.</span>
          </div>
        </div>
      </Modal>
    </>
  )
}

// 4.6 톤의 클릭 가능한 요약 stat 타일 — 값 + 라벨 + 상태 점, 필터 토글.
function StatTile({ label, value, tone, active, onClick }: { label: string; value: number; tone: 'accent' | 'warn' | 'ok' | 'danger'; active: boolean; onClick: () => void }) {
  const color = tone === 'ok' ? 'var(--c-ok)' : tone === 'warn' ? 'var(--c-warn)' : tone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card2 rounded-xl text-left transition-colors flex flex-col justify-center hover-lift"
      style={{ padding: '14px 16px', gap: 4, minHeight: 84, border: `1px solid ${active ? color : 'var(--c-border)'}`, boxShadow: 'var(--shadow-card)' }}
    >
      <span className="flex items-center gap-1.5 text-muted font-semibold" style={{ fontSize: 14 }}>
        <span className="rounded-full" style={{ width: 7, height: 7, background: color }} /> {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{value}<span className="text-muted" style={{ fontSize: 14, fontWeight: 600 }}> 건</span></span>
    </button>
  )
}

const inputStyle: CSSProperties = {
  padding: '9px 12px',
  fontSize: 14,
  background: 'var(--c-soft)',
  border: '1px solid var(--c-border)',
  color: 'var(--c-text)',
}

function ModalField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

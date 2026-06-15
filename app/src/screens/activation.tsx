import { useMemo, useState } from 'react'
import {
  KeyIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  SignalIcon,
  CpuChipIcon,
  InboxArrowDownIcon,
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
import {
  services,
  apiRequests,
  apiKeyUsages,
  publishRequests,
  userById,
  serviceById,
  modelById,
} from '../data'
import type { ApiRequest } from '../data/types'

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

  // 마켓플레이스에 올라와 있는(게시 승인된) 서비스만 = API 키 신청·발급의 대상.
  // publishRequests approved → serviceName 매칭으로 마켓 등록 서비스 추출.
  const marketServices = useMemo(() => {
    const listed = new Set(publishRequests.filter((p) => p.status === 'approved').map((p) => p.serviceName))
    return services.filter((s) => s.hasApi && listed.has(s.name))
  }, [])
  const marketIds = useMemo(() => new Set(marketServices.map((s) => s.id)), [marketServices])

  // 받은 신청도 마켓 등록 서비스 대상 건만(대상 서비스 = 마켓에 올라와 있는 서비스).
  const [reqs, setReqs] = useState<ApiRequest[]>(() =>
    apiRequests.filter((r) => marketIds.has(r.serviceId)).map((r) => ({ ...r })),
  )

  const apiServices = marketServices
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
            <span className="text-muted truncate" style={{ fontSize: 13 }}>{[s?.kind, modelById(r.model)?.name ?? r.model].filter(Boolean).join(' · ')}</span>
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
      desc="마켓플레이스에 게시된 내 서비스에 들어온 API 키 신청을 검토·발급하고, 서비스별 발급 현황을 관리해요. (소유자)"
      actions={<Badge tone={pending > 0 ? 'warn' : 'ok'}>{pending > 0 ? `대기 신청 ${pending}건` : '대기 신청 없음'}</Badge>}
      kpis={
        <>
          <KpiStat
            label="총 발급 키"
            value={totalIssued}
            unit="개"
            sub={`마켓 게시 서비스 ${apiServices.length}개`}
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
            {apiServices.length === 0 ? (
              <EmptyState title="마켓 게시 서비스가 없어요" description="게시 승인된 서비스가 있어야 API 키를 발급할 수 있어요." />
            ) : (
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
                      <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{[s.kind, modelById(s.model)?.name ?? s.model].filter(Boolean).join(' · ')}</span>
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
            )}
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

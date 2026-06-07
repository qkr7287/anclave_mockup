import type { ReactNode } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandLineIcon, BeakerIcon, BoltIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '../components/PageHeader'
import { Card, Button, EmptyState, KpiStat, StatusBadge, Modal, useBriefLoad, SkeletonRows } from '../components/ui'
import { LineChart, Heatmap } from '../components/charts'
import { useRole } from '../lib/role'
import { servers, allGpus } from '../data/servers'
import { services } from '../data/services'
import { modelById } from '../data/models'
import { events } from '../data/events'
import { gpuRequests, apiRequests, publishRequests } from '../data/requests'
import { serviceById } from '../data/services'
import { avg, series, fmtCompact } from '../lib/metrics'
import type { Status } from '../data/types'

// ── 4.5 내 할당 자원 (실무 대시보드 · B=C) ────────────────
export function MyResources() {
  const navigate = useNavigate()
  const { user } = useRole()

  if (!user.hasHosting) {
    return (
      <Page title="내 할당 자원" screen="4.5">
        <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
          <EmptyState
            icon={<BoltIcon width={26} height={26} />}
            title="호스팅 후 이용할 수 있어요"
            description="아직 할당받은 GPU 자원이 없어요. 자원을 신청하면 승인 후 이 대시보드에서 모니터링할 수 있어요."
            cta={<Button variant="primary" onClick={() => navigate('/requests')}>자원 신청하러 가기</Button>}
          />
        </div>
      </Page>
    )
  }

  const myGpus = allGpus.filter((g) => g.assignedUserId === user.id || (g.slices ?? []).some((s) => s.ownerUserId === user.id))
  const mySlices = allGpus.flatMap((g) => g.slices ?? []).filter((s) => s.ownerUserId === user.id)
  const myServers = servers.filter((s) => s.gpus.some((g) => myGpus.includes(g)))
  const myServices = services.filter((s) => s.ownerUserId === user.id)

  if (myGpus.length === 0) {
    return (
      <Page title="내 할당 자원" screen="4.5">
        <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
          <EmptyState title="할당된 자원이 없어요" description="현재 계정에 직접 할당된 GPU 자원이 없어요. 신청 후 승인되면 표시돼요." cta={<Button variant="outline" onClick={() => navigate('/requests')}>신청 관리로</Button>} />
        </div>
      </Page>
    )
  }

  const smUtil = Math.round(avg(myGpus.map((g) => g.smUtil)))
  const vram = Math.round(avg(myGpus.map((g) => g.vramUtil)))
  const cpu = Math.round(avg(myServers.map((s) => s.cpuUtil)))
  const mem = Math.round(avg(myServers.map((s) => s.memUtil)))
  const temp = Math.round(avg(myGpus.map((g) => g.temp)))
  const power = myGpus.reduce((a, g) => a + g.power, 0)
  const myGpuIds = new Set(myGpus.map((g) => g.id))
  const myLogs = events.filter((e) => e.gpuId && myGpuIds.has(e.gpuId)).slice(0, 5)
  const tokenSeries = series(user.id.length + 7, 24, 1200, 4800)

  return (
    <Page
      title="내 할당 자원"
      screen="4.5"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline"><CommandLineIcon width={15} height={15} className="text-accent" />콘솔</Button>
          <Button variant="outline"><BeakerIcon width={15} height={15} className="text-accent" />주피터</Button>
        </div>
      }
    >
      <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(6, minmax(0,1fr))' }}>
        <KpiStat label="작업률" value={smUtil} unit="%" bar={smUtil} />
        <KpiStat label="VRAM" value={vram} unit="%" bar={vram} />
        <KpiStat label="CPU" value={cpu} unit="%" bar={cpu} />
        <KpiStat label="시스템 MEM" value={mem} unit="%" bar={mem} />
        <KpiStat label="평균 온도" value={temp} unit="°C" />
        <KpiStat label="전력 합계" value={power} unit="W" />
      </div>

      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <Card title="토큰 사용량 추이">
          <LineChart data={tokenSeries} height={150} />
          <div className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>최근 24시간 · 합계 {fmtCompact(tokenSeries.reduce((a, b) => a + b, 0))} 토큰</div>
        </Card>
        <Card title="내 서비스 · 워크로드">
          <div className="flex flex-col" style={{ gap: 8 }}>
            {myServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '8px 10px' }}>
                <span className="truncate" style={{ fontSize: 14 }}>{s.name}</span>
                <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{modelById(s.model)?.name}</span>
              </div>
            ))}
            {mySlices.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '8px 10px' }}>
                <span className="truncate" style={{ fontSize: 14 }}>{s.containerId ?? s.profile}</span>
                <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{modelById(s.modelId ?? '')?.name} · {s.usage}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="최근 로그">
        {myLogs.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 14 }}>최근 로그가 없어요.</div>
        ) : (
          <div className="flex flex-col" style={{ gap: 2 }}>
            {myLogs.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5" style={{ padding: '6px 0', fontSize: 14 }}>
                <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: e.severity === 'critical' ? 'var(--c-danger)' : e.severity === 'warn' ? 'var(--c-warn)' : e.severity === 'recovered' ? 'var(--c-ok)' : 'var(--c-accent)' }} />
                <span className="flex-1 min-w-0 truncate">{e.message}</span>
                <span className="text-muted shrink-0">{e.createdAt.slice(11)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  )
}

function Page({ title, screen, action, children }: { title: string; screen: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <PageHeader title={title} screen={screen} action={action} />
      {children}
    </div>
  )
}

// ── 4.6 자원 신청현황 (B=C) ───────────────────────────────
interface MyReq { id: string; type: string; label: string; status: Status; createdAt: string; rejectReason?: string }
export function RequestStatus() {
  const navigate = useNavigate()
  const { user } = useRole()
  const [reason, setReason] = useState<string | null>(null)

  const rows: MyReq[] = [
    ...gpuRequests.filter((r) => r.requesterUserId === user.id).map((r) => ({ id: r.id, type: 'GPU', label: `${r.serviceName} · ${r.capacity}${r.capacityUnit === 'card' ? '장' : ' 슬라이스'}`, status: r.status, createdAt: r.createdAt, rejectReason: r.rejectReason })),
    ...apiRequests.filter((r) => r.requesterUserId === user.id).map((r) => ({ id: r.id, type: 'API', label: `${serviceById(r.serviceId)?.name ?? r.serviceId}`, status: r.status, createdAt: r.createdAt, rejectReason: r.rejectReason })),
    ...publishRequests.filter((r) => r.requesterUserId === user.id).map((r) => ({ id: r.id, type: '게시', label: r.serviceName, status: r.status, createdAt: r.createdAt, rejectReason: r.rejectReason })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const counts = { pending: rows.filter((r) => r.status === 'pending').length, approved: rows.filter((r) => r.status === 'approved').length, rejected: rows.filter((r) => r.status === 'rejected').length }

  return (
    <Page title="자원 신청현황" screen="4.6" action={<Button variant="primary" onClick={() => navigate('/requests')}>신청하러 가기</Button>}>
      {rows.length === 0 ? (
        <Card><EmptyState title="아직 신청한 자원이 없어요" description="필요한 자원을 신청하면 처리 상태를 여기서 추적할 수 있어요." cta={<Button variant="primary" onClick={() => navigate('/requests')}>자원 신청하러 가기</Button>} /></Card>
      ) : (
        <>
          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            <KpiStat label="대기" value={counts.pending} unit="건" />
            <KpiStat label="승인" value={counts.approved} unit="건" />
            <KpiStat label="반려" value={counts.rejected} unit="건" />
          </div>
          <Card title="내 신청 내역" flush>
            <div className="flex flex-col">
              {rows.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between gap-3" style={{ padding: '11px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--c-border-s)', background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-accent shrink-0" style={{ fontSize: 14, padding: '1px 8px', borderRadius: 12, background: 'var(--accent-soft)' }}>{r.type}</span>
                    <span className="truncate" style={{ fontSize: 14 }}>{r.label}</span>
                    <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{r.createdAt}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'rejected' && r.rejectReason && <button type="button" className="text-accent" style={{ fontSize: 14 }} onClick={() => setReason(r.rejectReason ?? '')}>사유</button>}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      <Modal open={reason != null} onClose={() => setReason(null)} title="반려 사유" footer={<Button variant="outline" onClick={() => setReason(null)}>닫기</Button>}>
        <p style={{ fontSize: 14 }}>{reason}</p>
      </Modal>
    </Page>
  )
}

// ── 4.7 관제 모니터링 (A · 빅스크린) ──────────────────────
export function AdminMonitoring() {
  const loading = useBriefLoad()
  const totalGpus = allGpus.length
  const dangerGpus = allGpus.filter((g) => g.health === 'danger').length
  const avgUtil = Math.round(avg(allGpus.map((g) => g.smUtil)))
  const openAlerts = events.filter((e) => e.status === 'open').length
  const heatRows = servers.map((s) => ({ label: s.host, values: s.gpus.map((g) => g.smUtil) }))

  return (
    <Page title="관제 모니터링" screen="4.7">
      {loading ? (
        <Card><SkeletonRows rows={8} /></Card>
      ) : (
        <>
          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <KpiStat label="전체 GPU 가동률" value={avgUtil} unit="%" bar={avgUtil} />
            <KpiStat label="활성 서버" value={servers.filter((s) => s.health !== 'inactive').length} unit={`/ ${servers.length}`} />
            <KpiStat label="장애 GPU" value={dangerGpus} unit="장" deltaTone={dangerGpus > 0 ? 'danger' : 'muted'} />
            <KpiStat label="미확인 알럿" value={openAlerts} unit="건" />
          </div>
          <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
            <Card title={`헬스 히트맵 · 서버 ${servers.length} × GPU ${totalGpus / servers.length}`}>
              <Heatmap rows={heatRows} colLabels={['GPU0', 'GPU1', 'GPU2', 'GPU3']} />
            </Card>
            <Card title="부하 · 알럿 추이">
              <div className="text-muted mb-1" style={{ fontSize: 14 }}>전체 가동률</div>
              <LineChart data={series(3, 30, 40, 80)} height={110} />
              <div className="text-muted mb-1 mt-3" style={{ fontSize: 14 }}>알럿 발생</div>
              <LineChart data={series(9, 30, 0, 6)} height={90} max={8} color="var(--c-danger)" />
            </Card>
          </div>
        </>
      )}
    </Page>
  )
}

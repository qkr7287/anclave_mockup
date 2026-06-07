import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { servers, serverById, gpuById, allSlices } from '../data/servers'
import { events as eventLogs } from '../data/events'
import { userById } from '../data/users'
import { modelById } from '../data/models'
import { services, serviceById } from '../data/services'
import type { EventLog, Gpu, MigSlice, Service } from '../data/types'
import {
  Card,
  Badge,
  HealthBadge,
  SeverityBadge,
  Button,
  StepBack,
  FloatingButtons,
  Drawer,
  CriticalAlert,
} from '../components/ui'
import { Hexagon, HexTile, LineChart, ArcGauge } from '../components/charts'
import { BAND_LEGEND, hatchBackground } from '../components/charts/bands'
import { serverUsage, summarizeSlices, isSliceFree, series, fmtCompact } from '../lib/metrics'

// 슬라이스 owner+model → 서비스 추정
function serviceForSlice(s: MigSlice): Service | undefined {
  if (!s.ownerUserId || !s.modelId) return undefined
  return services.find((sv) => sv.ownerUserId === s.ownerUserId && sv.model === s.modelId)
}

// ── 공통 작은 조각 ────────────────────────────────────────
function BandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {BAND_LEGEND.map((b) => (
        <span key={b.label} className="inline-flex items-center gap-1.5 text-muted" style={{ fontSize: 14 }}>
          <span className="rounded-sm" style={{ width: 11, height: 11, background: b.color }} />
          {b.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-muted" style={{ fontSize: 14 }}>
        <span className="rounded-sm" style={{ width: 11, height: 11, backgroundImage: hatchBackground, background: 'var(--c-soft)' }} />
        가용(빈 슬라이스)
      </span>
    </div>
  )
}

function SeverityDot({ severity }: { severity: EventLog['severity'] }) {
  const c =
    severity === 'critical' ? 'var(--c-danger)' : severity === 'warn' ? 'var(--c-warn)' : severity === 'recovered' ? 'var(--c-ok)' : 'var(--c-accent)'
  return <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: c }} />
}

function KpiBox({ label, value, unit, bar, tone }: { label: string; value: string; unit?: string; bar?: number; tone?: 'normal' | 'danger' }) {
  return (
    <div className="bg-card2 border border-line rounded-xl min-w-0" style={{ padding: '14px 16px', boxShadow: 'var(--shadow-card)' }}>
      <div className="text-muted font-semibold truncate" style={{ fontSize: 14 }}>{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px', color: tone === 'danger' ? 'var(--c-danger)' : 'var(--c-text)' }}>{value}</span>
        {unit && <span className="text-muted" style={{ fontSize: 14 }}>{unit}</span>}
      </div>
      {bar != null && (
        <div className="mt-2 rounded-full overflow-hidden" style={{ height: 6, background: 'var(--c-soft)' }}>
          <div className="h-full rounded-full" style={{ width: `${bar}%`, background: 'var(--c-accent)' }} />
        </div>
      )}
    </div>
  )
}

// 서버 타일 안 GPU 4개 미니 헥사 (2×2 honeycomb)
function MiniHexCluster({ gpus }: { gpus: Gpu[] }) {
  const rows = [gpus.slice(0, 2), gpus.slice(2, 4)]
  return (
    <div className="flex flex-col items-center">
      {rows.map((row, ri) => (
        <div key={ri} className="flex" style={{ gap: 4, marginTop: ri === 0 ? 0 : -7, marginLeft: ri === 1 ? 16 : 0 }}>
          {row.map((g) => (
            <HexTile key={g.id} usage={g.smUtil} free={g.health === 'inactive'} width={32} height={36} title={`${g.name} · ${g.health === 'danger' ? 'XID 장애' : `${g.smUtil}%`}`}>
              {g.health === 'danger' && <span style={{ fontSize: 12, fontWeight: 800 }}>!</span>}
            </HexTile>
          ))}
        </div>
      ))}
    </div>
  )
}

function SliceBar({ used, free }: { used: number; free: number }) {
  const total = used + free || 1
  return (
    <div className="flex rounded-md overflow-hidden" style={{ height: 16, background: 'var(--c-soft)' }}>
      <div style={{ width: `${(used / total) * 100}%`, background: 'var(--c-accent)' }} />
      <div style={{ width: `${(free / total) * 100}%`, backgroundImage: hatchBackground }} />
    </div>
  )
}

function EventList({ items }: { items: EventLog[] }) {
  if (items.length === 0) return <div className="text-muted" style={{ fontSize: 14 }}>이벤트가 없어요.</div>
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {items.map((e) => (
        <div key={e.id} className="border-b border-line pb-2.5 last:border-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge severity={e.severity} />
            <span className="text-muted ml-auto" style={{ fontSize: 14 }}>{e.createdAt}</span>
          </div>
          <div style={{ fontSize: 14 }}>{e.message}</div>
          {e.action && <div className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>조치: {e.action}</div>}
        </div>
      ))}
    </div>
  )
}

function NotFoundServer() {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 320 }}>
      <div className="text-center">
        <div className="font-bold" style={{ fontSize: 15 }}>대상을 찾을 수 없어요</div>
        <div className="mt-3"><Button variant="outline" onClick={() => navigate('/resource-map')}>전체 서버로</Button></div>
      </div>
    </div>
  )
}

// ── 4.2 전체 서버 모니터링 ────────────────────────────────
export function ResourceMap() {
  const navigate = useNavigate()
  const [scope, setScope] = useState<string>('all')
  const [alertOpen, setAlertOpen] = useState(true)

  const totalGpus = servers.reduce((a, s) => a + s.gpus.length, 0)
  const dangerCount = servers.filter((s) => s.health === 'danger').length
  const warnCount = servers.filter((s) => s.health === 'warn').length
  const avgUtil = Math.round(servers.reduce((a, s) => a + serverUsage(s), 0) / servers.length)

  const scopeSlices = scope === 'all' ? allSlices : serverById(scope)?.gpus.flatMap((g) => g.slices ?? []) ?? []
  const sliceSummary = summarizeSlices(scopeSlices)
  const recentEvents = eventLogs.slice(0, 7)
  const critical = eventLogs.find((e) => e.severity === 'critical' && e.status === 'open')

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <header className="flex items-center" style={{ gap: 8 }}>
        <h2 className="font-bold" style={{ fontSize: 18 }}>전체 서버 모니터링</h2>
        <span className="text-muted font-mono" style={{ fontSize: 14, padding: '1px 7px', borderRadius: 6, background: 'var(--c-soft)' }}>4.2</span>
      </header>

      <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <KpiBox label="전체 GPU 가동률" value={`${avgUtil}%`} bar={avgUtil} />
        <KpiBox label="서버" value={String(servers.length)} unit="대" />
        <KpiBox label="GPU" value={String(totalGpus)} unit="장" />
        <KpiBox label="장애 · 경고" value={`${dangerCount} · ${warnCount}`} tone={dangerCount > 0 ? 'danger' : 'normal'} />
      </div>

      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
        <Card title="자원맵 · 전체 서버" action={<span className="text-muted" style={{ fontSize: 14 }}>서버 타일 클릭 → 단일 서버</span>}>
          <div className="mb-3"><BandLegend /></div>
          <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {servers.map((s) => (
              <button key={s.id} type="button" onClick={() => navigate(`/resource-map/${s.id}`)} className="flex flex-col items-center gap-2 rounded-lg border border-line hover:border-accent transition-colors" style={{ padding: '10px 8px', background: 'var(--c-soft)' }}>
                <div className="flex items-center justify-between w-full" style={{ gap: 6 }}>
                  <span className="font-semibold truncate" style={{ fontSize: 14 }}>{s.host}</span>
                  <HealthBadge health={s.health} />
                </div>
                <MiniHexCluster gpus={s.gpus} />
                <span className="text-muted" style={{ fontSize: 14 }}>가동률 {serverUsage(s)}%</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="flex flex-col" style={{ gap: 16 }}>
          <Card
            title="MIG 슬라이스 현황"
            action={
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="bg-soft border border-line rounded-lg text-text" style={{ fontSize: 14, padding: '4px 8px' }}>
                <option value="all">전체 합산</option>
                {servers.map((s) => (<option key={s.id} value={s.id}>{s.host}</option>))}
              </select>
            }
          >
            <div className="flex flex-col" style={{ gap: 12 }}>
              {sliceSummary.map((r) => (
                <div key={r.profile} className="min-w-0">
                  <div className="flex items-center justify-between mb-1" style={{ fontSize: 14 }}>
                    <span className="font-semibold">{r.profile} 슬라이스</span>
                    <span className="text-muted">사용 {r.used} · 가용 {r.free}</span>
                  </div>
                  <SliceBar used={r.used} free={r.free} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="전체 서버 이벤트 로그" action={<button type="button" onClick={() => navigate('/events')} className="text-accent" style={{ fontSize: 14 }}>전체 보기</button>}>
            <div className="flex flex-col" style={{ gap: 2 }}>
              {recentEvents.map((e) => (
                <button key={e.id} type="button" onClick={() => navigate('/events')} className="flex items-center gap-2.5 text-left rounded-lg hover:bg-[var(--accent-soft)]" style={{ padding: '7px 8px' }}>
                  <SeverityDot severity={e.severity} />
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14 }}>{e.message}</span>
                  <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{e.createdAt.slice(11)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {critical && (
        <CriticalAlert
          open={alertOpen}
          serverName={serverById(critical.serverId ?? '')?.host ?? critical.serverId ?? ''}
          message={critical.message}
          onGo={() => navigate(`/resource-map/${critical.serverId}`)}
          onClose={() => setAlertOpen(false)}
        />
      )}
    </div>
  )
}

// ── 4.3 단일 서버 모니터링 ────────────────────────────────
export function ServerDetail() {
  const { serverId = '' } = useParams()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const server = serverById(serverId)

  if (!server) return <NotFoundServer />

  const hostedServices = server.hostedServiceIds
    .map((id) => serviceById(id))
    .filter((s): s is Service => s != null)
    .sort((a, b) => b.usageCount - a.usageCount)
  const serverEvents = eventLogs.filter((e) => e.serverId === serverId)

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 10 }}>
          <StepBack to="/resource-map" label="전체 서버" />
          <h2 className="font-bold" style={{ fontSize: 18 }}>{server.host}</h2>
          <span className="text-muted" style={{ fontSize: 14 }}>{server.rack}</span>
          <HealthBadge health={server.health} />
        </div>
        <span className="text-muted font-mono" style={{ fontSize: 14 }}>4.3</span>
      </div>

      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)' }}>
        <Card title="서버 GPU · 슬라이스" action={<span className="text-muted" style={{ fontSize: 14 }}>GPU 클릭 → 상세</span>}>
          <div className="mb-3"><BandLegend /></div>
          <div className="flex justify-center py-2">
            <Hexagon
              items={server.gpus.map((g) => ({ id: g.id, usage: g.smUtil, free: g.health === 'inactive', label: g.name, sublabel: g.health === 'danger' ? 'XID' : `${g.smUtil}%` }))}
              perRow={2}
              tileWidth={96}
              tileHeight={108}
              onSelect={(id) => navigate(`/resource-map/${serverId}/${id}`)}
            />
          </div>
        </Card>

        <Card title="서버 KPI">
          <div className="flex items-center justify-around mb-2">
            <ArcGauge value={server.cpuUtil} label="CPU" color="var(--c-accent)" size={104} />
            <ArcGauge value={server.memUtil} label="RAM" color="var(--c-accent2)" size={104} />
            <ArcGauge value={serverUsage(server)} label="GPU" color="#9f80ea" size={104} />
          </div>
          <div className="border-t border-line pt-2">
            <div className="text-muted mb-1" style={{ fontSize: 14 }}>GPU 가동률 추이</div>
            <LineChart data={series(serverId.length + server.gpus.length, 24, 30, serverUsage(server) + 8)} height={110} />
          </div>
        </Card>
      </div>

      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
        <Card title="GPU 상세" flush>
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup><col style={{ width: '24%' }} /><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /></colgroup>
            <thead><tr style={{ background: 'var(--th-bg)' }}>
              {['GPU', '분할', 'SM', 'VRAM', '온도', '상태'].map((h) => (
                <th key={h} className="font-bold whitespace-nowrap text-left" style={{ fontSize: 14, color: 'var(--c-muted)', padding: '9px 14px', borderBottom: '2px solid var(--c-border)' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {server.gpus.map((g, i) => (
                <tr key={g.id} className="cursor-pointer" onClick={() => navigate(`/resource-map/${serverId}/${g.id}`)} style={{ background: i % 2 ? 'var(--zebra)' : 'transparent' }}>
                  <td className="truncate" style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{g.name}</td>
                  <td style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{g.allocMode === 'cluster' ? '클러스터' : 'MIG'}</td>
                  <td style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{g.smUtil}%</td>
                  <td style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{g.vramUtil}%</td>
                  <td style={{ fontSize: 14, padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}>{g.temp}°C</td>
                  <td style={{ padding: '9px 14px', borderBottom: '1px solid var(--c-border-s)' }}><HealthBadge health={g.health} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="올라간 서비스 (사용량순)">
          {hostedServices.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 14 }}>올라간 서비스가 없어요.</div>
          ) : (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {hostedServices.map((s) => (
                <button key={s.id} type="button" onClick={() => navigate(`/marketplace/${s.id}`)} className="flex items-center justify-between gap-2 rounded-lg border border-line hover:border-accent" style={{ padding: '8px 10px' }}>
                  <span className="truncate" style={{ fontSize: 14 }}>{s.name}</span>
                  <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{fmtCompact(s.usageCount)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <FloatingButtons target={server.host} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`이벤트 로그 · ${server.host}`}>
        <EventList items={serverEvents} />
      </Drawer>
    </div>
  )
}

// ── 4.4 GPU 상세 모니터링 ─────────────────────────────────
function SliceRow({ slice }: { slice: MigSlice }) {
  const free = isSliceFree(slice)
  const owner = userById(slice.ownerUserId ?? '')
  const model = modelById(slice.modelId ?? '')
  return (
    <div className="rounded-lg border border-line" style={{ padding: '8px 10px', background: free ? undefined : 'var(--accent-soft)', backgroundImage: free ? hatchBackground : undefined }}>
      <div className="flex items-center justify-between" style={{ fontSize: 14 }}>
        <span className="font-semibold">{slice.profile} 슬라이스</span>
        <span className="text-muted">{free ? '가용' : `${slice.usage}%`}</span>
      </div>
      {!free && (
        <div className="text-muted truncate" style={{ fontSize: 14, marginTop: 2 }}>{owner?.name} · {model?.name} · {slice.containerId}</div>
      )}
    </div>
  )
}

function VramBar({ util }: { util: number }) {
  const occupied = Math.round((util / 100) * 32)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 14 }}>
        <span className="text-muted">VRAM 점유</span>
        <span className="font-semibold">{util}% · {Math.round((util / 100) * 80)} / 80 GB</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(32, 1fr)', gap: 2 }}>
        {Array.from({ length: 32 }, (_, i) => (
          <div key={i} style={{ height: 20, borderRadius: 2, background: i < occupied ? `hsl(${140 - (i / 32) * 78}, 58%, 53%)` : 'var(--c-soft)' }} />
        ))}
      </div>
    </div>
  )
}

export function GpuDetail() {
  const { serverId = '', gpuId = '' } = useParams()
  const [drawer, setDrawer] = useState(false)
  const gpu = gpuById(gpuId)
  const server = serverById(serverId)
  const gpuEvents = useMemo(() => eventLogs.filter((e) => e.gpuId === gpuId), [gpuId])

  if (!gpu || !server) return <NotFoundServer />

  const slices = gpu.slices ?? []
  const onServices = Array.from(
    new Map(
      slices
        .filter((s) => !isSliceFree(s))
        .map((s) => serviceForSlice(s))
        .filter((s): s is Service => s != null)
        .map((s) => [s.id, s]),
    ).values(),
  )

  const kpis = [
    { label: '작업률', value: gpu.smUtil, unit: '%', seed: 11, max: 100 },
    { label: 'VRAM', value: gpu.vramUtil, unit: '%', seed: 23, max: 100 },
    { label: '온도', value: gpu.temp, unit: '°C', seed: 37, max: 100 },
    { label: '전력', value: gpu.power, unit: 'W', seed: 53, max: 700 },
  ]

  return (
    <div className="anim-fade flex flex-col" style={{ gap: 16 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 10 }}>
          <StepBack to={`/resource-map/${serverId}`} label={server.host} />
          <h2 className="font-bold" style={{ fontSize: 18 }}>{gpu.name}</h2>
          <span className="text-muted" style={{ fontSize: 14 }}>{gpu.allocMode === 'cluster' ? '클러스터' : 'MIG'} · {gpu.serial}</span>
          <HealthBadge health={gpu.health} />
          {gpu.xid && <Badge tone="danger">{gpu.xid}</Badge>}
        </div>
        <span className="text-muted font-mono" style={{ fontSize: 14 }}>4.4</span>
      </div>

      <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        {kpis.map((k) => (
          <Card key={k.label}>
            <div className="text-muted font-semibold" style={{ fontSize: 14 }}>{k.label}</div>
            <div className="flex items-baseline gap-1" style={{ marginTop: 2 }}>
              <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px' }}>{k.value}</span>
              <span className="text-muted" style={{ fontSize: 14 }}>{k.unit}</span>
            </div>
            <LineChart data={series(k.seed + gpuId.length, 20, k.max * 0.25, Math.max(k.value, k.max * 0.4))} height={64} />
          </Card>
        ))}
      </div>

      <div className="grid items-start" style={{ gap: 16, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <Card title={gpu.allocMode === 'cluster' ? '클러스터 점유' : 'MIG 슬라이스 분할'}>
          <VramBar util={gpu.vramUtil} />
          {gpu.allocMode === 'cluster' ? (
            <div className="text-muted" style={{ fontSize: 14, marginTop: 10 }}>
              이 GPU는 클러스터(NVLink)로 묶여 단일 워크로드에 점유돼 있어요. 담당: {userById(gpu.assignedUserId ?? '')?.name ?? '-'} · 서비스: {serviceById(gpu.assignedServiceId ?? '')?.name ?? '-'}
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 8, marginTop: 10 }}>
              {slices.map((s) => (<SliceRow key={s.id} slice={s} />))}
            </div>
          )}
        </Card>

        <div className="flex flex-col" style={{ gap: 16 }}>
          <Card title="최근 활동">
            {(gpu.recentActivities ?? []).length === 0 ? (
              <div className="text-muted" style={{ fontSize: 14 }}>최근 활동이 없어요.</div>
            ) : (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {(gpu.recentActivities ?? []).map((a, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="rounded-full shrink-0" style={{ width: 8, height: 8, marginTop: 5, background: a.type === 'error' ? 'var(--c-danger)' : a.type === 'health' ? 'var(--c-warn)' : 'var(--c-accent)' }} />
                    <div className="min-w-0">
                      <div style={{ fontSize: 14 }}>{a.message}</div>
                      <div className="text-muted" style={{ fontSize: 14 }}>{a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="올라간 서비스">
            {onServices.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 14 }}>가용 GPU — 올라간 서비스가 없어요.</div>
            ) : (
              <div className="flex flex-col" style={{ gap: 8 }}>
                {onServices.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line" style={{ padding: '8px 10px' }}>
                    <span className="truncate" style={{ fontSize: 14 }}>{s.name}</span>
                    <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{modelById(s.model)?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <FloatingButtons target={gpu.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`이벤트 로그 · ${gpu.name}`}>
        <EventList items={gpuEvents} />
      </Drawer>
    </div>
  )
}

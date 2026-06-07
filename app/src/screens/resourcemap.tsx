import { useMemo, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import {
  Card,
  KpiStat,
  Badge,
  HealthBadge,
  Table,
  Drawer,
  FloatingButtons,
  CriticalAlert,
} from '../components/ui'
import type { Column } from '../components/ui'
import { LineChart, ServerHexMap, bandColor } from '../components/charts'
import type { ServerRegion, Bay } from '../components/charts'
import { ServerIcon, CpuChipIcon, ChartBarSquareIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { servers, serverById, allGpus, userById, modelById, gpuRequests } from '../data'
import type { Gpu, MigSlice, EventLog } from '../data/types'
import {
  serverAvgUtil,
  serverActiveGpus,
  gpuServices,
  serviceOfSlice,
  serverEvents,
  gpuEvents,
  vramUsedMb,
  fmtNum,
  fmtTemp,
  trend,
  HOUR_LABELS,
  H100_VRAM_MB,
  MIG_UNITS,
} from '../lib/metrics'
import { events as allEvents } from '../data'

// ───────────────────────── 공통 부품 ─────────────────────────


// 서버/GPU 호버 테두리 색 팔레트(hue) — 호버 시에만 서버별 다른 색
const HUES = [210, 180, 145, 270, 35, 330, 0, 248, 300, 160, 50, 190]
const hueLine = (hue: number) => `hsl(${hue}, 62%, 60%)`

// 4.3 올라간 서비스 — 누가(deployer) 올렸고 얼마나 쓰는지(상세는 4.4)
function ServiceDeployList({ services }: { services: { id: string; name: string; model: string; kind: string; deployerUserId?: string; ownerUserId: string; usageCount: number }[] }) {
  if (services.length === 0) return <div className="text-muted" style={{ fontSize: 14 }}>올라간 서비스가 없어요.</div>
  const abbr = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`)
  const ranked = [...services].sort((a, b) => b.usageCount - a.usageCount)
  return (
    <ul className="flex flex-col" style={{ gap: 8 }}>
      {ranked.map((s, i) => (
        <li key={s.id} className="flex items-center justify-between gap-2 min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-muted tabular-nums shrink-0" style={{ fontSize: 14, width: 16 }}>{i + 1}</span>
            <span className="font-semibold truncate" style={{ fontSize: 14 }}>{s.name}</span>
            <span className="text-muted shrink-0 truncate" style={{ fontSize: 14 }}>· {userById(s.deployerUserId ?? s.ownerUserId)?.name ?? '—'}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums" style={{ fontSize: 14 }}>{abbr(s.usageCount)} <span className="text-muted font-normal">호출</span></span>
        </li>
      ))}
    </ul>
  )
}


// 차트 카드 — 차트가 패널을 가로·세로 꽉 채움(ResponsiveContainer + flex-1 min-h-0)
function ChartCard({ title, legend, children, style }: { title: string; legend?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0" style={{ boxShadow: 'var(--shadow-card)', ...style }}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
        <h3 className="text-[14px] font-bold truncate">{title}</h3>
      </header>
      <div className="flex-1 min-h-0 min-w-0 flex flex-col" style={{ padding: 14, gap: 8 }}>
        <div className="flex-1 min-h-0 min-w-0">{children}</div>
        {legend && <div className="shrink-0">{legend}</div>}
      </div>
    </section>
  )
}

// 4.2 전체 — 단일 연속 벌집(모든 GPU hex 밀착) + 서버 영역 외곽선·라벨·헬스색(HyperCube 구조 베이스)
function ServerHoneycomb({ onSelect }: { onSelect: (id: string) => void }) {
  // 최소 단위 = 슬라이스. 서버 = 자기 슬라이스 헥사 묶음(고유 hue), 부하 음영.
  const regions: ServerRegion[] = servers.map((s, idx) => {
    const hue = HUES[idx % HUES.length]
    const bays: Bay[] = []
    s.gpus.forEach((g) => {
      if (g.xid) { bays.push({ util: 0, danger: true, idle: true, tip: `${g.name} · ${g.xid} · GPU 응답 없음` }); return }
      if (g.allocMode === 'cluster' || !g.slices || g.slices.length === 0) {
        bays.push({ util: g.smUtil, tip: `${g.name} · NVLink 클러스터 · 부하 ${g.smUtil}%` }); return
      }
      g.slices.forEach((sl) => {
        const used = sl.usage > 0 || !!sl.ownerUserId
        bays.push({
          util: sl.usage,
          idle: !used,
          tip: used ? `${sl.profile} · ${userById(sl.ownerUserId ?? '')?.name ?? '—'} · 부하 ${sl.usage}%` : `가용 · ${sl.profile} ${sl.gb}GB`,
        })
      })
    })
    const hl = s.health === 'danger' ? '위험' : s.health === 'warn' ? '경고' : s.health === 'inactive' ? '유휴' : '정상'
    return { id: s.id, label: s.name, health: s.health, outline: hueLine(hue), regionTip: `${s.name} · GPU ${s.gpus.length}장 · ${hl} · 평균 ${serverAvgUtil(s)}%`, bays, onClick: () => onSelect(s.id) }
  })
  // Figma: 카드 박스/테두리 없이 honeycomb이 배경 위에 직접
  return <div className="h-full min-h-0 min-w-0"><ServerHexMap regions={regions} /></div>
}

function sevColor(sev: EventLog['severity']): string {
  return sev === 'critical' ? 'var(--c-danger)' : sev === 'warn' ? 'var(--c-warn)' : sev === 'recovered' ? 'var(--c-ok)' : 'var(--c-accent)'
}
const sevLabel: Record<EventLog['severity'], string> = { critical: '위험', warn: '경고', info: '정보', recovered: '복구' }

// 이벤트 로그 테이블(Figma) — 심각도·메시지(넓게·wrap)·서버·시각·상태. thead sticky + tbody 내부 스크롤.
function EventTable({ rows }: { rows: EventLog[] }) {
  const SEV_TONE = { critical: 'danger', warn: 'warn', info: 'info', recovered: 'ok' } as const
  const th: CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--c-muted)', textAlign: 'left', padding: '9px 12px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--th-bg)', borderBottom: '2px solid var(--c-border)' }
  const td: CSSProperties = { fontSize: 14, padding: '9px 12px', borderBottom: '1px solid var(--c-border-s)', verticalAlign: 'top' }
  const meta: CSSProperties = { ...td, whiteSpace: 'nowrap', color: 'var(--c-muted)' }
  return (
    <div className="h-full overflow-auto min-w-0">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 60 }}>심각도</th>
            <th style={th}>메시지</th>
            <th style={{ ...th, width: 60 }}>서버</th>
            <th style={{ ...th, width: 96 }}>시각</th>
            <th style={{ ...th, width: 56, textAlign: 'right' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td style={td}><Badge tone={SEV_TONE[e.severity]} dot>{sevLabel[e.severity]}</Badge></td>
              <td style={{ ...td, lineHeight: 1.35 }}>{e.message}</td>
              <td style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>{e.serverId ?? '—'}</td>
              <td style={{ ...meta, fontVariantNumeric: 'tabular-nums' }}>{e.createdAt.slice(5)}</td>
              <td style={{ ...meta, textAlign: 'right' }}><Badge tone={e.status === 'resolved' ? 'ok' : 'neutral'} dot={false}>{e.status === 'resolved' ? '해결' : '진행'}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 드로어용 컴팩트 이벤트 리스트
function EventList({ rows }: { rows: EventLog[] }) {
  if (rows.length === 0) return <div className="text-muted" style={{ fontSize: 14 }}>이벤트가 없어요.</div>
  return (
    <ul className="flex flex-col" style={{ gap: 9 }}>
      {rows.map((e) => (
        <li key={e.id} className="flex items-start gap-2.5 min-w-0">
          <span className="rounded-full shrink-0" style={{ width: 8, height: 8, marginTop: 5, background: sevColor(e.severity) }} />
          <span className="flex-1 min-w-0">
            <span className="block truncate" style={{ fontSize: 14 }}>{e.message}</span>
            <span className="text-muted block truncate" style={{ fontSize: 14 }}>{e.serverId ?? ''} · {e.createdAt} · {e.status === 'resolved' ? '해결' : '진행'}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// MIG 도넛 링(Figma) — 트랙 + 블루 그라데이션 호 + 중앙 수치
function MigDonut({ used, total }: { used: number; total: number }) {
  const pct = total ? used / total : 0
  const r = 64
  const circ = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: 168, height: 168 }}>
      <svg viewBox="0 0 168 168" width="168" height="168">
        <defs>
          <linearGradient id="mig-arc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="#1B5099" />
          </linearGradient>
        </defs>
        <circle cx="84" cy="84" r={r} fill="none" stroke="var(--c-bg)" strokeWidth="16" />
        <circle cx="84" cy="84" r={r} fill="none" stroke="url(#mig-arc)" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 84 84)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold tabular-nums" style={{ fontSize: 36, lineHeight: 1 }}>{used}</span>
        <span className="tabular-nums" style={{ fontSize: 18, color: 'var(--c-muted)', marginTop: 4 }}>/ {total}</span>
      </div>
    </div>
  )
}

// 슬라이스 점유 세그먼트 셀(채움=블루·빈=다크)
function SegCells({ used, total }: { used: number; total: number }) {
  const N = 18
  const filled = total ? Math.max(used > 0 ? 1 : 0, Math.round((used / total) * N)) : 0
  return (
    <div className="flex items-center" style={{ gap: 2, flex: 1, minWidth: 0 }}>
      {Array.from({ length: N }, (_, i) => (
        <span key={i} className="rounded-[2px]" style={{ flex: 1, height: 9, background: i < filled ? 'var(--c-accent)' : 'var(--c-bg)' }} />
      ))}
    </div>
  )
}

function SliceStatus() {
  const [scope, setScope] = useState<string>('all')
  const gpus = scope === 'all' ? allGpus : serverById(scope)?.gpus ?? []
  const migGpus = gpus.filter((g) => g.allocMode === 'mig')
  const slices = migGpus.flatMap((g) => g.slices ?? [])
  const totalUnits = migGpus.length * MIG_UNITS
  const usedUnits = slices.filter((s) => s.usage > 0 || s.ownerUserId).reduce((a, s) => a + s.units, 0)
  const pct = totalUnits ? (usedUnits / totalUnits) * 100 : 0
  const byProfile = [{ p: '1g', u: 1 }, { p: '2g', u: 2 }, { p: '3g', u: 3 }, { p: '4g', u: 4 }, { p: '7g', u: 7 }].map(({ p, u }) => {
    const ps = slices.filter((s) => s.units === u)
    return { p, total: ps.length, used: ps.filter((s) => s.usage > 0 || s.ownerUserId).length }
  }).filter((b) => b.total > 0)
  return (
    <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col shrink-0" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* 헤더 + 드롭다운 */}
      <header className="flex items-center justify-between gap-3" style={{ padding: 16 }}>
        <h3 className="font-bold truncate" style={{ fontSize: 16 }}>MIG 슬라이스 현황</h3>
        <div className="flex items-center justify-between rounded border border-line" style={{ width: 120, padding: '2px 6px 2px 12px' }}>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="bg-transparent text-text outline-none w-full" style={{ fontSize: 14, fontWeight: 600 }} aria-label="슬라이스 범위">
            <option value="all">전체 서버</option>
            {servers.filter((s) => s.gpus.some((g) => g.allocMode === 'mig')).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </header>
      {/* 서브패널 2개 */}
      <div className="flex" style={{ gap: 16, padding: '0 16px 16px' }}>
        {/* 좌: 도넛 + 점유율 pill */}
        <div className="shrink-0 flex flex-col items-center justify-between rounded-[10px]" style={{ background: 'var(--c-soft)', padding: '18px 16px', gap: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted)' }}>MIG 슬라이스 현황</span>
          <MigDonut used={usedUnits} total={totalUnits} />
          <span className="inline-flex items-center rounded-full border border-line" style={{ gap: 12, padding: '4px 16px' }}>
            <span className="rounded-full" style={{ width: 8, height: 8, background: 'var(--c-accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>점유율</span>
            <span className="font-semibold" style={{ fontSize: 14, color: 'var(--c-accent)' }}>{pct.toFixed(1)}%</span>
          </span>
        </div>
        {/* 우: 슬라이스별 점유 현황 */}
        <div className="flex flex-col flex-1 min-w-0 rounded-[10px]" style={{ background: 'var(--c-soft)', padding: '18px 16px', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-muted)' }}>슬라이스별 점유 현황</span>
          <div className="flex flex-col flex-1" style={{ gap: 10 }}>
            {byProfile.map((b) => (
              <div key={b.p} className="flex items-center bg-card2 rounded" style={{ gap: 12, padding: '0 16px', flex: 1, minHeight: 36 }}>
                <span className="shrink-0 font-semibold" style={{ fontSize: 14, width: 18, color: 'var(--c-accent)' }}>{b.p}</span>
                <SegCells used={b.used} total={b.total} />
                <span className="shrink-0 tabular-nums text-right" style={{ width: 62 }}>
                  <span className="font-semibold" style={{ fontSize: 16, color: 'var(--c-accent)' }}>{b.used}</span>
                  <span style={{ fontSize: 13, color: 'var(--c-muted)' }}> / {b.total}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// Figma KPI 카드 — 제목/값/링크 + 델타·아이콘 배지
function ServerKpi({ title, value, unit, link, delta, deltaTone, icon }: {
  title: string; value: ReactNode; unit: string; link: string; delta: string; deltaTone: 'up' | 'down' | 'danger'; icon: ReactNode
}) {
  const dc = deltaTone === 'down' ? 'var(--c-danger)' : deltaTone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent2)'
  return (
    <div className="bg-card2 border border-line rounded-xl flex justify-between min-w-0 hover-lift" style={{ padding: '16px 20px', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex flex-col min-w-0" style={{ gap: 12 }}>
        <span className="text-muted font-semibold truncate" style={{ fontSize: 16 }}>{title}</span>
        <div className="flex items-baseline" style={{ gap: 6 }}>
          <span className="font-bold" style={{ fontSize: 30, lineHeight: 1, letterSpacing: '-0.3px' }}>{value}</span>
          <span className="text-muted" style={{ fontSize: 15 }}>{unit}</span>
        </div>
        <span className="text-muted truncate" style={{ fontSize: 13, textDecoration: 'underline' }}>{link}</span>
      </div>
      <div className="flex flex-col items-end justify-between shrink-0">
        <span className="font-semibold" style={{ fontSize: 14, color: dc }}>{delta}</span>
        <span className="flex items-center justify-center rounded-md" style={{ width: 44, height: 44, background: deltaTone === 'up' ? 'var(--ok-soft)' : 'var(--danger-soft)', color: dc }}>{icon}</span>
      </div>
    </div>
  )
}

// 작업률 수치(막대 금지) — 임계 초과 시 색 강조
function UtilPct({ pct }: { pct: number }) {
  const color = pct > 85 ? 'var(--c-warn)' : 'var(--c-text)'
  return <span className="tabular-nums font-semibold" style={{ fontSize: 14, color }}>{Math.round(pct)}%</span>
}
function Legend({ c, label }: { c: string; label: string }) {
  return <span className="inline-flex items-center" style={{ gap: 5, fontSize: 14 }}><span className="rounded-full" style={{ width: 9, height: 9, background: c }} /><span className="text-muted">{label}</span></span>
}
// 4.4 올라간 서비스(상세) — 서비스명·모델·올린 사용자·사용량·올라간 슬라이스
function GpuServicePanel({ gpu }: { gpu: Gpu }) {
  const svcs = gpuServices(gpu)
  if (svcs.length === 0) return <div className="text-muted" style={{ fontSize: 14 }}>올라간 서비스가 없어요.</div>
  const abbr = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`)
  return (
    <ul className="flex flex-col" style={{ gap: 10 }}>
      {svcs.map((s) => {
        const model = modelById(s.model)?.name ?? s.model
        const deployer = userById(s.deployerUserId ?? s.ownerUserId)?.name ?? '—'
        const chips = gpu.allocMode === 'cluster'
          ? ['7g.80gb (클러스터)']
          : (gpu.slices ?? []).filter((sl) => serviceOfSlice(sl)?.id === s.id).map((sl) => sl.profile)
        return (
          <li key={s.id} className="bg-soft border border-line rounded-lg min-w-0" style={{ padding: '10px 12px' }}>
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="font-bold truncate" style={{ fontSize: 14 }}>{s.name}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.hasApi && <Badge tone="info" dot={false}>API</Badge>}
                <Badge tone="neutral" dot={false}>{s.kind}</Badge>
              </span>
            </div>
            <div className="grid mt-1.5" style={{ gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 14 }}>
              <span className="text-muted">모델</span><span className="truncate text-right font-medium">{model}</span>
              <span className="text-muted">올린 사용자</span><span className="truncate text-right font-medium">{deployer}</span>
              <span className="text-muted">사용량</span><span className="truncate text-right font-semibold tabular-nums">{abbr(s.usageCount)} 호출</span>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center mt-2" style={{ gap: 4 }}>
                <span className="text-muted shrink-0" style={{ fontSize: 14 }}>슬라이스</span>
                {chips.map((c, i) => <span key={i} className="rounded bg-card2 border border-line text-muted shrink-0" style={{ fontSize: 13, padding: '1px 6px' }}>{c}</span>)}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ───────────────────────── 4.2 전체 서버 ─────────────────────────

export function ResourceMap() {
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const critGpu = useMemo(() => allGpus.find((g) => g.xid), [])
  const critServer = useMemo(() => servers.find((s) => s.gpus.some((g) => g.xid)), [])
  // 세션 1회만 — 닫으면 다시 안 뜸(자원맵 정중앙 영구 가림 방지)
  const [alertOpen, setAlertOpen] = useState(() => !!critGpu && !sessionStorage.getItem('anclave-crit-dismissed'))
  const dismissAlert = () => { sessionStorage.setItem('anclave-crit-dismissed', '1'); setAlertOpen(false) }

  const activeGpus = allGpus.filter((g) => g.health !== 'inactive' && !g.xid).length
  const avgUtil = Math.round(allGpus.reduce((a, g) => a + g.smUtil, 0) / allGpus.length)
  const critEvents = allEvents.filter((e) => e.severity === 'critical').length

  return (
    <>
      <PageShell
        fill
        bare
        screen="4.2"
        title="전체 서버 모니터링"
        kpis={
          <>
            <ServerKpi title="총 서버 수" value={servers.length} unit="대" link="서버 관리 전체보기" delta="↗ 16.24%" deltaTone="up" icon={<ServerIcon width={22} height={22} />} />
            <ServerKpi title="가동 GPU" value={activeGpus} unit={`/ ${allGpus.length}`} link="가동 GPU 전체보기" delta="↘ -3.57%" deltaTone="down" icon={<CpuChipIcon width={22} height={22} />} />
            <ServerKpi title="평균 사용률" value={avgUtil} unit="%" link="평균 사용률 추이" delta="↗ 3.2%" deltaTone="up" icon={<ChartBarSquareIcon width={22} height={22} />} />
            <ServerKpi title="위험 이벤트" value={critEvents} unit="건" link="위험 이벤트 전체보기" delta="확인 필요" deltaTone="danger" icon={<ExclamationTriangleIcon width={22} height={22} />} />
          </>
        }
      >
        <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 18 }}>
          <ServerHoneycomb onSelect={(id) => navigate(`/resource-map/${id}`)} />
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 12 }}>
            <SliceStatus />
            <Card fill flush title="이벤트 로그" action={<button type="button" onClick={() => setDrawer(true)} className="text-accent" style={{ fontSize: 14 }}>전체 보기</button>}>
              <EventTable rows={allEvents} />
            </Card>
          </div>
        </div>
      </PageShell>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="전체 이벤트 로그"><EventList rows={allEvents} /></Drawer>
      {critServer && (
        <CriticalAlert open={alertOpen} serverName={critServer.name}
          message={`${critGpu?.name} ${critGpu?.xid} — GPU 응답 없음(드라이버). 점검 모드로 전환됐어요.`}
          onGo={() => { dismissAlert(); navigate(`/resource-map/${critServer.id}`) }}
          onClose={dismissAlert} />
      )}
    </>
  )
}

// ───────────────────────── 4.3 단일 서버 ─────────────────────────

export function ServerDetail() {
  const { serverId = '' } = useParams()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const server = serverById(serverId)
  if (!server) return <Navigate to="/resource-map" replace />

  const avgUtil = serverAvgUtil(server)
  const svcList = server.gpus.flatMap((g) => gpuServices(g))
  const uniqServices = [...new Map(svcList.map((s) => [s.id, s])).values()]
  const cpuS = trend(server.cpuUtil, 24, 14, 3)
  const memS = trend(server.memUtil, 24, 10, 7)
  const gpuS = trend(avgUtil, 24, 16, 11)

  // 4.3 = 슬라이스 단위 벌집 · GPU = 자기 슬라이스 묶음(고유 hue), 부하 음영
  const gpuN = server.gpus.length
  const gpuRegions: ServerRegion[] = server.gpus.map((g, gi) => {
    const hue = HUES[gi % HUES.length]
    const go = () => navigate(`/resource-map/${server.id}/${g.id}`)
    const regHealth = g.xid ? 'danger' : g.health === 'inactive' ? 'inactive' : 'normal'
    let bays: Bay[]
    if (g.xid) {
      bays = [{ util: 0, danger: true, idle: true, tip: `${g.name} · ${g.xid} · GPU 응답 없음` }]
    } else if (g.allocMode === 'cluster' || !g.slices || g.slices.length === 0) {
      const svc = gpuServices(g)[0]
      bays = [{ util: g.smUtil, tip: `${g.name} · NVLink 클러스터(7g.80gb) · ${svc ? svc.name : '미할당'} · 부하 ${g.smUtil}%` }]
    } else {
      bays = g.slices.map((s) => {
        const used = s.usage > 0 || !!s.ownerUserId
        const owner = s.ownerUserId ? userById(s.ownerUserId)?.name : undefined
        const req = s.requestId ? gpuRequests.find((r) => r.id === s.requestId) : undefined
        return {
          util: s.usage,
          idle: !used,
          tip: used ? `${owner ?? '—'} · ${req?.serviceName ?? '신청'} · ${s.profile} ${s.gb}GB · 부하 ${s.usage}%` : `가용 · ${s.profile} ${s.gb}GB`,
        }
      })
    }
    const usedSl = g.slices?.filter((s) => s.usage > 0 || s.ownerUserId).length ?? (g.allocMode === 'cluster' ? 1 : 0)
    const rtip = `${g.name} · ${g.allocMode === 'cluster' ? 'NVLink 클러스터' : `MIG ${g.slices?.length ?? 0}분할(${usedSl} 사용)`} · ${g.xid ? g.xid : `${g.smUtil}%`}`
    return { id: g.id, label: g.name.replace('H100-', '#'), health: regHealth, outline: hueLine(hue), regionTip: rtip, bays, onClick: go }
  })

  const gpuCols: Column<Gpu>[] = [
    { key: 'name', header: 'GPU', width: '18%', render: (g) => <span className="font-semibold">{g.name}</span> },
    { key: 'health', header: '헬스', width: '14%', render: (g) => g.xid ? <Badge tone="danger" dot={false}>장애</Badge> : <HealthBadge health={g.health === 'inactive' ? 'inactive' : 'normal'} /> },
    { key: 'mode', header: '모드', width: '14%', render: (g) => <Badge tone={g.allocMode === 'cluster' ? 'info' : 'neutral'} dot={false}>{g.allocMode === 'cluster' ? 'NVLink' : 'MIG'}</Badge> },
    { key: 'util', header: '작업률', width: '24%', align: 'right', render: (g) => <UtilPct pct={g.smUtil} /> },
    { key: 'vram', header: 'VRAM', width: '16%', align: 'right', render: (g) => <span className="tabular-nums">{g.vramUtil}%</span> },
    { key: 'temp', header: '온도', width: '14%', align: 'right', render: (g) => fmtTemp(g.temp) },
  ]

  return (
    <>
      <PageShell
        fill
        screen="4.3"
        title={`단일 서버 — ${server.name}`}
        desc={`${server.host} · ${server.rack} · ${server.note}`}
        actions={<HealthBadge health={server.health} />}
      >
        {/* §4.3 — 좌: 자원맵 full / 우상(1/3): KPI+꺾은선 / 우하(2/3): GPU 상세 테이블+서비스 */}
        <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
          {/* 좌: 자원맵이 좌측을 가득 채움 */}
          <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0 h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
              <h3 className="text-[14px] font-bold truncate">GPU 자원맵 · {gpuN}장 · 슬라이스 단위</h3>
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>GPU 영역 클릭 → 상세</span>
            </header>
            <div className="flex-1 min-h-0" style={{ padding: 14 }}>
              <ServerHexMap regions={gpuRegions} />
            </div>
          </section>

          {/* 우 — 우상(KPI+꺾은선) / 우하(GPU 상세·서비스). 평탄 flex로 차트 높이 보장 */}
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 14, paddingBottom: 52 }}>
            <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <KpiStat label="CPU" value={server.cpuUtil} unit="%" gauge={server.cpuUtil} gaugeColor={server.cpuUtil > 85 ? 'var(--c-danger)' : undefined} />
              <KpiStat label="RAM" value={server.memUtil} unit="%" gauge={server.memUtil} gaugeColor={server.memUtil > 85 ? 'var(--c-danger)' : undefined} />
              <KpiStat label="GPU 평균" value={avgUtil} unit="%" gauge={avgUtil} sub={`가동 ${serverActiveGpus(server)}/${server.gpus.length}`} />
            </div>
            <ChartCard title="부하 추이 (24시간)" style={{ flex: 1.1, minHeight: 150 }}
              legend={<div className="flex items-center" style={{ gap: 14 }}><Legend c="var(--c-accent)" label="CPU" /><Legend c="var(--c-accent2)" label="RAM" /><Legend c="#9d6fe0" label="GPU" /></div>}>
              <LineChart series={[{ data: cpuS, color: 'var(--c-accent)', label: 'CPU' }, { data: memS, color: 'var(--c-accent2)', label: 'RAM' }, { data: gpuS, color: '#9d6fe0', label: 'GPU' }]} labels={HOUR_LABELS} />
            </ChartCard>
            <Card fill flush title="GPU 상세" style={{ flex: 1.6 }}>
              <Table columns={gpuCols} rows={server.gpus} rowKey={(g) => g.id} onRowClick={(g) => navigate(`/resource-map/${server.id}/${g.id}`)} />
            </Card>
            <Card fill title={`올라간 서비스 · ${uniqServices.length}`} style={{ flex: 1 }}><ServiceDeployList services={uniqServices} /></Card>
          </div>
        </div>
      </PageShell>

      <FloatingButtons target={server.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`${server.name} 이벤트 로그`}><EventList rows={serverEvents(server.id)} /></Drawer>
    </>
  )
}

// ───────────────────────── 4.4 GPU 상세 ─────────────────────────

export function GpuDetail() {
  const { serverId = '', gpuId = '' } = useParams()
  const [drawer, setDrawer] = useState(false)
  const server = serverById(serverId)
  const gpu = server?.gpus.find((g) => g.id === gpuId)
  if (!server || !gpu) return <Navigate to="/resource-map" replace />

  const usedMb = vramUsedMb(gpu)
  const utilS = trend(gpu.smUtil, 24, 14, 5)
  const vramS = trend(gpu.vramUtil, 24, 10, 9)
  const tempS = trend(gpu.temp, 24, 8, 13)
  // 결정적 가동시간(시드: 시리얼 숫자) — Math.random 미사용
  const serialNum = parseInt(gpu.serial.replace(/\D/g, '').slice(-4) || '0', 10)
  const upDays = (serialNum % 88) + 5
  const upHours = serialNum % 24
  // MIG 헤더 — N분할 · 사용 유닛/7
  const migSlices = gpu.slices ?? []
  const migUsedUnits = migSlices.filter((s) => s.usage > 0 || s.ownerUserId).reduce((sum, s) => sum + s.units, 0)
  const migTitle = gpu.allocMode === 'cluster'
    ? '클러스터 할당 (NVLink · 7g.80gb)'
    : `슬라이스 분할 · MIG · ${migSlices.length}분할 · 사용 ${migUsedUnits}/${MIG_UNITS}`

  return (
    <>
      <PageShell
        fill
        screen="4.4"
        title={`GPU 상세 — ${gpu.name}`}
        desc={`${server.name} · ${gpu.serial} · ${gpu.allocMode === 'cluster' ? 'NVLink 클러스터' : 'MIG 분할'}`}
        actions={gpu.xid ? <Badge tone="danger" dot={false}>{gpu.xid}</Badge> : <HealthBadge health={gpu.health} />}
        kpis={
          <>
            <KpiStat label="작업률" value={gpu.smUtil} unit="%" delta={gpu.smUtil > 85 ? '높음' : '정상'} deltaTone={gpu.smUtil > 85 ? 'warn' : 'ok'} gauge={gpu.smUtil} sub="적정 ≤85%" />
            <KpiStat label="VRAM" value={gpu.vramUtil} unit="%" delta={`${fmtNum(usedMb)} MB`} deltaTone="muted" gauge={gpu.vramUtil} sub={`${fmtNum(usedMb)} / ${fmtNum(H100_VRAM_MB)} MB`} />
            <KpiStat label="온도" value={gpu.temp} unit="°C" delta={gpu.temp > 80 ? '위험' : gpu.temp > 70 ? '주의' : '정상'} deltaTone={gpu.temp > 80 ? 'danger' : gpu.temp > 70 ? 'warn' : 'ok'} gauge={gpu.temp} gaugeColor="var(--c-warn)" sub="임계 80°C" />
            <KpiStat label="전력" value={gpu.power} unit="W" delta="TDP 700W" deltaTone="muted" spark={trend(gpu.power, 12, 25, 7)} sub={`효율 ${Math.round((gpu.smUtil / Math.max(1, gpu.power)) * 100)}%`} />
          </>
        }
      >
        <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 12 }}>
            <ChartCard title="성능 추이 (24시간)" style={{ flex: '0.85' }}
              legend={<div className="flex items-center" style={{ gap: 14 }}><Legend c="var(--c-accent)" label="작업률" /><Legend c="var(--c-accent2)" label="VRAM" /><Legend c="var(--c-warn)" label="온도" /></div>}>
              <LineChart series={[{ data: utilS, color: 'var(--c-accent)', label: '작업률' }, { data: vramS, color: 'var(--c-accent2)', label: 'VRAM' }, { data: tempS, color: 'var(--c-warn)', label: '온도' }]} labels={HOUR_LABELS} />
            </ChartCard>
            <Card title="VRAM 점유 (80GB · 32 세그먼트)" className="shrink-0">
              <VramSegments util={gpu.vramUtil} />
              <div className="flex items-center justify-between text-muted" style={{ fontSize: 14, marginTop: 8 }}><span>점유 {fmtNum(usedMb)} MB</span><span>여유 {fmtNum(H100_VRAM_MB - usedMb)} MB</span></div>
            </Card>
            <Card fill title={migTitle} style={{ flex: '1.35' }}>
              <SliceGrid gpu={gpu} />
            </Card>
          </div>
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 12, paddingBottom: 52 }}>
            <Card title="GPU 정보" className="shrink-0">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 20px' }}>
                <Info k="모델" v="H100 80GB SXM5" />
                <Info k="아키텍처" v="NVIDIA Hopper" />
                <Info k="시리얼" v={gpu.serial} />
                <Info k="분할 모드" v={gpu.allocMode === 'cluster' ? 'NVLink 클러스터' : 'MIG 분할'} />
                <Info k="VRAM" v="80GB HBM3" />
                <Info k="인터커넥트" v={gpu.interconnect ?? (gpu.allocMode === 'cluster' ? 'NVLink' : 'PCIe 5.0')} />
                <Info k="드라이버" v="550.90.07" />
                <Info k="CUDA" v="12.4" />
                <Info k="헬스" v={gpu.xid ? gpu.xid : gpu.health === 'inactive' ? '유휴' : '정상'} />
                <Info k="소속 서버" v={server.name} />
                <Info k="온도" v={`${gpu.temp}°C`} />
                <Info k="전력" v={`${gpu.power}W`} />
                <Info k="가동시간" v={`${upDays}일 ${upHours}시간`} />
              </div>
            </Card>
            <Card fill title={`올라간 서비스 · ${gpuServices(gpu).length}`} style={{ flex: '1' }}><GpuServicePanel gpu={gpu} /></Card>
          </div>
        </div>
      </PageShell>

      <FloatingButtons target={gpu.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`${gpu.name} 이벤트 로그`}><EventList rows={gpuEvents(gpu.id)} /></Drawer>
    </>
  )
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{k}</span>
      <span className="truncate font-semibold font-mono" style={{ fontSize: 14 }}>{v}</span>
    </div>
  )
}

function VramSegments({ util }: { util: number }) {
  const filled = Math.round((util / 100) * 32)
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(32, 1fr)', gap: 2 }}>
      {Array.from({ length: 32 }, (_, i) => (
        <div key={i} style={{ height: 20, borderRadius: 2, background: i < filled ? `hsl(${140 - (i / 32) * 78}, 58%, 53%)` : 'var(--c-soft)' }} title={`세그먼트 ${i + 1}/32`} />
      ))}
    </div>
  )
}

// 미할당 빗금(가시성 강화)
const MIG_HATCH = 'repeating-linear-gradient(45deg, rgba(120,140,170,.22) 0 5px, rgba(120,140,170,.04) 5px 10px)'

function SliceGrid({ gpu }: { gpu: Gpu }) {
  if (gpu.allocMode === 'cluster') {
    const svc = gpuServices(gpu)[0]
    return (
      <div className="rounded-lg border border-line flex flex-col items-center justify-center text-center h-full" style={{ minHeight: 130, padding: 16, background: bandColor(gpu.smUtil) }}>
        <div className="font-bold" style={{ fontSize: 16, color: '#fff' }}>NVLink 클러스터 — 전체 할당(7g.80gb)</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', marginTop: 4 }}>{svc ? `${svc.name} · ${modelById(svc.model)?.name ?? ''}` : '미할당'} · 작업률 {gpu.smUtil}%</div>
      </div>
    )
  }
  // GPU 1장 분할 — 외곽 프레임(=GPU) 안에 슬라이스 타일을 작은 간격으로(깔끔·구분·통합). 폭=g수 비례.
  const slices = gpu.slices ?? []
  const usedUnits = slices.reduce((sum, s) => sum + s.units, 0)
  const freeUnits = Math.max(0, MIG_UNITS - usedUnits)
  return (
    <div className="rounded-xl border border-line grid h-full" style={{ gridTemplateColumns: `repeat(${MIG_UNITS}, minmax(0, 1fr))`, gap: 6, padding: 8, background: 'var(--c-bg)' }}>
      {slices.map((s) => <SliceCell key={s.id} slice={s} />)}
      {freeUnits > 0 && <EmptySlot units={freeUnits} gb={freeUnits * 10} />}
    </div>
  )
}

// 슬라이스 타일 — 프레임 안의 한 칸(개별 카드 아님, 작은 간격으로 구분)
function tileStyle(units: number, used: boolean): CSSProperties {
  return {
    gridColumn: `span ${units}`,
    minHeight: 124,
    padding: 11,
    borderRadius: 8,
    background: used ? 'var(--accent-soft)' : 'var(--c-card2)',
    backgroundImage: used ? undefined : MIG_HATCH,
  }
}

function SliceCell({ slice }: { slice: MigSlice }) {
  const used = slice.usage > 0 || !!slice.ownerUserId
  const owner = slice.ownerUserId ? userById(slice.ownerUserId)?.name : undefined
  const model = slice.modelId ? modelById(slice.modelId)?.name : undefined
  const hot = (v: number) => (v > 85 ? 'var(--c-warn)' : 'var(--c-text)')
  return (
    <div className="flex flex-col min-w-0 overflow-hidden" style={{ ...tileStyle(slice.units, used), gap: 4 }}>
      {/* profile이 units·gb를 인코딩(1g.10gb) — 칩 1개, 폭에 맞춰 말줄임 */}
      <span className="rounded self-start max-w-full truncate font-semibold shrink-0" style={{ fontSize: 12.5, padding: '1px 8px', background: used ? 'var(--accent-soft)' : 'var(--c-soft)', color: used ? 'var(--c-accent)' : 'var(--c-muted)', border: '1px solid var(--c-border)' }}>{slice.profile}</span>
      {used ? (
        <>
          <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div className="font-semibold truncate" style={{ fontSize: 14 }}>{owner ?? '—'}</div>
            <div className="text-muted truncate" style={{ fontSize: 13 }}>{model ?? '—'}</div>
            <div className="text-muted truncate font-mono" style={{ fontSize: 12 }}>{slice.containerId ?? '—'}</div>
          </div>
          <div className="min-w-0 truncate tabular-nums" style={{ marginTop: 'auto', fontSize: 13 }}>
            <span className="text-muted">작업 </span><span className="font-semibold" style={{ color: hot(slice.usage) }}>{slice.usage}%</span>
            <span className="text-muted"> · VRAM </span><span className="font-semibold" style={{ color: hot(slice.vramUtil) }}>{slice.vramUtil}%</span>
          </div>
        </>
      ) : (
        <EmptyBody units={slice.units} gb={slice.gb} />
      )}
    </div>
  )
}

// 빈 슬롯 본문 — "비어 있음 · 신청 가능 · 용량"
function EmptyBody({ units, gb }: { units: number; gb: number }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" style={{ gap: 2 }}>
      <span className="font-semibold truncate max-w-full" style={{ fontSize: 14 }}>비어 있음</span>
      <span className="text-accent truncate max-w-full" style={{ fontSize: 13 }}>신청 가능</span>
      <span className="text-muted truncate max-w-full" style={{ fontSize: 13 }}>{units}g · {gb}GB</span>
    </div>
  )
}

// 미할당 유닛(분할 잔여) — 빈 타일
function EmptySlot({ units, gb }: { units: number; gb: number }) {
  return (
    <div className="flex flex-col min-w-0 overflow-hidden" style={{ ...tileStyle(units, false), gap: 6 }}>
      <span className="rounded self-start max-w-full truncate font-semibold shrink-0 text-muted" style={{ fontSize: 13, padding: '2px 8px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>{units}g.{gb}gb</span>
      <EmptyBody units={units} gb={gb} />
    </div>
  )
}


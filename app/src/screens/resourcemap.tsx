import { useEffect, useMemo, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import {
  Card,
  KpiStat,
  Badge,
  HealthBadge,
  Drawer,
  FloatingButtons,
  CriticalAlert,
  Picker,
} from '../components/ui'
import type { PickerOption } from '../components/ui'
import { BandChart, SparkLine, ServerHexMap, bandColor, heatColor } from '../components/charts'
import type { ServerRegion, Bay, BandSeries, BandAxis } from '../components/charts'
import { ServerIcon, CpuChipIcon, ChartBarSquareIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'
import { servers as seedServers, allGpus as seedAllGpus, userById, modelById, gpuRequests } from '../data'
import type { Gpu, MigSlice, EventLog, Service, GpuServer } from '../data/types'
import {
  serverAvgUtil,
  gpuServices,
  serviceOfSlice,
  serverEvents,
  gpuEvents,
  vramUsedMb,
  vramTotalMb,
  fmtNum,
  trend,
} from '../lib/metrics'
import { events as allEvents } from '../data'
import { RANGES, RANGE_LABEL, RangeProvider, useRange, useTelemetryBand, tsLabel } from './monitoring-telemetry'

// ───────────────────────── 공통 부품 ─────────────────────────


// 서버/GPU 호버 테두리 색 팔레트(hue) — 호버 시에만 서버별 다른 색
const HUES = [210, 180, 145, 270, 35, 330, 0, 248, 300, 160, 50, 190]
const hueLine = (hue: number) => `hsl(${hue}, 62%, 60%)`

// health → dot 색 · 라벨(Picker 옵션 표기용)
const HEALTH_META: Record<string, { color: string; label: string }> = {
  normal: { color: 'var(--c-ok)', label: '정상' },
  warn: { color: 'var(--c-warn)', label: '경고' },
  danger: { color: 'var(--c-danger)', label: '장애' },
  inactive: { color: 'var(--c-inactive)', label: '유휴' },
}

// 헤더 좌측 뒤로가기(아이콘 버튼) — 자원 신청현황(G2 dashboard)과 동일 스펙: 34px·rounded-[9px]
// ·bg-card2·hover bg-soft·아이콘 18·navigate(-1)(브라우저 뒤로).
function BackBtn() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="뒤로 가기"
      onClick={() => navigate(-1)}
      className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors shrink-0"
      style={{ width: 34, height: 34 }}
    >
      <ArrowLeftIcon style={{ width: 18, height: 18 }} />
    </button>
  )
}

// 서버 스위처 옵션 — live fleet 기준(4.3·4.4 공용).
const serverOptions = (servers: GpuServer[]): PickerOption[] =>
  servers.map((s) => ({
    id: s.id,
    label: s.name,
    hint: `${serverAvgUtil(s)}%`,
    status: HEALTH_META[s.health]?.label,
    dotColor: HEALTH_META[s.health]?.color,
  }))

// ───────────────────────── 자원맵 실연동 — GET /api/servers(인벤토리+할당) ─────────────────────────
// 할당 진실원천 = gpu_requests.allocated_*(백엔드 join). 응답은 GpuServer[] 동일 형태.
// 실시간 수치(smUtil·vramUtil·temp·power·usage)는 이 응답에 없음 → seed 매칭으로 보강(이번 범위 밖).
// 백엔드 미기동/엔드포인트 부재 시 seed 폴백(기존 화면 유지).
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

const SEED_GPU_BY_ID = new Map(seedAllGpus.map((g) => [g.id, g]))
// API gpu 에 빠진 실시간 수치를 seed 로 채움(undefined만 — API가 0을 주면 0 유지).
function withRealtime(servers: GpuServer[]): GpuServer[] {
  const n = (v: number | undefined, fb: number) => (v === undefined || v === null ? fb : v)
  return servers.map((s) => ({
    ...s,
    gpus: s.gpus.map((g) => {
      const sd = SEED_GPU_BY_ID.get(g.id)
      if (!sd) return g
      return {
        ...g,
        smUtil: n(g.smUtil, sd.smUtil),
        vramUtil: n(g.vramUtil, sd.vramUtil),
        temp: n(g.temp, sd.temp),
        power: n(g.power, sd.power),
        slices: g.slices?.map((sl) => {
          const sdsl = sd.slices?.find((x) => x.id === sl.id)
          return sdsl ? { ...sl, usage: n(sl.usage, sdsl.usage), vramUtil: n(sl.vramUtil, sdsl.vramUtil) } : sl
        }),
      }
    }),
  }))
}

async function fetchServers(): Promise<GpuServer[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/servers`, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`servers ${res.status}`)
    const json: unknown = await res.json()
    if (!Array.isArray(json) || json.length === 0) throw new Error('servers: empty/invalid')
    return withRealtime(json as GpuServer[])
  } catch {
    return null // 폴백은 호출부에서 seed 유지
  }
}

// 자원맵 데이터 소스 — 초기값=seed(로딩 밀림 없음), 마운트 후 /api/servers 성공 시 교체.
function useFleet(): GpuServer[] {
  const [fleet, setFleet] = useState<GpuServer[]>(seedServers)
  useEffect(() => {
    let alive = true
    fetchServers().then((live) => {
      if (alive && live) setFleet(live)
    })
    return () => {
      alive = false
    }
  }, [])
  return fleet
}

// 4.2 전체 — 단일 연속 벌집(모든 GPU hex 밀착) + 서버 영역 외곽선·라벨·헬스색(HyperCube 구조 베이스)
function ServerHoneycomb({ servers, onSelect }: { servers: GpuServer[]; onSelect: (id: string) => void }) {
  // 최소 단위 = 슬라이스. 서버 = 자기 슬라이스 헥사 묶음(고유 hue), 부하 음영.
  const regions: ServerRegion[] = servers.map((s, idx) => {
    const hue = HUES[idx % HUES.length]
    const bays: Bay[] = []
    s.gpus.forEach((g) => {
      if (g.xid) { bays.push({ util: 0, danger: true, idle: true, tip: `${g.name} · ${g.xid} · GPU 응답 없음` }); return }
      if (g.allocMode === 'cluster' || !g.slices || g.slices.length === 0) {
        const idle = g.health === 'inactive'
        bays.push({ util: g.smUtil, idle, tip: `${g.name} · GPU 단일(${g.vramGb}GB) · ${idle ? '유휴' : `부하 ${g.smUtil}%`}` }); return
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

// 도넛 링 — 트랙 + 블루 그라데이션 호. pct=true면 중앙에 백분율(사용률), 아니면 수치(used/total)
function MigDonut({ used, total, pct }: { used: number; total: number; pct?: boolean }) {
  const ratio = total ? used / total : 0
  const r = 64
  const circ = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: 168, height: 168 }}>
      <svg viewBox="0 0 168 168" width="168" height="168">
        <defs>
          <linearGradient id="mig-arc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="var(--mig-arc2)" />
          </linearGradient>
        </defs>
        <circle cx="84" cy="84" r={r} fill="none" stroke="var(--c-bg)" strokeWidth="16" />
        <circle cx="84" cy="84" r={r} fill="none" stroke="url(#mig-arc)" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - ratio)} transform="rotate(-90 84 84)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {pct ? (
          <>
            <span className="font-bold tabular-nums" style={{ fontSize: 40, lineHeight: 1 }}>{Math.round(ratio * 100)}<span style={{ fontSize: 20, color: 'var(--c-muted)' }}>%</span></span>
            <span className="tabular-nums" style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 5 }}>사용 {used} / {total}</span>
          </>
        ) : (
          <>
            <span className="font-bold tabular-nums" style={{ fontSize: 36, lineHeight: 1 }}>{used}</span>
            <span className="tabular-nums" style={{ fontSize: 18, color: 'var(--c-muted)', marginTop: 4 }}>/ {total}</span>
          </>
        )}
      </div>
    </div>
  )
}

// 작은 할당 공간 박스(미니) — 패널 목록용
function MiniBox({ state }: { state: BoxState }) {
  return <span className="rounded-[3px] shrink-0" style={{ width: 14, height: 14, ...BOX_STYLE[state] }} />
}

const RES_STATE: Record<BoxState, { label: string; fg: string }> = {
  used: { label: '사용 중', fg: 'var(--c-muted)' },
  free: { label: '가용', fg: 'var(--c-accent)' },
  down: { label: '확인 필요', fg: 'var(--c-danger)' },
}

// 자원 타입 칩(MIG·단일) — 일관 스타일
function ResTypeChip({ type }: { type: 'MIG' | '단일' }) {
  const accent = type === 'MIG'
  return (
    <span className="rounded shrink-0 font-bold whitespace-nowrap" style={{
      fontSize: 11, letterSpacing: '0.3px', padding: '1.5px 7px', lineHeight: 1.45,
      background: accent ? 'var(--accent-soft)' : 'transparent',
      border: `1px solid ${accent ? 'var(--c-accent)' : 'var(--c-border)'}`,
      color: accent ? 'var(--c-accent)' : 'var(--c-muted)',
    }}>{type}</span>
  )
}

// 상태 표기 — 박스 + 라벨(일관 색)
function ResStatus({ state }: { state: BoxState }) {
  const s = RES_STATE[state]
  return (
    <span className="inline-flex items-center shrink-0" style={{ gap: 6 }}>
      <MiniBox state={state} />
      <span className="font-semibold whitespace-nowrap" style={{ fontSize: 13, color: s.fg }}>{s.label}</span>
    </span>
  )
}

function SliceStatus({ allGpus }: { allGpus: Gpu[] }) {
  // 모든 할당 공간 = 단일 GPU(1칸) + MIG GPU 인스턴스(슬라이스). 장애 GPU = 확인 필요(down).
  const sliceState = (sl: MigSlice): BoxState => (sl.usage > 0 || sl.ownerUserId ? 'used' : 'free')
  const items = allGpus.map((g) => {
    if (g.xid) return { gpu: g, type: '단일' as const, slices: null, boxes: ['down' as BoxState] }
    if (g.migCapable && g.slices) {
      const sl = g.slices.map((s) => ({ gb: s.gb, state: sliceState(s) }))
      return { gpu: g, type: 'MIG' as const, slices: sl, boxes: sl.map((x) => x.state) }
    }
    return { gpu: g, type: '단일' as const, slices: null, boxes: [(g.assignedServiceId || g.assignedUserId) ? ('used' as BoxState) : ('free' as BoxState)] }
  })
  const allBoxes = items.flatMap((it) => it.boxes)
  const total = allBoxes.length
  const free = allBoxes.filter((b) => b === 'free').length
  const used = allBoxes.filter((b) => b === 'used').length
  const down = allBoxes.filter((b) => b === 'down').length
  // MIG GPU 먼저, 그다음 단일
  const ordered = [...items].sort((a, b) => (a.type === 'MIG' ? -1 : 0) - (b.type === 'MIG' ? -1 : 0))
  return (
    <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col shrink-0" style={{ boxShadow: 'var(--shadow-card)' }}>
      <header className="flex items-center justify-between gap-3" style={{ padding: 16 }}>
        <h3 className="font-bold truncate" style={{ fontSize: 16 }}>할당 가능한 공간</h3>
        <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: 14 }}>전체 공간 {total}</span>
      </header>
      <div className="flex" style={{ gap: 16, padding: '0 16px 16px' }}>
        {/* 좌: 사용률(MIG 인스턴스 + 단일 GPU 전체 중 사용 %) + 즉시 할당 가능 칸 수 */}
        <div className="shrink-0 flex flex-col items-center rounded-[10px]" style={{ background: 'var(--c-soft)', padding: '14px 14px', gap: 11, width: 196 }}>
          <span className="font-semibold text-center" style={{ fontSize: 14, color: 'var(--c-muted)' }}>사용률</span>
          <MigDonut used={used} total={total} pct />
          <span className="inline-flex items-center rounded-full border border-line" style={{ gap: 8, padding: '4px 14px' }}>
            <span className="rounded-[3px]" style={{ width: 12, height: 12, ...BOX_STYLE.free }} />
            <span className="font-semibold tabular-nums" style={{ fontSize: 14, color: 'var(--c-accent)' }}>{free}칸</span>
            <span className="text-muted" style={{ fontSize: 13 }}>할당 가능</span>
          </span>
          <div className="flex items-center flex-wrap justify-center" style={{ gap: '4px 12px', fontSize: 13 }}>
            <span className="inline-flex items-center" style={{ gap: 5 }}><MiniBox state="used" /><span className="text-muted">사용 {used}</span></span>
            <span className="inline-flex items-center" style={{ gap: 5 }}><MiniBox state="free" /><span className="text-muted">가용 {free}</span></span>
            {down > 0 && <span className="inline-flex items-center" style={{ gap: 5 }}><MiniBox state="down" /><span className="text-muted">확인 {down}</span></span>}
          </div>
        </div>
        {/* 우: 자원 목록(트리) — MIG GPU = 헤더 + 인스턴스 하위행 / 단일 GPU = 평행행 */}
        <div className="flex flex-col flex-1 min-w-0 rounded-[10px]" style={{ background: 'var(--c-soft)', padding: '14px 14px', gap: 8 }}>
          <span className="font-semibold" style={{ fontSize: 14, color: 'var(--c-muted)' }}>자원 목록 · MIG · 단일</span>
          <div className="flex flex-col overflow-auto" style={{ gap: 7, maxHeight: 306, paddingRight: 2 }}>
            {ordered.map((it) => {
              const tot = it.boxes.length
              const fr = it.boxes.filter((b) => b === 'free').length
              const isMig = it.type === 'MIG' && !!it.slices
              return (
                <div key={it.gpu.id} className="bg-card2 border border-line rounded-lg shrink-0" style={{ padding: isMig ? '9px 12px 11px' : '0 12px', minHeight: isMig ? undefined : 40 }}>
                  {/* 헤더 — GPU 글리프 · 모델 · 타입칩 / VRAM · 요약(MIG=가용 N/M · 단일=상태) */}
                  <div className="flex items-center justify-between gap-2 min-w-0" style={{ minHeight: isMig ? undefined : 40 }}>
                    <span className="flex items-center min-w-0" style={{ gap: 8 }}>
                      <CpuChipIcon width={15} height={15} style={{ color: 'var(--c-muted)' }} className="shrink-0" />
                      <span className="font-bold truncate" style={{ fontSize: 14 }}>{it.gpu.model}</span>
                      <ResTypeChip type={it.type} />
                    </span>
                    <span className="flex items-center shrink-0" style={{ gap: 10 }}>
                      <span className="text-muted tabular-nums" style={{ fontSize: 12 }}>{it.gpu.vramGb}GB</span>
                      {isMig
                        ? <span className="font-semibold tabular-nums whitespace-nowrap" style={{ fontSize: 13 }}><span style={{ color: fr > 0 ? 'var(--c-accent)' : 'var(--c-muted)' }}>가용 {fr}</span><span className="text-muted"> / {tot}</span></span>
                        : <ResStatus state={it.boxes[0]} />}
                    </span>
                  </div>
                  {/* MIG 인스턴스 하위행 — 좌측 가이드라인 트리 */}
                  {isMig && (
                    <div className="flex flex-col" style={{ gap: 5, marginTop: 9, marginLeft: 7, paddingLeft: 12, borderLeft: '1.5px solid var(--c-border)' }}>
                      {it.slices!.map((sl, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 min-w-0">
                          <span className="flex items-center min-w-0" style={{ gap: 7 }}>
                            <MiniBox state={sl.state} />
                            <span className="truncate" style={{ fontSize: 13 }}>{sl.gb}GB <span className="text-muted">인스턴스</span></span>
                          </span>
                          <span className="shrink-0 font-semibold" style={{ fontSize: 13, color: RES_STATE[sl.state].fg }}>{RES_STATE[sl.state].label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

// Figma KPI 카드 — 제목/값/링크 + 상태 배지(의미 기반 톤: danger=빨강·warn=노랑·ok=초록·neutral=중립)
type KpiTone = 'ok' | 'warn' | 'danger' | 'neutral'
const KPI_TONE: Record<KpiTone, { fg: string; bg: string }> = {
  ok: { fg: 'var(--c-accent2)', bg: 'var(--ok-soft)' },
  warn: { fg: 'var(--c-warn)', bg: 'var(--warn-soft)' },
  danger: { fg: 'var(--c-danger)', bg: 'var(--danger-soft)' },
  neutral: { fg: 'var(--c-accent)', bg: 'var(--accent-soft)' },
}
function ServerKpi({ title, value, unit, link, delta, deltaTone, icon }: {
  title: string; value: ReactNode; unit: string; link: string; delta?: string; deltaTone: KpiTone; icon: ReactNode
}) {
  const t = KPI_TONE[deltaTone]
  return (
    <div className="bg-card2 border border-line rounded-xl flex justify-between min-w-0 hover-lift" style={{ padding: '16px 20px', boxShadow: 'var(--shadow-card)' }}>
      <div className="flex flex-col min-w-0" style={{ gap: 12 }}>
        <span className="text-muted font-semibold truncate" style={{ fontSize: 16 }}>{title}</span>
        <div className="flex items-baseline" style={{ gap: 6 }}>
          <span className="font-bold" style={{ fontSize: 30, lineHeight: 1, letterSpacing: '-0.3px' }}>{value}</span>
          <span className="text-muted" style={{ fontSize: 15 }}>{unit}</span>
        </div>
        <span className="text-muted truncate" style={{ fontSize: 14, textDecoration: 'underline' }}>{link}</span>
      </div>
      <div className="flex flex-col items-end justify-between shrink-0">
        {delta ? <span className="font-semibold" style={{ fontSize: 14, color: t.fg }}>{delta}</span> : <span aria-hidden />}
        <span className="flex items-center justify-center rounded-md" style={{ width: 44, height: 44, background: t.bg, color: t.fg }}>{icon}</span>
      </div>
    </div>
  )
}

const abbrCalls = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`)

// 모델명 간단히 — 끝의 파라미터수(70B·32B·v3 등) 제거(좁은 슬라이스/카드에서 답답함 완화)
function shortModel(name?: string): string {
  const n = name ?? '—'
  return n.replace(/[\s-](\d+\.?\d*B|v\d+)(\s*\(.*\))?$/i, '').trim() || n
}

// 결정적 시드(문자열 해시) — 목업 보조지표(레이턴시·온도 등)에 Math.random 대신 사용
function seedOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// 서비스 카드 사용 추이 임계치 — 사용률 90%(초과 구간은 SparkLine이 위험색 강조)
const SVC_USAGE_THRESHOLD = 90

// 서비스 카드 보조지표 한 칸(라벨 위 · 값 아래)
function SvcMetric({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
      <span className="text-muted truncate" style={{ fontSize: 14 }}>{k}</span>
      <span className="truncate font-semibold tabular-nums" style={{ fontSize: 14, color: c ?? 'var(--c-text)' }}>{v}</span>
    </div>
  )
}

// 서비스 패널의 남는 공간 = 빗금 여유 슬롯(서비스 적거나 없을 때 깔끔히 채움). flex-1로 슬랙만 흡수
function ServiceEmptySlot({ none }: { none: boolean }) {
  return (
    <div className="flex-1 min-h-0 rounded-xl border border-line flex flex-col items-center justify-center text-center min-w-0 overflow-hidden"
      style={{ backgroundImage: MIG_HATCH, gap: 4, padding: 12 }}>
      <span className="font-semibold truncate max-w-full" style={{ fontSize: 15 }}>{none ? '올라간 서비스 없음' : '여유 슬롯'}</span>
      <span className="text-muted truncate max-w-full" style={{ fontSize: 14 }}>{none ? '이 GPU에 올라간 서비스가 없어요' : '서비스를 더 올릴 수 있어요'}</span>
    </div>
  )
}

// 4.4 올라간 서비스 — 우측 전체를 채우는 핵심 패널. 사용량순 대형 카드(종류·사용 비중·올린 사용자·모델·슬라이스)
function GpuServicePanel({ gpu }: { gpu: Gpu }) {
  const svcs = gpuServices(gpu)
  if (svcs.length === 0) return (
    <div className="flex flex-col h-full min-w-0" style={{ paddingBottom: 44 }}><ServiceEmptySlot none /></div>
  )
  const ranked = [...svcs].sort((a, b) => b.usageCount - a.usageCount)
  // 카드 1개면 콘텐츠 높이+빗금 여유슬롯, 2개+면 flex로 패널을 균등히 꽉 채움(아래 빈 공간 X)
  const single = ranked.length === 1
  // 비중 = 이 GPU 서비스 호출 총합 대비 점유율(합이 100%를 넘지 않게)
  const totalCalls = ranked.reduce((a, s) => a + s.usageCount, 0) || 1
  const slicesOf = (s: Service) => gpu.allocMode === 'cluster'
    ? [`단일 · ${gpu.vramGb}GB`]
    : (gpu.slices ?? []).filter((sl) => serviceOfSlice(sl)?.id === s.id).map((sl) => sl.profile)
  return (
    // paddingBottom = 우하단 FloatingButtons 클리어런스(마지막 카드 콘텐츠 안 가림)
    <div className="flex flex-col h-full min-w-0" style={{ gap: 12, paddingBottom: 44 }}>
      {ranked.map((s, i) => {
        const model = shortModel(modelById(s.model)?.name ?? s.model)
        const deployer = userById(s.deployerUserId ?? s.ownerUserId)?.name ?? '—'
        const chips = slicesOf(s)
        const share = Math.round((s.usageCount / totalCalls) * 100)
        const isTop = i === 0
        // 결정적 목업 보조지표(레이턴시·처리량·에러율·최근호출·추이) — Math.random 미사용
        const seed = seedOf(s.id)
        const latency = 38 + (seed % 142)
        const tput = 220 + (seed % 1480)
        const errRate = ((seed % 32) / 10)
        const ago = (seed % 56) + 1
        const warn = errRate > 2
        const spark = trend(52 + (seed % 34), 24, 16, (seed % 40) + 1)
        return (
          <article key={s.id} className="bg-soft border border-line rounded-xl flex flex-col min-w-0 hover-lift"
            style={{ flex: single ? undefined : 1, flexShrink: single ? 0 : 1, minHeight: 248, padding: 14, gap: 9 }}>
            {/* 헤더 — 순위 · 이름 / 상태·종류·API 배지 */}
            <header className="flex items-center justify-between gap-3 min-w-0 shrink-0">
              <div className="flex items-center min-w-0" style={{ gap: 11 }}>
                <span className="flex items-center justify-center rounded-lg shrink-0 font-bold tabular-nums"
                  style={{ width: 30, height: 30, fontSize: 15, background: isTop ? 'var(--c-accent)' : 'var(--accent-soft)', color: isTop ? 'var(--c-onaccent)' : 'var(--c-accent)' }}>{i + 1}</span>
                <div className="font-bold truncate min-w-0" style={{ fontSize: 17, lineHeight: 1.2 }}>{s.name}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge tone={warn ? 'warn' : 'ok'} dot>{warn ? '경고' : '정상'}</Badge>
                <Badge tone="neutral" dot={false}>{s.kind}</Badge>
                {s.hasApi && <Badge tone="info" dot={false}>API</Badge>}
              </div>
            </header>
            {/* 사용량 — 호출수·비중(숫자) */}
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>사용량 · 비중 {share}%</span>
              <span className="tabular-nums shrink-0"><span className="font-bold" style={{ fontSize: 22, letterSpacing: '-0.3px' }}>{abbrCalls(s.usageCount)}</span><span className="text-muted" style={{ fontSize: 14 }}> 호출</span></span>
            </div>
            {/* 사용 추이 — SparkLine(area fill 유지) + 임계 90% 점선·초과 위험색. 2개+면 남는 높이 채움, 1개면 고정 */}
            {single
              ? <div className="min-w-0"><SparkLine data={spark} color={isTop ? 'var(--c-accent)' : 'var(--c-accent2)'} height={48} threshold={SVC_USAGE_THRESHOLD} /></div>
              : <div className="flex-1 min-h-0 min-w-0" style={{ minHeight: 40 }}><SparkLine data={spark} color={isTop ? 'var(--c-accent)' : 'var(--c-accent2)'} height={40} fill threshold={SVC_USAGE_THRESHOLD} /></div>}
            {/* 보조지표 — 레이턴시·처리량·에러율·최근 호출 */}
            <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px 14px' }}>
              <SvcMetric k="평균 레이턴시" v={`${latency}ms`} />
              <SvcMetric k="토큰 처리량" v={`${abbrCalls(tput)} tok/s`} />
              <SvcMetric k="에러율" v={`${errRate.toFixed(1)}%`} c={warn ? 'var(--c-warn)' : undefined} />
              <SvcMetric k="최근 호출" v={`${ago}분 전`} />
            </div>
            {/* 메타 — 1줄 컴팩트(올린이 · 모델 / 슬라이스). 카드 높이 절약으로 2개 안정 표시 */}
            <div className="flex items-center justify-between gap-3 min-w-0 shrink-0" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 9 }}>
              <span className="truncate min-w-0" style={{ fontSize: 14 }}>
                <span className="text-muted">올린이 </span><span className="font-semibold">{deployer}</span>
                <span className="text-muted"> · </span><span className="font-semibold">{model}</span>
              </span>
              <div className="flex items-center shrink-0" style={{ gap: 4 }}>
                {chips.map((c, ci) => <span key={ci} className="rounded font-semibold tabular-nums shrink-0" style={{ fontSize: 14, padding: '1px 8px', background: 'var(--accent-soft)', color: 'var(--c-accent)', border: '1px solid var(--c-border)' }}>{c}</span>)}
              </div>
            </div>
          </article>
        )
      })}
      {/* 1개 서비스일 때만 빗금 여유 슬롯으로 나머지를 채움(2개+는 카드가 flex로 꽉 채움) */}
      {single && <ServiceEmptySlot none={false} />}
    </div>
  )
}

// ───────────────────────── 4.2 자원 뷰 — 서버 폴더(박스) ↔ MIG 육각 탭 ─────────────────────────

type BoxState = 'used' | 'free' | 'down'
const BOX_STYLE: Record<BoxState, CSSProperties> = {
  used: { background: 'var(--c-accent)', border: '1.5px solid var(--c-accent)' },
  free: { background: 'transparent', border: '1.5px solid var(--c-border)' },
  down: { backgroundImage: 'repeating-linear-gradient(45deg, rgba(120,140,170,.22) 0 5px, rgba(120,140,170,.04) 5px 10px)', border: '1.5px dashed var(--c-danger)' },
}
const BOX_LABEL: Record<BoxState, string> = { used: '사용 중', free: '할당 가능', down: '확인 필요' }

// 할당 공간 박스 — 정사각(MIG 유닛) 또는 와이드(GPU 단일)
function AllocBox({ state, tip, wide }: { state: BoxState; tip: string; wide?: boolean }) {
  const st = BOX_STYLE[state]
  if (wide) {
    const fg = state === 'used' ? 'var(--c-onaccent)' : state === 'down' ? 'var(--c-danger)' : 'var(--c-muted)'
    return (
      <div title={tip} className="flex items-center justify-center rounded-md w-full font-semibold" style={{ height: 34, ...st, color: fg, fontSize: 13 }}>
        {BOX_LABEL[state]}
      </div>
    )
  }
  return <span title={tip} className="rounded-[5px] shrink-0" style={{ width: 22, height: 22, ...st }} />
}

// GPU 1장의 할당 박스(MIG=유닛 다수 · 단일=1칸 · 장애=확인 필요)
function gpuAllocBoxes(g: Gpu): { boxes: { state: BoxState; tip: string }[]; wide: boolean } {
  if (g.xid) return { boxes: [{ state: 'down', tip: `${g.model} · 장애 ${g.xid}` }], wide: true }
  if (g.migCapable && g.slices) {
    // 박스 = MIG 인스턴스(분할) 1개당 1칸
    const boxes = g.slices.map((sl) => {
      const used = sl.usage > 0 || !!sl.ownerUserId
      const sv = serviceOfSlice(sl)
      return { state: (used ? 'used' : 'free') as BoxState, tip: `${sl.profile} · ${sl.gb}GB · ${used ? (sv?.name ?? '할당됨') : '할당 가능(가용)'}` }
    })
    return { boxes, wide: false }
  }
  const used = !!g.assignedServiceId || !!g.assignedUserId
  // 승인만 된(서비스 미생성) cluster 할당은 service가 없으므로 사용자명으로 보강
  const usedName = gpuServices(g)[0]?.name ?? userById(g.assignedUserId ?? '')?.name ?? '할당됨'
  return { boxes: [{ state: used ? 'used' : 'free', tip: `${g.model} 단일 · ${used ? usedName : '할당 가능(가용)'}` }], wide: true }
}

// 서버 = 폴더, 안에 GPU별 할당 가능 공간을 박스로. GPU 여러 장이면 GPU별로 묶어 표시.
function ServerFolder({ server, onSelect }: { server: GpuServer; onSelect: (id: string) => void }) {
  const multi = server.gpus.length > 1
  const per = server.gpus.map((g) => ({ g, ...gpuAllocBoxes(g) }))
  const allBoxes = per.flatMap((p) => p.boxes)
  const usedCount = allBoxes.filter((b) => b.state === 'used').length
  const total = allBoxes.length
  // GPU 여러 장이면 외부 그리드에서 장수만큼 칸을 차지(최대 4칸, 그리드 폭 초과 시 자동 클램프)
  const span = multi ? Math.min(server.gpus.length, 4) : 1
  return (
    <button type="button" onClick={() => onSelect(server.id)}
      className="bg-card2 border border-line rounded-xl flex flex-col text-left min-w-0 hover-lift"
      style={{ padding: 14, gap: 12, minHeight: 124, boxShadow: 'var(--shadow-card)', gridColumn: `span ${span}` }}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <ServerIcon width={17} height={17} style={{ color: 'var(--c-accent)' }} className="shrink-0" />
          <span className="font-bold shrink-0" style={{ fontSize: 15 }}>{server.name}</span>
          <span className="text-muted truncate" style={{ fontSize: 13 }}>{multi ? `GPU ${server.gpus.length}장` : per[0].g.model}</span>
        </span>
        <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: 13 }}>사용 {usedCount} / {total}</span>
      </div>
      {multi ? (
        // GPU 여러 장 — 폴더가 넓어진 만큼 GPU별 칸을 구분선으로 나눠 표시(단일 GPU 폴더와 동일 박스 크기)
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${server.gpus.length}, minmax(0, 1fr))` }}>
          {per.map(({ g, boxes, wide }, idx) => {
            const u = boxes.filter((b) => b.state === 'used').length
            return (
              <div key={g.id} className="flex flex-col min-w-0" style={{ gap: 7, paddingLeft: idx ? 14 : 0, paddingRight: idx < per.length - 1 ? 14 : 0, borderLeft: idx ? '1px solid var(--c-border)' : undefined }}>
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CpuChipIcon width={14} height={14} style={{ color: 'var(--c-muted)' }} className="shrink-0" />
                    <span className="font-semibold truncate" style={{ fontSize: 13 }}>{g.model}</span>
                  </span>
                  <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: 12 }}>{u}/{boxes.length}</span>
                </div>
                <div className="flex flex-wrap items-start" style={{ gap: 5 }}>
                  {boxes.map((b, i) => <AllocBox key={i} state={b.state} tip={b.tip} wide={wide} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap items-start" style={{ gap: 5 }}>
          {per[0].boxes.map((b, i) => <AllocBox key={i} state={b.state} tip={b.tip} wide={per[0].wide} />)}
        </div>
      )}
    </button>
  )
}

function LegendBox({ state, label }: { state: BoxState; label: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 7 }}>
      <span className="rounded-[4px]" style={{ width: 14, height: 14, ...BOX_STYLE[state] }} />
      <span className="text-muted" style={{ fontSize: 13 }}>{label}</span>
    </span>
  )
}

// 작은 육각형 글리프(탭 아이콘)
function HexGlyph({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 14 13" aria-hidden><polygon points="7,0 13,3.5 13,9.5 7,13 1,9.5 1,3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
}

// 서버 폴더(박스) ↔ MIG 육각 탭 래퍼
function ServerResourceView({ servers, onSelect }: { servers: GpuServer[]; onSelect: (id: string) => void }) {
  const [view, setView] = useState<'folder' | 'hex'>('folder')
  const tab = (active: boolean): CSSProperties => ({
    fontSize: 14, fontWeight: 600, padding: '7px 15px', borderRadius: 9,
    border: `1px solid ${active ? 'var(--c-accent)' : 'var(--c-border)'}`,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--c-accent)' : 'var(--c-muted)',
  })
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <div className="flex items-center shrink-0" style={{ gap: 8, marginBottom: 6 }}>
        <button type="button" onClick={() => setView('folder')} style={tab(view === 'folder')}>서버별 할당 보기</button>
        <button type="button" onClick={() => setView('hex')} className="inline-flex items-center" style={{ ...tab(view === 'hex'), gap: 7 }}><HexGlyph /> MIG 육각 보기</button>
      </div>
      {view === 'folder' ? (
        // 패딩: hover-lift(translateY -4px + 그림자)가 스크롤 컨테이너 상단/측면에서 잘리지 않게 여유
        <div className="flex-1 min-h-0 overflow-auto min-w-0 flex flex-col" style={{ padding: '12px 8px 8px' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(244px, 1fr))', gap: 14, alignContent: 'start' }}>
            {servers.map((s) => <ServerFolder key={s.id} server={s} onSelect={onSelect} />)}
          </div>
          <div className="flex items-center flex-wrap shrink-0" style={{ gap: 18, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--c-border)' }}>
            <LegendBox state="used" label="사용 중" />
            <LegendBox state="free" label="할당 가능" />
            <LegendBox state="down" label="확인 필요" />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 min-w-0"><ServerHoneycomb servers={servers} onSelect={onSelect} /></div>
      )}
    </div>
  )
}

// ───────────────────────── 4.2 전체 서버 ─────────────────────────

export function ResourceMap() {
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const servers = useFleet()
  const allGpus = useMemo(() => servers.flatMap((s) => s.gpus), [servers])
  const critGpu = useMemo(() => allGpus.find((g) => g.xid), [allGpus])
  const critServer = useMemo(() => servers.find((s) => s.gpus.some((g) => g.xid)), [servers])
  // 세션 1회만 — 닫으면 다시 안 뜸(자원맵 정중앙 영구 가림 방지)
  const [alertOpen, setAlertOpen] = useState(() => !sessionStorage.getItem('anclave-crit-dismissed'))
  const dismissAlert = () => { sessionStorage.setItem('anclave-crit-dismissed', '1'); setAlertOpen(false) }

  const activeGpus = allGpus.filter((g) => g.health !== 'inactive' && !g.xid).length
  const downGpus = allGpus.length - activeGpus // 유휴+장애 = 비가동(많을수록 위험)
  const avgUtil = Math.round(allGpus.reduce((a, g) => a + g.smUtil, 0) / allGpus.length)
  const critEvents = allEvents.filter((e) => e.severity === 'critical').length

  return (
    <>
      <div className="no-select h-full">
      <PageShell
        fill
        bare
        screen="4.2"
        title="전체 서버 현황"
        kpis={
          <>
            <ServerKpi title="총 서버 수" value={servers.length} unit="대" link="서버 관리 전체보기" deltaTone="neutral" icon={<ServerIcon width={22} height={22} />} />
            <ServerKpi title="가동 GPU" value={activeGpus} unit={`/ ${allGpus.length}`} link="가동 GPU 전체보기" delta={downGpus > 0 ? `${downGpus} 비가동` : '전체 가동'} deltaTone={downGpus > 0 ? 'danger' : 'ok'} icon={<CpuChipIcon width={22} height={22} />} />
            <ServerKpi title="평균 사용률" value={avgUtil} unit="%" link="평균 사용률 추이" delta={avgUtil >= 85 ? '높음' : avgUtil >= 70 ? '주의' : '적정'} deltaTone={avgUtil >= 85 ? 'danger' : avgUtil >= 70 ? 'warn' : 'ok'} icon={<ChartBarSquareIcon width={22} height={22} />} />
            <ServerKpi title="위험 이벤트" value={critEvents} unit="건" link="위험 이벤트 전체보기" delta={critEvents > 0 ? '확인 필요' : '없음'} deltaTone={critEvents > 0 ? 'danger' : 'ok'} icon={<ExclamationTriangleIcon width={22} height={22} />} />
          </>
        }
      >
        <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 18 }}>
          <ServerResourceView servers={servers} onSelect={(id) => navigate(`/resource-map/${id}`)} />
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 12 }}>
            <SliceStatus allGpus={allGpus} />
            <Card fill flush title="이벤트 로그" action={<button type="button" onClick={() => setDrawer(true)} className="text-accent" style={{ fontSize: 14 }}>전체 보기</button>}>
              <EventTable rows={allEvents} />
            </Card>
          </div>
        </div>
      </PageShell>
      </div>

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

// ───────────────────────── 4.3 단일 서버 (Figma '단일 서버 모니터링' node 6:3653 픽셀 매칭) ─────────────────────────

// GPU 정보 + 작업률·VRAM·온도 — 서버의 GPU(들) 통합 값을 텍스트로(게이지·그래프 없음, GPU 카드 스타일)
function GpuSummaryPanel({ server, onOpen }: { server: GpuServer; onOpen: () => void }) {
  const gpus = server.gpus
  const n = gpus.length
  const smUtil = Math.round(gpus.reduce((a, g) => a + g.smUtil, 0) / n)
  const vramUtil = Math.round(gpus.reduce((a, g) => a + g.vramUtil, 0) / n)
  const maxTemp = Math.max(...gpus.map((g) => g.temp))
  const totalPower = gpus.reduce((a, g) => a + g.power, 0)
  const totalVramGb = gpus.reduce((a, g) => a + g.vramGb, 0)
  const usedVramGb = Math.round(gpus.reduce((a, g) => a + (g.vramUtil / 100) * g.vramGb, 0) * 10) / 10
  const models = [...new Set(gpus.map((g) => g.model))]
  const g0 = gpus[0]
  const tempColor = maxTemp > 80 ? 'var(--c-danger)' : maxTemp > 70 ? 'var(--c-warn)' : 'var(--c-text)'
  const utilColor = smUtil > 85 ? 'var(--c-warn)' : 'var(--c-text)'
  const Stat = ({ k, v, c }: { k: string; v: ReactNode; c?: string }) => (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{k}</span>
      <span className="font-bold tabular-nums truncate" style={{ fontSize: 18, color: c ?? 'var(--c-text)' }}>{v}</span>
    </div>
  )
  return (
    <Card fill title="GPU 정보" action={<button type="button" onClick={onOpen} className="text-accent" style={{ fontSize: 13 }}>상세 →</button>}>
      <div className="flex flex-col h-full min-h-0" style={{ gap: 10 }}>
        {/* 모델 · 모드 */}
        <div className="flex items-center justify-between gap-2 min-w-0 shrink-0">
          <span className="flex items-center min-w-0" style={{ gap: 8 }}>
            <CpuChipIcon width={18} height={18} style={{ color: 'var(--c-muted)' }} className="shrink-0" />
            <span className="font-bold truncate" style={{ fontSize: 15 }}>{models.join(', ')}</span>
            {n > 1 && <span className="text-muted shrink-0" style={{ fontSize: 13 }}>×{n}</span>}
          </span>
          <span className="rounded shrink-0 font-semibold" style={{ fontSize: 12, padding: '1.5px 8px', border: `1px solid ${g0.migCapable ? 'var(--c-accent)' : 'var(--c-border)'}`, color: g0.migCapable ? 'var(--c-accent)' : 'var(--c-muted)' }}>{g0.migCapable ? 'MIG' : '단일'}</span>
        </div>
        {/* 통합 지표 — 텍스트(2열). 남는 높이를 행에 균등 분배 */}
        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: '1fr 1fr', gridAutoRows: 'minmax(0, 1fr)', columnGap: 20 }}>
          <Stat k="작업률" v={`${smUtil}%`} c={utilColor} />
          <Stat k="VRAM" v={`${vramUtil}%`} />
          <Stat k="온도" v={`${maxTemp}°C`} c={tempColor} />
          <Stat k="전력" v={`${totalPower} W`} />
          <Stat k="VRAM 사용" v={`${usedVramGb} / ${totalVramGb}GB`} />
          <Stat k="아키텍처" v={g0.arch} />
        </div>
        {n > 1 && <span className="text-muted shrink-0" style={{ fontSize: 12 }}>* {n}장 통합 — 작업률·VRAM=평균 · 온도=최고 · 전력=합</span>}
      </div>
    </Card>
  )
}

// 부하 추이 — 관제 모니터링 '클러스터 GPU 사용 추이'와 동일 비주얼: BandChart(버킷 min~max 밴드 +
// 평균선·점) · 같은 색 토큰 · 같은 조회범위 페어(10분→10초 default / 2시간→1분 / 1일→30분 / 1달→6시간).
// 데이터: GET /api/telemetry/band?kind=server&id=<serverId> — 해당 서버 것만(미연동 시 계약형 목).
const LOAD_CYAN = '#22d3ee'
const LOAD_SKY = '#7cc4f0'
const LOAD_VIOLET = '#a78bfa'
const LOAD_METRICS = ['cpu', 'mem', 'gpu']
const LOAD_SERIES: BandSeries[] = [
  { key: 'cpu', name: 'CPU', color: LOAD_CYAN, yAxisId: 'pct' },
  { key: 'mem', name: 'RAM', color: LOAD_SKY, yAxisId: 'pct' },
  { key: 'gpu', name: 'GPU', color: LOAD_VIOLET, yAxisId: 'pct' },
]
const LOAD_AXES: BandAxis[] = [{ id: 'pct', domain: [0, 100], ticks: [0, 25, 50, 75, 100], width: 36, suffix: '%' }]
const loadFmt = (_k: string, v: number) => `${Math.round(v)}%`

// 관제 모니터링과 동일한 범례(짧은 바)·조회범위 칩 스타일
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--c-muted)' }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 2 }} />
      {label}
    </span>
  )
}

// 조회범위 토글(4종) + {범위 · 단위} 칩 — 모니터링 헤더 토글·PanelChip과 동일 스타일(카드 헤더용 컴팩트)
function LoadRangeControls() {
  const { range, unit, setRange } = useRange()
  return (
    <div className="flex items-center shrink-0" style={{ gap: 8 }}>
      <div className="inline-flex items-center rounded-lg" style={{ padding: 2, gap: 2, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className="rounded-md font-semibold transition-colors"
            style={{ fontSize: 12, padding: '3px 10px', color: r === range ? 'var(--c-onaccent)' : 'var(--c-muted)', background: r === range ? 'var(--c-accent)' : 'transparent' }}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <span className="shrink-0 rounded-md font-semibold whitespace-nowrap" style={{ fontSize: 12, color: 'var(--c-muted)', padding: '3px 9px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>
        {RANGE_LABEL[range]} · {unit}
      </span>
    </div>
  )
}

function LoadBand({ server }: { server: GpuServer }) {
  const { data, range } = useTelemetryBand('server', server.id, LOAD_METRICS, {
    cpu: server.cpuUtil,
    mem: server.memUtil,
    gpu: serverAvgUtil(server),
  })
  return <BandChart data={data} xTickFormatter={tsLabel(range)} series={LOAD_SERIES} axes={LOAD_AXES} fmt={loadFmt} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} />
}

function LoadTrend({ server }: { server: GpuServer }) {
  // 이 카드 전용 조회범위 Context(모니터링과 같은 페어). 차트 영역 높이는 부모 grid가 고정.
  return (
    <RangeProvider initial="10m">
      <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0 min-w-0">
          <h3 className="text-[14px] font-bold truncate">부하 추이</h3>
          <div className="flex items-center shrink-0" style={{ gap: 12 }}>
            <div className="flex items-center" style={{ gap: 10 }}>
              <LegendDot color={LOAD_CYAN} label="CPU" />
              <LegendDot color={LOAD_SKY} label="RAM" />
              <LegendDot color={LOAD_VIOLET} label="GPU" />
            </div>
            <LoadRangeControls />
          </div>
        </header>
        <div className="flex-1 min-h-0 min-w-0" style={{ padding: 10 }}>
          <LoadBand server={server} />
        </div>
      </section>
    </RangeProvider>
  )
}

// 상단 GPU 카드 — 아이콘·이름·상태 / 모드·작업률·VRAM·온도(Figma Card General · node 6:3811)
function ServerGpuCard({ gpu, onClick }: { gpu: Gpu; onClick: () => void }) {
  const danger = !!gpu.xid
  const tempColor = gpu.temp > 80 ? 'var(--c-danger)' : gpu.temp > 70 ? '#FCBB2A' : '#919BC7'
  const Row = ({ k, children }: { k: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="shrink-0" style={{ fontSize: 15, color: '#5B6480' }}>{k}</span>
      {children}
    </div>
  )
  return (
    <button type="button" onClick={onClick}
      className="bg-card2 border border-line rounded-[10px] flex flex-col text-left min-w-0 hover-lift"
      style={{ minWidth: 0, padding: '16px 15px', gap: 15, boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <CpuChipIcon width={20} height={20} style={{ color: '#5B6480' }} className="shrink-0" />
          <span className="font-bold truncate" style={{ fontSize: 16 }}>{gpu.name}</span>
        </span>
        {danger
          ? <span className="rounded-full shrink-0 font-medium" style={{ fontSize: 13, padding: '2px 10px', color: 'var(--c-danger)', background: 'var(--danger-soft)', border: '1px solid var(--c-danger)' }}>장애</span>
          : <span className="rounded-full shrink-0 font-medium" style={{ fontSize: 13, padding: '2px 10px', color: '#5FF1EE', background: '#063240', border: '1px solid rgba(95,241,238,0.5)' }}>정상</span>}
      </div>
      <div className="flex flex-col" style={{ gap: 10 }}>
        <Row k="모드"><span className="rounded shrink-0 font-semibold" style={{ fontSize: 14, padding: '2px 10px', border: '1px solid var(--c-border)', color: gpu.migCapable ? 'var(--c-accent)' : '#919BC7' }}>{gpu.migCapable ? 'MIG' : '단일'}</span></Row>
        <Row k="작업률"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: '#919BC7' }}>{gpu.smUtil}%</span></Row>
        <Row k="VRAM"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: '#919BC7' }}>{gpu.vramUtil}%</span></Row>
        <Row k="온도"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: tempColor }}>{gpu.temp}°C</span></Row>
      </div>
    </button>
  )
}

// 빗금 "없음" 칩 — 빈 셀(빈 채로 두지 않고 명시)
function NoneChip({ label = '없음' }: { label?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded text-muted font-medium" style={{ fontSize: 13, padding: '2px 12px', backgroundImage: MIG_HATCH, border: '1px dashed var(--c-border)' }}>{label}</span>
  )
}

// 서비스 할당 현황(GPU별) — Figma 컬럼: GPU · 할당 서비스 수 · 서비스 목록 · 상태값 · 사용 VRAM · 시작 시간.
// 행 격자를 패널 하단까지 빈 줄로 이어 휑한 여백 방지(GPU N+1 자리도 그리드 유지).
const SAC_COLS = '76px 116px minmax(150px,1.5fr) 92px minmax(190px,1.1fr) 150px'
const SAC_ROW_H = 52
function ServiceAllocTable({ server, onGpu }: { server: GpuServer; onGpu: (g: Gpu) => void }) {
  const head: CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--c-muted)', whiteSpace: 'nowrap' }
  const cell: CSSProperties = { fontSize: 14 }
  return (
    <div className="h-full overflow-auto min-w-0 flex flex-col">
      {/* 헤더 */}
      <div className="grid items-center shrink-0 sticky top-0 z-[1]" style={{ gridTemplateColumns: SAC_COLS, gap: 16, padding: '12px 20px', background: 'var(--th-bg)', borderBottom: '2px solid var(--c-border)' }}>
        <span style={head}>GPU</span>
        <span style={{ ...head, textAlign: 'center' }}>할당 서비스 수</span>
        <span style={head}>서비스 목록</span>
        <span style={{ ...head, textAlign: 'center' }}>상태값</span>
        <span style={head}>사용 VRAM</span>
        <span style={{ ...head, textAlign: 'right' }}>시작 시간</span>
      </div>
      {/* 본문 — 행 + 빗금 필러로 높이 채움 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {server.gpus.map((g, i) => {
          const svcs = gpuServices(g)
          const s = seedOf(g.id)
          const active = svcs.length > 0
          const status = g.xid ? '장애' : active ? '실행중' : '대기중'
          const totalGb = g.allocMode === 'cluster' ? g.vramGb : (g.slices?.reduce((a, sl) => a + sl.gb, 0) ?? g.vramGb)
          const usedGb = !active ? 0 : g.allocMode === 'cluster'
            ? Math.round((g.vramUtil / 100) * g.vramGb * 10) / 10
            : Math.round((g.slices?.filter((sl) => sl.usage > 0 || sl.ownerUserId).reduce((a, sl) => a + (sl.vramUtil / 100) * sl.gb, 0) ?? 0) * 10) / 10
          const vramPct = totalGb ? Math.min(100, Math.round((usedGb / totalGb) * 100)) : 0
          const time = active ? `2026-06-0${(s % 8) + 1} / ${String(8 + (s % 12)).padStart(2, '0')}:${String((s % 6) * 10).padStart(2, '0')}` : ''
          return (
            <div key={g.id} onClick={() => onGpu(g)}
              className="grid items-center cursor-pointer shrink-0"
              style={{ gridTemplateColumns: SAC_COLS, gap: 16, height: SAC_ROW_H, padding: '0 20px', borderBottom: '1px solid var(--c-border-s)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              {/* GPU */}
              <span style={{ ...cell, fontWeight: 600 }}>GPU {i + 1}</span>
              {/* 할당 서비스 수 — 채움(>0)·빗금(0) pill */}
              <span className="flex justify-center">
                <span className="inline-flex items-center justify-center rounded-full font-bold tabular-nums" style={{ fontSize: 13, minWidth: 28, padding: '2px 9px', ...(active ? { background: 'var(--c-accent)', color: 'var(--c-onaccent)' } : { backgroundImage: MIG_HATCH, color: 'var(--c-muted)', border: '1px dashed var(--c-border)' }) }}>{svcs.length}</span>
              </span>
              {/* 서비스 목록 */}
              <span style={{ ...cell, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active ? svcs.map((x) => x.name).join(', ') : <NoneChip />}
              </span>
              {/* 상태값 */}
              <span className="flex justify-center">
                <Badge tone={status === '장애' ? 'danger' : active ? 'ok' : 'neutral'} dot>{status}</Badge>
              </span>
              {/* 사용 VRAM — 수치 + 바(빈 GPU=없음) */}
              <span style={cell}>
                {active ? (
                  <span className="flex flex-col" style={{ gap: 4 }}>
                    <span className="tabular-nums" style={{ fontSize: 13 }}><span className="font-semibold">{usedGb} GB</span><span className="text-muted"> / {totalGb} GB</span></span>
                    <span className="rounded-full overflow-hidden" style={{ height: 5, background: 'var(--c-bg)' }}><span className="block h-full rounded-full" style={{ width: `${vramPct}%`, background: 'var(--c-accent)' }} /></span>
                  </span>
                ) : <NoneChip />}
              </span>
              {/* 시작 시간 */}
              <span className="flex justify-end" style={{ ...cell, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {active ? time : <NoneChip />}
              </span>
            </div>
          )
        })}
        {/* 남은 공간 = 빈 그리드 줄(GPU N+1 자리) — 행 격자를 끝까지 이어 휑한 여백 방지 */}
        <div className="flex-1 min-h-0" aria-hidden
          style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${SAC_ROW_H - 1}px, var(--c-border) ${SAC_ROW_H - 1}px ${SAC_ROW_H}px)` }} />
      </div>
    </div>
  )
}

export function ServerDetail() {
  const { serverId = '' } = useParams()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const servers = useFleet()
  const server = servers.find((s) => s.id === serverId)
  if (!server) return <Navigate to="/resource-map" replace />

  const isMulti = server.gpus.length > 1 // GPU 여러 장=구 레이아웃(카드 행), 1장=신규 레이아웃
  const seed = seedOf(server.id)
  // 신규(단일 RTX) 서버 정보 = 호스트 정적 사양(2열 스펙시트). GPU 사양/지표는 GPU 정보 패널로 분리.
  const idn = parseInt(server.id.replace(/\D/g, '')) || 1
  const info: [string, string][] = [
    ['서버명', server.name],
    ['유형', 'GPU 노드'],
    ['CPU', 'Intel Xeon 8358P'],
    ['코어', '32C / 64T'],
    ['RAM', '512 GB'],
    ['스토리지', '7.2 TB NVMe'],
    ['네트워크', server.network],
    ['IP', `10.20.${idn}.10`],
    ['OS', 'Ubuntu 22.04 LTS'],
    ['위치', `데이터센터 A · ${server.host}`],
  ]
  // 구 레이아웃(멀티 GPU 노드) 서버 정보 = GPU 집계(혼합 구성 대응)
  const archs = [...new Set(server.gpus.map((g) => g.arch))]
  const totalVram = server.gpus.reduce((a, g) => a + g.vramGb, 0)
  const hasMig = server.gpus.some((g) => g.migCapable)
  const hasSingle = server.gpus.some((g) => !g.migCapable)
  const allocStr = hasMig && hasSingle ? 'MIG + 단일' : hasMig ? 'MIG 분할' : 'GPU 단일'
  const infoOld: [string, string][] = [
    ['서버명', server.name],
    ['GPU 수', `${server.gpus.length}장`],
    ['아키텍처', archs.join(' / ')],
    ['총 VRAM', `${totalVram} GB`],
    ['할당 방식', allocStr],
    ['CPU', 'Intel Xeon 8358P'],
    ['RAM', '512 GB'],
    ['네트워크', server.network],
    ['위치', `데이터센터 · ${server.host}`],
    ['생성일', `2025-0${(seed % 8) + 1}-${String((seed % 27) + 1).padStart(2, '0')} 11:23`],
  ]

  // 자원맵 — 서버 슬라이스 honeycomb(블루 히트맵)
  const gpuRegions: ServerRegion[] = server.gpus.map((g, gi) => {
    const hue = HUES[gi % HUES.length]
    const go = () => navigate(`/resource-map/${server.id}/${g.id}`)
    const regHealth = g.xid ? 'danger' : g.health === 'inactive' ? 'inactive' : 'normal'
    let bays: Bay[]
    if (g.xid) {
      bays = [{ util: 0, danger: true, idle: true, tip: `${g.name} · ${g.xid} · GPU 응답 없음` }]
    } else if (g.allocMode === 'cluster' || !g.slices || g.slices.length === 0) {
      const svc = gpuServices(g)[0]
      const idle = g.health === 'inactive'
      bays = [{ util: g.smUtil, idle, tip: `${g.name} · GPU 단일(${g.vramGb}GB) · ${svc ? svc.name : '미할당'} · ${idle ? '유휴' : `부하 ${g.smUtil}%`}` }]
    } else {
      bays = g.slices.map((s) => {
        const used = s.usage > 0 || !!s.ownerUserId
        const owner = s.ownerUserId ? userById(s.ownerUserId)?.name : undefined
        const req = s.requestId ? gpuRequests.find((r) => r.id === s.requestId) : undefined
        return { util: s.usage, idle: !used, tip: used ? `${owner ?? '—'} · ${req?.serviceName ?? '신청'} · ${s.profile} ${s.gb}GB · 부하 ${s.usage}%` : `가용 · ${s.profile} ${s.gb}GB` }
      })
    }
    const usedSl = g.slices?.filter((s) => s.usage > 0 || s.ownerUserId).length ?? (g.allocMode === 'cluster' ? 1 : 0)
    const rtip = `${g.model} · ${g.migCapable ? `MIG ${g.slices?.length ?? 0}분할(${usedSl} 사용)` : `GPU 단일 ${g.vramGb}GB`} · ${g.xid ? g.xid : `${g.smUtil}%`}`
    return { id: g.id, label: g.model, health: regHealth, outline: hueLine(hue), regionTip: rtip, bays, onClick: go }
  })

  return (
    <>
      <div className="no-select h-full">
      <PageShell fill bare screen="4.3">
        <div className="flex flex-col h-full min-h-0" style={{ gap: 12 }}>
          {/* 헤더 — 뒤로가기 · 서버 스위처(검색 드롭다운) · 상태 · GPU 수 */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <BackBtn />
            <Picker
              size="lg"
              value={server.id}
              options={serverOptions(servers)}
              onSelect={(id) => navigate(`/resource-map/${id}`)}
              searchable
              searchPlaceholder="서버 검색"
              ariaLabel="서버 선택"
              menuWidth={264}
            />
            <HealthBadge health={server.health} />
            <span className="rounded-full border border-line text-muted shrink-0" style={{ fontSize: 14, padding: '2px 11px' }}>GPU {server.gpus.length}장</span>
          </div>

          {isMulti ? (
            <>
              {/* 멀티 GPU 노드(구 레이아웃) — GPU 카드 행(장착된 GPU만, 빈 슬롯 없음) */}
              <div className="grid shrink-0 min-w-0" style={{ gridTemplateColumns: `repeat(${server.gpus.length}, minmax(0, 1fr))`, gap: 12 }}>
                {server.gpus.map((g) => <ServerGpuCard key={g.id} gpu={g} onClick={() => navigate(`/resource-map/${server.id}/${g.id}`)} />)}
              </div>
              {/* 부하 추이 · 서버 정보(2열) — 반반 배치 */}
              <div className="grid shrink-0" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, height: 300 }}>
                <LoadTrend server={server} />
                <Card fill title="서버 정보">
                  {/* 2열 스펙시트 — GPU 사양 포함, 행 높이 넉넉 · 옅은 hairline */}
                  <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1fr 1fr', columnGap: 32, gridAutoRows: 'minmax(0, 1fr)' }}>
                    {infoOld.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 min-w-0" style={{ borderBottom: '1px solid var(--c-border-s)' }}>
                        <span className="shrink-0" style={{ fontSize: 13, color: '#5B6480' }}>{k}</span>
                        <span className="font-medium truncate text-right min-w-0 selectable" style={{ fontSize: 14 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </>
          ) : (
            /* 단일 GPU 노드(신규 레이아웃) — 부하 추이(좌, 넓게) · 우측 적층[서버 정보 + GPU 정보(텍스트)] */
            <div className="grid shrink-0" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 12, height: 386 }}>
              <LoadTrend server={server} />
              <div className="grid min-h-0" style={{ gridTemplateRows: '1.12fr 0.88fr', gap: 12 }}>
                <Card fill title="서버 정보">
                  {/* 2열 스펙시트 — 라벨(muted) 좌 · 값 우 · 행 높이 넉넉 · 옅은 hairline */}
                  <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1fr 1fr', columnGap: 32, gridAutoRows: 'minmax(0, 1fr)' }}>
                    {info.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 min-w-0" style={{ borderBottom: '1px solid var(--c-border-s)' }}>
                        <span className="shrink-0" style={{ fontSize: 13, color: '#5B6480' }}>{k}</span>
                        <span className="font-medium truncate text-right min-w-0 selectable" style={{ fontSize: 14 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <GpuSummaryPanel server={server} onOpen={() => navigate(`/resource-map/${server.id}/${server.gpus[0].id}`)} />
              </div>
            </div>
          )}

          {/* ⑤자원맵(테두리·카드 박스 없이 배경에 직접 — Figma) · ⑥서비스 할당 현황 */}
          <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: '1fr 1.9fr', gap: 16 }}>
            <div className="flex flex-col min-h-0 min-w-0" style={{ gap: 8 }}>
              <h3 className="text-[14px] font-bold shrink-0">자원맵</h3>
              <div className="flex-1 min-h-0 min-w-0"><ServerHexMap regions={gpuRegions} bare /></div>
            </div>
            <Card fill flush title="서비스 할당 현황">
              <ServiceAllocTable server={server} onGpu={(g) => navigate(`/resource-map/${server.id}/${g.id}`)} />
            </Card>
          </div>
        </div>
      </PageShell>
      </div>

      <FloatingButtons target={server.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`${server.name} 이벤트 로그`}><EventList rows={serverEvents(server.id)} /></Drawer>
    </>
  )
}

// ───────────────────────── 4.4 GPU 상세 ─────────────────────────

// KPI 추이 임계치 — 사용률 90% · 온도 85°C · 전력 = TDP의 95%(전력 추이는 %TDP 스케일)
const UTIL_THRESHOLD_PCT = 90
const TEMP_THRESHOLD_C = 85
const POWER_THRESHOLD_PCT = 95

// 최근 활동 · 올라간 서비스 상세 — 이 GPU에 올라간 서비스들의 최근 이벤트 타임라인(더미)
type FeedTone = 'ok' | 'info' | 'warn' | 'danger' | 'accent'
const FEED_COL: Record<FeedTone, string> = { ok: 'var(--c-ok)', info: 'var(--c-accent)', warn: 'var(--c-warn)', danger: 'var(--c-danger)', accent: 'var(--c-accent2)' }
function GpuActivityFeed({ gpu }: { gpu: Gpu }) {
  const svcs = gpuServices(gpu)
  const seed = seedOf(gpu.id)
  const nm = (i: number) => (svcs.length ? svcs[i % svcs.length].name : '서비스')
  const items: { tone: FeedTone; kind: string; who: string; desc: string; ago: string }[] = [
    { tone: 'ok', kind: '배포 완료', who: nm(0), desc: `버전 v2.${3 + (seed % 5)}.1 롤아웃 · 컨테이너 3/3 Ready`, ago: '2분 전' },
    { tone: 'accent', kind: '호출 급증', who: nm(1), desc: `5분 평균 +${24 + (seed % 28)}% · QPS ${90 + (seed % 110)}`, ago: '11분 전' },
    { tone: 'warn', kind: '응답 지연 경고', who: nm(2), desc: `p95 ${280 + (seed % 130)}ms · 임계 250ms 초과`, ago: '26분 전' },
    { tone: 'info', kind: '레플리카 확장', who: nm(0), desc: '오토스케일 · 2 → 3 replica', ago: '41분 전' },
    { tone: 'ok', kind: '체크포인트 저장', who: nm(3), desc: `주기 저장 · ${3 + (seed % 5)}.${seed % 9}GB`, ago: '1시간 전' },
    gpu.migCapable
      ? { tone: 'info' as const, kind: '슬라이스 재할당', who: nm(1), desc: '1g.36gb → 2g.72gb 승급', ago: '2시간 전' }
      : { tone: 'info' as const, kind: '컨테이너 재배치', who: nm(1), desc: '노드 내 재스케줄 완료', ago: '2시간 전' },
    { tone: 'danger', kind: '오류 발생', who: nm(2), desc: 'CUDA OOM 1건 · 자동 복구됨', ago: '3시간 전' },
    { tone: 'ok', kind: '인스턴스 재시작', who: nm(0), desc: '헬스체크 실패 후 자동 재기동', ago: '5시간 전' },
    { tone: 'info', kind: '모델 동기화', who: nm(3), desc: '레지스트리 weights 동기화 완료', ago: '8시간 전' },
  ]
  if (svcs.length === 0) return (
    <div className="flex flex-col h-full min-w-0" style={{ gap: 12 }}>
      <span className="text-muted font-semibold shrink-0" style={{ fontSize: 13 }}>최근 활동 · 올라간 서비스 상세</span>
      <div className="flex-1 min-h-0 rounded-xl border border-line flex flex-col items-center justify-center text-center" style={{ backgroundImage: MIG_HATCH, gap: 4 }}>
        <span className="font-semibold" style={{ fontSize: 15 }}>최근 활동 없음</span>
        <span className="text-muted" style={{ fontSize: 13 }}>올라간 서비스가 없어 기록이 없어요</span>
      </div>
    </div>
  )
  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between gap-2 shrink-0 min-w-0" style={{ marginBottom: 12 }}>
        <span className="font-semibold truncate" style={{ fontSize: 14 }}>최근 활동 <span className="text-muted font-normal">· 올라간 서비스 상세</span></span>
        <span className="text-muted shrink-0" style={{ fontSize: 13 }}>{svcs.length}개 서비스</span>
      </div>
      <ul className="flex-1 min-h-0 overflow-auto flex flex-col min-w-0" style={{ paddingRight: 4 }}>
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={i} className="flex gap-3 min-w-0">
              {/* 좌측 레일 — dot + 연결선 */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 10 }}>
                <span className="rounded-full shrink-0" style={{ width: 9, height: 9, marginTop: 3, background: FEED_COL[it.tone], boxShadow: `0 0 0 3px color-mix(in srgb, ${FEED_COL[it.tone]} 24%, transparent)` }} />
                {!last && <span className="flex-1" style={{ width: 1.5, background: 'var(--c-border)', marginTop: 3 }} />}
              </div>
              {/* 내용 */}
              <div className="flex flex-col min-w-0" style={{ gap: 3, paddingBottom: last ? 0 : 14 }}>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="font-semibold truncate" style={{ fontSize: 14 }}>{it.kind}</span>
                  <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: 12 }}>{it.ago}</span>
                </div>
                <span className="text-muted truncate" style={{ fontSize: 13 }}>{it.desc}</span>
                <span className="self-start rounded font-medium truncate max-w-full" style={{ fontSize: 12, padding: '1px 8px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{it.who}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function GpuDetail() {
  // KPI 추이 band(useTelemetryBand)는 useRange Context 필요 → RangeProvider 로 감싼다(4.4는 범위 UI 없어 10m 고정).
  return (
    <RangeProvider initial="10m">
      <GpuDetailInner />
    </RangeProvider>
  )
}

const GPU_KPI_METRICS = ['sm', 'vram', 'temp', 'power'] // 4.4 KPI 추이 metric(DB telemetry)

function GpuDetailInner() {
  const { serverId = '', gpuId = '' } = useParams()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const servers = useFleet()
  const server = servers.find((s) => s.id === serverId)
  const gpu = server?.gpus.find((g) => g.id === gpuId)
  // KPI 추이 = 단일 GPU 텔레메트리 band(DB). hook 규칙상 early return 전에 호출(gpu 없으면 빈 id→빈 결과, Navigate로 폐기).
  const { data: kpiBand } = useTelemetryBand('gpu', gpu?.id ?? '', GPU_KPI_METRICS,
    gpu ? { sm: gpu.smUtil, vram: gpu.vramUtil, temp: gpu.temp, power: gpu.power } : undefined)
  if (!server || !gpu) return <Navigate to="/resource-map" replace />

  const usedMb = vramUsedMb(gpu)
  // 결정적 가동시간(시드: 시리얼 숫자) — Math.random 미사용
  const serialNum = parseInt(gpu.serial.replace(/\D/g, '').slice(-4) || '0', 10)
  const upDays = (serialNum % 88) + 5
  const upHours = serialNum % 24
  // MIG 헤더 — N분할(표시 칸 수=분할+빈) · 사용 인스턴스/전체. 그리드와 동일 소스(migLayout)
  const mig = migLayout(gpu)
  const tdp = gpu.migCapable ? 600 : 250 // 대략 TDP(전력 기준)
  const powerThW = Math.round(tdp * (POWER_THRESHOLD_PCT / 100)) // 전력 임계 = TDP의 95%
  // 미니 꺾은선 추이 = DB band avg 시계열(작업률·VRAM·온도 %·전력 W). 빈 응답이면 정적값 폴백.
  const utilTrend = kpiBand.map((d) => Number(d.sm) || 0)
  const vramTrend = kpiBand.map((d) => Number(d.vram) || 0)
  const tempTrend = kpiBand.map((d) => Number(d.temp) || 0)
  const powerTrend = kpiBand.map((d) => Number(d.power) || 0)
  const lastOr = (a: number[], fb: number) => (a.length ? a[a.length - 1] : fb)
  const smNow = Math.round(lastOr(utilTrend, gpu.smUtil))
  const vramNow = Math.round(lastOr(vramTrend, gpu.vramUtil))
  const tempNow = Math.round(lastOr(tempTrend, gpu.temp))
  const powerNow = Math.round(lastOr(powerTrend, gpu.power))
  const migTitle = gpu.migCapable
    ? `MIG 인스턴스 분할 · ${mig.cells}분할 · 사용 ${mig.usedInstances}/${mig.total}`
    : `GPU 단일 할당 · ${gpu.model}`

  // 이 서버의 GPU 스위처 옵션 — 순번(GPU N) 라벨 + 모델 보조(같은 모델 다수도 구분).
  // 장애=danger, 그 외 health.
  const gpuOptions: PickerOption[] = server.gpus.map((g, i) => ({
    id: g.id,
    label: `GPU ${i + 1}`,
    hint: g.xid ? undefined : `${g.smUtil}%`,
    status: g.xid ? '장애' : HEALTH_META[g.health]?.label,
    dotColor: g.xid ? 'var(--c-danger)' : HEALTH_META[g.health]?.color,
  }))

  return (
    <>
      <div className="no-select h-full">
      <PageShell
        fill
        bare
        screen="4.4"
        pre={
          <header className="flex items-center justify-between gap-3 min-w-0 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <BackBtn />
              <h2 className="font-bold truncate" style={{ fontSize: 18 }}>GPU 상세 현황</h2>
            </div>
            <div className="flex items-center gap-2 min-w-0">
            {/* 서버 전환 — 바꾸면 해당 서버의 첫 GPU로 */}
            <Picker
              size="sm"
              align="right"
              value={server.id}
              options={serverOptions(servers)}
              onSelect={(id) => {
                const s = servers.find((x) => x.id === id)
                if (s) navigate(`/resource-map/${id}/${s.gpus[0].id}`)
              }}
              searchable
              searchPlaceholder="서버 검색"
              ariaLabel="서버 선택"
              menuWidth={244}
            />
            {/* GPU 전환 — 같은 서버 내 */}
            <Picker
              size="sm"
              align="right"
              value={gpu.id}
              options={gpuOptions}
              onSelect={(id) => navigate(`/resource-map/${server.id}/${id}`)}
              searchable
              searchPlaceholder="GPU 검색"
              ariaLabel="GPU 선택"
              menuWidth={244}
            />
            {gpu.xid ? <Badge tone="danger" dot={false}>{gpu.xid}</Badge> : <HealthBadge health={gpu.health} />}
            </div>
          </header>
        }
        kpis={
          <>
            <KpiStat label="작업률" value={smNow} unit="%" delta={smNow > UTIL_THRESHOLD_PCT ? '높음' : '정상'} deltaTone={smNow > UTIL_THRESHOLD_PCT ? 'warn' : 'ok'} trend={utilTrend} trendThreshold={UTIL_THRESHOLD_PCT} trendAutoPad trendFmt={(v) => `${Math.round(v)}%`} sub={`임계 ${UTIL_THRESHOLD_PCT}%`} />
            <KpiStat label="VRAM" value={vramNow} unit="%" delta={`${fmtNum(usedMb)} MB`} deltaTone="muted" trend={vramTrend} trendThreshold={90} trendAutoPad trendFmt={(v) => `${Math.round(v)}% · ${fmtNum(Math.round((v / 100) * vramTotalMb(gpu)))} MB`} sub={`${fmtNum(usedMb)} / ${fmtNum(vramTotalMb(gpu))} MB`} />
            <KpiStat label="온도" value={tempNow} unit="°C" delta={tempNow > TEMP_THRESHOLD_C ? '위험' : tempNow > 70 ? '주의' : '정상'} deltaTone={tempNow > TEMP_THRESHOLD_C ? 'danger' : tempNow > 70 ? 'warn' : 'ok'} trend={tempTrend} trendThreshold={TEMP_THRESHOLD_C} trendAutoPad trendFmt={(v) => `${Math.round(v)}°C`} gaugeColor="var(--c-warn)" sub={`임계 ${TEMP_THRESHOLD_C}°C`} />
            <KpiStat label="전력" value={powerNow} unit="W" delta={`TDP ${tdp}W`} deltaTone="muted" trend={powerTrend} trendThreshold={powerThW} trendAutoPad trendFmt={(v) => `${Math.round(v)} W`} sub={`임계 ${powerThW} W · 효율 ${Math.round((smNow / Math.max(1, powerNow)) * 100)}%`} />
          </>
        }
      >
        {/* §4.4(갱신) — 좌: GPU 정보(성능추이 자리)+VRAM+MIG 적층 / 우: 올라간 서비스 전체 꽉 */}
        <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
          <div className="flex flex-col min-h-0 h-full" style={{ gap: 12 }}>
            {/* 슬라이스 분할 = 이 GPU에서 가장 중요 → 상단(GPU 정보 자리) */}
            <Card title={migTitle} className="shrink-0">
              <SliceGrid gpu={gpu} />
            </Card>
            <Card title={`VRAM 점유 (${gpu.vramGb}GB · 32 세그먼트)`} className="shrink-0">
              <VramSegments util={gpu.vramUtil} />
              <div className="flex items-center justify-between text-muted" style={{ fontSize: 14, marginTop: 8 }}><span>점유 {fmtNum(usedMb)} MB</span><span>여유 {fmtNum(vramTotalMb(gpu) - usedMb)} MB</span></div>
            </Card>
            {/* GPU 정보 = 하단. 좌: 사양(왼쪽으로 압축) / 우: 최근 활동 타임라인 */}
            <Card fill title="GPU 정보 · 최근 활동" style={{ flex: 1, minHeight: 0 }}>
              <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '0.82fr 1.18fr', gap: 18 }}>
                {/* 좌 — GPU 사양 */}
                <div className="grid h-full min-w-0" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, gridAutoRows: 'minmax(0, 1fr)' }}>
                  <Info k="모델" v={gpu.model} />
                  <Info k="아키텍처" v={gpu.arch} />
                  <Info k="시리얼" v={gpu.serial} />
                  <Info k="분할 모드" v={gpu.migCapable ? 'MIG' : '단일'} />
                  <Info k="VRAM" v={`${gpu.vramGb}GB`} />
                  <Info k="인터커넥트" v={gpu.interconnect ?? (gpu.allocMode === 'cluster' ? 'NVLink' : 'PCIe 5.0')} />
                  <Info k="드라이버" v="550.90.07" />
                  <Info k="CUDA" v="12.4" />
                  <Info k="헬스"
                    v={gpu.xid ? gpu.xid : gpu.health === 'inactive' ? '유휴' : '정상'}
                    tone={gpu.xid ? 'var(--c-danger)' : gpu.health === 'inactive' ? 'var(--c-inactive)' : 'var(--c-ok)'} />
                  <Info k="소속 서버" v={server.name} />
                  <Info k="온도" v={`${gpu.temp}°C`} tone={gpu.temp > 80 ? 'var(--c-danger)' : gpu.temp > 70 ? 'var(--c-warn)' : undefined} />
                  <Info k="전력" v={`${gpu.power}W`} />
                  <Info k="가동시간" v={`${upDays}일 ${upHours}시간`} />
                </div>
                {/* 우 — 최근 활동 · 올라간 서비스 상세 */}
                <div className="h-full min-h-0 min-w-0 border-l border-line" style={{ paddingLeft: 18 }}>
                  <GpuActivityFeed gpu={gpu} />
                </div>
              </div>
            </Card>
          </div>
          {/* 우: 올라간 서비스 — GPU 정보 빠진 공간까지 합쳐 전체 꽉(이 GPU 핵심 정보) */}
          <div className="flex flex-col min-h-0 h-full">
            <Card fill title={`올라간 서비스 · ${gpuServices(gpu).length}`} className="h-full">
              <GpuServicePanel gpu={gpu} />
            </Card>
          </div>
        </div>
      </PageShell>
      </div>

      <FloatingButtons target={gpu.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`${gpu.name} 이벤트 로그`}><EventList rows={gpuEvents(gpu.id)} /></Drawer>
    </>
  )
}

// 스펙시트 행 — 키(작게·muted) / 값(mono·강조) + 행 hairline으로 스캔성↑. tone 지정 시 상태 dot.
function Info({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0 border-b border-line" style={{ minHeight: 30 }}>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{k}</span>
      <span className="truncate font-semibold font-mono flex items-center selectable" style={{ fontSize: 14, gap: 6 }}>
        {tone && <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: tone }} />}
        {v}
      </span>
    </div>
  )
}

function VramSegments({ util }: { util: number }) {
  const filled = Math.round((util / 100) * 32)
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(32, 1fr)', gap: 2 }}>
      {/* 온도 스펙트럼 램프 — 세그먼트 위치를 따라 블루(저)→시안→녹→황→주황→레드(고). MIG 육각과 동일 heatColor */}
      {Array.from({ length: 32 }, (_, i) => (
        <div key={i} style={{ height: 16, borderRadius: 2, background: i < filled ? heatColor((i / 31) * 100) : 'var(--c-soft)' }} title={`세그먼트 ${i + 1}/32`} />
      ))}
    </div>
  )
}

// 미할당 빗금(가시성 강화)
const MIG_HATCH = 'repeating-linear-gradient(45deg, rgba(120,140,170,.22) 0 5px, rgba(120,140,170,.04) 5px 10px)'

// MIG 분할 레이아웃 — GPU의 실제 VRAM(vramGb)을 메모리 한도로. 헤더·그리드가 같은 값을 쓰도록 단일 소스.
function migLayout(gpu: Gpu) {
  const slices = gpu.slices ?? []
  const partUnits = slices.reduce((sum, s) => sum + s.units, 0) // 분할에 쓰인 컴퓨트
  const partGb = slices.reduce((sum, s) => sum + s.gb, 0) // 분할에 쓰인 메모리
  const minGb = slices.length ? Math.min(...slices.map((s) => s.gb)) : 8
  const freeGb = Math.max(0, gpu.vramGb - partGb)
  // 빈 인스턴스 = 가장 작은 인스턴스가 하나 더 들어갈 메모리 여유가 있을 때만
  const hasEmpty = freeGb >= minGb
  const freeUnits = hasEmpty ? Math.max(1, Math.round(freeGb / (partGb / Math.max(1, partUnits) || minGb))) : 0
  const usedInstances = slices.filter((s) => s.usage > 0 || s.ownerUserId).length
  const cells = slices.length + (hasEmpty ? 1 : 0) // 실제 표시 칸 수(분할+빈)
  const total = cells // 총 인스턴스(분할+빈)
  const cols = partUnits + (hasEmpty ? freeUnits : 0) // 그리드 폭(빈 칸 없으면 분할만 → 빈틈 없음)
  return { freeUnits, freeGb, hasEmpty, usedInstances, cells, total, cols }
}

function SliceGrid({ gpu }: { gpu: Gpu }) {
  if (gpu.allocMode === 'cluster') {
    const svc = gpuServices(gpu)[0]
    const idle = gpu.health === 'inactive'
    return (
      <div className="rounded-lg border border-line flex flex-col items-center justify-center text-center h-full" style={{ minHeight: 130, padding: 16, background: idle ? 'var(--c-soft)' : bandColor(gpu.smUtil), backgroundImage: idle ? MIG_HATCH : undefined }}>
        <div className="font-bold" style={{ fontSize: 16, color: idle ? 'var(--c-text)' : '#fff' }}>GPU 단일 할당 · {gpu.model} {gpu.vramGb}GB</div>
        <div style={{ fontSize: 14, color: idle ? 'var(--c-muted)' : 'rgba(255,255,255,.85)', marginTop: 4 }}>{idle ? '유휴 · 미할당(신청 가능)' : `${svc ? `${svc.name} · ${modelById(svc.model)?.name ?? ''}` : '미할당'} · 작업률 ${gpu.smUtil}%`}</div>
      </div>
    )
  }
  // GPU 1장 분할 — 외곽 프레임(=GPU) 안에 슬라이스 타일을 작은 간격으로(깔끔·구분·통합). 폭=g수 비례.
  // 그리드 폭 = 분할 컴퓨트(+빈 칸). 메모리 소진 시 빈 칸 없음 → 슬라이스가 폭을 빈틈없이 채움.
  const slices = gpu.slices ?? []
  const { hasEmpty, freeUnits, freeGb, cols } = migLayout(gpu)
  return (
    <div className="rounded-xl border border-line grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6, padding: 8, background: 'var(--c-bg)' }}>
      {slices.map((s) => <SliceCell key={s.id} slice={s} gpu={gpu} />)}
      {hasEmpty && <EmptySlot units={freeUnits} gb={freeGb} />}
    </div>
  )
}

// 슬라이스 타일 — 프레임 안의 한 칸(개별 카드 아님, 작은 간격으로 구분)
// 모든 슬라이스 타일 = 고정 높이(페이지·분할수 무관 동일). 좁은 1g(stat 세로 누적)도 이 안에 들어옴.
const SLICE_TILE_H = 178
function tileStyle(units: number, used: boolean): CSSProperties {
  return {
    gridColumn: `span ${units}`,
    height: SLICE_TILE_H,
    padding: 11,
    borderRadius: 8,
    background: used ? 'var(--accent-soft)' : 'var(--c-card2)',
    backgroundImage: used ? undefined : MIG_HATCH,
  }
}

// 슬라이스 stat 인라인 단위 — "라벨 값" 한 덩어리(nowrap), flex-wrap에서 단일로 줄바꿈(잘림 없음)
function SliceStat({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums" style={{ fontSize: 14 }}>
      <span className="text-muted">{k} </span>
      <span className="font-semibold" style={{ color: c ?? 'var(--c-text)' }}>{v}</span>
    </span>
  )
}

// 슬라이스 타일 — GPU 분할 한 칸을 풍부하게: 프로필·상태·신청명·사용자·모델·컨테이너·사용추이·stat(작업/VRAM/온도/전력/메모리/가동)
function SliceCell({ slice, gpu }: { slice: MigSlice; gpu: Gpu }) {
  const used = slice.usage > 0 || !!slice.ownerUserId
  const owner = slice.ownerUserId ? userById(slice.ownerUserId)?.name : undefined
  const model = slice.modelId ? shortModel(modelById(slice.modelId)?.name) : undefined
  const req = slice.requestId ? gpuRequests.find((r) => r.id === slice.requestId) : undefined
  const svcName = serviceOfSlice(slice)?.name ?? req?.serviceName ?? '할당 서비스'
  const hot = (v: number) => (v > 85 ? 'var(--c-warn)' : 'var(--c-text)')
  const seed = seedOf(slice.id)
  const temp = Math.min(86, Math.max(34, gpu.temp + (seed % 7) - 3))
  const warn = slice.usage > 85
  return (
    <div className="flex flex-col min-w-0 overflow-hidden" style={{ ...tileStyle(slice.units, used), gap: 6 }}>
      {/* 헤더 — 프로필 칩 + 상태 dot(좁은 타일에서도 안 잘림, 색으로 정상/경고) */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="rounded max-w-full truncate font-semibold shrink-0" style={{ fontSize: 14, padding: '1px 9px', background: used ? 'var(--accent-soft)' : 'var(--c-soft)', color: used ? 'var(--c-accent)' : 'var(--c-muted)', border: '1px solid var(--c-border)' }}>{slice.profile}</span>
        {used && <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: warn ? 'var(--c-warn)' : 'var(--c-ok)' }} title={warn ? '경고' : '정상'} />}
      </div>
      {used ? (
        <>
          {/* 신청명 · 사용자 · 모델 · 컨테이너 — line-height 압축으로 좁은 1g도 고정높이 안에 들어옴 */}
          <div className="min-w-0 flex flex-col" style={{ gap: 2, lineHeight: 1.25 }}>
            <div className="font-bold truncate" style={{ fontSize: 15 }}>{svcName}</div>
            <div className="text-muted truncate" style={{ fontSize: 14 }}>{owner ?? '—'} · {model ?? '—'}</div>
            <div className="text-muted truncate font-mono selectable" style={{ fontSize: 14 }}>{slice.containerId ?? '—'}</div>
          </div>
          {/* stat — 핵심 3개(작업·VRAM·온도). 하단 고정·flex-wrap(잘림 0) */}
          <div className="flex flex-wrap items-baseline min-w-0 shrink-0" style={{ marginTop: 'auto', gap: '2px 14px', lineHeight: 1.25 }}>
            <SliceStat k="작업" v={`${slice.usage}%`} c={hot(slice.usage)} />
            <SliceStat k="VRAM" v={`${slice.vramUtil}%`} c={hot(slice.vramUtil)} />
            <SliceStat k="온도" v={`${temp}°`} c={temp > 80 ? 'var(--c-danger)' : temp > 70 ? 'var(--c-warn)' : undefined} />
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
      <span className="font-semibold truncate max-w-full" style={{ fontSize: 15 }}>비어 있음</span>
      <span className="text-accent truncate max-w-full" style={{ fontSize: 14 }}>신청 가능</span>
      <span className="text-muted truncate max-w-full" style={{ fontSize: 14 }}>{units}g · {gb}GB</span>
    </div>
  )
}

// 미할당 여유(컴퓨트·메모리 잔여) — 빈 타일. 실제 가용 용량 표시(가짜 프로필 금지)
function EmptySlot({ units, gb }: { units: number; gb: number }) {
  return (
    <div className="flex flex-col min-w-0 overflow-hidden" style={{ ...tileStyle(units, false), gap: 6 }}>
      <span className="rounded self-start max-w-full truncate font-semibold shrink-0 text-muted" style={{ fontSize: 14, padding: '2px 8px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>미할당</span>
      <EmptyBody units={units} gb={gb} />
    </div>
  )
}


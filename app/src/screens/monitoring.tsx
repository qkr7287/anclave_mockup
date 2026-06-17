import { Fragment, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, KpiStat } from '../components/ui'
import { BandChart } from '../components/charts'
import type { BandSeries, BandAxis } from '../components/charts'
import { servers, allGpus, events } from '../data'
import { useEvents } from '../data/hooks/usePolling'
import { useRole } from '../lib/role'
import { filterEventRowsForUser } from './event-store'
import { serverAvgUtil, vramUsedMb, vramTotalMb, fmtNum } from '../lib/metrics'
import {
  RANGES,
  RANGE_LABEL,
  INTERVAL_BY_RANGE,
  RangeProvider,
  useRange,
  useTelemetryBand,
  tsLabel,
} from './monitoring-telemetry'

// ─────────────────────────────────────────────────────────────────────────
// G11 · 4.7 관제 모니터링 — 전체 서버 모니터링(재현) · Figma node 3-2 구조 1:1
// 다크 빅스크린 · 무스크롤 1920×1080(100vh·넘침은 패널 내부) · 색은 테마 토큰
// 시계열은 useTelemetryBand(조회범위 Context) → /api/telemetry/band(없으면 목).
// 모든 위젯이 같은 {range,unit} Context 공유(전부 조회범위 기준).
// ─────────────────────────────────────────────────────────────────────────

const ACCENT = 'var(--c-accent)'
const ACCENT2 = 'var(--c-accent2)'
const WARN = 'var(--c-warn)'
const DANGER = 'var(--c-danger)'
const OK = 'var(--c-ok)'
const MUTED = 'var(--c-muted)'

// Figma 차트 라인 색 — 클러스터(cyan/하늘/보라) · 전력온도(파랑/주황) · 네트워크(cyan/파랑)
const CYAN = '#22d3ee'
const SKY = '#7cc4f0'
const VIOLET = '#a78bfa'
const POWER_BLUE = '#4f9bff'
const TEMP_RED = '#ff6a45'
const NET_OUT = '#3b82f6'

// ───────── 시드 집계(src/data — seed.json 단일 소스 · 더미 생성 금지) ─────────
const meanOf = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0)
const TOTAL_GPU = allGpus.length
const ACTIVE_GPUS = allGpus.filter((g) => g.health !== 'inactive' && !g.xid)
const ACTIVE_GPU = ACTIVE_GPUS.length
const IDLE_GPU = allGpus.filter((g) => g.health === 'inactive').length
const FAILED_GPU = allGpus.filter((g) => g.xid).length
const NORMAL_SRV = servers.filter((s) => s.health === 'normal').length
const GPU_UTIL = meanOf(ACTIVE_GPUS.map((g) => g.smUtil))
const SRV_UTIL = meanOf(servers.map((s) => serverAvgUtil(s)))
const VRAM_UTIL = meanOf(ACTIVE_GPUS.map((g) => g.vramUtil))
const TEMP_MEAN = meanOf(ACTIVE_GPUS.map((g) => g.temp))
const VRAM_USED_GB = Math.round(allGpus.reduce((a, g) => a + vramUsedMb(g), 0) / 1024)
const VRAM_TOTAL_GB = Math.round(allGpus.reduce((a, g) => a + vramTotalMb(g), 0) / 1024)
const POWER_TOTAL = allGpus.reduce((a, g) => a + g.power, 0)
const POWER_MEAN = meanOf(allGpus.map((g) => g.power))
const IDLE_PCT = Math.round((IDLE_GPU / Math.max(1, TOTAL_GPU)) * 1000) / 10

const axisTick = { fontSize: 10, fill: MUTED }

// 축 상한을 nice 값으로 — 범위 전환에도 축이 안 흔들리게 base 기준 고정(레이아웃 안정).
function niceTop(v: number): number {
  const step = v <= 10 ? 2 : v <= 50 ? 10 : v <= 200 ? 50 : v <= 1000 ? 100 : 500
  return Math.max(step, Math.ceil(v / step) * step)
}
const triTicks = (top: number) => [0, Math.round(top / 2), top]
const PCT_TICKS = [0, 25, 50, 75, 100]

// 차트 값 포맷터 — BandChart 툴팁([최저·평균·최고])에 주입.
const clusterFmt = (k: string, v: number) => (k === 'avg' ? `${Math.round(v)}%` : Math.round(v).toLocaleString('en-US'))
const powerFmt = (k: string, v: number) => (k === 'power' ? `${Math.round(v)} W` : `${Math.round(v)}°C`)
const netFmt = (_k: string, v: number) => `${Math.round(v)} Gbps`

// 패널 우상단 조회범위 칩 — Context의 {range·unit} 반영(전부 조회범위 기준).
function PanelChip() {
  const { range, unit } = useRange()
  return (
    <span
      className="shrink-0 rounded-md font-semibold whitespace-nowrap"
      style={{ fontSize: 12, color: MUTED, padding: '3px 9px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
    >
      {RANGE_LABEL[range]} · {unit}
    </span>
  )
}

// ───────────────────────── ① 헤더 ─────────────────────────

function MonitoringHeader() {
  const { range, unit, setRange } = useRange()
  return (
    <header className="flex items-end justify-between gap-4 shrink-0 min-w-0">
      <div className="min-w-0">
        <h1 className="font-bold truncate" style={{ fontSize: 20, letterSpacing: '-0.3px' }}>
          전체 서버 모니터링
        </h1>
        <p className="text-muted truncate" style={{ fontSize: 14, marginTop: 2 }}>
          실시간 서버 및 인프라 현황을 살펴보는 모니터링입니다.
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* 실시간 LIVE */}
        <span className="inline-flex items-center gap-2" style={{ fontSize: 13 }}>
          <span
            className="rounded-full"
            style={{ width: 8, height: 8, background: OK, boxShadow: `0 0 0 3px color-mix(in srgb, ${OK} 22%, transparent)`, animation: 'pulseSlice 1.6s ease-in-out infinite' }}
          />
          <span className="font-semibold" style={{ color: OK }}>실시간</span>
          <span className="text-muted tabular-nums">15:30:45</span>
        </span>

        {/* 단위(읽기전용) — 조회범위 → 단위 권장페어 자동 */}
        <span
          className="inline-flex items-center gap-2 rounded-lg"
          style={{ fontSize: 13, padding: '5px 11px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          <span className="text-muted">단위</span>
          <span className="font-bold tabular-nums" style={{ color: ACCENT }}>{unit}</span>
        </span>

        {/* 조회범위 토글(4종) — 선택값을 Context로 전 위젯에 전파 */}
        <div
          className="inline-flex items-center rounded-lg"
          style={{ padding: 3, gap: 2, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded-md font-semibold transition-colors"
              style={{
                fontSize: 13,
                padding: '4px 12px',
                color: r === range ? 'var(--c-onaccent)' : MUTED,
                background: r === range ? ACCENT : 'transparent',
              }}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

// ───────────────────────── ② KPI 5장 ─────────────────────────

// GPU 상세 현황(4.4)과 동일한 KpiStat 추이 모드 — 좌 [라벨/값/상태/보조] · 우 큰 꺾은선
// (임계 점선 + 호버 값 툴팁). 도메인은 자체 정규화(16% 패딩) → 눌림 없음.
interface KpiStatus { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }
interface KpiMeta {
  metric: string
  base: number
  label: string
  unit?: string
  sub: string
  color: string
  /** 임계치 — 추이 점선. 없는 카드는 미표시. */
  threshold?: number
  fmt: (v: number) => string
  status?: (latest: number) => KpiStatus
}

// KPI 임계치 — 사용률 90%(경고 75%) · 전력 TDP 95%(시드에 TDP 필드 없음 → 목업 상수).
// (GPU 온도 85°C는 온도 KPI 카드가 없어 현재 미사용 — 온도 카드 추가 시 적용.)
const UTIL_THRESHOLD_PCT = 90
const UTIL_WARN_PCT = 75
const TDP_MEAN_W = 220
const POWER_THRESHOLD_W = Math.round(TDP_MEAN_W * 0.95)

const utilStatus = (v: number): KpiStatus =>
  v >= UTIL_THRESHOLD_PCT ? { text: '높음', tone: 'danger' } : v >= UTIL_WARN_PCT ? { text: '주의', tone: 'warn' } : { text: '정상', tone: 'ok' }
const pctFmt = (v: number) => `${Math.round(v)}%`
const wattFmt = (v: number) => `${Math.round(v)} W`

// 시드 집계가 목 폴백 base — 실연동 시 base는 무시되고 계약 응답으로 대체.
const KPI_META: KpiMeta[] = [
  { metric: 'srvUtil', base: SRV_UTIL, label: '전체 서버 사용률', unit: '%', sub: `정상 ${NORMAL_SRV} / ${servers.length} 서버`, color: ACCENT, threshold: UTIL_THRESHOLD_PCT, fmt: pctFmt, status: utilStatus },
  { metric: 'gpuUtil', base: GPU_UTIL, label: '전체 GPU 사용률', unit: '%', sub: `활성 ${ACTIVE_GPU} / ${TOTAL_GPU} GPU`, color: ACCENT2, threshold: UTIL_THRESHOLD_PCT, fmt: pctFmt, status: utilStatus },
  { metric: 'activeGpu', base: ACTIVE_GPU, label: '활성 GPU 수', unit: '대', sub: `전체 ${TOTAL_GPU}대`, color: OK, fmt: (v) => `${Math.round(v)}대`, status: () => (FAILED_GPU > 0 ? { text: `장애 ${FAILED_GPU}`, tone: 'danger' } : { text: '정상', tone: 'ok' }) },
  { metric: 'vramUtil', base: VRAM_UTIL, label: '평균 VRAM 사용률', unit: '%', sub: `${VRAM_USED_GB} / ${VRAM_TOTAL_GB} GB`, color: '#8d6be0', threshold: UTIL_THRESHOLD_PCT, fmt: pctFmt, status: utilStatus },
  { metric: 'power', base: POWER_MEAN, label: '평균 전력', unit: 'W', sub: `총 ${fmtNum(POWER_TOTAL)} W`, color: WARN, threshold: POWER_THRESHOLD_W, fmt: wattFmt, status: () => ({ text: `TDP ${TDP_MEAN_W}W`, tone: 'muted' }) },
]
const KPI_METRICS = KPI_META.map((k) => k.metric)
const KPI_BASES = Object.fromEntries(KPI_META.map((k) => [k.metric, k.base]))

function KpiRow() {
  // KPI 5종 단일 폴링(같은 조회범위) — 카드 큰 숫자=범위 내 최신값, 추이=범위 시리즈.
  const { data } = useTelemetryBand('cluster', 'all', KPI_METRICS, KPI_BASES)
  return (
    <div className="grid shrink-0" style={{ gap: 12, gridTemplateColumns: 'repeat(5, 1fr)' }}>
      {KPI_META.map((meta) => {
        const trend = data.map((d) => Number(d[meta.metric]) || 0)
        const latest = trend.length ? trend[trend.length - 1] : meta.base
        const st = meta.status?.(latest)
        return (
          <KpiStat
            key={meta.label}
            label={meta.label}
            value={Math.round(latest)}
            unit={meta.unit}
            delta={st?.text}
            deltaTone={st?.tone}
            sub={meta.sub}
            trend={trend}
            trendThreshold={meta.threshold}
            trendAutoPad
            trendFmt={meta.fmt}
            gaugeColor={meta.color}
          />
        )
      })}
    </div>
  )
}

// ───────────────────────── ③ 클러스터 GPU 사용 추이 ─────────────────────────

const CLUSTER_METRICS = ['total', 'used', 'avg']
const CLUSTER_BASES = { used: ACTIVE_GPU, total: TOTAL_GPU, avg: GPU_UTIL }
const CNT_TOP = niceTop(TOTAL_GPU)
const CLUSTER_AXES: BandAxis[] = [
  { id: 'cnt', domain: [0, CNT_TOP], ticks: triTicks(CNT_TOP), width: 34 },
  { id: 'pct', orientation: 'right', domain: [0, 100], ticks: PCT_TICKS, width: 36, suffix: '%' },
]
const CLUSTER_SERIES: BandSeries[] = [
  { key: 'total', name: '총 GPU 수', color: SKY, yAxisId: 'cnt' },
  { key: 'used', name: '사용 GPU 수', color: CYAN, yAxisId: 'cnt' },
  { key: 'avg', name: '평균 사용률(%)', color: VIOLET, yAxisId: 'pct' },
]
function ClusterTrend() {
  const { data, range } = useTelemetryBand('cluster', 'all', CLUSTER_METRICS, CLUSTER_BASES)
  return <BandChart data={data} xTickFormatter={tsLabel(range)} series={CLUSTER_SERIES} axes={CLUSTER_AXES} fmt={clusterFmt} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} />
}

// ───────────────────────── ④ 전력 / 온도 추이 ─────────────────────────

const POWER_METRICS = ['power', 'temp']
const POWER_BASES = { power: POWER_MEAN, temp: TEMP_MEAN }
const W_TOP = niceTop(Math.round(POWER_MEAN * 1.5))
const POWER_AXES: BandAxis[] = [
  { id: 'w', domain: [0, W_TOP], ticks: triTicks(W_TOP), width: 38 },
  { id: 'c', orientation: 'right', domain: [0, 100], ticks: PCT_TICKS, width: 32 },
]
const POWER_SERIES: BandSeries[] = [
  { key: 'power', name: '평균 전력 (W)', color: POWER_BLUE, yAxisId: 'w' },
  { key: 'temp', name: '평균 온도 (°C)', color: TEMP_RED, yAxisId: 'c' },
]
function PowerTempTrend() {
  const { data, range } = useTelemetryBand('cluster', 'all', POWER_METRICS, POWER_BASES)
  return <BandChart data={data} xTickFormatter={tsLabel(range)} series={POWER_SERIES} axes={POWER_AXES} fmt={powerFmt} margin={{ top: 8, right: 6, bottom: 0, left: 2 }} />
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: MUTED }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 2 }} />
      {label}
    </span>
  )
}

// ───────────────────────── ⑤ 서버별 GPU 히트맵 ─────────────────────────

// 사용률 5밴드(0~20…80~100%) — 녹→황→적 heat ramp
const HEAT_BANDS = [
  { max: 20, color: '#2c6e5a' },
  { max: 40, color: '#3fb950' },
  { max: 60, color: '#c9a227' },
  { max: 80, color: '#e07b39' },
  { max: 101, color: '#f85149' },
]
function heatColor(v: number): string {
  return (HEAT_BANDS.find((b) => v < b.max) ?? HEAT_BANDS[4]).color
}

const SRV_BADGE: Record<string, { label: string; color: string }> = {
  normal: { label: '정상', color: OK },
  warn: { label: '경고', color: WARN },
  danger: { label: '장애', color: DANGER },
  inactive: { label: '유휴', color: MUTED },
}
const MAX_GPU = Math.max(...servers.map((s) => s.gpus.length))
const HEAT = servers.map((s) => ({
  id: s.id,
  name: s.name,
  health: s.health,
  avg: serverAvgUtil(s),
  cells: Array.from({ length: MAX_GPU }, (_, i) => {
    const g = s.gpus[i]
    if (!g) return null
    return { util: g.smUtil, xid: g.xid, idle: g.health === 'inactive', model: g.model }
  }),
}))

// 히트맵 — 서버×GPU 현재 스냅샷. 단일 CSS Grid로 헤더·전 행이 같은 컬럼 트랙을
// 공유 → 완벽 정렬. 헤더 구분선 + 타일 테두리로 그리드 가독성 확보.
const HEAT_COLS = `66px repeat(${MAX_GPU}, minmax(0, 1fr)) 104px`
const heatCell: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  borderRadius: 5,
  fontSize: 10.5,
  fontWeight: 700,
  padding: '0 9px',
  gap: 6,
  overflow: 'hidden',
}
function GpuHeatmap() {
  return (
    <div className="h-full min-h-0 flex flex-col" style={{ gap: 8 }}>
      <div
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: HEAT_COLS,
          gridTemplateRows: `auto 1px repeat(${HEAT.length}, minmax(0, 1fr))`,
          columnGap: 6,
          rowGap: 5,
        }}
      >
        {/* 헤더 행 — 라벨 */}
        <div />
        {Array.from({ length: MAX_GPU }, (_, i) => (
          <div key={`h${i}`} className="text-muted" style={{ fontSize: 10, alignSelf: 'end', paddingLeft: 9 }}>GPU{i}</div>
        ))}
        <div className="text-muted text-right" style={{ fontSize: 10, alignSelf: 'end' }}>평균 · 상태</div>
        {/* 헤더 구분선 — 전 컬럼 가로지름 */}
        <div style={{ gridColumn: '1 / -1', background: 'var(--c-border)' }} />

        {/* 서버 행 — Fragment 로 같은 그리드에 셀 배치 */}
        {HEAT.map((r) => {
          const badge = SRV_BADGE[r.health]
          return (
            <Fragment key={r.id}>
              <div className="text-muted truncate" style={{ display: 'flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600 }}>{r.name}</div>
              {r.cells.map((c, ci) => {
                if (!c) return <div key={ci} style={{ ...heatCell, border: '1px dashed var(--c-border)', opacity: 0.5 }} />
                const bg = c.xid ? 'color-mix(in srgb, var(--c-danger) 22%, transparent)' : c.idle ? 'var(--c-track)' : heatColor(c.util)
                const fg = c.xid ? DANGER : c.idle ? MUTED : c.util >= 40 ? '#0a0d12' : '#cdd6e4'
                const text = c.xid ? `장애 · ${c.xid}` : c.idle ? '유휴' : `${c.util}%`
                return (
                  <div key={ci} style={{ ...heatCell, background: bg, color: fg, border: '1px solid color-mix(in srgb, var(--c-text) 10%, transparent)' }} title={`${r.name} · ${c.model}`}>
                    <span className="tabular-nums shrink-0">{text}</span>
                    <span className="truncate" style={{ fontWeight: 500, opacity: 0.82, fontSize: 10 }}>{c.model}</span>
                  </div>
                )
              })}
              <div className="flex items-center justify-end gap-1.5" style={{ minWidth: 0 }}>
                <span className="tabular-nums font-bold" style={{ fontSize: 11 }}>{r.avg}%</span>
                <span className="rounded font-bold shrink-0" style={{ fontSize: 9.5, padding: '1px 5px', color: badge.color, background: `color-mix(in srgb, ${badge.color} 16%, transparent)` }}>{badge.label}</span>
              </div>
            </Fragment>
          )
        })}
      </div>
      <div className="flex items-center flex-wrap shrink-0" style={{ gap: '4px 12px', paddingTop: 2 }}>
        <span className="text-muted" style={{ fontSize: 11 }}>사용률 범례</span>
        {['0~20%', '20~40%', '40~60%', '60~80%', '80~100%'].map((lb, i) => (
          <span key={lb} className="inline-flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>
            <span className="rounded-sm" style={{ width: 12, height: 12, background: HEAT_BANDS[i].color }} />
            {lb}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11, color: DANGER }}>장애(XID)</span>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>유휴</span>
      </div>
    </div>
  )
}

// ───────────────────────── ⑥ 네트워크 Throughput ─────────────────────────

const NET_METRICS = ['in', 'out']
const NET_BASES = { in: 70, out: 35 }
const NET_TOP = niceTop(90)
const NET_AXES: BandAxis[] = [{ id: 'g', domain: [0, NET_TOP], ticks: PCT_TICKS, width: 32 }]
const NET_SERIES: BandSeries[] = [
  { key: 'in', name: 'In (Gbps)', color: CYAN, yAxisId: 'g' },
  { key: 'out', name: 'Out (Gbps)', color: NET_OUT, yAxisId: 'g' },
]
function NetworkThroughput() {
  const { data, range } = useTelemetryBand('cluster', 'all', NET_METRICS, NET_BASES)
  return <BandChart data={data} xTickFormatter={tsLabel(range)} series={NET_SERIES} axes={NET_AXES} fmt={netFmt} margin={{ top: 8, right: 8, bottom: 0, left: -10 }} />
}

// ───────────────────────── ⑦ 실시간 알림 ─────────────────────────

const SEV: Record<string, { label: string; color: string }> = {
  critical: { label: '치명', color: DANGER },
  warn: { label: '경고', color: WARN },
  info: { label: '관심', color: ACCENT },
  recovered: { label: '복구', color: OK },
}
// 발생 시간 — DB(ISO) · 시드('YYYY-MM-DD HH:mm') 둘 다 HH:mm 으로 표시.
function fmtTime(createdAt: string): string {
  if (createdAt.includes('T')) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
  }
  const m = createdAt.match(/\d{2}:\d{2}/)
  return m ? m[0] : createdAt
}

type AlarmRow = { id: string; gpuId?: string | null; serverId?: string | null; severity: string; message: string; createdAt: string }
const toAlarm = (e: AlarmRow) => ({
  id: e.id,
  sev: SEV[e.severity] ?? SEV.info,
  msg: e.message,
  srv: e.serverId ?? '—',
  time: fmtTime(e.createdAt),
})

function AlarmTable() {
  const { user, isAdmin } = useRole()
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  // 실시간 알림 — DB(/api/events). 관리자=전체(7), 사용자=본인 스코프 확보 위해 넉넉히 받아 클라 필터.
  const { data } = useEvents({ limit: isAdmin ? 7 : 60 })
  // data null(로딩·backend 다운) → 시드 폴백.
  const rows: AlarmRow[] = data ?? events
  // 사용자(B/C)는 본인 소유 자원·서비스 이벤트만(자원맵은 A 전용 → event-store 스코프 재사용).
  const scoped = isAdmin ? rows : filterEventRowsForUser(rows, user.id)
  const alarms = scoped.slice(0, 7).map(toAlarm)
  // 행 클릭 → 이벤트 상세(이벤트 로그 ?detail=<id> · 자원맵/대시보드와 동일 패턴).
  const openEvent = (id: string) => navigate(`/events?detail=${id}`)

  const th: CSSProperties = { fontSize: 11, fontWeight: 700, color: MUTED, textAlign: 'left', padding: '7px 8px', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--th-bg)', borderBottom: '2px solid var(--c-border)' }
  const td: CSSProperties = { fontSize: 12.5, padding: '8px 8px', borderBottom: '1px solid var(--c-border-s)', verticalAlign: 'middle' }
  return (
    <div className="h-full overflow-auto min-w-0">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 52 }}>수준</th>
            <th style={th}>메시지</th>
            <th style={{ ...th, width: 62 }}>서버</th>
            <th style={{ ...th, width: 64, textAlign: 'right' }}>발생 시간</th>
          </tr>
        </thead>
        <tbody>
          {alarms.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...td, color: MUTED, textAlign: 'center', padding: '24px 8px' }}>표시할 알림이 없습니다.</td>
            </tr>
          ) : (
            alarms.map((a) => (
              <tr
                key={a.id}
                onClick={() => openEvent(a.id)}
                onMouseEnter={() => setHover(a.id)}
                onMouseLeave={() => setHover((h) => (h === a.id ? null : h))}
                className="cursor-pointer"
                style={{ background: hover === a.id ? 'var(--c-soft)' : undefined }}
              >
                <td style={td}>
                  <span className="rounded font-bold whitespace-nowrap" style={{ fontSize: 10.5, padding: '2px 7px', color: a.sev.color, background: `color-mix(in srgb, ${a.sev.color} 16%, transparent)` }}>{a.sev.label}</span>
                </td>
                <td style={{ ...td, color: 'var(--c-text)' }}>{a.msg}</td>
                <td style={{ ...td, color: MUTED }} className="tabular-nums">{a.srv}</td>
                <td style={{ ...td, color: MUTED, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{a.time}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── ⑧ 서버별 활용률 순위 ─────────────────────────

const RANK = [...servers]
  .map((s) => ({ name: s.name, v: serverAvgUtil(s) }))
  .sort((a, b) => b.v - a.v)
  .slice(0, 6)
function rankColor(v: number): string {
  if (v >= 90) return DANGER
  if (v >= 80) return '#e07b39'
  if (v >= 70) return WARN
  return OK
}

function RankTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const idx = RANK.findIndex((r) => r.name === payload?.value)
  return (
    <text x={(x ?? 0) - 12} y={y ?? 0} dy={4} textAnchor="end" style={{ fontSize: 12.5 }}>
      <tspan style={{ fontWeight: 800, fill: MUTED }}>{idx + 1}</tspan>
      <tspan dx={9} style={{ fontWeight: 600, fill: 'var(--c-text)' }}>{payload?.value}</tspan>
    </text>
  )
}

function RankLabel({ x, y, width, height, value }: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  return (
    <text x={(x ?? 0) + (width ?? 0) + 6} y={(y ?? 0) + (height ?? 0) / 2} dy={4} style={{ fontSize: 12, fontWeight: 700, fill: 'var(--c-text)' }}>{value}%</text>
  )
}

function UtilRanking() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={RANK} layout="vertical" margin={{ top: 6, right: 40, bottom: 0, left: 6 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke="var(--c-border)" />
        <XAxis type="number" domain={[0, 100]} ticks={PCT_TICKS} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={<RankTick />} tickLine={false} axisLine={false} width={84} />
        <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={15} isAnimationActive={false} label={<RankLabel />}>
          {RANK.map((r) => (
            <Cell key={r.name} fill={rankColor(r.v)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ───────────────────────── ⑨ 유휴 자원 현황 ─────────────────────────

function IdleResource() {
  // 유휴 비율도 조회범위 폴링 — 범위 내 최신값.
  const { data } = useTelemetryBand('cluster', 'all', ['idle'], { idle: IDLE_PCT })
  const idle = data.length ? Math.round(Number(data[data.length - 1].idle) * 10) / 10 : IDLE_PCT
  const idlePie = [
    { name: '유휴', value: idle },
    { name: '사용', value: Math.max(0, 100 - idle) },
  ]
  return (
    <div className="h-full min-h-0 flex flex-col items-center justify-center" style={{ gap: 10 }}>
      <div className="relative" style={{ width: 132, height: 132 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={idlePie} dataKey="value" cx="50%" cy="50%" innerRadius={46} outerRadius={62} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              <Cell fill={ACCENT} />
              <Cell fill="var(--c-track)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-bold tabular-nums" style={{ fontSize: 24, lineHeight: 1 }}>{idle}%</span>
          <span className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>유휴 자원 비율</span>
        </div>
      </div>
      <div className="flex items-center justify-between w-full rounded-lg" style={{ padding: '9px 12px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}>
        <span className="text-muted" style={{ fontSize: 13 }}>유휴 GPU</span>
        <span className="font-bold tabular-nums" style={{ fontSize: 15 }}>{IDLE_GPU} <span className="text-muted" style={{ fontSize: 12 }}>/ {TOTAL_GPU}</span></span>
      </div>
    </div>
  )
}

// ───────────────────────── 루트 ─────────────────────────

function MonitoringContent() {
  return (
    <div className="flex flex-col h-full min-w-0 no-select" style={{ gap: 12, overflow: 'hidden' }}>
      <MonitoringHeader />

      {/* ② KPI 5장 */}
      <KpiRow />

      {/* 본문 — 3행, 각 행 flex-1 균등 */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 12 }}>
        {/* Row 1 — 클러스터 추이 | 전력/온도 */}
        <div className="grid flex-1 min-h-0" style={{ gap: 12, gridTemplateColumns: '47fr 53fr' }}>
          <Card
            fill
            title="클러스터 GPU 사용 추이"
            action={
              <div className="flex items-center gap-3">
                <LegendDot color={CYAN} label="사용 GPU 수" />
                <LegendDot color={SKY} label="총 GPU 수" />
                <LegendDot color={VIOLET} label="평균 사용률(%)" />
                <PanelChip />
              </div>
            }
          >
            <ClusterTrend />
          </Card>
          <Card
            fill
            title="전력 / 온도 추이"
            action={
              <div className="flex items-center gap-3">
                <LegendDot color={POWER_BLUE} label="평균 전력 (W)" />
                <LegendDot color={TEMP_RED} label="평균 온도 (°C)" />
                <PanelChip />
              </div>
            }
          >
            <PowerTempTrend />
          </Card>
        </div>

        {/* Row 2 — GPU 히트맵 | 네트워크 */}
        <div className="grid flex-1 min-h-0" style={{ gap: 12, gridTemplateColumns: '47fr 53fr' }}>
          <Card fill title="서버별 GPU 히트맵" action={<PanelChip />}>
            <GpuHeatmap />
          </Card>
          <Card
            fill
            title="네트워크 Throughput"
            action={
              <div className="flex items-center gap-3">
                <LegendDot color={CYAN} label="In (Gbps)" />
                <LegendDot color={NET_OUT} label="Out (Gbps)" />
                <PanelChip />
              </div>
            }
          >
            <NetworkThroughput />
          </Card>
        </div>

        {/* Row 3 — 실시간 알림 | 활용률 순위 | 유휴 자원 */}
        <div className="grid flex-1 min-h-0" style={{ gap: 12, gridTemplateColumns: '678fr 429fr 321fr' }}>
          <Card fill flush title="실시간 알림" action={<span className="text-muted" style={{ fontSize: 12 }}>전체 보기</span>}>
            <AlarmTable />
          </Card>
          <Card fill title="서버별 활용률 순위 (평균)" action={<PanelChip />}>
            <UtilRanking />
          </Card>
          <Card fill title="유휴 자원 현황" action={<PanelChip />}>
            <IdleResource />
          </Card>
        </div>
      </div>
    </div>
  )
}

export function AdminMonitoring() {
  // 조회범위 Context로 모니터링 화면 전 위젯에 {range,unit} 전파(전부 조회범위 기준).
  return (
    <RangeProvider initial="10m">
      <MonitoringContent />
    </RangeProvider>
  )
}

// 폴링 간격 상수는 외부에서도 참조 가능하도록 노출(검증·디버그용).
export { INTERVAL_BY_RANGE as MONITORING_INTERVALS }

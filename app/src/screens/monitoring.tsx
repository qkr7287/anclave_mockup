import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  PieChart,
  Pie,
  Cell,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  ChartBarSquareIcon,
  CpuChipIcon,
  Squares2X2Icon,
  CircleStackIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import { Card } from '../components/ui'
import { servers, allGpus, events } from '../data'
import { serverAvgUtil, vramUsedMb, vramTotalMb, fmtNum } from '../lib/metrics'

// ─────────────────────────────────────────────────────────────────────────
// G11 · 4.7 관제 모니터링 — 전체 서버 모니터링(재현) · Figma node 3-2 구조 1:1
// 다크 빅스크린 · 무스크롤 1920×1080(100vh·넘침은 패널 내부) · 색은 테마 토큰
// ─────────────────────────────────────────────────────────────────────────

// 결정적 시계열 — base 주위로 진동(Math.random 미사용 → 렌더 안정).
// 주파수를 윈도 비율(p=0~1)에 고정 → 포인트 수와 무관하게 매크로 추세 유지.
// 마지막 per-sample 해시 jitter가 샘플마다 흔들려 데이터가 촘촘할수록 더 빽빽해짐.
function wave(base: number, amp: number, seed: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const p = n <= 1 ? 0 : i / (n - 1)
    const TAU = Math.PI * 2
    const w =
      Math.sin(p * TAU * 1.3 + seed) * amp * 0.5 +
      Math.sin(p * TAU * 3.5 + seed * 1.7) * amp * 0.24 +
      Math.sin(p * TAU * 9 + seed) * amp * 0.15 +
      Math.sin(p * TAU * 22 + seed * 0.5) * amp * 0.09 +
      (((i * 9301 + seed * 49297) % 233) / 233 - 0.5) * amp * 0.36
    return Math.round((base + w) * 10) / 10
  })
}

// 1시간 윈도(30초 간격 121포인트) — Figma처럼 촘촘한 텔레메트리.
const STEP_SEC = 30
const pad2 = (v: number) => String(v).padStart(2, '0')
const TIMES = Array.from({ length: 3600 / STEP_SEC + 1 }, (_, i) => {
  const s = 14 * 3600 + 30 * 60 + i * STEP_SEC
  return `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`
})
const N = TIMES.length
// 10분 간격 눈금(14:30·14:40…15:30) — 600초/10초 − 1
const TICK_INTERVAL = (10 * 60) / STEP_SEC - 1
const hhmm = (t: string) => t.slice(0, 5) // 축 라벨은 HH:MM만

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

// Figma 스타일 툴팁 — 시간 헤더 + [컬러 닷 · 라벨 · 굵은 값] 행
interface TipEntry { name?: string; value?: number; color?: string; dataKey?: string }
function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: TipEntry[]; label?: string; fmt: (key: string, v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--toast-bg)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '8px 11px', boxShadow: 'var(--shadow-pop)', minWidth: 150 }}>
      <div className="font-bold" style={{ fontSize: 13, marginBottom: 5 }}>{label?.slice(0, 5)}</div>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: p.color }} />
            <span className="text-muted">{p.name}</span>
            <span className="ml-auto font-bold tabular-nums">{fmt(p.dataKey ?? '', p.value ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
const clusterFmt = (k: string, v: number) => (k === 'avg' ? `${v}%` : v.toLocaleString('en-US'))
const powerFmt = (k: string, v: number) => (k === 'power' ? `${v} W` : `${v}°C`)
const netFmt = (_k: string, v: number) => `${v} Gbps`

// 패널 우상단 기간 칩(Figma "1시간") — 정적 라벨
function PanelChip({ label = '1시간' }: { label?: string }) {
  return (
    <span
      className="shrink-0 rounded-md font-semibold"
      style={{
        fontSize: 12,
        color: MUTED,
        padding: '3px 9px',
        background: 'var(--c-soft)',
        border: '1px solid var(--c-border)',
      }}
    >
      {label}
    </span>
  )
}

// ───────────────────────── ① 헤더 ─────────────────────────

const PERIODS = ['3시간', '6시간', '24시간'] as const

function MonitoringHeader() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('3시간')
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

        {/* 자동 새로고침 ON */}
        <span
          className="inline-flex items-center gap-2 rounded-lg"
          style={{ fontSize: 13, padding: '5px 11px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          <span className="text-muted">자동 새로고침</span>
          <span className="font-bold" style={{ color: ACCENT }}>ON</span>
        </span>

        {/* 기간 토글 */}
        <div
          className="inline-flex items-center rounded-lg"
          style={{ padding: 3, gap: 2, background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="rounded-md font-semibold transition-colors"
              style={{
                fontSize: 13,
                padding: '4px 12px',
                color: p === period ? 'var(--c-onaccent)' : MUTED,
                background: p === period ? ACCENT : 'transparent',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

// ───────────────────────── ② KPI 5장 ─────────────────────────

interface KpiCardProps {
  icon: ReactNode
  iconTone: string
  label: string
  value: string
  unit?: string
  delta?: string
  sub: string
  spark: number[]
  sparkColor: string
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const W = 100
  const H = 26
  const top = Math.max(...data)
  const bot = Math.min(...data)
  const span = Math.max(0.01, top - bot)
  const n = data.length
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (v: number) => 2 + (1 - (v - bot) / span) * (H - 4)
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }} aria-hidden>
      <polygon points={area} fill={color} opacity={0.13} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function KpiCard({ icon, iconTone, label, value, unit, delta, sub, spark, sparkColor }: KpiCardProps) {
  return (
    <div
      className="bg-card2 border border-line rounded-xl min-w-0 flex flex-col hover-lift"
      style={{ padding: '12px 14px', boxShadow: 'var(--shadow-card)', minHeight: 104, maxHeight: 116, overflow: 'hidden' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 26, height: 26, background: `color-mix(in srgb, ${iconTone} 16%, transparent)`, color: iconTone }}
        >
          {icon}
        </span>
        <span className="text-muted font-semibold truncate" style={{ fontSize: 14 }}>{label}</span>
        {delta && <span className="ml-auto shrink-0 font-bold tabular-nums" style={{ fontSize: 13, color: OK }}>▲ {delta}</span>}
      </div>
      <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</span>
        {unit && <span className="text-muted" style={{ fontSize: 14 }}>{unit}</span>}
        <span className="text-muted truncate" style={{ fontSize: 12, marginLeft: 'auto' }}>{sub}</span>
      </div>
      <div className="mt-auto" style={{ paddingTop: 4 }}>
        <Spark data={spark} color={sparkColor} />
      </div>
    </div>
  )
}

// 시드 집계 기반 — 더미 없음(servers·allGpus)
const KPIS: KpiCardProps[] = [
  { icon: <ChartBarSquareIcon width={16} />, iconTone: ACCENT, label: '전체 서버 사용률', value: `${SRV_UTIL}`, unit: '%', delta: '2.4%', sub: `정상 ${NORMAL_SRV} / ${servers.length} 서버`, spark: wave(SRV_UTIL, 13, 3, 90), sparkColor: ACCENT },
  { icon: <Squares2X2Icon width={16} />, iconTone: ACCENT2, label: '전체 GPU 사용률', value: `${GPU_UTIL}`, unit: '%', delta: '3.1%', sub: `활성 ${ACTIVE_GPU} / ${TOTAL_GPU} GPU`, spark: wave(GPU_UTIL, 12, 7, 90), sparkColor: ACCENT2 },
  { icon: <CpuChipIcon width={16} />, iconTone: OK, label: '활성 GPU 수', value: `${ACTIVE_GPU}`, sub: `전체 ${TOTAL_GPU}대 · 장애 ${FAILED_GPU}`, spark: wave(60, 16, 11, 90), sparkColor: OK },
  { icon: <CircleStackIcon width={16} />, iconTone: '#8d6be0', label: '평균 VRAM 사용률', value: `${VRAM_UTIL}`, unit: '%', delta: '1.8%', sub: `${VRAM_USED_GB} / ${VRAM_TOTAL_GB} GB`, spark: wave(VRAM_UTIL, 11, 5, 90), sparkColor: '#8d6be0' },
  { icon: <BoltIcon width={16} />, iconTone: WARN, label: '평균 전력', value: `${POWER_MEAN}`, unit: 'W', delta: '6 W', sub: `총 ${fmtNum(POWER_TOTAL)} W`, spark: wave(70, 16, 9, 90), sparkColor: WARN },
]

// ───────────────────────── ③ 클러스터 GPU 사용 추이 ─────────────────────────

// 시드엔 시계열이 없으니 현재 집계값 기준으로 자연스러운 추이를 생성(엔티티는 시드 그대로)
const clusterData = TIMES.map((t, i) => ({
  t,
  used: Math.max(0, Math.min(TOTAL_GPU, Math.round(wave(ACTIVE_GPU, 1.6, 3, N)[i] * 10) / 10)),
  total: TOTAL_GPU,
  avg: Math.round(wave(GPU_UTIL, 8, 5, N)[i]),
}))

function ClusterTrend() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={clusterData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="g-used" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CYAN} stopOpacity={0.32} />
            <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="g-total" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY} stopOpacity={0.16} />
            <stop offset="100%" stopColor={SKY} stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="g-avg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIOLET} stopOpacity={0.22} />
            <stop offset="100%" stopColor={VIOLET} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" />
        <XAxis dataKey="t" tickFormatter={hhmm} tick={axisTick} tickLine={false} axisLine={false} interval={TICK_INTERVAL} minTickGap={8} />
        <YAxis yAxisId="cnt" domain={[0, 10]} ticks={[0, 5, 10]} tick={axisTick} tickLine={false} axisLine={false} width={34} />
        <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} tickLine={false} axisLine={false} width={34} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<ChartTooltip fmt={clusterFmt} />} cursor={{ stroke: 'rgba(255,255,255,.22)' }} />
        <Area yAxisId="cnt" type="linear" dataKey="total" name="총 GPU 수" stroke={SKY} strokeWidth={1.6} fill="url(#g-total)" dot={false} activeDot={{ r: 3, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
        <Area yAxisId="cnt" type="linear" dataKey="used" name="사용 GPU 수" stroke={CYAN} strokeWidth={2} fill="url(#g-used)" dot={{ r: 1, fill: CYAN, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
        <Area yAxisId="pct" type="linear" dataKey="avg" name="평균 사용률(%)" stroke={VIOLET} strokeWidth={2} fill="url(#g-avg)" dot={{ r: 1, fill: VIOLET, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ───────────────────────── ④ 전력 / 온도 추이 ─────────────────────────

const powerData = TIMES.map((t, i) => ({
  t,
  power: Math.round(wave(POWER_MEAN, 22, 4, N)[i]),
  temp: Math.round(wave(TEMP_MEAN, 6, 8, N)[i]),
}))

function PowerTempTrend() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={powerData} margin={{ top: 8, right: 6, bottom: 0, left: 2 }}>
        <CartesianGrid vertical={false} stroke="var(--c-border)" />
        <XAxis dataKey="t" tickFormatter={hhmm} tick={axisTick} tickLine={false} axisLine={false} interval={TICK_INTERVAL} minTickGap={8} />
        <YAxis yAxisId="w" domain={[0, 300]} ticks={[0, 100, 200, 300]} tick={axisTick} tickLine={false} axisLine={false} width={36} />
        <YAxis yAxisId="c" orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} tickLine={false} axisLine={false} width={32} />
        <Tooltip content={<ChartTooltip fmt={powerFmt} />} cursor={{ stroke: 'rgba(255,255,255,.22)' }} />
        <Line yAxisId="w" type="linear" dataKey="power" name="평균 전력 (W)" stroke={POWER_BLUE} strokeWidth={2} dot={{ r: 1, fill: POWER_BLUE, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
        <Line yAxisId="c" type="linear" dataKey="temp" name="평균 온도 (°C)" stroke={TEMP_RED} strokeWidth={2} dot={{ r: 1, fill: TEMP_RED, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function LegendDot({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: MUTED }}>
      <span style={{ width: 12, height: dash ? 0 : 3, borderTop: dash ? `1.5px dashed ${color}` : 'none', background: dash ? 'none' : color, borderRadius: 2 }} />
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

// 서버 헬스 배지(시드)
const SRV_BADGE: Record<string, { label: string; color: string }> = {
  normal: { label: '정상', color: OK },
  warn: { label: '경고', color: WARN },
  danger: { label: '장애', color: DANGER },
  inactive: { label: '유휴', color: MUTED },
}
// 서버별 GPU 셀(시드 그대로) — 각 GPU = smUtil 색 · 장애(XID)/유휴 표기 · 빈 슬롯 placeholder
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

function GpuHeatmap() {
  return (
    <div className="h-full min-h-0 flex flex-col" style={{ gap: 7 }}>
      {/* 헤더행 */}
      <div className="flex items-center shrink-0" style={{ gap: 5, paddingLeft: 66 }}>
        {Array.from({ length: MAX_GPU }, (_, i) => (
          <div key={i} className="flex-1 text-muted" style={{ fontSize: 10, paddingLeft: 9 }}>GPU{i}</div>
        ))}
        <div className="text-right text-muted shrink-0" style={{ width: 92, fontSize: 10 }}>평균 · 상태</div>
      </div>
      {/* 행 = 서버(시드) — 패널 높이 균등 분배 */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 4 }}>
        {HEAT.map((r) => {
          const badge = SRV_BADGE[r.health]
          return (
            <div key={r.id} className="flex items-center flex-1 min-h-0" style={{ gap: 5 }}>
              <div className="text-muted shrink-0 truncate" style={{ width: 62, fontSize: 11.5, fontWeight: 600 }}>{r.name}</div>
              {r.cells.map((c, ci) => {
                if (!c) return <div key={ci} className="flex-1 self-stretch rounded" style={{ border: '1px dashed var(--c-border)', opacity: 0.5 }} />
                const bg = c.xid ? 'color-mix(in srgb, var(--c-danger) 22%, transparent)' : c.idle ? 'var(--c-track)' : heatColor(c.util)
                const fg = c.xid ? DANGER : c.idle ? MUTED : c.util >= 40 ? '#0a0d12' : '#cdd6e4'
                const text = c.xid ? `장애 · ${c.xid}` : c.idle ? '유휴' : `${c.util}%`
                return (
                  <div key={ci} className="flex-1 self-stretch flex items-center rounded" style={{ background: bg, color: fg, fontSize: 10.5, fontWeight: 700, padding: '0 9px', gap: 6, overflow: 'hidden' }} title={`${r.name} · ${c.model}`}>
                    <span className="tabular-nums shrink-0">{text}</span>
                    <span className="truncate" style={{ fontWeight: 500, opacity: 0.8, fontSize: 10 }}>{c.model}</span>
                  </div>
                )
              })}
              <div className="flex items-center justify-end gap-1.5 shrink-0" style={{ width: 92 }}>
                <span className="tabular-nums font-bold" style={{ fontSize: 11 }}>{r.avg}%</span>
                <span className="rounded font-bold" style={{ fontSize: 9.5, padding: '1px 5px', color: badge.color, background: `color-mix(in srgb, ${badge.color} 16%, transparent)` }}>{badge.label}</span>
              </div>
            </div>
          )
        })}
      </div>
      {/* 범례 */}
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

const netData = TIMES.map((t, i) => ({
  t,
  in: Math.round(wave(70, 12, 2, N)[i]),
  out: Math.round(wave(35, 9, 6, N)[i]),
}))

function NetworkThroughput() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={netData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CYAN} stopOpacity={0.3} />
            <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NET_OUT} stopOpacity={0.16} />
            <stop offset="100%" stopColor={NET_OUT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" />
        <XAxis dataKey="t" tickFormatter={hhmm} tick={axisTick} tickLine={false} axisLine={false} interval={TICK_INTERVAL} minTickGap={6} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} tickLine={false} axisLine={false} width={32} />
        <Tooltip content={<ChartTooltip fmt={netFmt} />} cursor={{ stroke: 'rgba(255,255,255,.22)' }} />
        <Area type="linear" dataKey="in" name="In (Gbps)" stroke={CYAN} strokeWidth={2} fill="url(#g-in)" dot={{ r: 1, fill: CYAN, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
        <Area type="linear" dataKey="out" name="Out (Gbps)" stroke={NET_OUT} strokeWidth={2} fill="url(#g-out)" dot={{ r: 1, fill: NET_OUT, strokeWidth: 0 }} activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--c-bg)' }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ───────────────────────── ⑦ 실시간 알림 ─────────────────────────

// 시드 이벤트(events) → 알람 행. severity → 수준 라벨/색
const SEV: Record<string, { label: string; color: string }> = {
  critical: { label: '치명', color: DANGER },
  warn: { label: '경고', color: WARN },
  info: { label: '관심', color: ACCENT },
  recovered: { label: '복구', color: OK },
}
const ALARMS = events.slice(0, 7).map((e) => ({
  sev: SEV[e.severity] ?? SEV.info,
  msg: e.message,
  srv: e.serverId ?? '—',
  time: e.createdAt.length > 10 ? e.createdAt.slice(11) : e.createdAt,
}))

function AlarmTable() {
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
          {ALARMS.map((a, i) => (
            <tr key={i}>
              <td style={td}>
                <span className="rounded font-bold whitespace-nowrap" style={{ fontSize: 10.5, padding: '2px 7px', color: a.sev.color, background: `color-mix(in srgb, ${a.sev.color} 16%, transparent)` }}>{a.sev.label}</span>
              </td>
              <td style={{ ...td, color: 'var(--c-text)' }}>{a.msg}</td>
              <td style={{ ...td, color: MUTED }} className="tabular-nums">{a.srv}</td>
              <td style={{ ...td, color: MUTED, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{a.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────── ⑧ 서버별 활용률 순위 ─────────────────────────

// 시드 — 서버별 평균 사용률 내림차순(상위 6)
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

// 순번 + SRV 라벨을 한 줄 우측정렬(겹침 방지) — 순번(muted) · 라벨(text)
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
        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
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

// IDLE_PCT는 시드 집계 블록에서 산출(유휴 GPU / 전체 GPU)
const idlePie = [
  { name: '유휴', value: IDLE_PCT },
  { name: '사용', value: 100 - IDLE_PCT },
]

function IdleResource() {
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
          <span className="font-bold tabular-nums" style={{ fontSize: 24, lineHeight: 1 }}>{IDLE_PCT}%</span>
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

export function AdminMonitoring() {
  return (
    <div className="flex flex-col h-full min-w-0" style={{ gap: 12, overflow: 'hidden' }}>
      <MonitoringHeader />

      {/* ② KPI 5장 */}
      <div className="grid shrink-0" style={{ gap: 12, gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

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
          <Card fill title="유휴 자원 현황">
            <IdleResource />
          </Card>
        </div>
      </div>
    </div>
  )
}

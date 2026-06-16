import { useState, useEffect, useMemo } from 'react'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  FunnelIcon,
  ServerStackIcon,
  ServerIcon,
  CpuChipIcon,
  CubeIcon,
  ClockIcon,
  CommandLineIcon,
  CodeBracketIcon,
  InformationCircleIcon,
  ChevronRightIcon,
  RocketLaunchIcon,
  XMarkIcon,
  CheckIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { EmptyState, Button, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { useTheme } from '../lib/theme'
import { useGpuRequests, useAllocations, useTelemetrySeries, useEvents, useServiceTokens, type GpuRequestRow, type AllocationRow, type SeriesPoint } from '../data/hooks/usePolling'

// 다크 테마에서 공유 --c-muted(#525872)가 카드 대비 ~2.7:1로 너무 어두움 → 페이지 루트에서만 더 밝게 오버라이드.
// (index.css는 공유 파일이라 수정 불가 → 스코프 오버라이드로 text-muted 일괄 개선. 라이트는 기본값 유지.)
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

// G2 · 대시보드 — 4.5 내 할당 자원 · 4.6 자원 신청현황. (4.2~4.4=resourcemap · 4.7=monitoring)

type IconType = ComponentType<SVGProps<SVGSVGElement>>

// ════════════════════════════════════════════════════════════════════
// 4.5 내 할당 자원 — Figma node 35:2 "내 할당 자원 (구현)" 매칭
//  · 구조색/텍스트색 = 테마 토큰(다크/라이트 양립) · 지표값·차트·배지색 = Figma 정확 hex
//  · 본문 텍스트 ≥14px(floor) · 차트 축 라벨만 예외(작게)
//  · C(호스팅 전) = 빈 상태 → 신청하러 가기
// ════════════════════════════════════════════════════════════════════

// ── 스파크라인(area + 꺾은선 + 호버 데이터 툴팁) ──
function Sparkline({ data, color, id, suffix = '' }: { data: number[]; color: string; id: string; suffix?: string }) {
  const [hi, setHi] = useState(-1)
  const W = 156
  const H = 52
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1, max - min)
  const n = data.length
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (v: number) => 3 + (1 - (v - min) / span) * (H - 8)
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const idx = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))))
    setHi(idx)
  }
  return (
    <div className="relative h-full w-full" style={{ cursor: 'crosshair' }} onMouseMove={move} onMouseLeave={() => setHi(-1)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {hi >= 0 && (
        <>
          <div className="absolute pointer-events-none" style={{ left: `${(x(hi) / W) * 100}%`, top: 0, bottom: 0, width: 1, background: color, opacity: 0.35 }} />
          <div className="absolute pointer-events-none rounded-full" style={{ left: `${(x(hi) / W) * 100}%`, top: `${(y(data[hi]) / H) * 100}%`, width: 7, height: 7, background: color, border: '1.5px solid var(--c-card2)', transform: 'translate(-50%, -50%)' }} />
          <div className="absolute pointer-events-none font-semibold rounded-md whitespace-nowrap" style={{ right: 0, top: 0, fontSize: 14, lineHeight: 1.3, padding: '1px 6px', background: 'var(--toast-bg)', color: 'var(--c-text)', border: '1px solid var(--c-line)', boxShadow: 'var(--shadow-card)' }}>
            {data[hi]}{suffix}
          </div>
        </>
      )}
    </div>
  )
}

type MetricTone = 'blue' | 'cyan' | 'purple' | 'orange' | 'green'
// 지표 색 — 테마별로 라이트(흰 배경 대비 충분히 진하게)/다크(어두운 배경 대비 충분히 밝게) 분리.
const METRIC_PALETTE: Record<MetricTone, { light: string; dark: string }> = {
  blue: { light: '#2563eb', dark: '#4d9bff' },
  cyan: { light: '#0e8aa3', dark: '#22d3ee' },
  purple: { light: '#7c3aed', dark: '#a78bfa' },
  orange: { light: '#ea580c', dark: '#fb923c' },
  green: { light: '#15803d', dark: '#34d399' },
}

interface MetricDef {
  key: string
  label: string
  value: string
  sub?: string
  tone: MetricTone
  spark: number[]
  suffix: string // 호버 툴팁 단위
}

// telemetry 시계열 → 6 KPI(MetricDef). value=최신값, spark=시계열. 4.5 DB 연동.
function buildMetrics(gpuTel: SeriesPoint[] | null, srvTel: SeriesPoint[] | null): MetricDef[] {
  const last = (a: SeriesPoint[] | null) => (a && a.length ? a[a.length - 1] : null)
  const gL = last(gpuTel), sL = last(srvTel)
  const num = (v: unknown) => Math.round(Number(v ?? 0))
  const spark = (a: SeriesPoint[] | null, k: string) => (a ?? []).map((p) => Number(p[k] ?? 0))
  return [
    { key: 'gpu', label: 'GPU 사용률', value: `${num(gL?.sm)}%`, tone: 'blue', suffix: '%', spark: spark(gpuTel, 'sm') },
    { key: 'vram', label: 'VRAM 사용률', value: `${num(gL?.vram)}`, sub: '%', tone: 'blue', suffix: '%', spark: spark(gpuTel, 'vram') },
    { key: 'cpu', label: 'CPU 사용률', value: `${num(sL?.cpu_util)}%`, tone: 'cyan', suffix: '%', spark: spark(srvTel, 'cpu_util') },
    { key: 'mem', label: '메모리 사용률', value: `${num(sL?.mem_util)}`, sub: '%', tone: 'purple', suffix: '%', spark: spark(srvTel, 'mem_util') },
    { key: 'temp', label: '온도', value: `${num(gL?.temp)}`, sub: '°C', tone: 'orange', suffix: '°C', spark: spark(gpuTel, 'temp') },
    { key: 'power', label: '전력 사용량', value: `${num(gL?.power)}`, sub: 'W', tone: 'green', suffix: ' W', spark: spark(gpuTel, 'power') },
  ]
}

function MetricCard({ m }: { m: MetricDef }) {
  const { theme } = useTheme()
  const color = METRIC_PALETTE[m.tone][theme === 'dark' ? 'dark' : 'light']
  const axis = { fontSize: 9.5, color: 'var(--c-muted)', opacity: 0.7 } as const
  return (
    <div className="relative bg-card2 border border-line rounded-[12px] overflow-hidden hover-lift flex flex-col h-full" style={{ minHeight: 152, boxShadow: 'var(--shadow-card)' }}>
      <div className="shrink-0" style={{ padding: '15px 17px 0' }}>
        <div className="text-muted font-medium truncate" style={{ fontSize: 14 }}>{m.label}</div>
        <div className="flex items-baseline gap-1.5" style={{ marginTop: 6 }}>
          <span className="font-bold" style={{ fontSize: 22, lineHeight: 1, color }}>{m.value}</span>
          {m.sub && <span className="text-muted" style={{ fontSize: 14 }}>{m.sub}</span>}
        </div>
      </div>
      {/* 차트 영역 — 카드 높이에 맞춰 채움 */}
      <div className="relative flex-1 min-h-0" style={{ margin: '8px 12px 12px 16px' }}>
        {/* y축 라벨 */}
        <span className="absolute" style={{ left: 0, top: 0, ...axis }}>100%</span>
        <span className="absolute" style={{ left: 0, top: '50%', transform: 'translateY(-50%)', ...axis }}>50%</span>
        <span className="absolute" style={{ left: 0, bottom: 14, ...axis }}>0%</span>
        {/* 스파크라인 — 축 라벨 우측으로 가득 */}
        <div className="absolute" style={{ left: 28, right: 0, top: 0, bottom: 14 }}>
          <Sparkline data={m.spark} color={color} id={`spark-${m.key}`} suffix={m.suffix} />
        </div>
        {/* x축 라벨 */}
        <span className="absolute" style={{ left: 28, bottom: 0, ...axis }}>06:04</span>
        <span className="absolute" style={{ right: 0, bottom: 0, ...axis }}>지금</span>
      </div>
    </div>
  )
}

// ── info-box 미니 항목(서버/GPU/모델/상태) ──
function InfoItem({ Icon, label, value, valueColor }: { Icon: IconType; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center min-w-0" style={{ gap: 10 }}>
      <Icon style={{ width: 24, height: 24, color: 'var(--c-muted)', flexShrink: 0 }} />
      <div className="min-w-0">
        <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>{label}</div>
        <div className="font-bold truncate" style={{ fontSize: 14, lineHeight: 1.3, color: valueColor ?? 'var(--c-text)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}

// ── 할당 요약(hero) 카드 — DB allocations 연동 ──
function HeroCard({ allocs }: { allocs: AllocationRow[] }) {
  const gpuAlloc = allocs.find((a) => a.gpuId) ?? allocs[0]
  const count = allocs.length
  const first = allocs[0]
  const svcName = count > 1 ? `${first?.serviceName} 외 ${count - 1}개 서비스` : (first?.serviceName ?? '할당 서비스')
  const server = gpuAlloc?.serverHost ?? '—'
  const gpuLabel = gpuAlloc?.gpuModel ? `${gpuAlloc.gpuModel}${gpuAlloc.allocMode === 'mig' ? ' · MIG' : ''}` : 'MIG 슬라이스'
  const model = first?.modelId ?? '—'
  return (
    <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: 24, minHeight: 140 }}>
      <div className="flex items-stretch gap-6 min-w-0 h-full">
        {/* 좌: 서비스 환경 요약 */}
        <div className="flex flex-col justify-between min-w-0" style={{ flex: '1 1 0' }}>
          <div className="flex items-start gap-4">
            <span className="flex items-center justify-center shrink-0 rounded-[12px]" style={{ width: 48, height: 48, background: 'var(--c-accent)' }}>
              <ServerStackIcon style={{ width: 24, height: 24, color: 'var(--c-onaccent)' }} />
            </span>
            <div className="min-w-0">
              <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>서비스 환경</div>
              <div className="font-bold text-text truncate" style={{ fontSize: 17, lineHeight: 1.3, marginTop: 2 }}>{svcName}</div>
            </div>
          </div>
          <div className="flex items-end justify-between" style={{ marginTop: 18, paddingRight: 32 }}>
            <HeroField label="서비스 ID" value={first?.serviceId ?? '—'} />
            <HeroField label="운영 서비스" value={`${count}개`} />
            <HeroField label="서버 / GPU" value={`${server} / ${gpuLabel}`} />
            <div className="flex flex-col" style={{ gap: 6 }}>
              <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>할당 상태</span>
              <span className="inline-flex items-center rounded-[6px] font-semibold" style={{ background: 'var(--ok-soft)', color: 'var(--c-ok)', padding: '3px 10px', fontSize: 14, alignSelf: 'flex-start' }}>정상</span>
            </div>
          </div>
        </div>
        {/* 우: info-box */}
        <div className="bg-card2 border border-line rounded-[12px] flex items-center min-w-0" style={{ flex: '0 0 47%', padding: '0 24px' }}>
          <div className="grid items-center w-full" style={{ gridTemplateColumns: '1fr 1px 1fr 1px 1.3fr 1px 0.8fr', columnGap: 18 }}>
            <InfoItem Icon={ServerIcon} label="서버" value={server} valueColor="var(--c-accent)" />
            <Divider />
            <InfoItem Icon={CpuChipIcon} label="GPU" value={gpuLabel} />
            <Divider />
            <InfoItem Icon={CubeIcon} label="모델" value={model} />
            <Divider />
            <InfoItem Icon={CheckCircleIcon} label="상태" value="정상" valueColor="var(--c-ok)" />
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col min-w-0" style={{ gap: 6 }}>
      <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>{label}</span>
      <span className="font-medium text-text truncate" style={{ fontSize: 14, lineHeight: 1.2 }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 44, background: 'var(--c-border)' }} />
}

// ── 모델별 토큰 그룹 바차트 ──
const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}M` : `${v}K`)

function GroupedBars({ data, max, yLabels, series }: { data: number[][]; max: number; yLabels: string[]; series: { name: string; color: string }[] }) {
  const [hv, setHv] = useState<{ gi: number; mi: number } | null>(null)
  return (
    <div className="relative h-full w-full min-w-0" style={{ paddingLeft: 36 }}>
      {/* y축 라벨 + 그리드 */}
      {yLabels.map((t, i) => (
        <div key={i} className="absolute flex items-center" style={{ left: 0, right: 0, top: `${(i / 3) * 100}%`, transform: 'translateY(-50%)' }}>
          <span style={{ fontSize: 9.5, color: 'var(--c-muted)', opacity: 0.7, width: 30, textAlign: 'right', flexShrink: 0 }}>{t}</span>
          <span style={{ flex: 1, height: 1, background: 'var(--c-border-s)', marginLeft: 6 }} />
        </div>
      ))}
      {/* 바 그룹 */}
      <div className="flex items-end justify-between h-full" style={{ paddingBottom: 1 }}>
        {data.map((group, gi) => (
          <div key={gi} className="relative flex items-end h-full" style={{ gap: 2 }}>
            {group.map((v, mi) => {
              const dim = hv != null && !(hv.gi === gi && hv.mi === mi)
              return (
                <div
                  key={mi}
                  onMouseEnter={() => setHv({ gi, mi })}
                  onMouseLeave={() => setHv(null)}
                  style={{ width: 6, height: `${(v / max) * 100}%`, background: series[mi].color, borderRadius: '2px 2px 0 0', opacity: dim ? 0.45 : 1, transition: 'height .35s cubic-bezier(0.2,0.7,0.2,1), opacity .12s', cursor: 'pointer' }}
                />
              )
            })}
            {hv != null && hv.gi === gi && (
              <div
                className="absolute pointer-events-none rounded-md whitespace-nowrap font-semibold flex items-center gap-1.5"
                style={{ left: '50%', bottom: '100%', transform: 'translate(-50%, -6px)', fontSize: 14, lineHeight: 1.3, padding: '3px 9px', background: 'var(--toast-bg)', color: 'var(--c-text)', border: '1px solid var(--c-line)', boxShadow: 'var(--shadow-pop)', zIndex: 5 }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: series[hv.mi].color, flexShrink: 0 }} />
                {series[hv.mi].name} · {fmtK(data[hv.gi][hv.mi])}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 라벨-좌 / 값-우 정렬 행 (지연·횟수 지표)
function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-muted truncate" style={{ fontSize: 14 }}>{label}</span>
      <span className="whitespace-nowrap shrink-0" style={{ fontSize: 14 }}>
        <span className="font-bold text-text">{value}</span>
        {unit && <span className="text-muted" style={{ marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  )
}


const BAR_COLORS = ['#2d7ff9', '#22b8cf', '#8b5cf6', '#f97316']
function BarCard() {
  const { user } = useRole()
  const { data } = useServiceTokens(user.id)
  const services = data?.services ?? []
  const series = services.map((s, i) => ({ name: s.name, color: BAR_COLORS[i % BAR_COLORS.length] }))
  const bars = data?.bars ?? []
  const max = data?.max ?? 1
  const yLabels = [`${max}`, `${Math.round((max * 2) / 3)}`, `${Math.round(max / 3)}`, '0']
  return (
    <section className="bg-card2 border border-line rounded-[14px] flex flex-col min-w-0" style={{ boxShadow: 'var(--shadow-card)', padding: 18 }}>
      <header className="flex items-center gap-3 shrink-0">
        <h3 className="font-bold text-text" style={{ fontSize: 15 }}>서비스 토큰 사용량</h3>
        <span className="inline-flex items-center rounded-[6px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', padding: '3px 8px', fontSize: 14 }}>총 {services.length}개 서비스</span>
        <span className="ml-auto text-muted" style={{ fontSize: 14 }}>최근 24시간</span>
      </header>
      <div className="flex gap-5 flex-1 min-h-0" style={{ marginTop: 14 }}>
        {/* 차트 영역 */}
        <div className="flex flex-col min-w-0" style={{ flex: '1 1 0' }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0" style={{ marginBottom: 10 }}>
            {series.map((m) => (
              <span key={m.name} className="inline-flex items-center gap-1.5" style={{ fontSize: 14 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: m.color }} />
                <span className="text-text font-medium">{m.name}</span>
              </span>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            <GroupedBars data={bars} max={max} yLabels={yLabels} series={series} />
          </div>
        </div>
        {/* 우측 통계 — 총량·최다모델 강조 + 지연 지표 행, 세로 중앙 정렬 */}
        <div className="flex flex-col justify-center shrink-0" style={{ width: 196 }}>
          {/* 총 토큰 사용량 (강조) */}
          <div className="min-w-0">
            <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>총 토큰 사용량 · 최근 24h</div>
            <div className="flex items-baseline gap-1.5 whitespace-nowrap" style={{ marginTop: 4 }}>
              <span className="font-bold text-text" style={{ fontSize: 21, lineHeight: 1.1, letterSpacing: '-0.3px' }}>{(data?.total ?? 0).toLocaleString()}</span>
              <span className="text-muted" style={{ fontSize: 14 }}>Tokens/h</span>
            </div>
          </div>
          {/* 주력 서비스 */}
          <div className="min-w-0" style={{ marginTop: 16 }}>
            <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>주력 서비스</div>
            <div className="font-bold text-text truncate" style={{ fontSize: 15, lineHeight: 1.2, marginTop: 4 }}>{services[0]?.name ?? '-'}</div>
            <div className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>{services.length}개 운영 중</div>
          </div>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '16px 0' }} />
          {/* 요청·서비스 지표 */}
          <div className="flex flex-col" style={{ gap: 11 }}>
            <StatRow label="총 요청 횟수" value={String(data?.calls ?? 0)} unit="회/h" />
            <StatRow label="운영 서비스" value={String(services.length)} unit="개" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 이벤트 로그 ──
type EvLevel = '정보' | '경고'
const EV_BADGE: Record<EvLevel, { bg: string; fg: string }> = {
  정보: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  경고: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
}
function EventLogCard() {
  const toast = useToast()
  const { data } = useEvents({ limit: 8 })
  const events: { time: string; level: EvLevel; msg: string }[] = (data ?? []).map((e) => ({
    time: fmtReqDate(e.createdAt),
    level: e.severity === 'warn' || e.severity === 'critical' ? '경고' : '정보',
    msg: e.message,
  }))
  return (
    <section className="bg-card2 border border-line rounded-[14px] flex flex-col min-w-0" style={{ boxShadow: 'var(--shadow-card)', padding: '18px 20px' }}>
      <header className="flex items-center justify-between gap-3 shrink-0">
        <h3 className="font-bold text-text" style={{ fontSize: 15 }}>이벤트 로그</h3>
        <button type="button" onClick={() => toast.push('이벤트 로그 전체 보기 (목업)', 'neutral')} className="font-medium hover:underline" style={{ fontSize: 14, color: 'var(--c-accent)' }}>전체 보기</button>
      </header>
      <div className="flex items-center text-muted font-medium shrink-0" style={{ fontSize: 14, marginTop: 14, paddingBottom: 9, borderBottom: '1px solid var(--c-border)' }}>
        <span style={{ width: 150 }}>시간</span>
        <span style={{ width: 64 }}>상태</span>
        <span className="flex-1">이벤트</span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {events.map((e, i) => (
          <div key={i} className="flex items-center flex-1" style={{ minHeight: 32, borderBottom: i < events.length - 1 ? '1px solid var(--c-border-s)' : 'none' }}>
            <span className="shrink-0 text-muted" style={{ width: 150, fontSize: 14 }}>{e.time}</span>
            <span className="shrink-0" style={{ width: 64 }}>
              <span className="inline-flex items-center rounded-[5px] font-semibold" style={{ background: EV_BADGE[e.level].bg, color: EV_BADGE[e.level].fg, padding: '2px 8px', fontSize: 14 }}>{e.level}</span>
            </span>
            <span className="flex-1 min-w-0 truncate text-text" style={{ fontSize: 14, opacity: 0.86, paddingRight: 8 }}>{e.msg}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── 플로팅 "작업 런칭" 패널(오버레이 + ··· 토글) ──
const LAUNCH_ITEMS: { Icon: IconType; label: string; sub: string; tone: string }[] = [
  { Icon: CommandLineIcon, label: '콘솔 접속', sub: '웹 터미널 열기', tone: '#3b82f6' },
  { Icon: CodeBracketIcon, label: '코드 접속', sub: 'VS Code 서버', tone: '#8b5cf6' },
  { Icon: ServerStackIcon, label: 'SSH 접속', sub: 'SSH 자격 증명 발급', tone: '#12b39c' },
  { Icon: InformationCircleIcon, label: '상세 정보 보기', sub: '할당 리소스 상세', tone: '#e0922e' },
]

function FloatingControl() {
  const [open, setOpen] = useState(false) // 기본 = 접힘
  const toast = useToast()
  const launch = (label: string) => {
    toast.push(`${label} 세션을 시작했어요 (목업)`, 'info')
    setOpen(false)
  }
  // 접힘: 우하단 그라데이션 FAB(글로우 + hover 모션)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
        style={{ position: 'absolute', right: 24, bottom: 24, width: 58, height: 58, background: 'linear-gradient(135deg,#0568fc,#4f9bff)', color: '#fff', boxShadow: '0 10px 28px rgba(5,104,252,0.45), inset 0 1px 0 rgba(255,255,255,0.28)', zIndex: 30 }}
        aria-label="작업 런칭 열기"
      >
        <RocketLaunchIcon className="transition-transform duration-200 group-hover:-rotate-12 group-hover:-translate-y-0.5" style={{ width: 24, height: 24 }} />
        <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 9, height: 9, background: '#3bd27a', border: '2px solid #1158d8' }} />
      </button>
    )
  }
  // 펼침: 우하단 다크 런처 패널(헤더 + 라이브 상태 + 아이콘 타일 항목)
  return (
    <div
      className="rounded-[20px] overflow-hidden anim-fade"
      style={{ position: 'absolute', right: 24, bottom: 24, width: 270, background: '#0b1326', boxShadow: 'var(--shadow-pop)', border: '1px solid rgba(255,255,255,0.07)', zIndex: 30 }}
    >
      {/* 헤더 */}
      <div style={{ background: 'linear-gradient(135deg,#10204a,#0b1326)', padding: '15px 15px 13px' }}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center rounded-[11px] shrink-0" style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#0568fc,#4f9bff)', color: '#fff', boxShadow: '0 4px 12px rgba(5,104,252,0.4)' }}>
            <RocketLaunchIcon style={{ width: 19, height: 19 }} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold" style={{ fontSize: 14, color: '#eaf0fa', lineHeight: 1.2 }}>작업 런칭</div>
            <div style={{ fontSize: 11.5, color: '#8b97b4', marginTop: 1 }}>환경에 빠르게 접속</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:scale-90" style={{ width: 26, height: 26, color: '#8b97b4' }} aria-label="접기">
            <XMarkIcon style={{ width: 17, height: 17 }} />
          </button>
        </div>
        {/* 라이브 상태 */}
        <div className="flex items-center gap-2 rounded-[9px]" style={{ marginTop: 12, padding: '7px 10px', background: 'rgba(255,255,255,0.05)' }}>
          <span className="relative flex" style={{ width: 7, height: 7 }}>
            <span className="absolute inline-flex rounded-full opacity-60 animate-ping" style={{ width: 7, height: 7, background: '#3bd27a' }} />
            <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: '#3bd27a' }} />
          </span>
          <span style={{ fontSize: 11.5, color: '#c3cbdd' }}>SRV-10 · A100 1GPU · <span style={{ color: '#3bd27a', fontWeight: 600 }}>정상 가동</span></span>
        </div>
      </div>
      {/* 항목 */}
      <div className="flex flex-col stagger" style={{ padding: '8px 9px 11px', gap: 2 }}>
        {LAUNCH_ITEMS.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={() => launch(it.label)}
            className="group flex items-center gap-3 rounded-[12px] text-left transition-[transform,background-color] duration-100 hover:bg-white/[0.07] active:scale-[0.98]"
            style={{ padding: '9px 10px' }}
          >
            <span className="flex items-center justify-center rounded-[10px] shrink-0" style={{ width: 36, height: 36, background: `${it.tone}22`, color: it.tone }}>
              <it.Icon style={{ width: 18, height: 18 }} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate" style={{ fontSize: 13.5, color: '#eaf0fa' }}>{it.label}</span>
              <span className="block truncate" style={{ fontSize: 11.5, color: '#8b97b4' }}>{it.sub}</span>
            </span>
            <ChevronRightIcon className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" style={{ width: 15, height: 15, color: '#5b6680' }} />
          </button>
        ))}
      </div>
    </div>
  )
}

export function MyResources() {
  const { user, access } = useRole()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { data: allocs } = useAllocations(access === 'C' ? null : user.id)
  const gpuAlloc = allocs?.find((a) => a.gpuId)
  // 내 대표 GPU/서버의 텔레메트리 (백필이 과거라 range=24h). 할당 GPU 없으면 보류(null).
  const gpuTel = useTelemetrySeries('gpu', 'sm,vram,temp,power', '24h', 'avg', 10000, gpuAlloc?.gpuId ?? null).data
  const srvTel = useTelemetrySeries('server', 'cpu_util,mem_util', '24h', 'avg', 10000, gpuAlloc?.serverId ?? null).data

  // C(호스팅 전) 또는 할당 0건 → 빈 상태
  if (access === 'C' || allocs?.length === 0) {
    return (
      <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
        <header className="flex flex-col min-w-0 shrink-0">
          <h1 className="font-bold text-text" style={{ fontSize: 20, lineHeight: 1.2 }}>내 할당 자원</h1>
          <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>사용자에게 할당된 GPU 자원과 서비스 사용 현황을 모니터링합니다.</p>
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="bg-card2 border border-line rounded-[14px]" style={{ boxShadow: 'var(--shadow-card)', padding: '40px 32px', maxWidth: 460, width: '100%' }}>
            <EmptyState
              icon={<ServerStackIcon width={26} height={26} />}
              title="아직 할당된 자원이 없어요"
              description="GPU 자원을 신청하면 이 화면에서 사용 현황·토큰 사용량·이벤트 로그를 실시간으로 모니터링할 수 있어요."
              cta={<Button onClick={() => navigate('/requests/status')}>신청하러 가기</Button>}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 relative h-full" style={mutedFix}>
      {/* 1) 헤더 */}
      <header className="flex items-end justify-between gap-4 min-w-0 shrink-0">
        <div className="flex flex-col min-w-0">
          <h1 className="font-bold text-text" style={{ fontSize: 20, lineHeight: 1.2 }}>내 할당 자원</h1>
          <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>사용자에게 할당된 GPU 자원과 서비스 사용 현황을 모니터링합니다.</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="flex items-center gap-1.5 text-muted" style={{ fontSize: 14 }}>
            <ClockIcon style={{ width: 15, height: 15 }} />
            마지막 업데이트: 2025-05-14 15:30:45
          </span>
          <span className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 14, color: '#16a34a' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
            실시간
          </span>
        </div>
      </header>

      {/* 2) 할당 요약 — 고정 높이(Figma 140) */}
      <div className="shrink-0" style={{ marginTop: 20 }}>
        <HeroCard allocs={allocs ?? []} />
      </div>

      {/* 3) 할당 GPU 상태 — 간격은 Figma대로 촘촘히, 카드는 152:330 비율로 함께 grow */}
      <h2 className="font-bold text-text shrink-0" style={{ fontSize: 15.5, marginTop: 26 }}>할당 GPU 상태</h2>
      <div className="grid stagger" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 34, marginTop: 14, flex: '152 1 152px', minHeight: 152 }}>
        {buildMetrics(gpuTel, srvTel).map((m) => (
          <MetricCard key={m.key} m={m} />
        ))}
      </div>

      {/* 4·5·6) 토큰 사용량 + 이벤트 로그 (+ 플로팅 작업 런칭은 한 레이어 위 오버레이) */}
      <div className="relative" style={{ marginTop: 36, flex: '330 1 330px', minHeight: 300 }}>
        <div className="grid items-stretch h-full" style={{ gridTemplateColumns: '614fr 783fr', gap: 16 }}>
          <BarCard />
          <EventLogCard />
        </div>
        <FloatingControl />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 4.6 자원 신청현황 — Figma node 3:2 "자원 신청현황 (구현)" 매칭
//  · 구조색=테마 토큰(다크/라이트 양립), stat 숫자/배지/아이콘박스=Figma 정확 hex.
//  · 텍스트는 §2 가드레일대로 전부 ≥14px(floor). 표 카드는 화면 하단까지 채움.
// ════════════════════════════════════════════════════════════════════

// Figma 대기 아이콘(모래시계) — heroicons 미제공이라 인라인
function HourglassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3h12M6 21h12M8 3v3.6c0 1.2.5 2.3 1.5 3.1L12 12l2.5-2.3c1-.8 1.5-1.9 1.5-3.1V3M8 21v-3.6c0-1.2.5-2.3 1.5-3.1L12 12l2.5 2.3c1 .8 1.5 1.9 1.5 3.1V21" />
    </svg>
  )
}

function NewRequestButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[8px] btn-sweep shrink-0 text-onaccent transition-transform duration-100 hover:brightness-105 active:scale-[0.96]"
      style={{ background: 'var(--c-accent)', padding: '9px 18px' }}
    >
      <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>＋</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>신규 신청</span>
    </button>
  )
}

interface StatDef {
  label: string
  value: number
  desc: string
  num: string // 숫자색 (Figma)
  box: string // 아이콘 박스 배경 (Figma)
  Icon: IconType
}

// 색은 테마 토큰(soft 배경 + semantic 숫자) — 라이트=Figma 유사 / 다크=다크 네이티브 자동 적응.
const STATS: StatDef[] = [
  { label: '전체 신청', value: 23, desc: '전체 자원 신청 건수', num: 'var(--c-accent)', box: 'var(--accent-soft)', Icon: DocumentTextIcon },
  { label: '대기', value: 7, desc: '검토 중인 신청 건', num: 'var(--c-warn)', box: 'var(--warn-soft)', Icon: HourglassIcon },
  { label: '승인', value: 13, desc: '승인 및 할당 완료 건', num: 'var(--c-ok)', box: 'var(--ok-soft)', Icon: CheckCircleIcon },
  { label: '반려', value: 3, desc: '반려된 신청 건', num: 'var(--c-danger)', box: 'var(--danger-soft)', Icon: XCircleIcon },
]

type ReqStatus = '대기' | '승인' | '반려'

// 상태 배지색 — 테마 토큰(라이트=Figma 유사 / 다크=다크 칩)
const BADGE: Record<ReqStatus, { bg: string; fg: string }> = {
  대기: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  승인: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  반려: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}

interface ReqRow {
  no: string
  resource: string
  model: string
  reason: string
  date: string
  status: ReqStatus
  statusSub: string
  procDate: string
  procStatus: string
  memo: string
  action: '상세보기' | '재신청'
}

// DB(gpu_requests) → 화면 행(ReqRow) 변환. 4.6 DB 연동.
const STATUS_KR: Record<GpuRequestRow['status'], ReqStatus> = { pending: '대기', approved: '승인', rejected: '반려' }
function fmtReqDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function toReqRow(r: GpuRequestRow): ReqRow {
  const status = STATUS_KR[r.status] ?? '대기'
  const unit = r.capacityUnit === 'slice' ? '슬라이스' : 'GPU'
  const date = fmtReqDate(r.createdAt)
  const sub = status === '대기' ? '검토중' : status === '승인' ? '할당 완료' : '반려됨'
  return {
    no: r.id,
    resource: `${r.capacity} ${unit}`,
    model: r.models?.[0] ?? '-',
    reason: r.purpose ?? r.serviceName ?? '-',
    date,
    status,
    statusSub: sub,
    procDate: date,
    procStatus: status === '대기' ? '접수 완료' : sub,
    memo: r.rejectReason ?? (status === '승인' ? '리소스 할당됨' : '-'),
    action: status === '반려' ? '재신청' : '상세보기',
  }
}
function computeStats(rows: ReqRow[]): StatDef[] {
  const c: Record<ReqStatus, number> = { 대기: 0, 승인: 0, 반려: 0 }
  rows.forEach((r) => { c[r.status]++ })
  return [
    { ...STATS[0], value: rows.length },
    { ...STATS[1], value: c.대기 },
    { ...STATS[2], value: c.승인 },
    { ...STATS[3], value: c.반려 },
  ]
}

const COLS = [
  { key: 'no', label: '신청번호', width: 160 },
  { key: 'resource', label: '신청 자원', width: 140 },
  { key: 'model', label: '모델', width: 120 },
  { key: 'reason', label: '요청 사유', width: 250 },
  { key: 'date', label: '신청일', width: 150 },
  { key: 'status', label: '상태', width: 110 },
  { key: 'proc', label: '최근 처리', width: 150 },
  { key: 'memo', label: '메모 / 반려 사유', width: 138 },
  { key: 'action', label: '액션', width: 196 },
] as const

interface ReqFilter { q: string; status: string; type: string; start: string; end: string }
const EMPTY_FILTER: ReqFilter = { q: '', status: '전체', type: '전체', start: '', end: '' }
function matchReq(r: ReqRow, f: ReqFilter): boolean {
  if (f.q.trim() && !`${r.no} ${r.resource} ${r.model} ${r.reason}`.toLowerCase().includes(f.q.trim().toLowerCase())) return false
  if (f.status !== '전체' && r.status !== f.status) return false
  if (f.type !== '전체') {
    const isMig = r.resource.includes('MIG')
    if (f.type === 'MIG' && !isMig) return false
    if (f.type === 'GPU' && isMig) return false
  }
  const d = r.date.slice(0, 10)
  if (f.start && d < f.start) return false
  if (f.end && d > f.end) return false
  return true
}

function StatBadge({ status }: { status: ReqStatus }) {
  const b = BADGE[status]
  return (
    <span
      className="inline-flex items-center rounded-[7px] font-semibold whitespace-nowrap"
      style={{ background: b.bg, color: b.fg, padding: '3px 12px', fontSize: 14, lineHeight: 1.35 }}
    >
      {status}
    </span>
  )
}

// 테이블 액션 펠릿(아이콘 + 라벨) — 소프트 채움, 테두리 없이 은은하게
function ActionLink({ label, accent, Icon, onClick }: { label: string; accent?: boolean; Icon: IconType; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color,box-shadow] duration-100 active:scale-95 whitespace-nowrap hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{
        fontSize: 14,
        padding: '5px 10px',
        background: accent ? 'var(--accent-soft)' : 'var(--c-soft)',
        color: accent ? 'var(--c-accent)' : 'var(--c-muted)',
      }}
    >
      <Icon style={{ width: 14, height: 14, opacity: 0.9 }} />
      {label}
    </button>
  )
}

function StatCard({ s }: { s: StatDef }) {
  const { Icon } = s
  return (
    <div
      className="relative bg-card2 border border-line rounded-[14px] overflow-hidden hover-lift"
      style={{ height: 128, boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start" style={{ gap: 16, padding: 23 }}>
        <span
          className="flex items-center justify-center shrink-0 rounded-[14px]"
          style={{ width: 56, height: 56, background: s.box, color: s.num }}
        >
          <Icon style={{ width: 28, height: 28 }} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-text" style={{ fontSize: 15, lineHeight: 1.3 }}>{s.label}</span>
          <span className="font-bold" style={{ fontSize: 30, lineHeight: 1.2, color: s.num, letterSpacing: '-0.5px', marginTop: 2 }}>
            {s.value}
          </span>
        </div>
      </div>
      <span className="absolute text-muted" style={{ left: 23, bottom: 15, fontSize: 14, lineHeight: 1 }}>
        {s.desc}
      </span>
    </div>
  )
}

// 필터 입력 박스(공통 외형) — 38px 높이, border-line, radius8
function FieldBox({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`flex items-center bg-card2 border border-line rounded-[8px] transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`}
      style={{ height: 38, padding: '0 13px', ...style }}
    >
      {children}
    </div>
  )
}

// 상태/유형 드롭다운 — 박스 전체(라벨·값·화살표) 클릭 시 네이티브 드롭다운 오픈(투명 select 전체 덮기)
function FilterSelect({ label, value, onChange, options, width }: { label: string; value: string; onChange: (v: string) => void; options: string[]; width: number }) {
  return (
    <div className="relative flex items-center bg-card2 border border-line rounded-[8px] gap-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 38, padding: '0 13px', width }}>
      <span className="text-muted shrink-0 pointer-events-none" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-text font-medium ml-auto pointer-events-none truncate" style={{ fontSize: 14 }}>{value}</span>
      <ChevronDownIcon className="shrink-0 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--c-muted)' }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ fontSize: 14 }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function PageBtn({ children, active, onClick, disabled }: { children: ReactNode; active?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-[7px] font-medium transition-[transform,background-color] duration-100 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-soft active:enabled:scale-90"
      style={{
        width: 30,
        height: 30,
        fontSize: 14,
        background: active ? 'var(--c-accent)' : 'transparent',
        color: active ? 'var(--c-onaccent)' : 'var(--c-muted)',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  )
}

// ── 신규 자원 요청 마법사 모달 — Figma node 31:2 (4-step) ──
// 테마 토큰 매핑: 라이트 테마=라이트 모달 / 다크 테마=다크 모달 (오버레이는 var(--dim)).
// 보조 텍스트는 본문색의 반투명(color-mix)으로 → 테마 자동 적응 + 대비 보장(다크에서 muted가 너무 어두운 문제 해결).
const M = {
  surface: 'var(--c-card2)', text: 'var(--c-text)', label: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  ph: 'color-mix(in srgb, var(--c-text) 62%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  req: 'var(--c-danger)', inputBg: 'var(--c-bg)', border: 'var(--c-border)', divider: 'var(--c-border)',
  stepLine: 'var(--c-border)', blue: 'var(--c-accent)', blueText: 'var(--c-accent)',
  cancelBg: 'var(--c-soft)', cancelBorder: 'var(--c-border)', value: 'var(--c-text)',
  onAccent: 'var(--c-onaccent)', activeBg: 'var(--accent-soft)',
}
const WIZARD_STEPS = ['기본 정보', '모델 및 자원 선택', '상세 설정', '요청 내용 확인']

interface ReqForm {
  serviceName: string
  team: string
  reason: string
  model: string
  period: string
  priority: string
  addons: string[]
}
const EMPTY_FORM: ReqForm = { serviceName: '', team: '', reason: '', model: '', period: '', priority: '보통', addons: [] }

const TEAMS = ['플랫폼팀', 'AI 연구팀', '서비스개발팀', '데이터팀', '클라우드인프라팀']
const PERIOD_OPTS = ['1개월', '3개월', '6개월', '무기한']
const PRIORITY_OPTS = ['낮음', '보통', '높음']
const ADDON_OPTS = ['주피터 노트북', 'API 엔드포인트', '모니터링 대시보드']

// 모델 카탈로그(미니) — Figma '모델 카탈로그 (구현)' node 9:2 기반. 로고는 app/public/models/*.png.
interface CatalogModel { name: string; provider: string; img: string; desc: string; tags: string[]; usage: string; popular?: boolean }
const CATALOG: CatalogModel[] = [
  { name: 'GPT-4o', provider: 'OpenAI', img: '/models/gpt-4o.png', desc: '멀티모달 지원 고성능 범용 모델', tags: ['LLM', '멀티모달'], usage: '35.6%', popular: true },
  { name: 'Claude 3.5 Sonnet', provider: 'Anthropic', img: '/models/claude.png', desc: '코딩 및 분석에 최적화된 모델', tags: ['LLM'], usage: '22.1%', popular: true },
  { name: 'Llama 3.1 70B', provider: 'Meta', img: '/models/llama.png', desc: '오픈 소스 고성능 언어 모델', tags: ['LLM'], usage: '15.8%', popular: true },
  { name: 'Gemini 1.5 Pro', provider: 'Google', img: '/models/gemini.png', desc: '맥락 이해에 특화된 모델', tags: ['LLM', '멀티모달'], usage: '10.4%' },
  { name: 'GPT-4o mini', provider: 'OpenAI', img: '/models/gpt-4o.png', desc: '저비용 경량 멀티모달 모델', tags: ['LLM', '멀티모달'], usage: '9.2%', popular: true },
  { name: 'Claude 3 Opus', provider: 'Anthropic', img: '/models/claude.png', desc: '최고 성능 추론·작문 모델', tags: ['LLM'], usage: '8.4%' },
  { name: 'Mistral Large 2', provider: 'Mistral AI', img: '/models/mistral.png', desc: '고성능 오픈 가중치 모델', tags: ['LLM'], usage: '6.1%' },
  { name: 'Gemini 1.5 Flash', provider: 'Google', img: '/models/gemini.png', desc: '빠른 응답 경량 멀티모달', tags: ['LLM', '멀티모달'], usage: '5.7%' },
  { name: 'Llama 3.1 405B', provider: 'Meta', img: '/models/llama.png', desc: '초대형 오픈 소스 프런티어 모델', tags: ['LLM'], usage: '4.8%' },
  { name: 'Claude 3 Haiku', provider: 'Anthropic', img: '/models/claude.png', desc: '초경량 고속 응답 모델', tags: ['LLM'], usage: '4.1%' },
  { name: 'Phi-3 Medium', provider: 'Microsoft', img: '/models/phi3.png', desc: '경량화된 고성능 추론 모델', tags: ['LLM'], usage: '3.2%' },
  { name: 'Mixtral 8x22B', provider: 'Mistral AI', img: '/models/mistral.png', desc: 'MoE 기반 고효율 모델', tags: ['LLM'], usage: '2.9%' },
  { name: 'Command R+', provider: 'Cohere', img: '/models/command-r.png', desc: '엔터프라이즈 최적화 모델', tags: ['LLM'], usage: '2.1%' },
  { name: 'Gemma 2 27B', provider: 'Google', img: '/models/gemini.png', desc: '경량 오픈 가중치 모델', tags: ['LLM'], usage: '2.0%' },
  { name: 'Yi-1.5 34B', provider: '01.AI', img: '/models/yi.png', desc: '중국어/영어에 특화된 모델', tags: ['LLM'], usage: '1.7%' },
  { name: 'Llama 3.1 8B', provider: 'Meta', img: '/models/llama.png', desc: '경량 온디바이스 오픈 모델', tags: ['LLM'], usage: '1.4%' },
  { name: 'Phi-3 mini', provider: 'Microsoft', img: '/models/phi3.png', desc: '초경량 SLM 추론 모델', tags: ['LLM'], usage: '1.1%' },
  { name: 'Command R', provider: 'Cohere', img: '/models/command-r.png', desc: 'RAG 특화 검색 증강 모델', tags: ['LLM'], usage: '0.9%' },
]

// 모달 라벨(필수 표시 + 헬퍼)
function FieldLabel({ text, required, help }: { text: string; required?: boolean; help?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="font-semibold" style={{ fontSize: 14, color: M.label }}>
        {text}
        {required && <span style={{ color: M.req, marginLeft: 5 }}>*</span>}
      </div>
      {help && <div style={{ fontSize: 13, color: M.help, marginTop: 4 }}>{help}</div>}
    </div>
  )
}

// 선택 카드(모델/자원/기간/우선순위)
function SelectCard({ label, active, onClick, full }: { label: string; active: boolean; onClick: () => void; full?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-[8px] transition-colors text-left"
      style={{
        height: 44,
        padding: '0 14px',
        width: full ? '100%' : undefined,
        background: active ? M.activeBg : M.inputBg,
        border: `1px solid ${active ? M.blue : M.border}`,
        color: active ? M.text : M.value,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
      {active && <CheckIcon style={{ width: 16, height: 16, color: M.blue }} />}
    </button>
  )
}

// 모달 내 카탈로그 페이지 버튼(테마)
function ModelPageBtn({ children, active, disabled, onClick }: { children: ReactNode; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-[7px] font-medium transition-[transform,background-color] duration-100 disabled:opacity-40 disabled:cursor-not-allowed active:enabled:scale-90"
      style={{ minWidth: 30, height: 30, padding: '0 9px', fontSize: 14, background: active ? M.blue : 'transparent', color: active ? M.onAccent : M.help, border: active ? 'none' : `1px solid ${M.border}` }}
    >
      {children}
    </button>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start" style={{ padding: '0 4px' }}>
      {WIZARD_STEPS.map((s, i) => {
        const done = i <= current
        return (
          <div key={s} className={i < WIZARD_STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'}>
            <div className="flex flex-col items-center" style={{ width: 96 }}>
              <span
                className="flex items-center justify-center rounded-full font-semibold"
                style={{
                  width: 28, height: 28, fontSize: 13,
                  background: done ? M.blue : 'transparent',
                  border: done ? 'none' : `1.5px solid ${M.border}`,
                  color: done ? M.onAccent : M.idle,
                }}
              >
                {i < current ? <CheckIcon style={{ width: 15, height: 15 }} /> : i + 1}
              </span>
              <span className="font-medium" style={{ fontSize: 12.5, marginTop: 8, color: i <= current ? M.blueText : M.idle, whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <span style={{ flex: 1, height: 2, marginTop: 13, background: i < current ? M.blue : M.stepLine, borderRadius: 1 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function NewRequestModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (f: ReqForm) => void }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState<ReqForm>(EMPTY_FORM)
  const [modelQ, setModelQ] = useState('')
  const [modelPage, setModelPage] = useState(1)
  const set = <K extends keyof ReqForm>(k: K, v: ReqForm[K]) => setF((p) => ({ ...p, [k]: v }))

  // 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setStep(0)
      setF(EMPTY_FORM)
      setModelQ('')
      setModelPage(1)
    }
  }, [open])

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const valid = [
    Boolean(f.serviceName.trim() && f.team && f.reason.trim()),
    Boolean(f.model),
    Boolean(f.period && f.priority),
    true,
  ]
  const canNext = valid[step]
  const isLast = step === 3
  const go = (d: number) => setStep((s) => Math.max(0, Math.min(3, s + d)))
  const next = () => {
    if (!canNext) return
    if (isLast) onSubmit(f)
    else go(1)
  }

  const inputBase: React.CSSProperties = {
    height: 44, width: '100%', background: M.inputBg, border: `1px solid ${M.border}`,
    borderRadius: 8, padding: '0 14px', fontSize: 14, color: M.text, outline: 'none',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center anim-fade"
      style={{ background: 'var(--dim)', zIndex: 60, padding: 20 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex flex-col rounded-[16px] overflow-hidden"
        style={{ width: 761, maxWidth: '94vw', maxHeight: '92vh', background: M.surface, boxShadow: 'var(--shadow-pop)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between shrink-0" style={{ padding: '24px 36px 22px' }}>
          <h2 className="font-bold" style={{ fontSize: 18, color: M.text }}>신규 자원 요청</h2>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ color: M.idle }} className="transition-transform duration-100 hover:opacity-70 active:scale-90">
            <XMarkIcon style={{ width: 22, height: 22 }} />
          </button>
        </div>
        <div style={{ height: 1, background: M.divider }} />

        {/* 스텝퍼 */}
        <div className="shrink-0" style={{ padding: '20px 36px 14px' }}>
          <Stepper current={step} />
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '6px 36px 24px' }}>
          {step === 0 && (
            <div className="flex flex-col">
              <h3 className="font-semibold" style={{ fontSize: 14, color: M.text, marginBottom: 18 }}>기본 정보를 입력해주세요.</h3>
              {/* 서비스명 */}
              <FieldLabel text="서비스명" required help="서비스를 식별할 수 있는 이름을 입력해주세요." />
              <div className="relative" style={{ marginBottom: 24 }}>
                <input
                  value={f.serviceName}
                  maxLength={50}
                  onChange={(e) => set('serviceName', e.target.value)}
                  placeholder="예: 고객 챗봇 서비스"
                  style={inputBase}
                />
                <span className="absolute" style={{ right: 14, top: 15, fontSize: 12, color: M.meta }}>{f.serviceName.length}/50</span>
              </div>
              {/* 소속 팀/부서 */}
              <FieldLabel text="소속 팀/부서" required />
              <div className="relative" style={{ marginBottom: 24 }}>
                <select
                  value={f.team}
                  onChange={(e) => set('team', e.target.value)}
                  style={{ ...inputBase, appearance: 'none', color: f.team ? M.text : M.ph, cursor: 'pointer' }}
                >
                  <option value="">선택해주세요</option>
                  {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDownIcon className="absolute pointer-events-none" style={{ right: 14, top: 14, width: 16, height: 16, color: M.idle }} />
              </div>
              {/* 요청자 */}
              <FieldLabel text="요청자" />
              <input readOnly value="홍길동 (hongildong@company.com)" style={{ ...inputBase, color: M.value, marginBottom: 24, cursor: 'default' }} />
              {/* 요청 사유 */}
              <FieldLabel text="요청 사유" required help="자원 요청 목적과 사용 계획을 간단히 입력해주세요." />
              <div className="relative">
                <textarea
                  value={f.reason}
                  maxLength={300}
                  onChange={(e) => set('reason', e.target.value)}
                  placeholder="예: 고객 상담 자동화를 위한 LLM 추론 서비스 운영"
                  style={{ ...inputBase, height: 108, padding: '14px', resize: 'none', lineHeight: 1.5 }}
                />
                <span className="absolute" style={{ right: 14, bottom: 12, fontSize: 12, color: M.meta }}>{f.reason.length}/300</span>
              </div>
            </div>
          )}

          {step === 1 && (() => {
            const list = CATALOG.filter((m) => {
              const s = modelQ.trim().toLowerCase()
              return !s || `${m.name} ${m.provider} ${m.desc} ${m.tags.join(' ')}`.toLowerCase().includes(s)
            })
            const PER = 6
            const mPageCount = Math.max(1, Math.ceil(list.length / PER))
            const mCur = Math.min(modelPage, mPageCount)
            const paged = list.slice((mCur - 1) * PER, mCur * PER)
            return (
              <div className="flex flex-col">
                <h3 className="font-semibold" style={{ fontSize: 14, color: M.text, marginBottom: 6 }}>사용할 모델을 선택해주세요.</h3>
                <p style={{ fontSize: 13, color: M.help, marginBottom: 14 }}>추론에 사용할 기반 모델을 카탈로그에서 검색·선택하세요. (총 {CATALOG.length}개)</p>
                {/* 검색 */}
                <div className="relative" style={{ marginBottom: 14 }}>
                  <MagnifyingGlassIcon className="absolute" style={{ left: 14, top: 13, width: 16, height: 16, color: M.idle }} />
                  <input
                    value={modelQ}
                    onChange={(e) => { setModelQ(e.target.value); setModelPage(1) }}
                    placeholder="모델명, 제공사 검색 (예: GPT, Llama, Anthropic)"
                    style={{ height: 42, width: '100%', background: M.inputBg, border: `1px solid ${M.border}`, borderRadius: 8, padding: '0 14px 0 40px', fontSize: 14, color: M.text, outline: 'none' }}
                  />
                </div>
                {/* 모델 카드 그리드 */}
                <div className="grid grid-cols-2" style={{ gap: 10 }}>
                  {paged.map((m) => {
                    const on = f.model === m.name
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => set('model', m.name)}
                        className="relative text-left rounded-[12px] transition-[transform,background-color,border-color] duration-100 active:scale-[0.985]"
                        style={{ padding: 14, background: on ? M.activeBg : M.inputBg, border: `1px solid ${on ? M.blue : M.border}` }}
                      >
                        <div className="flex items-start gap-3">
                          <img src={m.img} alt={m.provider} width={36} height={36} className="rounded-[9px] shrink-0" style={{ objectFit: 'cover' }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold truncate" style={{ fontSize: 14, color: M.text }}>{m.name}</span>
                              {m.popular && <span className="shrink-0 rounded-[5px] font-medium" style={{ fontSize: 10.5, padding: '1px 6px', background: M.activeBg, color: M.blue }}>인기</span>}
                            </div>
                            <div className="truncate" style={{ fontSize: 12, color: M.help }}>{m.provider}</div>
                          </div>
                          {on && <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: M.blue }}><CheckIcon style={{ width: 13, height: 13, color: M.onAccent }} /></span>}
                        </div>
                        <p className="truncate" style={{ fontSize: 12.5, color: M.value, marginTop: 10 }}>{m.desc}</p>
                        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                          <div className="flex gap-1.5">
                            {m.tags.map((t) => (
                              <span key={t} className="rounded-[5px] font-medium" style={{ fontSize: 10.5, padding: '2px 7px', background: M.inputBg, border: `1px solid ${M.border}`, color: M.help }}>{t}</span>
                            ))}
                          </div>
                          <span style={{ fontSize: 11.5, color: M.help }}>사용률 {m.usage}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {list.length === 0 && <div className="text-center" style={{ fontSize: 14, color: M.help, padding: '32px 0' }}>검색 결과가 없어요.</div>}
                {mPageCount > 1 && (
                  <div className="flex items-center justify-center gap-1.5" style={{ marginTop: 16 }}>
                    <ModelPageBtn disabled={mCur === 1} onClick={() => setModelPage(mCur - 1)}>‹</ModelPageBtn>
                    {Array.from({ length: mPageCount }, (_, i) => i + 1).map((p) => (
                      <ModelPageBtn key={p} active={p === mCur} onClick={() => setModelPage(p)}>{p}</ModelPageBtn>
                    ))}
                    <ModelPageBtn disabled={mCur === mPageCount} onClick={() => setModelPage(mCur + 1)}>›</ModelPageBtn>
                  </div>
                )}
              </div>
            )
          })()}

          {step === 2 && (
            <div className="flex flex-col">
              <h3 className="font-semibold" style={{ fontSize: 14, color: M.text, marginBottom: 18 }}>세부 운영 조건을 설정해주세요.</h3>
              <FieldLabel text="사용 기간" required />
              <div className="grid grid-cols-4" style={{ gap: 10, marginBottom: 24 }}>
                {PERIOD_OPTS.map((p) => <SelectCard key={p} label={p} active={f.period === p} onClick={() => set('period', p)} full />)}
              </div>
              <FieldLabel text="우선순위" required />
              <div className="grid grid-cols-3" style={{ gap: 10, marginBottom: 24 }}>
                {PRIORITY_OPTS.map((p) => <SelectCard key={p} label={p} active={f.priority === p} onClick={() => set('priority', p)} full />)}
              </div>
              <FieldLabel text="부가 옵션" help="필요한 운영 도구를 선택해주세요. (선택)" />
              <div className="flex flex-col" style={{ gap: 10 }}>
                {ADDON_OPTS.map((a) => {
                  const on = f.addons.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => set('addons', on ? f.addons.filter((x) => x !== a) : [...f.addons, a])}
                      className="flex items-center rounded-[8px] transition-colors text-left"
                      style={{ height: 44, padding: '0 14px', background: M.inputBg, border: `1px solid ${on ? M.blue : M.border}`, color: on ? M.text : M.value, fontSize: 14 }}
                    >
                      <span className="flex items-center justify-center rounded-[5px]" style={{ width: 18, height: 18, marginRight: 10, background: on ? M.blue : 'transparent', border: on ? 'none' : `1.5px solid ${M.border}` }}>
                        {on && <CheckIcon style={{ width: 13, height: 13, color: M.onAccent }} />}
                      </span>
                      {a}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col">
              <h3 className="font-semibold" style={{ fontSize: 14, color: M.text, marginBottom: 18 }}>요청 내용을 확인해주세요.</h3>
              <div className="rounded-[10px]" style={{ background: M.inputBg, border: `1px solid ${M.border}`, padding: '6px 18px' }}>
                <SummaryRow k="서비스명" v={f.serviceName || '—'} />
                <SummaryRow k="소속 팀/부서" v={f.team || '—'} />
                <SummaryRow k="요청자" v="홍길동 (hongildong@company.com)" />
                <SummaryRow k="모델" v={f.model || '—'} />
                <SummaryRow k="사용 기간" v={f.period || '—'} />
                <SummaryRow k="우선순위" v={f.priority || '—'} />
                <SummaryRow k="부가 옵션" v={f.addons.length ? f.addons.join(', ') : '없음'} />
                <SummaryRow k="요청 사유" v={f.reason || '—'} last />
              </div>
              <p style={{ fontSize: 12.5, color: M.help, marginTop: 14 }}>제출 시 신청이 접수되며, 검토 후 자원이 할당됩니다.</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ height: 1, background: M.divider }} />
        <div className="flex items-center justify-between shrink-0" style={{ padding: '20px 36px' }}>
          <div>
            {step > 0 && (
              <button type="button" onClick={() => go(-1)} className="rounded-[8px] font-medium transition-transform duration-100 hover:opacity-80 active:scale-[0.97]" style={{ padding: '11px 20px', fontSize: 14, color: M.value, background: 'transparent', border: `1px solid ${M.cancelBorder}` }}>이전</button>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="rounded-[8px] font-medium transition-transform duration-100 hover:opacity-80 active:scale-[0.97]" style={{ padding: '11px 24px', fontSize: 14, color: M.value, background: M.cancelBg, border: `1px solid ${M.cancelBorder}` }}>취소</button>
            <button
              type="button"
              onClick={next}
              disabled={!canNext}
              className="rounded-[8px] font-semibold transition-[transform,opacity] duration-100 enabled:hover:brightness-110 enabled:active:scale-[0.97]"
              style={{ padding: '11px 26px', fontSize: 14, color: M.onAccent, background: M.blue, opacity: canNext ? 1 : 0.45, cursor: canNext ? 'pointer' : 'not-allowed' }}
            >
              {isLast ? '제출' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className="flex items-start gap-4" style={{ padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${M.border}` }}>
      <span className="shrink-0" style={{ width: 110, fontSize: 14, color: M.help }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium" style={{ fontSize: 14, color: M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}

// ── 신청 상세보기 모달 (테마 연동) — 행/상세보기·재신청 클릭 시 ──
// "YYYY-MM-DD HH:MM"에 시간 더하기(타임라인 중간 시각 합성용)
function addHours(s: string, h: number): string {
  const [d, t] = s.split(' ')
  const dt = new Date(`${d}T${t || '00:00'}:00`)
  if (isNaN(dt.getTime())) return s
  dt.setHours(dt.getHours() + h)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

// 상세 모달 카드 / 라벨-값 행
function DCard({ title, children, gap = 14, grow }: { title: string; children: ReactNode; gap?: number; grow?: boolean }) {
  return (
    <section className={grow ? 'flex-1 min-h-0' : ''} style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 12, padding: '15px 17px', boxShadow: '0 1px 1.5px rgba(0,0,0,0.04)' }}>
      <h3 className="font-bold" style={{ fontSize: 14.5, color: M.text, marginBottom: 13 }}>{title}</h3>
      <div className="flex flex-col" style={{ gap }}>{children}</div>
    </section>
  )
}
function DKV({ k, v, vColor, right }: { k: string; v: ReactNode; vColor?: string; right?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0" style={{ width: 92, fontSize: 13, color: M.help }}>{k}</span>
      <span className={`min-w-0 flex-1 ${right ? 'text-right' : ''}`} style={{ fontSize: 13, fontWeight: 500, color: vColor ?? M.value }}>{v}</span>
    </div>
  )
}

interface TStep { time: string; label: string; state: 'done' | 'current' | 'pending'; tone?: string }
function DetailTimeline({ steps }: { steps: TStep[] }) {
  return (
    <div className="flex flex-col">
      {steps.map((s, i) => (
        <div key={i} className="relative flex gap-3" style={{ paddingBottom: i < steps.length - 1 ? 22 : 0 }}>
          {i < steps.length - 1 && <span className="absolute" style={{ left: 8.25, top: 18, bottom: 0, width: 1.5, background: M.border }} />}
          <span className="relative shrink-0 flex items-center justify-center rounded-full" style={{ width: 18, height: 18, zIndex: 1, background: s.state === 'done' ? (s.tone || 'var(--c-ok)') : 'var(--c-card2)', border: s.state === 'done' ? 'none' : `2px solid ${s.state === 'current' ? 'var(--c-accent)' : M.border}` }}>
            {s.state === 'done' && <CheckIcon style={{ width: 11, height: 11, color: 'var(--c-onaccent)' }} />}
            {s.state === 'current' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-accent)' }} />}
          </span>
          <div style={{ marginTop: -2 }}>
            {s.time && <div style={{ fontSize: 12.5, fontWeight: 500, color: M.value }}>{s.time}</div>}
            <div style={{ fontSize: 12, color: M.help, marginTop: s.time ? 2 : 0 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RequestDetailModal({ row, onClose }: { row: ReqRow | null; onClose: () => void }) {
  const toast = useToast()
  useEffect(() => {
    if (!row) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [row, onClose])
  if (!row) return null
  const resultColor = row.status === '승인' ? 'var(--c-ok)' : row.status === '반려' ? 'var(--c-danger)' : 'var(--c-warn)'
  const typeTag = row.resource.includes('MIG') ? 'MIG' : 'GPU'
  const steps: TStep[] =
    row.status === '승인'
      ? [
          { time: row.date, label: '접수 완료', state: 'done' },
          { time: addHours(row.date, 3), label: '검토 진행', state: 'done' },
          { time: row.procDate, label: '승인 및 할당 완료', state: 'done' },
        ]
      : row.status === '반려'
        ? [
            { time: row.date, label: '접수 완료', state: 'done' },
            { time: addHours(row.date, 3), label: '검토 진행', state: 'done' },
            { time: row.procDate, label: '반려됨', state: 'done', tone: 'var(--c-danger)' },
          ]
        : [
            { time: row.date, label: '접수 완료', state: 'done' },
            { time: row.procDate, label: '검토 진행', state: 'current' },
            { time: '', label: '승인 대기', state: 'pending' },
          ]
  return (
    <div className="fixed inset-0 flex items-center justify-center anim-fade" style={{ background: 'var(--dim)', zIndex: 60, padding: 20 }} onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex flex-col rounded-[18px] overflow-hidden" style={{ width: 767, maxWidth: '95vw', maxHeight: '92vh', background: M.surface, boxShadow: 'var(--shadow-pop)' }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between shrink-0" style={{ padding: '20px 32px' }}>
          <h2 className="font-bold" style={{ fontSize: 19, color: M.text }}>신청 상세보기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="transition-transform duration-100 hover:opacity-70 active:scale-90" style={{ color: M.idle }}>
            <XMarkIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <div style={{ height: 1, background: M.divider }} />
        {/* 부제: 신청번호 + 상태 */}
        <div className="flex items-center gap-3 shrink-0" style={{ padding: '15px 32px' }}>
          <span className="font-bold" style={{ fontSize: 18, color: M.text }}>{row.no}</span>
          <StatBadge status={row.status} />
        </div>
        {/* 본문 — 2열 카드 그리드 */}
        <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '0 32px 24px' }}>
          <div className="grid grid-cols-2 items-stretch" style={{ gap: 16 }}>
            {/* 좌 */}
            <div className="flex flex-col" style={{ gap: 14 }}>
              <DCard title="기본 정보">
                <DKV k="신청유형" v={<span className="inline-flex items-center font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', borderRadius: 11, padding: '3px 10px', fontSize: 12 }}>{typeTag}</span>} />
                <DKV k="신청 자원" v={row.resource} />
                <DKV k="모델" v={row.model} />
                <DKV k="신청일" v={row.date} />
                <DKV k="요청자" v="홍길동" />
              </DCard>
              <DCard title="요청 사유">
                <p style={{ fontSize: 13, color: M.value, lineHeight: 1.55 }}>{row.reason}</p>
              </DCard>
              <DCard title="운영 환경 / 부가 서비스" gap={10}>
                <DKV k="운영환경" v="Ubuntu 22.04 / Python 3.10" />
                <DKV k="부가서비스" v="PyTorch, Jupyter" />
              </DCard>
              <DCard title="첨부 파일" grow>
                <div className="flex items-center gap-2.5" style={{ background: M.inputBg, border: `1px solid ${M.border}`, borderRadius: 8, height: 32, padding: '0 10px' }}>
                  <span className="flex items-center justify-center shrink-0 font-bold" style={{ width: 16, height: 16, borderRadius: 3, background: '#e8413a', color: '#fff', fontSize: 6 }}>PDF</span>
                  <span className="flex-1 truncate font-medium" style={{ fontSize: 12.5, color: M.value }}>결재 공문.pdf</span>
                  <button type="button" onClick={() => toast.push('결재 공문.pdf 다운로드 (목업)', 'info')} className="shrink-0 transition-transform active:scale-90 hover:text-text" style={{ color: M.help }} aria-label="다운로드"><ArrowDownTrayIcon style={{ width: 14, height: 14 }} /></button>
                </div>
              </DCard>
            </div>
            {/* 우 */}
            <div className="flex flex-col" style={{ gap: 14 }}>
              <DCard title="처리 현황">
                <DKV k="현재 상태" right v={<StatBadge status={row.status} />} />
                <DKV k="최근 처리" right v={row.procDate} />
                <DKV k="처리 결과" right v={row.procStatus} vColor={resultColor} />
                <DKV k="담당자" right v="관리자" />
              </DCard>
              <DCard title="처리 이력">
                <DetailTimeline steps={steps} />
              </DCard>
              <DCard title="메모" grow>
                <p style={{ fontSize: 13, color: M.value, lineHeight: 1.55 }}>{row.memo === '-' ? '메모 없음' : row.memo}</p>
              </DCard>
            </div>
          </div>
        </div>
        {/* 푸터 */}
        <div style={{ height: 1, background: M.divider }} />
        <div className="flex items-center justify-end shrink-0" style={{ padding: '15px 32px', gap: 10 }}>
          <button type="button" onClick={onClose} className="rounded-[8px] font-medium transition-transform duration-100 hover:bg-soft active:scale-[0.97]" style={{ padding: '11px 24px', fontSize: 14, color: M.value, background: 'transparent', border: `1px solid ${M.border}` }}>닫기</button>
          <button type="button" onClick={onClose} className="rounded-[8px] font-medium transition-transform duration-100 hover:brightness-110 active:scale-[0.97]" style={{ padding: '11px 28px', fontSize: 14, color: M.onAccent, background: 'var(--c-accent)' }}>확인</button>
        </div>
      </div>
    </div>
  )
}

export function RequestStatus() {
  const toast = useToast()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { user, isAdmin } = useRole()
  // A=전체 신청, B/C=내 신청만(requester=나)
  const { data: dbReqs } = useGpuRequests(isAdmin ? undefined : user.id)
  const [extraRows, setExtraRows] = useState<ReqRow[]>([]) // 신규 신청(로컬 추가)
  const dbRows = useMemo(() => (dbReqs ?? []).map(toReqRow), [dbReqs])
  const rows = useMemo(() => [...extraRows, ...dbRows], [extraRows, dbRows])
  const total = rows.length
  const [modalOpen, setModalOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<ReqRow | null>(null)
  // 검색·필터: draft(입력값) → '필터 적용' 시 applied 로 반영(실제 검색)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [typeF, setTypeF] = useState('전체')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [applied, setApplied] = useState<ReqFilter>(EMPTY_FILTER)
  // 페이지네이션
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const hasFilter = applied.q.trim() !== '' || applied.status !== '전체' || applied.type !== '전체' || applied.start !== '' || applied.end !== ''
  // 입력값이 적용값과 다르면 '미적용 변경' 상태 → 필터 적용 버튼 강조
  const dirty = q !== applied.q || statusF !== applied.status || typeF !== applied.type || dateStart !== applied.start || dateEnd !== applied.end
  const view = rows.filter((r) => matchReq(r, applied))
  const pageCount = Math.max(1, Math.ceil(view.length / pageSize))
  const curPage = Math.min(page, pageCount)
  const pageRows = view.slice((curPage - 1) * pageSize, curPage * pageSize)

  // 적용 필터·페이지크기 변경 시 첫 페이지로
  useEffect(() => { setPage(1) }, [applied, pageSize])

  const applyFilters = () => {
    const next: ReqFilter = { q, status: statusF, type: typeF, start: dateStart, end: dateEnd }
    setApplied(next)
    setPage(1)
    const cnt = rows.filter((r) => matchReq(r, next)).length
    toast.push(`필터 적용 — ${cnt}건 검색되었어요`, cnt ? 'info' : 'warn')
  }
  const resetFilters = () => {
    setQ('')
    setStatusF('전체')
    setTypeF('전체')
    setDateStart('')
    setDateEnd('')
    setApplied(EMPTY_FILTER)
    setPage(1)
  }

  const handleSubmit = (form: ReqForm) => {
    const seq = total + 1
    const stamp = '2025-05-14 16:02'
    const row: ReqRow = {
      no: `REQ-2025-0514-${String(seq).padStart(3, '0')}`,
      resource: '할당 대기',
      model: form.model,
      reason: form.reason || form.serviceName,
      date: stamp,
      status: '대기',
      statusSub: '검토중',
      procDate: stamp,
      procStatus: '접수 완료',
      memo: '-',
      action: '상세보기',
    }
    setExtraRows((cur) => [row, ...cur])
    setPage(1)
    setModalOpen(false)
    toast.push('신규 자원 요청이 접수되었어요. (검토중)', 'ok')
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      {/* 1) 헤더 — 제목 + 부제 (신규 신청 버튼은 표 카드 헤더로 이동) */}
      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>자원 신청현황</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          자원 신청의 승인 상태, 반려 사유 및 최근 처리 내역을 확인할 수 있습니다.
        </p>
      </header>

      {/* 2) stat 카드 4개 */}
      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {computeStats(rows).map((s) => (
          <StatCard key={s.label} s={s} />
        ))}
      </div>

      {/* 3) 검색 및 필터 바 — 4.10 승인 관리와 동일 간격(18) */}
      <section
        className="bg-card2 border border-line rounded-[14px] shrink-0"
        style={{ marginTop: 18, padding: '14px 19px' }}
      >
        <h2 className="font-bold text-text" style={{ fontSize: 14.5 }}>검색 및 필터</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 11 }}>
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <FieldBox className="gap-2" style={{ width: 308 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
                className="bg-transparent min-w-0 flex-1 text-text"
                style={{ fontSize: 14, outline: 'none', border: 'none', boxShadow: 'none' }}
                placeholder="신청번호, 모델명, 자원명 검색"
              />
              <button type="button" onClick={applyFilters} aria-label="검색" className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-soft active:scale-90" style={{ width: 24, height: 24, color: 'var(--c-muted)', margin: '0 -5px 0 0' }}>
                <MagnifyingGlassIcon style={{ width: 17, height: 17 }} />
              </button>
            </FieldBox>
            <FilterSelect label="상태" value={statusF} onChange={setStatusF} options={['전체', '대기', '승인', '반려']} width={168} />
            <FilterSelect label="신청 유형" value={typeF} onChange={setTypeF} options={['전체', 'GPU', 'MIG']} width={188} />
            <FieldBox className="gap-1.5" style={{ width: 326 }}>
              <CalendarDaysIcon style={{ width: 18, height: 18, color: 'var(--c-muted)', flexShrink: 0 }} />
              <input type="date" value={dateStart} max={dateEnd || undefined} onChange={(e) => setDateStart(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
              <span className="text-muted shrink-0" style={{ fontSize: 14 }}>~</span>
              <input type="date" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} className="bg-transparent outline-none text-text min-w-0 flex-1" style={{ fontSize: 14, colorScheme: 'inherit' }} />
            </FieldBox>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={resetFilters} className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] transition-[transform,background-color] duration-100 hover:bg-soft active:scale-[0.97]" style={{ height: 38, padding: '0 16px' }}>
              <ArrowPathIcon style={{ width: 16, height: 16, color: 'var(--c-muted)' }} />
              <span className="text-text font-medium" style={{ fontSize: 14 }}>초기화</span>
            </button>
            <button type="button" onClick={applyFilters} className="relative flex items-center gap-2 rounded-[8px] text-onaccent btn-sweep transition-transform duration-100 hover:brightness-105 active:scale-[0.97]" style={{ height: 38, padding: '0 16px', background: 'var(--c-accent)', boxShadow: dirty ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
              <FunnelIcon style={{ width: 15, height: 15 }} />
              <span className="font-semibold" style={{ fontSize: 14 }}>필터 적용</span>
              {dirty && <span className="absolute rounded-full" style={{ top: -4, right: -4, width: 9, height: 9, background: 'var(--c-warn)', border: '2px solid var(--c-card2)' }} />}
            </button>
          </div>
        </div>
      </section>

      {/* 4) 내 신청 현황 테이블 — 화면 하단까지 채움 (필터와 18 간격 통일) */}
      <section className="bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col flex-1 min-h-0" style={{ marginTop: 18 }}>
        {/* 카드 헤더: 제목(좌) + 신규 신청(우) */}
        <div className="flex items-center justify-between gap-3 shrink-0" style={{ padding: '16px 24px' }}>
          <h2 className="font-bold text-text" style={{ fontSize: 16 }}>내 신청 현황</h2>
          <NewRequestButton onClick={() => setModalOpen(true)} />
        </div>

        {/* 표 본문 — 남는 높이를 채우고 내부 스크롤 */}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup>
              {COLS.map((c) => (
                <col key={c.key} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                {COLS.map((c, i) => (
                  <th
                    key={c.key}
                    className="text-muted font-medium whitespace-nowrap"
                    style={{
                      textAlign: 'left',
                      fontSize: 14,
                      padding: '0 0 12px',
                      paddingLeft: i === 0 ? 24 : 0,
                      paddingRight: i === COLS.length - 1 ? 24 : 0,
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-muted text-center" style={{ fontSize: 14, padding: '40px 0' }}>
                    검색 결과가 없어요. 검색어나 필터를 조정해보세요.
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr
                  key={r.no}
                  className="cursor-pointer"
                  onClick={() => setDetailRow(r)}
                  style={{ borderBottom: '1px solid var(--c-border-s)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* 신청번호 */}
                  <td className="align-middle truncate text-text font-medium" style={{ fontSize: 14, padding: '15px 0', paddingLeft: 24 }}>
                    {r.no}
                  </td>
                  {/* 신청 자원 */}
                  <td className="align-middle truncate text-text font-medium" style={{ fontSize: 14, padding: '15px 0' }}>
                    {r.resource}
                  </td>
                  {/* 모델 */}
                  <td className="align-middle truncate text-text font-medium" style={{ fontSize: 14, padding: '15px 0' }}>
                    {r.model}
                  </td>
                  {/* 요청 사유 */}
                  <td className="align-middle text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0', lineHeight: 1.4 }}>
                    {r.reason}
                  </td>
                  {/* 신청일 */}
                  <td className="align-middle truncate text-muted" style={{ fontSize: 14, padding: '15px 0' }}>
                    {r.date}
                  </td>
                  {/* 상태 = 배지 + 하단 sub */}
                  <td className="align-middle" style={{ padding: '15px 0' }}>
                    <div className="flex flex-col items-start" style={{ gap: 5 }}>
                      <StatBadge status={r.status} />
                      <span className="text-muted" style={{ fontSize: 14 }}>{r.statusSub}</span>
                    </div>
                  </td>
                  {/* 최근 처리 = 일시 + 상태 */}
                  <td className="align-middle" style={{ padding: '15px 0' }}>
                    <div className="flex flex-col" style={{ gap: 4 }}>
                      <span className="truncate" style={{ fontSize: 14, color: 'var(--c-text)', opacity: 0.82 }}>{r.procDate}</span>
                      <span className="text-muted" style={{ fontSize: 14 }}>{r.procStatus}</span>
                    </div>
                  </td>
                  {/* 메모 / 반려 사유 */}
                  <td className="align-middle text-muted" style={{ fontSize: 14, padding: '15px 16px 15px 0', lineHeight: 1.4 }}>
                    {r.memo}
                  </td>
                  {/* 액션 — 승인=자원 보기(→대시보드)·상세보기 / 반려=재신청·상세보기 / 대기=상세보기 */}
                  <td className="align-middle" style={{ padding: '15px 0', paddingRight: 24 }}>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {r.status === '승인' && (
                        <ActionLink label="자원 보기" accent Icon={ArrowTopRightOnSquareIcon} onClick={(e) => { e.stopPropagation(); toast.push('할당된 자원 화면으로 이동합니다.', 'info'); navigate('/dashboard') }} />
                      )}
                      {r.status === '반려' && (
                        <ActionLink label="재신청" accent Icon={ArrowPathIcon} onClick={(e) => { e.stopPropagation(); setModalOpen(true) }} />
                      )}
                      <ActionLink label="상세보기" Icon={EyeIcon} onClick={(e) => { e.stopPropagation(); setDetailRow(r) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 푸터 — 카드 하단 고정: 전체 N건 · 페이지네이션 · 페이지 크기 */}
        <div className="flex items-center justify-between gap-3 shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 24px' }}>
          <span className="text-muted shrink-0" style={{ fontSize: 14 }}>
            {hasFilter ? `${view.length}건 표시` : `전체 ${total}건`}
            {view.length > 0 && <span style={{ opacity: 0.7 }}>{` · ${(curPage - 1) * pageSize + 1}–${Math.min(curPage * pageSize, view.length)}`}</span>}
          </span>
          <div className="flex items-center" style={{ gap: 6 }}>
            <PageBtn onClick={() => setPage(1)} disabled={curPage === 1}>«</PageBtn>
            <PageBtn onClick={() => setPage(curPage - 1)} disabled={curPage === 1}>‹</PageBtn>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <PageBtn key={p} active={p === curPage} onClick={() => setPage(p)}>{p}</PageBtn>
            ))}
            <PageBtn onClick={() => setPage(curPage + 1)} disabled={curPage === pageCount}>›</PageBtn>
            <PageBtn onClick={() => setPage(pageCount)} disabled={curPage === pageCount}>»</PageBtn>
          </div>
          <div className="flex items-center gap-2 bg-card2 border border-line rounded-[8px] shrink-0" style={{ height: 32, padding: '0 13px' }}>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="bg-transparent outline-none text-muted font-medium cursor-pointer" style={{ fontSize: 14, appearance: 'none' }}>
              <option value={10}>10건씩 보기</option>
              <option value={20}>20건씩 보기</option>
              <option value={50}>50건씩 보기</option>
            </select>
            <ChevronDownIcon style={{ width: 14, height: 14, color: 'var(--c-muted)' }} />
          </div>
        </div>
      </section>

      <NewRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleSubmit} />
      <RequestDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  )
}

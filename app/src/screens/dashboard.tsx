import { useState, useEffect, useMemo, useRef } from 'react'
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
  EyeIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { EmptyState, Button, KpiStat, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { useTheme } from '../lib/theme'
import { useAllocations, useTelemetrySeries, useEvents, useServiceTokens, type AllocationRow, type SeriesPoint, type ServiceTokens } from '../data/hooks/usePolling'
import { modelById } from '../data'
import { useRequests, allocationLink, type RequestItem } from './requests-shared'

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
function HeroCard({ allocs, totalServices }: { allocs: AllocationRow[]; totalServices?: number }) {
  const gpuAlloc = allocs.find((a) => a.gpuId) ?? allocs[0]
  const count = allocs.length
  const opCount = totalServices ?? count // "운영 서비스" 필드는 전체 보유 수(필터 시에도 진짜 운영 수)
  const first = allocs[0]
  const svcName = count > 1 ? `${first?.serviceName} 외 ${count - 1}개 서비스` : (first?.serviceName ?? '할당 서비스')
  const server = gpuAlloc?.serverHost ?? '—'
  const gpuLabel = gpuAlloc?.gpuModel ? `${gpuAlloc.gpuModel}${gpuAlloc.allocMode === 'mig' ? ' · MIG' : ''}` : 'MIG 슬라이스'
  // 모델은 ID(m8) 대신 모델명(SDXL)으로 — 정적 메타 modelById 매핑, 실패 시 ID 폴백
  const model = first?.modelId ? (modelById(first.modelId)?.name ?? first.modelId) : '—'
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
              <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>{count > 1 ? '서비스 환경' : '서비스명'}</div>
              <div className="font-bold text-text truncate" style={{ fontSize: 17, lineHeight: 1.3, marginTop: 2 }}>{svcName}</div>
            </div>
          </div>
          <div className="flex items-end justify-between" style={{ marginTop: 18, paddingRight: 32 }}>
            <HeroField label="서비스 ID" value={first?.serviceId ?? '—'} />
            <HeroField label="운영 서비스" value={`${opCount}개`} />
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

// 막대가 천장까지 닿지 않도록 헤드룸(약 1.6×)을 준 "보기 좋은" y축 최대값.
//  예) 데이터 max 10 → 축 max 20(가장 큰 막대 ~50% 높이). 1/1.5/2/2.5/3/4/5/6/8/10 자리로 라운드업.
function niceChartMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1
  const target = rawMax * 1.6
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  const n = target / pow
  const niceN = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10
  return niceN * pow
}

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
function BarCard({ data, serviceIds }: { data?: ServiceTokens; serviceIds: string[] }) {
  const allServices = data?.services ?? []
  const allBars = data?.bars ?? []
  const totalCount = allServices.length
  // 선택 자원에 속한 서비스 컬럼들(여러 서비스면 다중 시리즈). 매칭 없으면 폴백으로 전부.
  const matched = serviceIds.map((id) => allServices.findIndex((s) => s.id === id)).filter((i) => i >= 0)
  const cols = matched.length ? matched : allServices.map((_, i) => i)
  const single = cols.length === 1

  const services = cols.map((i) => allServices[i])
  const bars = allBars.map((g) => cols.map((i) => g[i] ?? 0))
  const series = services.map((s, k) => ({ name: s.name, color: BAR_COLORS[cols[k] % BAR_COLORS.length] }))
  // y축 max = 현재 보이는 막대의 최댓값에 헤드룸을 준 nice 값 → 막대가 천장까지 안 뻗고 ~50~60% 높이
  const visMax = bars.length ? Math.max(...bars.flat()) : 0
  const max = niceChartMax(visMax)
  const yLabels = [`${max}`, `${Math.round((max * 2) / 3)}`, `${Math.round(max / 3)}`, '0']

  // 선택 자원 점유율 비례로 총량·요청수 환산
  const sums = allServices.map((_, i) => allBars.reduce((a, g) => a + (g[i] ?? 0), 0))
  const grand = sums.reduce((a, b) => a + b, 0) || 1
  const share = matched.length ? cols.reduce((a, i) => a + sums[i], 0) / grand : 1
  const total = Math.round((data?.total ?? 0) * share)
  const calls = Math.round((data?.calls ?? 0) * share)
  const focusName = single ? services[0]?.name ?? '-' : `${services[0]?.name ?? '-'} 외 ${services.length - 1}개`
  return (
    <section className="bg-card2 border border-line rounded-[14px] flex flex-col min-w-0" style={{ boxShadow: 'var(--shadow-card)', padding: 18 }}>
      <header className="flex items-center gap-3 shrink-0">
        <h3 className="font-bold text-text" style={{ fontSize: 15 }}>서비스 토큰 사용량</h3>
        <span className="inline-flex items-center rounded-[6px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', padding: '3px 8px', fontSize: 14 }}>{focusName}</span>
        <span className="ml-auto text-muted" style={{ fontSize: 14 }}>최근 24시간</span>
      </header>
      <div className="flex gap-5 flex-1 min-h-0" style={{ marginTop: 14 }}>
        {/* 차트 영역 */}
        <div className="flex flex-col min-w-0" style={{ flex: '1 1 0' }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0" style={{ marginBottom: 18 }}>
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
              <span className="font-bold text-text" style={{ fontSize: 21, lineHeight: 1.1, letterSpacing: '-0.3px' }}>{total.toLocaleString()}</span>
              <span className="text-muted" style={{ fontSize: 14 }}>Tokens/h</span>
            </div>
          </div>
          {/* 선택 자원 */}
          <div className="min-w-0" style={{ marginTop: 16 }}>
            <div className="text-muted" style={{ fontSize: 14, lineHeight: 1.2 }}>선택 자원</div>
            <div className="font-bold text-text truncate" style={{ fontSize: 15, lineHeight: 1.2, marginTop: 4 }}>{focusName}</div>
            <div className="text-muted" style={{ fontSize: 14, marginTop: 2 }}>{single ? '단일 서비스 보기' : `${services.length}개 서비스`}</div>
          </div>
          <div style={{ height: 1, background: 'var(--c-border)', margin: '16px 0' }} />
          {/* 요청·서비스 지표 */}
          <div className="flex flex-col" style={{ gap: 11 }}>
            <StatRow label="총 요청 횟수" value={String(calls)} unit="회/h" />
            <StatRow label="운영 서비스" value={String(totalCount)} unit="개" />
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
function EventLogCard({ gpuId, serverId }: { gpuId?: string; serverId?: string }) {
  const toast = useToast()
  const { data } = useEvents({ gpuId, serverId, limit: 8 })
  const events: { time: string; level: EvLevel; msg: string }[] = (data ?? []).map((e) => ({
    time: fmtReqDate(e.createdAt),
    level: e.severity === 'warn' || e.severity === 'critical' ? '경고' : '정보',
    msg: e.message,
  }))
  // 데이터가 없어도 그리드(행 hairline)는 유지 → 고정 슬롯 8개, 빈 슬롯은 placeholder
  const ROW_SLOTS = 8
  const rows = Array.from({ length: ROW_SLOTS }, (_, i) => events[i] ?? null)
  const isEmpty = events.length === 0
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
      <div className="relative flex-1 min-h-0 flex flex-col">
        {rows.map((e, i) => (
          <div key={i} className="flex items-center flex-1" style={{ minHeight: 32, borderBottom: i < ROW_SLOTS - 1 ? '1px solid var(--c-border-s)' : 'none' }}>
            {e ? (
              <>
                <span className="shrink-0 text-muted" style={{ width: 150, fontSize: 14 }}>{e.time}</span>
                <span className="shrink-0" style={{ width: 64 }}>
                  <span className="inline-flex items-center rounded-[5px] font-semibold" style={{ background: EV_BADGE[e.level].bg, color: EV_BADGE[e.level].fg, padding: '2px 8px', fontSize: 14 }}>{e.level}</span>
                </span>
                <span className="flex-1 min-w-0 truncate text-text" style={{ fontSize: 14, opacity: 0.86, paddingRight: 8 }}>{e.msg}</span>
              </>
            ) : (
              <span className="shrink-0 text-muted" style={{ width: 150, fontSize: 14, opacity: 0.3 }}>—</span>
            )}
          </div>
        ))}
        {/* 전부 비었을 때만 그리드 위에 안내 오버레이(그리드는 그대로 노출) */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted" style={{ fontSize: 14 }}>표시할 이벤트가 없습니다</span>
          </div>
        )}
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

// ════════════════════════════════════════════════════════════════════
// 4.5 자원 선택 스위처 — 헤더 검색형 드롭다운(G2 자체). resource-map 셀렉터와 시각 통일.
//  · 옵션 = 내가 할당받은 자원(= 할당 시 서비스명) · 항목: 상태 dot·서비스명·GPU·주력·현재 체크
//  · 선택 시 KPI·토큰차트·HeroCard·이벤트로그가 그 자원 기준 (집계 "전체"는 없음 — 자원 단위 조회)
//  · 자원 1개 이하면 호출부에서 숨김 · 텍스트 전부 ≥14px
// ════════════════════════════════════════════════════════════════════
interface SvcOption { id: string; name: string; gpu: string } // id = 자원 key

function SwitchDot({ on }: { on: boolean }) {
  return on ? (
    <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-ok)', boxShadow: '0 0 0 3px var(--ok-soft)' }} />
  ) : (
    <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--c-muted)' }} />
  )
}

function SwitchRow({ selected, dot, name, badge, right, onClick }: { selected: boolean; dot: boolean; name: string; badge: string | null; right: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex items-center w-full text-left transition-colors hover:bg-[var(--accent-soft)]"
      style={{ gap: 10, minHeight: 40, padding: '7px 10px', borderRadius: 9, background: selected ? 'var(--accent-soft)' : 'transparent' }}
    >
      <SwitchDot on={dot} />
      <span className="font-medium truncate" style={{ fontSize: 14, flex: 1, color: selected ? 'var(--c-accent)' : 'var(--c-text)' }}>{name}</span>
      {badge && (
        <span className="inline-flex items-center rounded-[5px] font-semibold shrink-0" style={{ fontSize: 14, padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{badge}</span>
      )}
      <span className="text-muted shrink-0 truncate text-right" style={{ fontSize: 14, maxWidth: 140 }}>{right}</span>
      <span className="shrink-0 flex items-center justify-center" style={{ width: 16 }}>
        {selected && <CheckIcon style={{ width: 16, height: 16, color: 'var(--c-accent)' }} />}
      </span>
    </button>
  )
}

function ServiceSwitcher({ options, value, onChange }: { options: SvcOption[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const current = options.find((o) => o.id === value)
  const pick = (v: string) => { onChange(v); setOpen(false) }

  return (
    <div ref={ref} className="relative" style={{ width: 200 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="bg-card2 flex items-center w-full transition-colors hover:border-[var(--c-accent)]"
        style={{ height: 38, padding: '0 12px', gap: 8, borderRadius: 10, border: `1px solid ${open ? 'var(--c-accent)' : 'var(--c-line)'}`, boxShadow: 'var(--shadow-card)' }}
      >
        <SwitchDot on />
        <span className="font-semibold text-text truncate" style={{ fontSize: 14, flex: 1, textAlign: 'left' }}>{current?.name ?? '자원 선택'}</span>
        <ChevronDownIcon className="shrink-0 transition-transform duration-200" style={{ width: 16, height: 16, color: 'var(--c-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div
          role="listbox"
          className="bg-card2 anim-fade absolute"
          style={{ top: 'calc(100% + 8px)', right: 0, width: 340, maxWidth: 'min(92vw, 400px)', padding: 6, borderRadius: 12, border: '1px solid var(--c-line)', boxShadow: 'var(--shadow-pop)', zIndex: 40 }}
        >
          <div className="text-muted font-medium" style={{ fontSize: 14, padding: '4px 10px 6px' }}>할당 자원</div>
          {options.map((o) => (
            <SwitchRow key={o.id} selected={value === o.id} dot name={o.name} badge={null} right={o.gpu} onClick={() => pick(o.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function MyResources() {
  const { user, access } = useRole()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { data: allocs } = useAllocations(access === 'C' ? null : user.id)
  const { data: tokens } = useServiceTokens(access === 'C' ? null : user.id)
  const [selected, setSelected] = useState<string>('')

  // 자원(= 할당된 GPU) 단위로 그룹. 한 자원에 여러 서비스가 있으면 "외 N개"로 표기.
  //  · 자원 key = gpuId(있으면) · GPU 없는 서비스는 각자 1자원(svc:id)
  //  · 진입 기본 = 사용량(usageCount) 합 최다 자원
  const resources = useMemo(() => {
    const rows = allocs ?? []
    const byKey = new Map<string, AllocationRow[]>()
    const order: string[] = []
    for (const a of rows) {
      const key = a.gpuId ?? `svc:${a.serviceId}`
      if (!byKey.has(key)) { byKey.set(key, []); order.push(key) }
      byKey.get(key)!.push(a)
    }
    return order.map((key) => {
      const group = byKey.get(key)!
      const first = group[0]
      const name = group.length > 1 ? `${first.serviceName} 외 ${group.length - 1}개` : first.serviceName
      const gpu = first.gpuModel ? `${first.gpuModel}${first.allocMode === 'mig' ? ' · MIG' : ''}` : 'GPU 미할당'
      const usage = group.reduce((s, x) => s + (x.usageCount ?? 0), 0)
      return { key, name, gpu, group, usage, serviceIds: group.map((g) => g.serviceId) }
    })
  }, [allocs])

  const svcOptions = useMemo<SvcOption[]>(() => resources.map((r) => ({ id: r.key, name: r.name, gpu: r.gpu })), [resources])

  // 기본 = 사용량 최다 자원. 선택값이 없거나 사라지면 폴백.
  const primaryKey = resources.length ? resources.reduce((b, r) => (r.usage > b.usage ? r : b)).key : ''
  const effSelected = resources.some((r) => r.key === selected) ? selected : primaryKey
  const current = resources.find((r) => r.key === effSelected)
  const viewAllocs = current?.group ?? []
  // KPI 기준 GPU: 선택 자원의 GPU(없으면 보류→0)
  const gpuAlloc = viewAllocs.find((a) => a.gpuId)
  const totalServices = new Set((allocs ?? []).map((a) => a.serviceId)).size
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
          {svcOptions.length > 1 && (
            <>
              <span className="shrink-0 text-muted font-medium" style={{ fontSize: 14 }}>자원 선택</span>
              <ServiceSwitcher options={svcOptions} value={effSelected} onChange={setSelected} />
              <span className="shrink-0" style={{ width: 1, height: 22, background: 'var(--c-border)' }} />
            </>
          )}
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

      {/* 2) 할당 요약 — 고정 높이(Figma 140). 선택한 자원(서비스)의 환경 요약 */}
      <div className="shrink-0" style={{ marginTop: 20 }}>
        <HeroCard allocs={viewAllocs} totalServices={totalServices} />
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
          <BarCard data={tokens ?? undefined} serviceIds={current?.serviceIds ?? []} />
          <EventLogCard gpuId={gpuAlloc?.gpuId ?? undefined} serverId={gpuAlloc?.serverId ?? undefined} />
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
  procDate: string
  allocPath?: string // 승인 행 '자원 보기' 딥링크(/resource-map/:serverId/:gpuId), 도출 불가 시 undefined
}

// 신청(RequestItem: DB + 시드 폴백 + 로컬 신규) → 화면 행 변환. 확장 필드는 optional — '—' 폴백.
const STATUS_KR: Record<RequestItem['status'], ReqStatus> = { pending: '대기', approved: '승인', rejected: '반려' }
function fmtReqDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function toReqRow(r: RequestItem, isAdmin: boolean): ReqRow {
  const status = STATUS_KR[r.status] ?? '대기'
  const unit = r.capacityUnit === 'slice' ? '슬라이스' : 'GPU'
  const date = fmtReqDate(r.createdAt)
  return {
    no: r.id,
    resource: `${r.capacity} ${unit}`,
    model: r.models?.[0] ? (modelById(r.models[0])?.name ?? r.models[0]) : '-',
    reason: r.purpose || r.serviceName || '-',
    date,
    status,
    procDate: r.processedAt ? fmtReqDate(r.processedAt) : '—',
    allocPath: allocationLink(r, isAdmin) ?? undefined,
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
  { key: 'action', label: '액션', width: 196 },
] as const

interface ReqFilter { q: string; status: string; type: string; start: string; end: string }
const EMPTY_FILTER: ReqFilter = { q: '', status: '전체', type: '전체', start: '', end: '' }
function matchReq(r: ReqRow, f: ReqFilter): boolean {
  if (f.q.trim() && !`${r.no} ${r.resource} ${r.model} ${r.reason}`.toLowerCase().includes(f.q.trim().toLowerCase())) return false
  if (f.status !== '전체' && r.status !== f.status) return false
  if (f.type !== '전체') {
    const isMig = r.resource.includes('슬라이스')
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
function ActionLink({ label, accent, Icon, onClick, disabled }: { label: string; accent?: boolean; Icon: IconType; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 font-medium rounded-[8px] cursor-pointer transition-[transform,background-color,box-shadow] duration-100 active:enabled:scale-95 whitespace-nowrap hover:enabled:shadow-[0_1px_3px_rgba(0,0,0,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
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

// KPI 카드 — 공용 KpiStat + 상태색 아이콘 박스. 값은 실데이터 카운트(computeStats).
function StatKpi({ s }: { s: StatDef }) {
  const { Icon } = s
  return (
    <KpiStat
      label={s.label}
      value={s.value}
      sub={s.desc}
      icon={
        <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: s.box, color: s.num }}>
          <Icon style={{ width: 17, height: 17 }} />
        </span>
      }
    />
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

// 신규 신청 마법사 → /requests/new (request-new.tsx) · 신청 상세 모달 → /requests/status/:id (request-detail.tsx)로 승격.
export function RequestStatus() {
  const toast = useToast()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { user, isAdmin } = useRole()
  // A=전체 신청, B/C=내 신청만(requester=나). DB 우선 · backend 미기동 시 시드 폴백 · 로컬 신규 신청(4.6b 제출) 병합.
  const { items: reqItems, isLoading } = useRequests(isAdmin ? undefined : user.id)
  const rows = useMemo(() => reqItems.map((it) => toReqRow(it, isAdmin)), [reqItems, isAdmin])
  const total = rows.length
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

  const openDetail = (r: ReqRow) => navigate(`/requests/status/${r.no}`)

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      {/* 1) 헤더 — 제목 + 부제 (신규 신청 버튼은 표 카드 헤더로 이동) */}
      <header className="flex flex-col min-w-0 shrink-0">
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>자원 신청현황</h1>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8 }}>
          자원 신청의 승인 상태, 반려 사유 및 최근 처리 내역을 확인할 수 있습니다.
        </p>
      </header>

      {/* 2) KPI 4카드(전체/대기/승인/반려) — 공용 KpiStat · 실데이터 카운트 */}
      <div className="grid stagger shrink-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
        {computeStats(rows).map((s) => (
          <StatKpi key={s.label} s={s} />
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
        {/* 카드 헤더: 제목(좌) + 신규 신청(우) — /requests/new 페이지로 이동 */}
        <div className="flex items-center justify-between gap-3 shrink-0" style={{ padding: '16px 24px' }}>
          <h2 className="font-bold text-text" style={{ fontSize: 16 }}>내 신청 현황</h2>
          <NewRequestButton onClick={() => navigate('/requests/new')} />
        </div>

        {/* 로딩 중(첫 fetch 미완) — 빈 상태 대신 로딩 표시. 영역 높이는 테이블과 동일 유지 */}
        {isLoading && total === 0 ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <span className="text-muted" style={{ fontSize: 14 }}>신청 내역을 불러오는 중…</span>
          </div>
        ) : total === 0 ? (
          /* 빈 상태(신청 0건) — 안내 + 신규 신청 CTA 중앙 */
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <EmptyState
              icon={<DocumentTextIcon width={26} height={26} />}
              title="아직 신청한 자원이 없어요"
              description="신규 신청으로 GPU 자원을 요청하면 승인 상태와 처리 내역을 이곳에서 확인할 수 있어요."
              cta={<Button onClick={() => navigate('/requests/new')}>신규 신청</Button>}
            />
          </div>
        ) : (
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
                  <td colSpan={8} className="text-muted text-center" style={{ fontSize: 14, padding: '40px 0' }}>
                    검색 결과가 없어요. 검색어나 필터를 조정해보세요.
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr
                  key={r.no}
                  className="cursor-pointer"
                  onClick={() => openDetail(r)}
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
                  {/* 상태 = 배지 */}
                  <td className="align-middle" style={{ padding: '15px 0' }}>
                    <StatBadge status={r.status} />
                  </td>
                  {/* 최근 처리 = 일시 */}
                  <td className="align-middle" style={{ padding: '15px 0' }}>
                    <span className="truncate text-muted" style={{ fontSize: 14 }}>{r.procDate}</span>
                  </td>
                  {/* 액션 — 승인=자원 보기(자원맵 딥링크, 도출 불가 시 비활성) / 모두 상세 보기(/requests/status/:id) */}
                  <td className="align-middle" style={{ padding: '15px 0', paddingRight: 24 }}>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {r.status === '승인' && (
                        <ActionLink label="자원 보기" accent Icon={ArrowTopRightOnSquareIcon} disabled={!r.allocPath} onClick={(e) => { e.stopPropagation(); if (r.allocPath) navigate(r.allocPath) }} />
                      )}
                      <ActionLink label="상세 보기" Icon={EyeIcon} onClick={(e) => { e.stopPropagation(); openDetail(r) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

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
    </div>
  )
}

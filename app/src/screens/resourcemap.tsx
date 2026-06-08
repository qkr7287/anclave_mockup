import { useMemo, useState } from 'react'
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
} from '../components/ui'
import { LineChart, ServerHexMap, bandColor } from '../components/charts'
import type { ServerRegion, Bay } from '../components/charts'
import { ServerIcon, CpuChipIcon, ChartBarSquareIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { servers, serverById, allGpus, userById, modelById, gpuRequests } from '../data'
import type { Gpu, MigSlice, EventLog, Service, GpuServer } from '../data/types'
import {
  serverAvgUtil,
  serverActiveGpus,
  gpuServices,
  serviceOfSlice,
  serverEvents,
  gpuEvents,
  vramUsedMb,
  fmtNum,
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
                  <span style={{ fontSize: 14, color: 'var(--c-muted)' }}> / {b.total}</span>
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
        <span className="text-muted truncate" style={{ fontSize: 14, textDecoration: 'underline' }}>{link}</span>
      </div>
      <div className="flex flex-col items-end justify-between shrink-0">
        <span className="font-semibold" style={{ fontSize: 14, color: dc }}>{delta}</span>
        <span className="flex items-center justify-center rounded-md" style={{ width: 44, height: 44, background: deltaTone === 'up' ? 'var(--ok-soft)' : 'var(--danger-soft)', color: dc }}>{icon}</span>
      </div>
    </div>
  )
}

function Legend({ c, label }: { c: string; label: string }) {
  return <span className="inline-flex items-center" style={{ gap: 5, fontSize: 14 }}><span className="rounded-full" style={{ width: 9, height: 9, background: c }} /><span className="text-muted">{label}</span></span>
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

// 미니 스파크라인 — 카드 내부 사용 추이(차트 축 없음, 면+선). fill=true면 컨테이너 높이를 꽉 채움(빈 공간 제거)
function MiniSpark({ data, color, h = 28, fill = false }: { data: number[]; color: string; h?: number; fill?: boolean }) {
  const W = 100
  const H = fill ? 40 : h // viewBox 내부 좌표 기준(preserveAspectRatio none으로 컨테이너에 늘어남)
  const top = Math.max(1, ...data)
  const bot = Math.min(...data)
  const span = Math.max(1, top - bot)
  const n = data.length
  const x = (i: number) => (n <= 1 ? 0 : (i * W) / (n - 1))
  const y = (v: number) => 2 + (1 - (v - bot) / span) * (H - 4)
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: fill ? '100%' : h, display: 'block' }} aria-hidden>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={color} opacity={0.13} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

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
    ? ['7g.80gb · 클러스터']
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
            {/* 사용 추이 — 2개+면 카드 남는 높이를 채우고(딱 맞게), 1개면 고정(거대화 방지) */}
            {single
              ? <div className="min-w-0"><MiniSpark data={spark} color={isTop ? 'var(--c-accent)' : 'var(--c-accent2)'} h={48} /></div>
              : <div className="flex-1 min-h-0 min-w-0" style={{ minHeight: 40 }}><MiniSpark data={spark} color={isTop ? 'var(--c-accent)' : 'var(--c-accent2)'} fill /></div>}
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

// ───────────────────────── 4.3 단일 서버 (Figma '단일 서버 모니터링' node 6:3653 픽셀 매칭) ─────────────────────────

// 180° 반달(반원) 게이지 — 서버 현황(CPU 사용량·RAM 사용량·GPU 평균) · Figma node 6:3653
function RingGauge({ value, title, sub }: { value: number; title: string; sub: ReactNode }) {
  const W = 184, H = 104
  const cx = W / 2, cy = 92, r = 76, sw = 14
  const START = 270, SWEEP = 180 // 상단 반원(반달)
  const ratio = Math.min(1, Math.max(0, value / 100))
  // deg: 0=상단(12시), 시계방향 증가
  const pt = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
  }
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = pt(fromDeg)
    const [x2, y2] = pt(toDeg)
    const large = toDeg - fromDeg > 180 ? 1 : 0
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
  }
  const gid = `rg-${title.replace(/\s/g, '')}`
  return (
    <div className="flex flex-col items-center min-w-0" style={{ gap: 8 }}>
      <span className="font-semibold truncate max-w-full" style={{ fontSize: 16, color: '#5B6480' }}>{title}</span>
      <div className="relative" style={{ width: W, height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#206DE7" />
              <stop offset="100%" stopColor="#5C9FFA" />
            </linearGradient>
          </defs>
          <path d={arc(START, START + SWEEP)} fill="none" stroke="var(--c-track)" strokeWidth={sw} strokeLinecap="round" />
          <path d={arc(START, START + SWEEP * ratio)} fill="none" stroke={`url(#${gid})`} strokeWidth={sw} strokeLinecap="round" />
        </svg>
        {/* 숫자 — 반원 안쪽 하단 중앙 */}
        <div className="absolute inset-x-0 flex items-baseline justify-center" style={{ top: cy - 40 }}>
          <span className="font-bold tabular-nums" style={{ fontSize: 36, lineHeight: 1 }}>{Math.round(value)}</span>
          <span style={{ fontSize: 18, color: '#5B6480', marginLeft: 1 }}>%</span>
        </div>
      </div>
      <span className="inline-flex items-center rounded-full border border-line whitespace-nowrap" style={{ gap: 7, padding: '4px 13px', fontSize: 14 }}>
        <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: 'var(--c-accent)' }} />
        {sub}
      </span>
    </div>
  )
}

// 부하 추이 — Figma: 헤더 우측 범례 · 0~80 축. 툴팁은 호버 시에만(LineChart 내장 Recharts Tooltip).
const LOAD_COL = { cpu: 'var(--c-accent)', mem: 'var(--c-accent2)', gpu: '#c74ddb' }
function LoadTrend({ cpu, mem, gpu }: { cpu: number[]; mem: number[]; gpu: number[] }) {
  return (
    <section className="bg-card2 border border-line rounded-xl overflow-hidden flex flex-col min-w-0 min-h-0" style={{ boxShadow: 'var(--shadow-card)' }}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
        <h3 className="text-[14px] font-bold truncate">부하 추이</h3>
        <div className="flex items-center shrink-0" style={{ gap: 14 }}>
          <Legend c={LOAD_COL.cpu} label="CPU" /><Legend c={LOAD_COL.mem} label="RAM" /><Legend c={LOAD_COL.gpu} label="GPU" />
        </div>
      </header>
      <div className="flex-1 min-h-0 min-w-0" style={{ padding: 10 }}>
        <LineChart max={80} labels={HOUR_LABELS}
          series={[{ data: cpu, color: LOAD_COL.cpu, label: 'CPU' }, { data: mem, color: LOAD_COL.mem, label: 'RAM' }, { data: gpu, color: LOAD_COL.gpu, label: 'GPU' }]} />
      </div>
    </section>
  )
}

// 상단 GPU 카드 — 아이콘·이름·상태 / 모드·작업률·VRAM·온도(Figma Card General · node 6:3811)
function ServerGpuCard({ gpu, onClick }: { gpu: Gpu; onClick: () => void }) {
  const danger = !!gpu.xid
  const tempHot = gpu.temp > 80
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
        <Row k="모드"><span className="rounded shrink-0 font-semibold" style={{ fontSize: 14, padding: '2px 10px', border: '1px solid var(--c-border)', color: gpu.allocMode === 'cluster' ? 'var(--c-accent)' : '#919BC7' }}>{gpu.allocMode === 'cluster' ? 'NVLink' : 'MIG'}</span></Row>
        <Row k="작업률"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: '#919BC7' }}>{gpu.smUtil}%</span></Row>
        <Row k="VRAM"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: '#919BC7' }}>{gpu.vramUtil}%</span></Row>
        <Row k="온도"><span className="font-semibold tabular-nums" style={{ fontSize: 16, color: tempHot ? '#FCBB2A' : '#919BC7' }}>{gpu.temp}°C</span></Row>
      </div>
    </button>
  )
}

// 서버 섀시 최대 GPU 슬롯 — 2/4장 노드=4슬롯, 8장 노드=8슬롯. 카드 행을 이 칸수로 등분.
const gpuSlotCount = (count: number) => (count <= 4 ? 4 : 8)

// 빈 GPU 슬롯 — 장착 안 된 베이(빗금·점선)
function EmptyGpuSlot() {
  return (
    <div className="rounded-[10px] flex flex-col items-center justify-center text-center min-w-0" style={{ border: '1px dashed var(--c-border)', backgroundImage: MIG_HATCH, gap: 5 }}>
      <CpuChipIcon width={20} height={20} style={{ color: 'var(--c-muted)', opacity: 0.5 }} />
      <span className="text-muted font-medium" style={{ fontSize: 13 }}>빈 슬롯</span>
    </div>
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
          const totalGb = g.allocMode === 'cluster' ? 80 : (g.slices?.reduce((a, sl) => a + sl.gb, 0) ?? 80)
          const usedGb = !active ? 0 : g.allocMode === 'cluster'
            ? Math.round((g.vramUtil / 100) * 80 * 10) / 10
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
  const server = serverById(serverId)
  if (!server) return <Navigate to="/resource-map" replace />

  const avgUtil = serverAvgUtil(server)
  const cpuS = trend(server.cpuUtil, 24, 14, 3)
  const memS = trend(server.memUtil, 24, 10, 7)
  const gpuS = trend(avgUtil, 24, 16, 11)
  const seed = seedOf(server.id)
  const svcCount = new Set(server.gpus.flatMap((g) => gpuServices(g).map((s) => s.id))).size
  const info: [string, string][] = [
    ['서버 ID', server.name],
    ['서버 유형', 'GPU Server'],
    ['CPU', 'Intel Xeon 8358P'],
    ['RAM', '512 GB'],
    ['스토리지', '7.2 TB (NVMe)'],
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
      bays = [{ util: g.smUtil, tip: `${g.name} · NVLink 클러스터(7g.80gb) · ${svc ? svc.name : '미할당'} · 부하 ${g.smUtil}%` }]
    } else {
      bays = g.slices.map((s) => {
        const used = s.usage > 0 || !!s.ownerUserId
        const owner = s.ownerUserId ? userById(s.ownerUserId)?.name : undefined
        const req = s.requestId ? gpuRequests.find((r) => r.id === s.requestId) : undefined
        return { util: s.usage, idle: !used, tip: used ? `${owner ?? '—'} · ${req?.serviceName ?? '신청'} · ${s.profile} ${s.gb}GB · 부하 ${s.usage}%` : `가용 · ${s.profile} ${s.gb}GB` }
      })
    }
    const usedSl = g.slices?.filter((s) => s.usage > 0 || s.ownerUserId).length ?? (g.allocMode === 'cluster' ? 1 : 0)
    const rtip = `${g.name} · ${g.allocMode === 'cluster' ? 'NVLink 클러스터' : `MIG ${g.slices?.length ?? 0}분할(${usedSl} 사용)`} · ${g.xid ? g.xid : `${g.smUtil}%`}`
    return { id: g.id, label: g.name.replace('H100-', '#'), health: regHealth, outline: hueLine(hue), regionTip: rtip, bays, onClick: go }
  })

  return (
    <>
      <PageShell fill bare screen="4.3">
        <div className="flex flex-col h-full min-h-0" style={{ gap: 12 }}>
          {/* 헤더 — 랙명 · 상태 · GPU 수 */}
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <h2 className="font-bold truncate" style={{ fontSize: 18 }}>{server.name}</h2>
            <HealthBadge health={server.health} />
            <span className="rounded-full border border-line text-muted shrink-0" style={{ fontSize: 14, padding: '2px 11px' }}>GPU {server.gpus.length}장</span>
          </div>

          {/* ① GPU 카드 행 — 서버 최대 슬롯 수로 등분. 장착된 GPU는 자기 칸에, 나머지는 빈 슬롯 */}
          <div className="grid shrink-0 min-w-0" style={{ gridTemplateColumns: `repeat(${gpuSlotCount(server.gpus.length)}, minmax(0, 1fr))`, gap: 12 }}>
            {server.gpus.map((g) => <ServerGpuCard key={g.id} gpu={g} onClick={() => navigate(`/resource-map/${server.id}/${g.id}`)} />)}
            {Array.from({ length: gpuSlotCount(server.gpus.length) - server.gpus.length }, (_, i) => <EmptyGpuSlot key={`slot-${i}`} />)}
          </div>

          {/* ②부하추이 · ③서버현황(게이지) · ④서버정보 */}
          <div className="grid shrink-0" style={{ gridTemplateColumns: '1.15fr 1.35fr 1fr', gap: 12, height: 288 }}>
            <LoadTrend cpu={cpuS} mem={memS} gpu={gpuS} />
            <Card title="서버 현황" action={<span className="inline-flex items-center rounded border border-line text-muted" style={{ gap: 6, fontSize: 14, padding: '3px 10px' }}>전체 서버 <span style={{ fontSize: 11 }}>▾</span></span>}>
              <div className="flex items-center justify-around h-full rounded-lg" style={{ gap: 8, background: 'var(--c-soft)', padding: '14px 8px' }}>
                <RingGauge value={server.cpuUtil} title="CPU 사용량" sub={<span style={{ fontSize: 14 }}><span className="text-muted">사용율</span> <span className="font-semibold tabular-nums" style={{ color: 'var(--c-accent)' }}>{Math.round((server.cpuUtil / 100) * 128)}</span> <span className="text-muted">/ 128 core</span></span>} />
                <RingGauge value={server.memUtil} title="RAM 사용량" sub={<span style={{ fontSize: 14 }}><span className="text-muted">사용율</span> <span className="font-semibold tabular-nums" style={{ color: 'var(--c-accent)' }}>{Math.round((server.memUtil / 100) * 640)}</span> <span className="text-muted">/ 640 GB</span></span>} />
                <RingGauge value={avgUtil} title="GPU 평균" sub={<span style={{ fontSize: 14 }}><span className="text-muted">실행중</span> <span className="font-semibold tabular-nums" style={{ color: 'var(--c-accent)' }}>{serverActiveGpus(server)} GPU</span> <span className="text-muted">/ {svcCount} 서비스</span></span>} />
              </div>
            </Card>
            <Card title="서버 정보">
              {/* Figma: 라벨 좌(muted) · 값 좌(고정 열·흰색) · hairline 없음 · 넉넉한 행 간격 */}
              <div className="flex flex-col h-full justify-between" style={{ paddingBlock: 2 }}>
                {info.map(([k, v]) => (
                  <div key={k} className="grid items-center min-w-0" style={{ gridTemplateColumns: '92px 1fr', columnGap: 16 }}>
                    <span className="shrink-0" style={{ fontSize: 15, color: '#5B6480' }}>{k}</span>
                    <span className="font-medium truncate min-w-0" style={{ fontSize: 15 }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

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

      <FloatingButtons target={server.name} onEventLog={() => setDrawer(true)} />
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={`${server.name} 이벤트 로그`}><EventList rows={serverEvents(server.id)} /></Drawer>
    </>
  )
}

// ───────────────────────── 4.4 GPU 상세 ─────────────────────────

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
    { tone: 'info', kind: '슬라이스 재할당', who: nm(1), desc: '1g.10gb → 2g.20gb 승급', ago: '2시간 전' },
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
  const { serverId = '', gpuId = '' } = useParams()
  const [drawer, setDrawer] = useState(false)
  const server = serverById(serverId)
  const gpu = server?.gpus.find((g) => g.id === gpuId)
  if (!server || !gpu) return <Navigate to="/resource-map" replace />

  const usedMb = vramUsedMb(gpu)
  // 결정적 가동시간(시드: 시리얼 숫자) — Math.random 미사용
  const serialNum = parseInt(gpu.serial.replace(/\D/g, '').slice(-4) || '0', 10)
  const upDays = (serialNum % 88) + 5
  const upHours = serialNum % 24
  // MIG 헤더 — N분할(표시 칸 수=분할+빈) · 사용(할당 컴퓨트 유닛)/7. 그리드와 동일 소스(migLayout)
  const mig = migLayout(gpu.slices ?? [])
  const migTitle = gpu.allocMode === 'cluster'
    ? '클러스터 할당 (NVLink · 7g.80gb)'
    : `슬라이스 분할 · MIG · ${mig.cells}분할 · 사용 ${mig.allocUnits}/${MIG_UNITS}`

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
            <KpiStat label="전력" value={gpu.power} unit="W" delta="TDP 700W" deltaTone="muted" gauge={Math.round((gpu.power / 700) * 100)} sub={`효율 ${Math.round((gpu.smUtil / Math.max(1, gpu.power)) * 100)}%`} />
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
            <Card title="VRAM 점유 (80GB · 32 세그먼트)" className="shrink-0">
              <VramSegments util={gpu.vramUtil} />
              <div className="flex items-center justify-between text-muted" style={{ fontSize: 14, marginTop: 8 }}><span>점유 {fmtNum(usedMb)} MB</span><span>여유 {fmtNum(H100_VRAM_MB - usedMb)} MB</span></div>
            </Card>
            {/* GPU 정보 = 하단. 좌: 사양(왼쪽으로 압축) / 우: 최근 활동 타임라인 */}
            <Card fill title="GPU 정보 · 최근 활동" style={{ flex: 1, minHeight: 0 }}>
              <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '0.82fr 1.18fr', gap: 18 }}>
                {/* 좌 — GPU 사양 */}
                <div className="grid h-full min-w-0" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, gridAutoRows: 'minmax(0, 1fr)' }}>
                  <Info k="모델" v="H100 80GB SXM5" />
                  <Info k="아키텍처" v="NVIDIA Hopper" />
                  <Info k="시리얼" v={gpu.serial} />
                  <Info k="분할 모드" v={gpu.allocMode === 'cluster' ? 'NVLink' : 'MIG'} />
                  <Info k="VRAM" v="80GB HBM3" />
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
      <span className="truncate font-semibold font-mono flex items-center" style={{ fontSize: 14, gap: 6 }}>
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
      {/* 블루(214) → 틸(188) 램프 — 전체 액센트와 통일(그린 이탈 제거) */}
      {Array.from({ length: 32 }, (_, i) => (
        <div key={i} style={{ height: 16, borderRadius: 2, background: i < filled ? `hsl(${214 - (i / 32) * 26}, 72%, 56%)` : 'var(--c-soft)' }} title={`세그먼트 ${i + 1}/32`} />
      ))}
    </div>
  )
}

// 미할당 빗금(가시성 강화)
const MIG_HATCH = 'repeating-linear-gradient(45deg, rgba(120,140,170,.22) 0 5px, rgba(120,140,170,.04) 5px 10px)'

const MIG_MEM_GB = 80 // H100 80GB

// MIG 분할 레이아웃 — 컴퓨트(≤7)·메모리(≤80GB) 둘 다 고려. 헤더·그리드가 같은 값을 쓰도록 단일 소스.
function migLayout(slices: MigSlice[]) {
  const partUnits = slices.reduce((sum, s) => sum + s.units, 0) // 분할에 쓰인 컴퓨트
  const partGb = slices.reduce((sum, s) => sum + s.gb, 0) // 분할에 쓰인 메모리
  const freeUnits = Math.max(0, MIG_UNITS - partUnits)
  const freeGb = Math.max(0, MIG_MEM_GB - partGb)
  // 빈 슬롯 = 컴퓨트·메모리 둘 다 남을 때만(메모리 소진 시 추가 분할 불가 → 빈 칸 없음)
  const hasEmpty = freeUnits >= 1 && freeGb >= 10
  const allocUnits = slices.filter((s) => s.usage > 0 || s.ownerUserId).reduce((sum, s) => sum + s.units, 0)
  const cells = slices.length + (hasEmpty ? 1 : 0) // 실제 표시 칸 수(분할+빈)
  const cols = partUnits + (hasEmpty ? freeUnits : 0) // 그리드 폭(빈 칸 없으면 분할만 → 빈틈 없음)
  return { freeUnits, freeGb, hasEmpty, allocUnits, cells, cols }
}

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
  // 그리드 폭 = 분할 컴퓨트(+빈 칸). 메모리 소진 시 빈 칸 없음 → 슬라이스가 폭을 빈틈없이 채움.
  const slices = gpu.slices ?? []
  const { hasEmpty, freeUnits, freeGb, cols } = migLayout(slices)
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

// 슬라이스 stat 인라인 단위 — "라벨 값" 한 덩어리(nowrap), flex-wrap에서 통째로 줄바꿈(잘림 없음)
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
            <div className="text-muted truncate font-mono" style={{ fontSize: 14 }}>{slice.containerId ?? '—'}</div>
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


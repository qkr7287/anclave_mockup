import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FoundationPage } from '../components/FoundationPage'
import { models, services } from '../data'
import type { Model } from '../data/types'

// G5 · 4.12 모델 카탈로그 — Figma '모델 카탈로그 (구현)'(node 9-2) 픽셀 매칭.
// 색=테마 토큰화(다크 Figma 정본 / 라이트 대응). 본문·라벨·배지 텍스트 14px floor(가이드 §2, 차트 축만 예외 허용이나 여기선 14로 통일).
// 콘텐츠=src/data 시드(models·services). 로고=Figma 실제 이미지(다운로드) + 무피그마 제공사는 브랜드 SVG 마크.

const K = {
  cardBg: 'var(--cat-card)',
  cardBorder: 'var(--cat-cardb)',
  innerBg: 'var(--cat-inner)',
  innerBorder: 'var(--cat-innerb)',
  track: 'var(--cat-track)',
  divider: 'var(--cat-divider)',
  tagBg: 'var(--cat-tagbg)',
  tagBorder: 'var(--cat-tagb)',
  tagText: 'var(--cat-tagtx)',
  popBg: 'var(--cat-popbg)',
  popText: 'var(--cat-poptx)',
  pillBg: 'var(--cat-pillbg)',
  pillBorder: 'var(--cat-pillb)',
  pillText: 'var(--cat-pilltx)',
  ctrlBg: 'var(--cat-ctrlbg)',
  ctrlBorder: 'var(--cat-ctrlb)',
  title: 'var(--cat-title)',
  name: 'var(--cat-name)',
  sub: 'var(--cat-sub)',
  desc: 'var(--cat-desc)',
  label: 'var(--cat-label)',
  axis: 'var(--cat-axis)',
  rank: 'var(--cat-rank)',
  muted: 'var(--cat-muted)',
  white: 'var(--cat-strong)',
  ok: 'var(--cat-ok)',
  accent: 'var(--cat-accent)',
  gridLine: 'var(--cat-grid)',
} as const

const BAR_COLORS = ['#3069f6', '#6c32f3', '#0abdc2', '#ff8913', '#ec4e8c']
const PAGE_SIZE = 8
const TOKENS_PER_REQ = 5400
const LOGO_TILE = '#182336'

// 무피그마 제공사 브랜드 SVG 마크(다크 타일 위 브랜드색 글리프) — Figma 다운 로고와 톤 일치.
const QwenMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#a07bff" strokeWidth="2.2" strokeLinecap="round" style={{ width: '100%', height: '100%' }}>
    <path d="M12 3.5v17M4.5 7.75l15 8.5M19.5 7.75l-15 8.5" />
  </svg>
)
const DeepSeekMark = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
    <path d="M3 14.5c2.4 0 3.4-2.2 6-2.2s3.6 2.2 6 2.2 3.4-2.6 6-2.6" stroke="#5b8cff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="18" cy="7.5" r="1.4" fill="#5b8cff" />
  </svg>
)
const StabilityMark = () => (
  <svg viewBox="0 0 24 24" style={{ width: '100%', height: '100%' }}>
    <rect x="3" y="10" width="3.2" height="10" rx="1.3" fill="#c43bff" />
    <rect x="8.4" y="5" width="3.2" height="15" rx="1.3" fill="#d96bff" />
    <rect x="13.8" y="12" width="3.2" height="8" rx="1.3" fill="#c43bff" />
    <rect x="19.2" y="7.5" width="3.2" height="12.5" rx="1.3" fill="#d96bff" />
  </svg>
)
const BaaiMark = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '100%', height: '100%' }}>
    <circle cx="12" cy="12" r="3.6" fill="#22c1a8" />
    <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-32 12 12)" stroke="#22c1a8" strokeWidth="1.8" />
  </svg>
)

interface Brand {
  name: string
  img?: string
  mark?: ReactNode
}
const BRAND: Record<string, Brand> = {
  m1: { name: 'Meta', img: '/logos/meta.png' },
  m9: { name: 'OpenAI', img: '/logos/openai.png' },
  m6: { name: 'Google', img: '/logos/google.png' },
  m4: { name: 'Mistral AI', img: '/logos/mistral.png' },
  m2: { name: 'Alibaba', mark: <QwenMark /> },
  m5: { name: 'Alibaba', mark: <QwenMark /> },
  m7: { name: 'Alibaba', mark: <QwenMark /> },
  m12: { name: 'Alibaba', mark: <QwenMark /> },
  m13: { name: 'Alibaba', mark: <QwenMark /> },
  m11: { name: 'Meta', img: '/logos/meta.png' },
  m3: { name: 'DeepSeek', mark: <DeepSeekMark /> },
  m8: { name: 'Stability AI', mark: <StabilityMark /> },
  m10: { name: 'BAAI', mark: <BaaiMark /> },
}
export const providerName = (id: string) => BRAND[id]?.name ?? '—'

export function Logo({ id, size = 38 }: { id: string; size?: number }) {
  const b = BRAND[id]
  const radius = size * 0.27
  if (b?.img) {
    return (
      <img
        src={b.img}
        alt=""
        width={size}
        height={size}
        aria-hidden
        style={{ width: size, height: size, borderRadius: radius, display: 'block', flexShrink: 0 }}
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: radius, background: LOGO_TILE }}
      aria-hidden
    >
      <span style={{ width: size * 0.6, height: size * 0.6, display: 'flex' }}>{b?.mark}</span>
    </span>
  )
}

const TOTAL_USAGE = models.reduce((a, m) => a + m.usageCount, 0)
const SERVED = new Set(services.map((s) => s.model))

const BASE_DATE = new Date('2026-06-08T00:00:00')
function updatedAt(rank: number): string {
  const d = new Date(BASE_DATE)
  d.setDate(d.getDate() - (rank - 1) * 8 - 3)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const fmtReq = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`
const fmtTok = (n: number) =>
  n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(2)}B`
    : n >= 1_000_000
      ? `${Math.round(n / 1_000_000)}M`
      : `${Math.round(n / 1000)}K`

interface CatModel {
  m: Model
  provider: string
  share: number
  requests: number
  tokens: number
  updated: string
  tags: string[]
  served: boolean
}

const CATALOG: CatModel[] = [...models]
  .sort((a, b) => a.usageRank - b.usageRank)
  .map((m) => ({
    m,
    provider: providerName(m.id),
    share: (m.usageCount / TOTAL_USAGE) * 100,
    requests: m.usageCount,
    tokens: m.usageCount * TOKENS_PER_REQ,
    updated: updatedAt(m.usageRank),
    tags: [m.kind, ...m.addons.slice(0, 1)],
    served: SERVED.has(m.id),
  }))

const AREA = [
  620, 690, 660, 760, 820, 790, 860, 910, 880, 950, 1000, 970, 1040, 1090, 1060, 1130, 1170, 1140,
  1200, 1250, 1220, 1270, 1300, 1260, 1310,
]
const AREA_MAX = 1500
const X_LABELS = ['4/12', '4/15', '4/18', '4/21', '4/24', '4/27', '4/30', '5/3', '5/6', '5/9']

// ── 작은 부품 ──
function Chevron() {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 사용률 옆 미니차트 — Figma 모티프(보라→파랑 wavy 라인).
function MiniSpark() {
  return (
    <svg width={60} height={9} viewBox="0 0 60 9" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points="0,7 9.5,2.5 20,7.5 30,2 40,6.5 50,1.5 60,4.5"
        fill="none"
        stroke="url(#catSpark)"
        strokeWidth={1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MonthPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      style={{
        background: K.pillBg,
        border: `1px solid ${K.pillBorder}`,
        color: K.pillText,
        borderRadius: 7,
        padding: '5px 9px 5px 11px',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      이번 달
      <Chevron />
    </span>
  )
}

// ── TOP5 패널 (가로 바 순위) ──
function Top5Panel() {
  const top5 = CATALOG.slice(0, 5)
  const axisMax = Math.max(10, Math.ceil(Math.max(...top5.map((c) => c.share)) / 10) * 10)
  const axisTicks = Array.from({ length: axisMax / 10 + 1 }, (_, i) => `${i * 10}%`)
  return (
    <section
      className="flex flex-col min-w-0"
      style={{ background: K.cardBg, border: `1px solid ${K.cardBorder}`, borderRadius: 14, padding: '17px 19px' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="font-bold truncate" style={{ fontSize: 15, color: K.title }}>
          가장 많이 사용된 모델 TOP 5
        </h3>
        <MonthPill />
      </div>

      <div className="flex flex-col flex-1 justify-between" style={{ gap: 13 }}>
        {top5.map((c, i) => (
          <div key={c.m.id} className="flex items-center min-w-0" style={{ gap: 12 }}>
            <span className="shrink-0 tabular-nums text-center" style={{ width: 14, fontSize: 14, color: K.rank }}>
              {i + 1}
            </span>
            <Logo id={c.m.id} size={20} />
            <span className="truncate shrink-0" style={{ width: 132, fontSize: 14, color: K.desc }}>
              {c.m.name}
            </span>
            <span className="flex-1 min-w-0 rounded-full overflow-hidden" style={{ height: 6, background: K.track }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(c.share / axisMax) * 100}%`, background: BAR_COLORS[i] }}
              />
            </span>
            <span className="shrink-0 tabular-nums font-bold text-right" style={{ width: 50, fontSize: 14, color: K.title }}>
              {c.share.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex" style={{ marginTop: 13, paddingLeft: 202, paddingRight: 62 }}>
        <div className="flex justify-between w-full">
          {axisTicks.map((t) => (
            <span key={t} style={{ fontSize: 14, color: K.axis }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 사용 현황 KPI 박스 ──
function StatBox({
  icon,
  label,
  value,
  unit,
  delta,
}: {
  icon: ReactNode
  label: string
  value: string
  unit?: string
  delta?: string
}) {
  return (
    <div
      className="flex flex-col min-w-0"
      style={{ background: K.innerBg, border: `1px solid ${K.innerBorder}`, borderRadius: 10, padding: '12px 13px' }}
    >
      <div className="flex items-center min-w-0" style={{ gap: 8 }}>
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(59,130,246,0.14)', color: K.accent }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="truncate" style={{ fontSize: 14, color: K.sub }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline" style={{ gap: 4, marginTop: 9 }}>
        <span className="tabular-nums" style={{ fontSize: 23, fontWeight: 700, color: K.white, letterSpacing: '-0.3px' }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 14, color: K.label }}>{unit}</span>}
      </div>
      {delta && (
        <span style={{ fontSize: 14, color: K.ok, marginTop: 5 }}>
          전월 대비 <span style={{ fontWeight: 600 }}>{delta}</span>
        </span>
      )}
    </div>
  )
}

const IconGrid = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>
)
const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5l3.5 3.5L13 4.5" />
  </svg>
)
const IconReq = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 10l3-3 3 2 4-5" /><path d="M10 4h3v3" />
  </svg>
)
const IconToken = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" opacity="0.9" />
  </svg>
)

// ── 전체 모델 사용 현황 패널 ──
function UsagePanel() {
  const totalReq = TOTAL_USAGE
  const totalTok = TOTAL_USAGE * TOKENS_PER_REQ
  const served = new Set(services.map((s) => s.model)).size

  const CW = 660
  const CH = 86
  const px = (i: number) => (i * CW) / (AREA.length - 1)
  const py = (v: number) => CH * (1 - v / AREA_MAX)
  const line = AREA.map((v, i) => `${px(i)},${py(v)}`).join(' ')
  const area = `0,${CH} ${line} ${CW},${CH}`

  return (
    <section
      className="flex flex-col min-w-0"
      style={{ background: K.cardBg, border: `1px solid ${K.cardBorder}`, borderRadius: 14, padding: '17px 19px' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h3 className="font-bold truncate" style={{ fontSize: 15, color: K.title }}>
          전체 모델 사용 현황
        </h3>
        <MonthPill />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 11 }}>
        <StatBox icon={<IconGrid />} label="전체 모델 수" value={String(models.length)} unit="종" />
        <StatBox icon={<IconCheck />} label="사용 가능한 모델" value={String(served)} unit="개" />
        <StatBox icon={<IconReq />} label="이번 달 총 요청 수" value={fmtReq(totalReq)} delta="▲ 18.7%" />
        <StatBox icon={<IconToken />} label="이번 달 총 토큰" value={fmtTok(totalTok)} delta="▲ 22.4%" />
      </div>

      <div className="flex flex-1 min-h-0" style={{ marginTop: 16, gap: 9 }}>
        <div className="flex flex-col justify-between shrink-0" style={{ width: 42, paddingBottom: 22 }}>
          {['1.5M', '1M', '500K'].map((t) => (
            <span key={t} style={{ fontSize: 14, color: K.axis }}>
              {t}
            </span>
          ))}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="relative flex-1 min-h-0" style={{ minHeight: 100 }}>
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ height: 1, background: K.gridLine }} />
              ))}
            </div>
            <svg
              viewBox={`0 0 ${CW} ${CH}`}
              preserveAspectRatio="none"
              className="absolute inset-0"
              style={{ width: '100%', height: '100%', display: 'block' }}
              aria-hidden
            >
              <defs>
                <linearGradient id="usageArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={K.accent} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={K.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <polygon points={area} fill="url(#usageArea)" />
              <polyline
                points={line}
                fill="none"
                stroke={K.accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="flex justify-between" style={{ marginTop: 8 }}>
            {X_LABELS.map((t) => (
              <span key={t} style={{ fontSize: 14, color: K.axis }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 모델 카드 (Figma 307×214 비율 — 타이트 간격) ──
function ModelCard({ c, onOpen }: { c: CatModel; onOpen: () => void }) {
  const popular = c.m.usageRank <= 3
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col min-w-0 text-left hover-lift"
      style={{ background: K.cardBg, border: `1px solid ${K.cardBorder}`, borderRadius: 14, padding: 15, height: '100%', maxHeight: 288 }}
    >
      <div className="flex items-start min-w-0" style={{ gap: 11 }}>
        <Logo id={c.m.id} />
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 3 }}>
          <div className="flex items-center justify-between min-w-0" style={{ gap: 6 }}>
            <span className="truncate font-bold" style={{ fontSize: 15, color: K.name }}>
              {c.m.name}
            </span>
            {popular ? (
              <span
                className="shrink-0"
                style={{ background: K.popBg, color: K.popText, borderRadius: 6, padding: '2px 8px', fontSize: 14, fontWeight: 500 }}
              >
                인기
              </span>
            ) : (
              <span className="shrink-0" style={{ color: K.rank, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                ···
              </span>
            )}
          </div>
          <div className="flex items-center justify-between min-w-0" style={{ gap: 6 }}>
            <span className="truncate" style={{ fontSize: 14, color: K.sub }}>
              {c.provider}
            </span>
            <span className="shrink-0 tabular-nums" style={{ fontSize: 14, color: K.muted }}>
              {c.m.params}
            </span>
          </div>
        </div>
      </div>

      <p
        className="min-w-0 truncate"
        style={{ fontSize: 14, color: K.desc, marginTop: 11, lineHeight: 1.35 }}
      >
        {c.m.description}
      </p>

      <div className="flex items-center" style={{ gap: 6, marginTop: 10 }}>
        {c.tags.map((t) => (
          <span
            key={t}
            className="truncate"
            style={{ background: K.tagBg, border: `1px solid ${K.tagBorder}`, color: K.tagText, borderRadius: 6, padding: '2px 8px', fontSize: 14, maxWidth: 130 }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* 카드 높이를 채우는 spacer — 지표·상태 블록을 하단에 정렬(Figma) */}
      <div style={{ flex: 1, minHeight: 14 }} />

      <div style={{ height: 1, background: K.divider }} />

      <div className="grid" style={{ gridTemplateColumns: '1.32fr 0.84fr 0.92fr', gap: 8, marginTop: 14 }}>
        <div className="flex flex-col min-w-0" style={{ gap: 7 }}>
          <span className="truncate" style={{ fontSize: 14, color: K.label }}>
            사용률 (이번 달)
          </span>
          <div className="flex items-center min-w-0" style={{ gap: 7 }}>
            <span className="font-bold tabular-nums shrink-0" style={{ fontSize: 16, color: K.name }}>
              {c.share.toFixed(1)}%
            </span>
            <MiniSpark />
          </div>
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 7 }}>
          <span className="truncate" style={{ fontSize: 14, color: K.label }}>
            요청 수
          </span>
          <span className="font-bold tabular-nums truncate" style={{ fontSize: 15, color: K.name }}>
            {fmtReq(c.requests)}
          </span>
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 7 }}>
          <span className="truncate" style={{ fontSize: 14, color: K.label }}>
            토큰 사용량
          </span>
          <span className="font-bold tabular-nums truncate" style={{ fontSize: 15, color: K.name }}>
            {fmtTok(c.tokens)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between min-w-0" style={{ gap: 8, marginTop: 14 }}>
        <span className="flex items-center min-w-0" style={{ gap: 7 }}>
          <span style={{ fontSize: 14, color: K.label }}>상태</span>
          <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: c.served ? K.ok : K.muted }} />
          <span style={{ fontSize: 14, color: c.served ? K.ok : K.muted }}>{c.served ? '사용 가능' : '미배포'}</span>
        </span>
        <span className="flex items-center shrink-0" style={{ gap: 7 }}>
          <span style={{ fontSize: 14, color: K.label }}>최종 업데이트</span>
          <span className="tabular-nums" style={{ fontSize: 14, color: K.sub }}>
            {c.updated}
          </span>
        </span>
      </div>
    </button>
  )
}

// ── 컨트롤 ──
function FilterSelect({
  value,
  onChange,
  options,
  width,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  width?: number
}) {
  return (
    <span
      className="relative inline-flex items-center"
      style={{ background: K.ctrlBg, border: `1px solid ${K.ctrlBorder}`, borderRadius: 8, height: 36 }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-transparent outline-none cursor-pointer truncate"
        style={{ color: K.pillText, fontSize: 14, padding: '0 28px 0 12px', height: 36, width, minWidth: width }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: 'var(--cat-selbg)', color: 'var(--cat-strong)' }}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="absolute pointer-events-none" style={{ right: 10, color: K.pillText, display: 'flex' }}>
        <Chevron />
      </span>
    </span>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span
      className="flex items-center gap-2 min-w-0"
      style={{ background: K.ctrlBg, border: `1px solid ${K.ctrlBorder}`, borderRadius: 8, height: 36, padding: '0 12px', width: 214 }}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden style={{ flexShrink: 0, opacity: 0.55 }}>
        <circle cx="7" cy="7" r="5" fill="none" stroke={K.pillText} strokeWidth="1.6" />
        <path d="M11 11l3.5 3.5" stroke={K.pillText} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="모델, 제공사 검색"
        aria-label="모델 검색"
        className="bg-transparent outline-none w-full min-w-0"
        style={{ fontSize: 14, color: 'var(--cat-strong)' }}
      />
    </span>
  )
}

function ViewToggle({ view, onChange }: { view: 'grid' | 'list'; onChange: (v: 'grid' | 'list') => void }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ background: K.ctrlBg, border: `1px solid ${K.ctrlBorder}`, borderRadius: 8, padding: 3, gap: 3 }}
    >
      <button
        type="button"
        aria-label="그리드 보기"
        aria-pressed={view === 'grid'}
        onClick={() => onChange('grid')}
        className="flex items-center justify-center"
        style={{ width: 26, height: 24, borderRadius: 6, background: view === 'grid' ? '#2d6fe0' : 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          {[
            [2, 2],
            [8, 2],
            [2, 8],
            [8, 8],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="4" height="4" rx="1" fill={view === 'grid' ? '#fff' : 'var(--cat-icon)'} />
          ))}
        </svg>
      </button>
      <button
        type="button"
        aria-label="리스트 보기"
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
        className="flex items-center justify-center"
        style={{ width: 26, height: 24, borderRadius: 6, background: view === 'list' ? '#2d6fe0' : 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          {[3, 7, 11].map((y, i) => (
            <rect key={i} x="1" y={y - 1} width="12" height="2" rx="1" fill={view === 'list' ? '#fff' : 'var(--cat-icon)'} />
          ))}
        </svg>
      </button>
    </span>
  )
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const cell = (content: ReactNode, opts: { active?: boolean; disabled?: boolean; onClick?: () => void; key: string }) => (
    <button
      key={opts.key}
      type="button"
      disabled={opts.disabled}
      onClick={opts.onClick}
      className="flex items-center justify-center font-bold"
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        fontSize: 14,
        background: opts.active ? '#3b82f6' : K.ctrlBg,
        border: opts.active ? 'none' : `1px solid ${K.ctrlBorder}`,
        color: opts.active ? '#fff' : K.pillText,
        opacity: opts.disabled ? 0.4 : 1,
        cursor: opts.disabled ? 'default' : 'pointer',
      }}
    >
      {content}
    </button>
  )
  return (
    <div className="flex items-center justify-center shrink-0" style={{ gap: 7, marginTop: 12 }}>
      {cell('‹', { key: 'prev', disabled: page === 1, onClick: () => onPage(page - 1) })}
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="font-bold" style={{ color: K.rank, fontSize: 14, padding: '0 2px' }}>
            ···
          </span>
        ) : (
          cell(n, { key: `p${n}`, active: n === page, onClick: () => onPage(n) })
        ),
      )}
      {cell('›', { key: 'next', disabled: page === pages, onClick: () => onPage(page + 1) })}
    </div>
  )
}

// ── 리스트(테이블) 뷰 ──
function ListView({ rows, onOpen }: { rows: CatModel[]; onOpen: (id: string) => void }) {
  const cols: { key: string; header: string; w: string; align?: 'right'; render: (c: CatModel) => ReactNode }[] = [
    {
      key: 'name',
      header: '모델',
      w: '26%',
      render: (c) => (
        <span className="flex items-center min-w-0" style={{ gap: 10 }}>
          <Logo id={c.m.id} size={28} />
          <span className="truncate font-bold" style={{ color: K.name }}>
            {c.m.name}
          </span>
        </span>
      ),
    },
    { key: 'prov', header: '제공사', w: '14%', render: (c) => <span className="truncate" style={{ color: K.sub }}>{c.provider}</span> },
    { key: 'kind', header: '유형', w: '13%', render: (c) => <span style={{ color: K.tagText }}>{c.m.kind}</span> },
    {
      key: 'share',
      header: '사용률',
      w: '12%',
      align: 'right',
      render: (c) => <span className="tabular-nums font-bold" style={{ color: K.name }}>{c.share.toFixed(1)}%</span>,
    },
    { key: 'req', header: '요청 수', w: '12%', align: 'right', render: (c) => <span className="tabular-nums" style={{ color: K.desc }}>{fmtReq(c.requests)}</span> },
    { key: 'tok', header: '토큰 사용량', w: '13%', align: 'right', render: (c) => <span className="tabular-nums" style={{ color: K.desc }}>{fmtTok(c.tokens)}</span> },
    {
      key: 'st',
      header: '상태',
      w: '10%',
      render: (c) => (
        <span className="flex items-center" style={{ gap: 6 }}>
          <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: c.served ? K.ok : K.muted }} />
          <span style={{ color: c.served ? K.ok : K.muted }}>{c.served ? '사용 가능' : '미배포'}</span>
        </span>
      ),
    },
  ]
  return (
    <div className="min-w-0 overflow-hidden" style={{ background: K.cardBg, border: `1px solid ${K.cardBorder}`, borderRadius: 14 }}>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup>
            {cols.map((c) => (
              <col key={c.key} style={{ width: c.w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="font-bold whitespace-nowrap"
                  style={{ textAlign: c.align ?? 'left', fontSize: 14, color: K.sub, padding: '11px 14px', borderBottom: `1px solid ${K.cardBorder}` }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.m.id} onClick={() => onOpen(c.m.id)} className="cursor-pointer cat-row">
                {cols.map((c2) => (
                  <td
                    key={c2.key}
                    className="truncate"
                    style={{ textAlign: c2.align ?? 'left', fontSize: 14, padding: '11px 14px', borderBottom: `1px solid ${K.divider}` }}
                  >
                    {c2.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 메인 ──
export function ModelCatalog() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('all')
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)

  const providerOpts = useMemo(() => {
    const set = Array.from(new Set(CATALOG.map((c) => c.provider)))
    return [{ value: 'all', label: '전체 제공사' }, ...set.map((p) => ({ value: p, label: p }))]
  }, [])
  const kindOpts = useMemo(() => {
    const set = Array.from(new Set(models.map((m) => m.kind)))
    return [{ value: 'all', label: '전체 유형' }, ...set.map((k) => ({ value: k, label: k }))]
  }, [])
  const statusOpts = [
    { value: 'all', label: '전체 상태' },
    { value: 'served', label: '사용 가능' },
    { value: 'idle', label: '미배포' },
  ]
  const sortOpts = [
    { value: 'recent', label: '최신 등록' },
    { value: 'usage', label: '사용률 높은순' },
    { value: 'requests', label: '요청 수 많은순' },
    { value: 'name', label: '이름순' },
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = CATALOG.filter((c) => {
      if (q && !(`${c.m.name} ${c.provider} ${c.m.description} ${c.m.kind}`.toLowerCase().includes(q))) return false
      if (provider !== 'all' && c.provider !== provider) return false
      if (kind !== 'all' && c.m.kind !== kind) return false
      if (status === 'served' && !c.served) return false
      if (status === 'idle' && c.served) return false
      return true
    })
    const sorted = [...list]
    if (sort === 'recent') sorted.sort((a, b) => (a.updated < b.updated ? 1 : -1))
    else if (sort === 'usage') sorted.sort((a, b) => b.share - a.share)
    else if (sort === 'requests') sorted.sort((a, b) => b.requests - a.requests)
    else sorted.sort((a, b) => a.m.name.localeCompare(b.m.name))
    return sorted
  }, [query, provider, kind, status, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage = Math.min(page, pages)
  const pageRows = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)
  const open = (id: string) => navigate(`/models/${id}`)
  const resetPage = () => setPage(1)

  return (
    <div className="cat anim-fade flex flex-col min-w-0" style={{ gap: 18, minHeight: '100%' }}>
      <style>{`
        .cat {
          --cat-card:#101b29; --cat-cardb:#1e2a3c; --cat-inner:#0d1a2c; --cat-innerb:#1b2738;
          --cat-track:#101c30; --cat-divider:#1c2940; --cat-tagbg:#16243a; --cat-tagb:#243450; --cat-tagtx:#9fb0c3;
          --cat-popbg:#2a2150; --cat-poptx:#b79cf6; --cat-pillbg:#16233a; --cat-pillb:#26344c; --cat-pilltx:#aeb9c8;
          --cat-ctrlbg:#131f33; --cat-ctrlb:#24344c; --cat-title:#e9eef6; --cat-name:#eaf0fa; --cat-sub:#8492a6;
          --cat-desc:#a4b3c6; --cat-label:#7c8a9c; --cat-axis:#56627a; --cat-rank:#5c6776; --cat-muted:#6e7b8c;
          --cat-strong:#eff3f9; --cat-ok:#3bd27a; --cat-grid:rgba(26,39,64,0.6); --cat-accent:#3b82f6;
          --cat-selbg:#0f1a2b; --cat-icon:#6b7888; --cat-rowhover:rgba(59,130,246,0.08);
        }
        :root[data-theme="light"] .cat {
          --cat-card:#ffffff; --cat-cardb:#e6eaf0; --cat-inner:#f7f9fc; --cat-innerb:#e8edf4;
          --cat-track:#e9edf3; --cat-divider:#eef1f6; --cat-tagbg:#f2f5fa; --cat-tagb:#e1e7f0; --cat-tagtx:#4a5568;
          --cat-popbg:#efe9ff; --cat-poptx:#6c32f3; --cat-pillbg:#f3f6fa; --cat-pillb:#e1e7f0; --cat-pilltx:#566072;
          --cat-ctrlbg:#f5f7fb; --cat-ctrlb:#e1e7f0; --cat-title:#1a2230; --cat-name:#1a2230; --cat-sub:#5c6678;
          --cat-desc:#3a4252; --cat-label:#6a7686; --cat-axis:#8a94a4; --cat-rank:#9aa4b2; --cat-muted:#8a94a4;
          --cat-strong:#1a2230; --cat-ok:#15a85c; --cat-grid:rgba(120,135,160,0.22); --cat-accent:#2f6fe0;
          --cat-selbg:#ffffff; --cat-icon:#9aa4b2; --cat-rowhover:rgba(47,111,224,0.07);
        }
        .cat-card-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0,1fr)); flex: 1 1 auto; min-height: 0; grid-auto-rows: minmax(224px, 1fr); }
        @media (max-width: 1280px) { .cat-card-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        @media (max-width: 900px)  { .cat-card-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (max-width: 620px)  { .cat-card-grid { grid-template-columns: 1fr; } }
        .cat-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
        .cat-row:hover { background: var(--cat-rowhover); }
      `}</style>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="catSpark" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6c32f3" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>

      <header className="flex flex-col min-w-0" style={{ gap: 4 }}>
        <h2 className="font-bold truncate" style={{ fontSize: 22, letterSpacing: '-0.4px' }}>
          모델 카탈로그
        </h2>
        <p style={{ fontSize: 14, color: K.sub }}>등록된 모델의 상세 정보와 모델 통계를 확인할 수 있습니다.</p>
      </header>

      <div className="grid items-stretch section-grid" style={{ gridTemplateColumns: '541fr 731fr', gap: 22 }}>
        <Top5Panel />
        <UsagePanel />
      </div>

      <div className="flex items-center justify-between flex-wrap" style={{ gap: 12, marginTop: 4 }}>
        <h3 className="font-bold shrink-0" style={{ fontSize: 15 }}>
          등록 모델 목록 <span style={{ color: K.sub, fontWeight: 400 }}>({filtered.length})</span>
        </h3>
        <div className="flex items-center flex-wrap justify-end" style={{ gap: 8 }}>
          <SearchBox value={query} onChange={(v) => { setQuery(v); resetPage() }} />
          <FilterSelect value={provider} onChange={(v) => { setProvider(v); resetPage() }} options={providerOpts} width={108} />
          <FilterSelect value={kind} onChange={(v) => { setKind(v); resetPage() }} options={kindOpts} width={104} />
          <FilterSelect value={status} onChange={(v) => { setStatus(v); resetPage() }} options={statusOpts} width={100} />
          <FilterSelect value={sort} onChange={setSort} options={sortOpts} width={130} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="flex items-center justify-center text-center"
          style={{ background: K.cardBg, border: `1px solid ${K.cardBorder}`, borderRadius: 14, padding: '48px 16px', color: K.sub, fontSize: 14, flex: '1 1 auto', minHeight: 0 }}
        >
          조건에 맞는 모델이 없어요. 필터를 변경해 보세요.
        </div>
      ) : view === 'grid' ? (
        <div className="cat-card-grid">
          {pageRows.map((c) => (
            <ModelCard key={c.m.id} c={c} onOpen={() => open(c.m.id)} />
          ))}
        </div>
      ) : (
        <div className="cat-body">
          <ListView rows={pageRows} onOpen={open} />
        </div>
      )}

      <Pagination page={curPage} pages={pages} onPage={setPage} />
    </div>
  )
}

export function ModelDetail() {
  return (
    <FoundationPage
      screen="4.13"
      title="모델 상세"
      desc="모델 메타·사용량, GPU 신청 시 선택 (공통)."
      group={3}
      roles={['A', 'B', 'C']}
      planned={['메타데이터 카드(권장 GPU·라이선스)', '사용 추이 라인차트', 'GPU 신청 시 선택 진입']}
    />
  )
}

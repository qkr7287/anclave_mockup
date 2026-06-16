import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { SparkLine } from '../components/charts'
import { useTheme } from '../lib/theme'
import { QaPolish } from './qa-polish'
import { type MarketService as Service, type MarketServiceUsage, listMarketServices, getMarketService, getMarketServiceUsage } from './market-store'
import {
  MagnifyingGlassIcon,
  CpuChipIcon,
  MicrophoneIcon,
  PhotoIcon,
  DocumentTextIcon,
  LanguageIcon,
  ChatBubbleLeftRightIcon,
  DocumentChartBarIcon,
  CodeBracketSquareIcon,
  CircleStackIcon,
  FaceSmileIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  ShieldExclamationIcon,
  ClockIcon,
  CodeBracketIcon,
  StarIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  XMarkIcon,
  KeyIcon,
  BookOpenIcon,
  MoonIcon,
  ClipboardDocumentCheckIcon,
  BeakerIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'

// G8 · 4.17 마켓플레이스 · 4.18 서비스(AI) 상세 — Figma 매칭(fileKey iqVQ2GEDCRj9cK3EBOwBJV,
// 4.17=node 1:2, 4.18=node 3:11938). 셸은 우리 것, 콘텐츠만 Figma.
// 상세는 행 클릭 → 모달 팝업(Figma 상세 카드). 필터·검색·정렬은 목업이지만 실제 동작.

type Icon = ComponentType<SVGProps<SVGSVGElement>>

// ───────────────────────── Figma 팔레트(테마 인지) ─────────────────────────
interface Palette {
  filter: string; panel: string; card: string; modalCard: string; inset: string; chip: string
  border: string; borderStrong: string; divider: string; heading: string; text: string; muted: string; chipText: string
  accent: string; accentSoft: string
  ok: string; okSoft: string; warn: string; warnSoft: string; danger: string; dangerSoft: string
  dim: string; shadow: string
}
function usePalette(): Palette {
  const { theme } = useTheme()
  if (theme !== 'light') {
    // 표면 명도 단계를 벌려 섹션 구분을 또렷하게(패널 < 모달 < 인셋·칩).
    return {
      filter: '#19212F', panel: '#171F2C', card: '#161E2C', modalCard: '#1D2738', inset: '#243044', chip: '#26334A',
      border: '#34415A', borderStrong: '#41506C', divider: '#303C53', heading: '#F4F6FA', text: '#DDE2EC', muted: '#9AA4B6', chipText: '#C2CADA',
      accent: '#3B8DFF', accentSoft: 'rgba(59,141,255,0.16)',
      ok: '#34C759', okSoft: 'rgba(52,199,89,0.16)', warn: '#E8B033', warnSoft: 'rgba(232,176,51,0.16)',
      danger: '#FF6B57', dangerSoft: 'rgba(255,107,87,0.16)',
      dim: 'rgba(4,7,13,0.72)', shadow: '0 30px 80px rgba(0,0,0,0.62)',
    }
  }
  return {
    filter: 'var(--c-card2)', panel: 'var(--c-card2)', card: 'var(--c-card2)', modalCard: 'var(--c-card2)', inset: 'var(--c-soft)', chip: 'var(--c-soft)',
    border: 'var(--c-border)', borderStrong: 'var(--c-border)', divider: 'var(--c-border)', heading: 'var(--c-text)', text: 'var(--c-text)', muted: 'var(--c-muted)', chipText: 'var(--c-muted)',
    accent: 'var(--c-accent)', accentSoft: 'var(--accent-soft)',
    ok: 'var(--c-ok)', okSoft: 'var(--ok-soft)', warn: 'var(--c-warn)', warnSoft: 'var(--warn-soft)', danger: 'var(--c-danger)', dangerSoft: 'var(--danger-soft)',
    dim: 'var(--dim)', shadow: 'var(--shadow-pop)',
  }
}

type Tone = 'ok' | 'warn' | 'danger'
const toneOf = (status: string): Tone => (status === '정상' ? 'ok' : status === '불안정' ? 'danger' : 'warn')

// ───────────────────────── 로고 이미지(DiceBear + 그라데이션 폴백) ─────────────────────────
function Logo({ id, hue, icon: Glyph, size = 40, radius }: { id: string; hue: number; icon: Icon; size?: number; radius?: number }) {
  const [failed, setFailed] = useState(false)
  const r = radius ?? (size >= 48 ? 14 : size >= 36 ? 11 : 9)
  if (failed) {
    return (
      <span className="flex items-center justify-center shrink-0"
        style={{ width: size, height: size, borderRadius: r, background: `linear-gradient(140deg, hsl(${hue},72%,54%), hsl(${(hue + 38) % 360},70%,44%))`, color: '#fff' }}>
        <Glyph width={size * 0.5} height={size * 0.5} />
      </span>
    )
  }
  return (
    <img
      src={`https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(id)}&backgroundType=gradientLinear`}
      width={size} height={size} alt="" loading="lazy" onError={() => setFailed(true)}
      className="shrink-0 object-cover" style={{ borderRadius: r, display: 'block' }}
    />
  )
}

// ───────────────────────── 서비스 헬퍼 ─────────────────────────
const hasApiOf = (s: Service) => s.api !== '콘솔'

// icon 문자열(backend) → heroicon 컴포넌트 매핑. 미정의 시 CpuChipIcon 폴백.
const ICON_MAP: Record<string, Icon> = {
  BookOpenIcon, CircleStackIcon, ChatBubbleLeftRightIcon, MoonIcon,
  ClipboardDocumentCheckIcon, BeakerIcon, VideoCameraIcon, CpuChipIcon,
  MagnifyingGlassIcon, MicrophoneIcon, PhotoIcon, DocumentTextIcon,
  LanguageIcon, DocumentChartBarIcon, CodeBracketSquareIcon, FaceSmileIcon,
  SpeakerWaveIcon, ShieldExclamationIcon,
}
const iconOf = (name: string): Icon => ICON_MAP[name] ?? CpuChipIcon

// 서비스 목록 → 파생 필터 옵션·랭킹 아이템(컴포넌트에서 useMemo로 호출).
const kindsOf = (list: Service[]) => [...new Set(list.map((s) => s.kind))]
const modelsOf = (list: Service[]) => [...new Set(list.map((s) => s.model))]
const allTagsOf = (list: Service[]) => [...new Set(list.flatMap((s) => s.tags))].slice(0, 18)
const rankItemsOf = (list: Service[]): RankItem[] =>
  [...list].sort((a, b) => b.usageNum - a.usageNum).map((s, i) => ({
    rank: i + 1, name: s.name, model: s.model, usage: s.usage, delta: s.delta, up: s.up,
    chips: [hasApiOf(s) ? s.api : '콘솔', s.tier], status: s.status,
    tone: toneOf(s.status), icon: s.icon, hue: s.hue, seed: s.id, serviceId: s.id,
  }))

const STATUSES = ['정상', '주의', '불안정', '점검 중']

interface RankItem {
  rank: number; name: string; model: string; usage: string; delta: string; up: boolean
  chips: string[]; status: string; tone: Tone; icon: string; hue: number; seed: string; serviceId: string
}
// serviceId = 클릭 시 열 대표 서비스(상세 모달 재사용)
// ───────────────────────── 필터 상태 ─────────────────────────
type ApiMode = 'all' | 'yes' | 'no'
type SortKey = 'usage' | 'recent' | 'name'
interface Filters {
  query: string; kind: string; model: string; api: ApiMode; statuses: Set<string>; tag: string
}
const emptyFilters = (): Filters => ({ query: '', kind: 'all', model: 'all', api: 'all', statuses: new Set(), tag: '' })
const filtersActive = (f: Filters) =>
  !!f.query || f.kind !== 'all' || f.model !== 'all' || f.api !== 'all' || f.statuses.size > 0 || !!f.tag

function applyFilters(list: Service[], f: Filters, sort: SortKey): Service[] {
  const q = f.query.trim().toLowerCase()
  const tag = f.tag.trim().toLowerCase()
  const out = list.filter((s) => {
    if (q && !`${s.name} ${s.kind} ${s.model} ${s.provider} ${s.desc} ${s.tags.join(' ')}`.toLowerCase().includes(q)) return false
    if (f.kind !== 'all' && s.kind !== f.kind) return false
    if (f.model !== 'all' && s.model !== f.model) return false
    if (f.api === 'yes' && !hasApiOf(s)) return false
    if (f.api === 'no' && hasApiOf(s)) return false
    if (f.statuses.size > 0 && !f.statuses.has(s.status)) return false
    if (tag && !s.tags.some((t) => t.toLowerCase().includes(tag))) return false
    return true
  })
  if (sort === 'usage') out.sort((a, b) => b.usageNum - a.usageNum)
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
  // 'recent' = 시드 순서 유지
  return out
}

// ───────────────────────── 반응형 ─────────────────────────
function useNarrow(bp = 1180): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [bp])
  return narrow
}

// ───────────────────────── 공통 부품 ─────────────────────────
const deltaColor = (p: Palette, up: boolean) => (up ? p.ok : p.danger)
const toneColor = (p: Palette, t: Tone) => (t === 'ok' ? p.ok : t === 'warn' ? p.warn : p.danger)
const toneSoft = (p: Palette, t: Tone) => (t === 'ok' ? p.okSoft : t === 'warn' ? p.warnSoft : p.dangerSoft)

function StatusBadge({ status, tone }: { status: string; tone: Tone }) {
  const p = usePalette()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full whitespace-nowrap"
      style={{ padding: '3px 10px', fontSize: 14, fontWeight: 700, color: toneColor(p, tone), background: toneSoft(p, tone) }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />{status}
    </span>
  )
}

function MetaChip({ label, value }: { label?: string; value: string }) {
  const p = usePalette()
  return (
    <span className="inline-flex items-center gap-1 rounded-md whitespace-nowrap"
      style={{ padding: '2px 8px', fontSize: 14, background: p.chip, border: `1px solid ${p.border}` }}>
      {label && <span style={{ color: p.muted }}>{label}</span>}
      <span style={{ fontWeight: 600, color: p.chipText }}>{value}</span>
    </span>
  )
}

// 스타일된 네이티브 select(실제 동작)
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const p = usePalette()
  return (
    <label className="flex flex-col" style={{ gap: 7 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{label}</span>
      <span className="relative flex items-center">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full rounded-lg outline-none cursor-pointer truncate"
          style={{ padding: '9px 30px 9px 12px', fontSize: 14, background: p.chip, border: `1px solid ${p.border}`, color: value === 'all' ? p.muted : p.text }}>
          {options.map((o) => <option key={o.value} value={o.value} style={{ color: '#111', background: '#fff' }}>{o.label}</option>)}
        </select>
        <ChevronDownIcon width={15} height={15} className="absolute right-3 pointer-events-none" style={{ color: p.muted }} />
      </span>
    </label>
  )
}

function CheckRow({ label, checked, onClick }: { label: string; checked?: boolean; onClick?: () => void }) {
  const p = usePalette()
  return (
    <button type="button" onClick={onClick} className="flex items-center text-left" style={{ gap: 9, fontSize: 14 }}>
      <span className="flex items-center justify-center shrink-0"
        style={{ width: 18, height: 18, borderRadius: 5, background: checked ? p.accent : 'transparent', border: `1px solid ${checked ? p.accent : p.border}`, color: '#fff' }}>
        {checked && <CheckIcon width={13} height={13} strokeWidth={3} />}
      </span>
      <span style={{ color: checked ? p.text : p.muted }}>{label}</span>
    </button>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const p = usePalette()
  return (
    <div className="flex flex-col" style={{ gap: 9 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{label}</span>
      {children}
    </div>
  )
}

const PANEL_SHADOW = '0 2px 10px rgba(0,0,0,0.18)'

// 4.17 좌 — 서비스 탐색 가이드(필터, 실제 동작)
function FilterPanel({ f, set, onReset, fill, kinds, models, allTags }: { f: Filters; set: (patch: Partial<Filters>) => void; onReset: () => void; fill: boolean; kinds: string[]; models: string[]; allTags: string[] }) {
  const p = usePalette()
  const toggleStatus = (st: string) => {
    const next = new Set(f.statuses)
    next.has(st) ? next.delete(st) : next.add(st)
    set({ statuses: next })
  }
  return (
    <section className={`rounded-xl min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}
      style={{ background: p.filter, border: `1px solid ${p.border}`, boxShadow: PANEL_SHADOW }}>
      <div className={`flex flex-col ${fill ? 'flex-1 min-h-0 overflow-auto' : ''}`} style={{ gap: 18, padding: 20 }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <div className="flex items-center justify-between gap-2">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: p.heading }}>서비스 탐색 가이드</h3>
            {filtersActive(f) && (
              <button type="button" onClick={onReset} className="flex items-center gap-1 shrink-0" style={{ fontSize: 14, color: p.accent }}>
                <ArrowPathIcon width={12} height={12} /> 초기화
              </button>
            )}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: p.muted }}>
            동료가 할당받은 GPU에 배포한 AI 서비스를 탐색·비교하고, 호출에 필요한 API 키를 요청해 보세요.
          </p>
        </div>

        <Select label="종류" value={f.kind} onChange={(kind) => set({ kind })}
          options={[{ value: 'all', label: '모든 종류' }, ...kinds.map((k) => ({ value: k, label: k }))]} />

        <FilterGroup label="API 여부">
          <CheckRow label="전체" checked={f.api === 'all'} onClick={() => set({ api: 'all' })} />
          <CheckRow label="API 제공" checked={f.api === 'yes'} onClick={() => set({ api: 'yes' })} />
          <CheckRow label="API 미제공" checked={f.api === 'no'} onClick={() => set({ api: 'no' })} />
        </FilterGroup>

        <Select label="모델" value={f.model} onChange={(model) => set({ model })}
          options={[{ value: 'all', label: '모든 모델' }, ...models.map((m) => ({ value: m, label: m }))]} />

        <FilterGroup label="상태">
          <CheckRow label="전체" checked={f.statuses.size === 0} onClick={() => set({ statuses: new Set() })} />
          {STATUSES.map((st) => <CheckRow key={st} label={st} checked={f.statuses.has(st)} onClick={() => toggleStatus(st)} />)}
        </FilterGroup>

        <FilterGroup label="태그">
          <span className="flex items-center gap-2 rounded-lg" style={{ padding: '8px 11px', background: p.chip, border: `1px solid ${p.border}` }}>
            <input value={f.tag} onChange={(e) => set({ tag: e.target.value })}
              className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14, color: p.text }} placeholder="태그 선택 또는 입력" aria-label="태그 필터" />
            {f.tag && (
              <button type="button" onClick={() => set({ tag: '' })} aria-label="태그 지우기" className="shrink-0" style={{ color: p.muted }}>
                <XMarkIcon width={14} height={14} />
              </button>
            )}
          </span>
          <div className="flex flex-wrap" style={{ gap: 7, marginTop: 2 }}>
            {allTags.map((t) => {
              const on = f.tag.toLowerCase() === t.toLowerCase()
              return (
                <button key={t} type="button" onClick={() => set({ tag: on ? '' : t })}
                  className="rounded-full whitespace-nowrap transition-colors"
                  style={{ padding: '4px 10px', fontSize: 14, fontWeight: 500,
                    background: on ? p.accentSoft : p.chip, color: on ? p.accent : p.chipText,
                    border: `1px solid ${on ? p.accent : p.border}` }}>
                  #{t}
                </button>
              )
            })}
          </div>
        </FilterGroup>
      </div>
    </section>
  )
}

// 서비스 목록 항목 = 세로형 그리드 카드(로고+상태 / 이름·제공사 / 설명 2줄 / 칩 / 푸터)
function ServiceCard({ s, onOpen }: { s: Service; onOpen: (s: Service) => void }) {
  const p = usePalette()
  const tone = toneOf(s.status)
  return (
    <button type="button" onClick={() => onOpen(s)}
      className="flex flex-col text-left rounded-2xl transition-colors h-full"
      style={{ padding: 18, gap: 13, background: p.filter, border: `1px solid ${p.border}` }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.background = p.inset }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.background = p.filter }}>
      {s.thumbnail && (
        <div className="w-full overflow-hidden flex-1" style={{ minHeight: 132, borderRadius: 12, background: p.inset }}>
          <img src={s.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" style={{ objectPosition: 'top', display: 'block' }} />
        </div>
      )}
      <div className="flex items-start gap-3">
        <Logo id={s.id} hue={s.hue} icon={iconOf(s.icon)} size={48} radius={12} />
        <div className="flex flex-col min-w-0 flex-1" style={{ gap: 2 }}>
          <span className="truncate" style={{ fontSize: 16, fontWeight: 700, color: p.heading, letterSpacing: '-0.2px' }}>{s.name}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{s.provider} · {s.model}</span>
        </div>
        <StatusBadge status={s.status} tone={tone} />
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: p.muted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}>{s.desc}</p>
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        <span className="rounded-md whitespace-nowrap" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 500, background: p.chip, color: p.chipText }}>{s.kind}</span>
        <span className="rounded-md whitespace-nowrap" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 500, background: p.chip, color: hasApiOf(s) ? p.chipText : p.muted }}>{hasApiOf(s) ? s.api : '미제공'}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2" style={{ paddingTop: 12, borderTop: `1px solid ${p.divider}` }}>
        <div className="flex flex-col">
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.4px', color: p.heading }}>{s.usage}</span>
          <span style={{ fontSize: 14, color: p.muted }}>API 호출</span>
        </div>
        <div className="flex flex-col items-end" style={{ gap: 3 }}>
          <span className="flex items-center" style={{ gap: 2, fontSize: 14, fontWeight: 700, color: p.warn }}><StarIcon width={13} height={13} /> {s.rating.toFixed(1)}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: deltaColor(p, s.up) }}>{s.delta}</span>
        </div>
      </div>
    </button>
  )
}

// 페이지네이션 바 — 3×2 그리드 페이지 전환(스크롤 대신).
function PaginationBar({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (n: number) => void }) {
  const p = usePalette()
  const cell = (active: boolean, disabled?: boolean) => ({
    minWidth: 30, height: 30, fontSize: 14, fontWeight: 700,
    borderRadius: 8, border: `1px solid ${active ? p.accent : p.border}`,
    background: active ? p.accentSoft : 'transparent',
    color: disabled ? p.muted : active ? p.accent : p.text,
    opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
    padding: '0 8px',
  } as const)
  return (
    <div className="shrink-0 flex items-center justify-center" style={{ gap: 6, paddingTop: 2 }}>
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}
        className="flex items-center justify-center transition-colors" style={cell(false, page === 0)} aria-label="이전 페이지">
        <ChevronRightIcon width={15} height={15} style={{ transform: 'rotate(180deg)' }} />
      </button>
      {Array.from({ length: pageCount }, (_, n) => (
        <button key={n} type="button" onClick={() => onPage(n)}
          className="flex items-center justify-center transition-colors" style={cell(n === page)} aria-current={n === page ? 'page' : undefined}>
          {n + 1}
        </button>
      ))}
      <button type="button" disabled={page === pageCount - 1} onClick={() => onPage(page + 1)}
        className="flex items-center justify-center transition-colors" style={cell(false, page === pageCount - 1)} aria-label="다음 페이지">
        <ChevronRightIcon width={15} height={15} />
      </button>
    </div>
  )
}

// 4.17 중앙 — 서비스 목록(3×2 그리드 + 페이지네이션). fill 시 헤더·페이지바 고정.
function AIList({ services, total, sort, onSort, onOpen, onReset, fill, loading, loadError }: {
  services: Service[]; total: number; sort: SortKey; onSort: (s: SortKey) => void; onOpen: (s: Service) => void; onReset: () => void; fill: boolean; loading: boolean; loadError: boolean
}) {
  const p = usePalette()
  const PER_PAGE = 6 // 3 × 2
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [services]) // 필터·정렬·로드 변경 시 첫 페이지로
  const pageCount = Math.max(1, Math.ceil(services.length / PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const pageItems = services.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE)
  return (
    <section className={`min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}>
      <header className="shrink-0 flex items-center justify-between gap-3" style={{ paddingBottom: 12 }}>
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 style={{ fontSize: 18, fontWeight: 700, color: p.heading }}>서비스 목록</h3>
          <span className="rounded-full self-center" style={{ padding: '1px 8px', fontSize: 14, fontWeight: 700, color: p.accent, background: p.accentSoft }}>{services.length}{services.length !== total ? `/${total}` : ''}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>탐색 · 검색 · 태그</span>
        </div>
        <span className="relative flex items-center shrink-0">
          <select value={sort} onChange={(e) => onSort(e.target.value as SortKey)}
            className="appearance-none outline-none cursor-pointer" style={{ padding: '4px 22px 4px 8px', fontSize: 14, color: p.muted, background: 'transparent', border: `1px solid ${p.border}`, borderRadius: 8 }}>
            <option value="recent" style={{ color: '#111' }}>최신순</option>
            <option value="usage" style={{ color: '#111' }}>사용량순</option>
            <option value="name" style={{ color: '#111' }}>이름순</option>
          </select>
          <ChevronDownIcon width={13} height={13} className="absolute right-2 pointer-events-none" style={{ color: p.muted }} />
        </span>
      </header>

      {loading || loadError ? (
        <div className={`flex flex-col items-center justify-center text-center rounded-2xl ${fill ? 'flex-1 min-h-0' : ''}`} style={{ padding: '56px 20px', gap: 10, background: p.filter, border: `1px solid ${p.border}` }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: p.inset, color: p.muted }}>
            {loadError ? <XMarkIcon width={22} height={22} /> : <ArrowPathIcon width={22} height={22} />}
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: p.heading }}>{loadError ? '서비스를 불러오지 못했어요' : '서비스를 불러오는 중…'}</span>
          <span style={{ fontSize: 14, color: p.muted }}>{loadError ? '잠시 후 다시 시도해주세요.' : '잠시만 기다려 주세요.'}</span>
        </div>
      ) : services.length === 0 ? (
        <div className={`flex flex-col items-center justify-center text-center rounded-2xl ${fill ? 'flex-1 min-h-0' : ''}`} style={{ padding: '56px 20px', gap: 10, background: p.filter, border: `1px solid ${p.border}` }}>
          <span className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: p.inset, color: p.muted }}>
            <MagnifyingGlassIcon width={22} height={22} />
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: p.heading }}>조건에 맞는 서비스가 없어요</span>
          <span style={{ fontSize: 14, color: p.muted }}>필터를 조정하거나 검색어를 바꿔 보세요.</span>
          <button type="button" onClick={onReset} className="mt-1 flex items-center gap-1.5 rounded-lg" style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, color: p.accent, background: p.accentSoft }}>
            <ArrowPathIcon width={13} height={13} /> 필터 초기화
          </button>
        </div>
      ) : (
        <div className={`flex flex-col min-w-0 ${fill ? 'flex-1 min-h-0' : ''}`} style={{ gap: 12 }}>
          <div className={`grid min-w-0 ${fill ? 'flex-1 min-h-0' : ''}`}
            style={{ gap: 14, alignContent: 'start',
              gridTemplateColumns: fill ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))',
              gridTemplateRows: fill ? 'repeat(2, minmax(0, 1fr))' : undefined }}>
            {pageItems.map((s) => <ServiceCard key={s.id} s={s} onOpen={onOpen} />)}
          </div>
          {pageCount > 1 && <PaginationBar page={safePage} pageCount={pageCount} onPage={setPage} />}
        </div>
      )}
    </section>
  )
}

// 랭킹 카드
function RankCard({ item, onOpen, services }: { item: RankItem; onOpen: (s: Service) => void; services: Service[] }) {
  const p = usePalette()
  const medal = item.rank === 1 ? '#F4C71A' : item.rank === 2 ? '#C7CFDB' : item.rank === 3 ? '#E08A4C' : p.chip
  const medalFg = item.rank <= 3 ? '#10131c' : p.muted
  return (
    <button type="button" onClick={() => { const s = services.find((x) => x.id === item.serviceId); if (s) onOpen(s) }}
      className="rounded-xl w-full text-left transition-colors flex flex-col"
      style={{ background: p.inset, border: `1px solid ${p.border}`, flexGrow: 1, flexShrink: 0, flexBasis: 'auto' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent; e.currentTarget.style.background = p.chip }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border; e.currentTarget.style.background = p.inset }}>
      <div className="flex flex-1 items-center gap-2.5" style={{ padding: '11px 12px 9px' }}>
        <span className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: 999, background: medal, color: medalFg, fontSize: 14, fontWeight: 800 }}>{item.rank}</span>
        <Logo id={item.seed} hue={item.hue} icon={iconOf(item.icon)} size={30} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: p.heading }}>{item.name}</span>
          <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{item.model}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span style={{ fontSize: 14, fontWeight: 800, color: p.heading }}>{item.usage}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: deltaColor(p, item.up) }}>{item.delta}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2" style={{ padding: '8px 12px', borderTop: `1px solid ${p.border}` }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {item.chips.map((c) => (
            <span key={c} className="rounded-md whitespace-nowrap" style={{ padding: '2px 7px', fontSize: 14, color: p.muted, background: p.card, border: `1px solid ${p.border}` }}>{c}</span>
          ))}
        </div>
        <StatusBadge status={item.status} tone={item.tone} />
      </div>
    </button>
  )
}

// 4.17·4.18 우 — 실시간 서비스 랭킹. 검색·필터는 좌측 탐색 가이드와 중복이라 제거.
// '전체 랭킹 보기' → 팝업(FullRankingModal). fill 시 헤더·버튼 고정 + 카드 내부 스크롤.
function RankingPanel({ fill, onOpen, services }: { fill: boolean; onOpen: (s: Service) => void; services: Service[] }) {
  const p = usePalette()
  const [allOpen, setAllOpen] = useState(false)
  const rankItems = useMemo(() => rankItemsOf(services), [services])
  return (
    <section className={`rounded-xl min-w-0 flex flex-col ${fill ? 'h-full min-h-0' : ''}`}
      style={{ background: p.panel, border: `1px solid ${p.border}`, boxShadow: PANEL_SHADOW, padding: 16, gap: 14 }}>
      <div className="shrink-0 flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-center justify-between gap-2">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: p.heading }}>실시간 서비스 랭킹</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 700, color: p.ok, background: p.okSoft }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />LIVE
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontSize: 14, fontWeight: 700, color: p.text }}>최대 사용량 서비스 순위</span>
          <span className="flex items-center gap-1" style={{ fontSize: 14, color: p.muted }}><ArrowPathIcon width={12} height={12} /> 1분 전 업데이트</span>
        </div>
      </div>
      <div className={`flex flex-col ${fill ? 'flex-1 min-h-0 overflow-auto' : ''}`} style={{ gap: 10 }}>
        {rankItems.map((r) => <RankCard key={r.rank} item={r} onOpen={onOpen} services={services} />)}
      </div>
      <Button variant="outline" className="justify-center w-full shrink-0" onClick={() => setAllOpen(true)}>전체 랭킹 보기 <ChevronRightIcon width={14} height={14} /></Button>
      {allOpen && <FullRankingModal onClose={() => setAllOpen(false)} onOpen={onOpen} services={services} />}
    </section>
  )
}

// 전체 서비스 랭킹 팝업 — 전 서비스를 사용량(usageNum)순으로. 행 클릭 시 해당 서비스 상세로.
function FullRankingModal({ onClose, onOpen, services }: { onClose: () => void; onOpen: (s: Service) => void; services: Service[] }) {
  const p = usePalette()
  const ranked = useMemo(() => [...services].sort((a, b) => b.usageNum - a.usageNum), [services])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  const pick = (s: Service) => { onClose(); onOpen(s) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: p.dim, backdropFilter: 'blur(3px)', padding: '24px 16px', animation: 'mkFadeIn .18s ease both' }} onClick={onClose} role="presentation">
      <style>{`@keyframes mkFadeIn{from{opacity:0}to{opacity:1}}@keyframes mkPopIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      <div className="w-full rounded-2xl relative flex flex-col" style={{ maxWidth: 600, maxHeight: 'min(870px, calc(100vh - 48px))', background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: p.shadow, animation: 'mkPopIn .24s cubic-bezier(.2,.7,.2,1) both' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="전체 서비스 랭킹">
        <div className="shrink-0 flex items-center justify-between gap-3" style={{ padding: '17px 22px', borderBottom: `1px solid ${p.divider}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="truncate" style={{ fontSize: 18, fontWeight: 800, color: p.heading, letterSpacing: '-0.3px' }}>전체 서비스 랭킹</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full shrink-0" style={{ padding: '3px 9px', fontSize: 14, fontWeight: 700, color: p.ok, background: p.okSoft }}><span className="rounded-full" style={{ width: 6, height: 6, background: 'currentColor' }} />LIVE</span>
            <span className="text-muted shrink-0" style={{ fontSize: 14, color: p.muted }}>사용량순 {ranked.length}개</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex items-center justify-center rounded-lg shrink-0 transition" style={{ width: 32, height: 32, color: p.text, background: p.inset, border: `1px solid ${p.borderStrong}` }}><XMarkIcon width={17} height={17} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '8px 12px' }}>
          {ranked.map((s, i) => {
            const tone = toneOf(s.status)
            const medal = i === 0 ? '#F4C71A' : i === 1 ? '#C7CFDB' : i === 2 ? '#E08A4C' : p.chip
            const medalFg = i < 3 ? '#10131c' : p.muted
            return (
              <button key={s.id} type="button" onClick={() => pick(s)}
                className="w-full text-left flex items-center gap-3 rounded-xl transition-colors"
                style={{ padding: '10px 12px', borderBottom: i < ranked.length - 1 ? `1px solid ${p.divider}` : 'none' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = p.inset)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24, borderRadius: 999, background: medal, color: medalFg, fontSize: 14, fontWeight: 800 }}>{i + 1}</span>
                <Logo id={s.id} hue={s.hue} icon={iconOf(s.icon)} size={34} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: p.heading }}>{s.name}</span>
                  <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{s.provider} · {s.model}</span>
                </div>
                <div className="flex flex-col items-end shrink-0" style={{ gap: 2, width: 84 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: p.heading }}>{s.usage}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: deltaColor(p, s.up) }}>{s.delta}</span>
                </div>
                <span className="shrink-0 hidden sm:inline-flex"><StatusBadge status={s.status} tone={tone} /></span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 4.18 서비스 상세 카드(모달 내용) ─────────────────────────
function StatCard({ icon: Ico, label, value }: { icon: Icon; label: string; value: string }) {
  const p = usePalette()
  return (
    <div className="flex items-center gap-3 rounded-xl" style={{ padding: '13px 14px', background: p.inset, border: `1px solid ${p.border}` }}>
      <span className="flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 10, background: p.accentSoft, color: p.accent }}><Ico width={19} height={19} /></span>
      <div className="flex flex-col min-w-0">
        <span className="truncate" style={{ fontSize: 14, color: p.muted, lineHeight: 1.3 }}>{label}</span>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px', color: p.heading, lineHeight: 1.2 }}>{value}</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  const p = usePalette()
  return <h3 style={{ fontSize: 15.5, fontWeight: 700, color: p.heading, letterSpacing: '-0.2px' }}>{children}</h3>
}

// 점 불릿 리스트(Figma 스타일)
function BulletList({ items }: { items: ReactNode[] }) {
  const p = usePalette()
  return (
    <ul className="flex flex-col" style={{ gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5" style={{ fontSize: 14, lineHeight: 1.5, color: p.muted }}>
          <span className="rounded-full shrink-0" style={{ width: 5, height: 5, background: p.accent, marginTop: 7 }} />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  )
}

// 접속 정보 URL 행 — 라벨 + accent URL. 닫힌망 목업이라 링크 이동 대신 표시·복사용.
function UrlRow({ label, url }: { label: string; url: string }) {
  const p = usePalette()
  const copy = () => { navigator.clipboard?.writeText(url) }
  return (
    <div className="flex items-center gap-3 rounded-lg" style={{ padding: '10px 12px', background: p.inset, border: `1px solid ${p.border}` }}>
      <span className="shrink-0" style={{ fontSize: 14, color: p.muted, width: 84 }}>{label}</span>
      <span className="truncate flex-1 min-w-0" style={{ fontSize: 14, color: p.accent }}>{url}</span>
      <button type="button" onClick={copy} aria-label={`${label} 복사`} className="shrink-0 transition-transform active:scale-90" style={{ color: p.muted }}>
        <ClipboardIcon p={p} />
      </button>
    </div>
  )
}

// 인라인 복사 아이콘(heroicons clipboard outline 경량 path)
function ClipboardIcon({ p }: { p: { muted: string } }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={p.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={9} y={9} width={11} height={11} rx={2} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// 갤러리 이미지 라이트박스(클릭 시 확대). Esc·배경 클릭 닫기, ←/→ 이동.
function ImageLightbox({ images, index, onIndex, onClose }: { images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const multi = images.length > 1
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && multi) onIndex((index - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight' && multi) onIndex((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, multi, onClose, onIndex])
  const navBtn = { width: 42, height: 42, borderRadius: 999, background: 'rgba(255,255,255,0.14)', color: '#fff', backdropFilter: 'blur(4px)', cursor: 'pointer' } as const
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 60, background: 'rgba(8,10,16,0.88)', backdropFilter: 'blur(4px)', padding: '5vh 6vw', animation: 'lbFadeIn .15s ease both' }} onClick={onClose} role="dialog" aria-modal="true" aria-label="이미지 확대 보기">
      <style>{`@keyframes lbFadeIn{from{opacity:0}to{opacity:1}}.lb-btn:hover{background:rgba(255,255,255,0.26)}`}</style>
      <img src={images[index]} alt="" className="rounded-xl" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 16px 60px rgba(0,0,0,0.55)' }} onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} aria-label="닫기" className="lb-btn absolute flex items-center justify-center transition" style={{ ...navBtn, top: 20, right: 24 }}>
        <XMarkIcon width={20} height={20} />
      </button>
      {multi && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length) }} aria-label="이전 이미지" className="lb-btn absolute flex items-center justify-center transition" style={{ ...navBtn, left: 20, top: '50%', transform: 'translateY(-50%)' }}>
            <ChevronRightIcon width={22} height={22} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % images.length) }} aria-label="다음 이미지" className="lb-btn absolute flex items-center justify-center transition" style={{ ...navBtn, right: 20, top: '50%', transform: 'translateY(-50%)' }}>
            <ChevronRightIcon width={22} height={22} />
          </button>
          <span className="absolute" style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)', fontSize: 14, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '4px 12px', borderRadius: 999 }}>{index + 1} / {images.length}</span>
        </>
      )}
    </div>,
    document.body,
  )
}

function ServiceDetailCard({ service: s, narrow, reserveClose }: { service: Service; narrow: boolean; reserveClose?: boolean }) {
  const p = usePalette()
  const navigate = useNavigate()
  const [lightbox, setLightbox] = useState<number | null>(null)
  const tone = toneOf(s.status)
  const apiAvailable = hasApiOf(s)
  const usageStats: [string, string][] = [
    ['월간 요청 수', s.reqFull],
    ['평균 응답시간', s.responseTime.replace('s', '초')],
    ['성공률', s.success],
    ['최근 7일 증감율', s.deltaPct],
    ['마지막 호출', s.lastCall],
  ]
  const ops = [...s.opsNotes, '문의: ai-support@anclave.io']
  const divider = <div style={{ height: 1, background: p.divider }} />
  return (
    <div className="flex flex-col" style={{ gap: narrow ? 18 : 22 }}>
      {/* 헤더 */}
      <div className="flex flex-col" style={{ gap: 18 }}>
        <div className="flex items-start justify-between gap-4 flex-wrap" style={{ paddingRight: reserveClose ? 44 : 0 }}>
          <div className="flex items-start gap-3.5 min-w-0">
            <button
              type="button"
              aria-label="뒤로 가기"
              onClick={() => navigate('/marketplace')}
              className="flex items-center justify-center shrink-0 rounded-[9px] transition-colors cursor-pointer"
              style={{ width: 34, height: 34, marginTop: 9, border: `1px solid ${p.border}`, background: p.card, color: p.muted }}
              onMouseEnter={(e) => { e.currentTarget.style.color = p.text; e.currentTarget.style.background = p.inset }}
              onMouseLeave={(e) => { e.currentTarget.style.color = p.muted; e.currentTarget.style.background = p.card }}
            >
              <ArrowLeftIcon style={{ width: 18, height: 18 }} />
            </button>
            <Logo id={s.id} hue={s.hue} icon={iconOf(s.icon)} size={52} />
            <div className="flex flex-col min-w-0" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', color: p.heading, lineHeight: 1.1 }}>{s.name}</h2>
              <div className="flex items-center flex-wrap gap-2">
                <MetaChip label="제공사" value={s.provider} />
                <MetaChip label="API" value={apiAvailable ? s.api : '미제공'} />
                <MetaChip label="모델" value={s.model} />
                <MetaChip label="소유자" value={s.owner} />
                <StatusBadge status={s.status} tone={tone} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center shrink-0 rounded-xl" style={{ padding: '8px 18px', background: p.okSoft, border: `1px solid ${toneColor(p, 'ok')}33` }}>
            <span className="flex items-center gap-1" style={{ fontSize: 19, fontWeight: 800, color: p.ok, lineHeight: 1.1 }}><StarIcon width={16} height={16} /> {s.rating.toFixed(1)}</span>
            <span style={{ fontSize: 14, color: p.muted }}>사용자 평점</span>
          </div>
        </div>
        {divider}
      </div>

      {/* 스크린샷 갤러리 */}
      {s.screenshots && s.screenshots.length > 0 && (
        <div className="flex overflow-x-auto" style={{ gap: 12, paddingBottom: 4 }}>
          {s.screenshots.map((src, i) => (
            <img key={src} src={src} alt="" loading="lazy" onClick={() => setLightbox(i)} className="shrink-0 object-cover transition-[border-color,transform] hover:-translate-y-0.5"
              style={{ height: 200, borderRadius: 12, border: `1px solid ${p.border}`, background: p.inset, objectPosition: 'top', cursor: 'zoom-in' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = p.accent }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = p.border }} />
          ))}
        </div>
      )}

      {/* 4 스탯 카드 */}
      <div className="grid" style={{ gap: 12, gridTemplateColumns: narrow ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
        <StatCard icon={ClockIcon} label="평균 응답 시간" value={s.responseTime} />
        <StatCard icon={CodeBracketIcon} label="호출 방식" value={apiAvailable ? s.api : '콘솔'} />
        <StatCard icon={StarIcon} label="모델 등급" value={s.tier} />
        <StatCard icon={ChartBarIcon} label="월 요청수" value={s.monthlyReq} />
      </div>

      {/* 개요 */}
      <div className="flex flex-col" style={{ gap: 9 }}>
        <SectionTitle>서비스 개요</SectionTitle>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: p.muted }}>{s.overview}</p>
      </div>

      {/* API 설명(API 제공 시) */}
      {apiAvailable && s.apiDesc && (
        <div className="flex flex-col" style={{ gap: 9 }}>
          <SectionTitle>API 설명</SectionTitle>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: p.muted }}>{s.apiDesc}</p>
        </div>
      )}

      {/* 주요 기능 */}
      <div className="flex flex-col" style={{ gap: 11 }}>
        <SectionTitle>주요 기능</SectionTitle>
        <ul className="grid" style={{ rowGap: 9, columnGap: 24, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
          {s.features.map((feat) => (
            <li key={feat} className="flex items-center gap-2.5" style={{ fontSize: 14, color: p.text }}>
              <span className="flex items-center justify-center shrink-0" style={{ width: 18, height: 18, borderRadius: 999, background: p.accentSoft, color: p.accent }}>
                <CheckIcon width={11} height={11} strokeWidth={3.2} />
              </span>
              {feat}
            </li>
          ))}
        </ul>
      </div>

      {divider}

      {/* 사용 현황 · 운영 메모 — Figma 점 불릿 2열 */}
      <div className="grid" style={{ gap: narrow ? 18 : 28, gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 1fr)' }}>
        <div className="flex flex-col" style={{ gap: 11 }}>
          <SectionTitle>사용 현황</SectionTitle>
          <BulletList items={usageStats.map(([k, v]) => (
            <span key={k} className="flex items-baseline justify-between gap-3">
              <span style={{ color: p.muted }}>{k}</span>
              <span className="text-right tabular-nums" style={{ fontWeight: 700, color: p.text, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
            </span>
          ))} />
        </div>
        <div className="flex flex-col" style={{ gap: 11 }}>
          <SectionTitle>운영 메모</SectionTitle>
          <BulletList items={ops} />
        </div>
      </div>

      {divider}

      {/* 접속 정보 — 서비스 URL · 데모 URL (명세서 동일 항목) */}
      <div className="flex flex-col" style={{ gap: 11 }}>
        <SectionTitle>접속 정보</SectionTitle>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <UrlRow label="서비스 URL" url={s.serviceUrl || `http://svc.anclave.local/${s.id}`} />
          {apiAvailable && <UrlRow label="데모 URL" url={s.demoUrl || `http://svc.anclave.local/${s.id}/playground`} />}
        </div>
      </div>

      {divider}

      {/* 소유자 안내 + 액션(API 키 요청 = 버튼만, 발급은 추후) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="flex items-center gap-2" style={{ fontSize: 14, color: p.muted }}>
          <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 18, height: 18, background: p.accentSoft, color: p.accent }}>
            <CheckIcon width={11} height={11} strokeWidth={3} />
          </span>
          소유자 <b style={{ color: p.text }}>{s.owner}</b> 님이 GPU에 배포한 서비스 · 내부 사용자에게만 제공
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="outline">서비스 문의</Button>
          {apiAvailable
            ? <Button onClick={() => navigate(`/marketplace/api-request/${s.id}`)}><KeyIcon width={15} height={15} /> API 키 요청</Button>
            : <Button>워크스페이스 열기</Button>}
        </div>
      </div>

      {lightbox !== null && s.screenshots?.[lightbox] !== undefined && (
        <ImageLightbox images={s.screenshots} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

// ───────────────────────── 4.17 마켓플레이스 ─────────────────────────
export function Marketplace() {
  const p = usePalette()
  const narrow = useNarrow()
  const fill = !narrow // 넓은 화면: 무스크롤 fill(3패널 같은 높이·하단 정렬·목록 내부 스크롤)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<SortKey>('recent') // 기본 = Figma 노출 순서(시드순)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const openService = (s: Service) => navigate(`/marketplace/${s.id}`)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let alive = true
    listMarketServices()
      .then((d) => { if (alive) { setServices(d); setLoadError(false) } })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const reset = () => setFilters(emptyFilters())
  const kinds = useMemo(() => kindsOf(services), [services])
  const models = useMemo(() => modelsOf(services), [services])
  const allTags = useMemo(() => allTagsOf(services), [services])
  const results = useMemo(() => applyFilters(services, filters, sort), [services, filters, sort])

  // ?service=<id> 진입(API 키 요청 완료 등) → 서비스 상세 페이지로 리다이렉트.
  useEffect(() => {
    const sid = params.get('service')
    if (sid) navigate(`/marketplace/${sid}`, { replace: true })
  }, [params, navigate])

  return (
    <div data-qa className="anim-fade flex flex-col min-w-0" style={{ gap: 14, height: fill ? '100%' : 'auto', overflow: fill ? 'hidden' : 'visible' }}>
      <QaPolish />
      {/* 상단 검색바(동작) */}
      <div className="shrink-0 flex items-center gap-3 rounded-xl" style={{ padding: '11px 14px', background: p.card, border: `1px solid ${p.border}` }}>
        <span className="flex items-center gap-2.5 flex-1 min-w-0">
          <MagnifyingGlassIcon width={18} height={18} className="shrink-0" style={{ color: p.muted }} />
          <input value={filters.query} onChange={(e) => set({ query: e.target.value })}
            className="bg-transparent outline-none w-full min-w-0" style={{ fontSize: 14.5, color: p.text }} placeholder="서비스를 검색해 보세요" aria-label="서비스 검색" />
          {filters.query && (
            <button type="button" onClick={() => set({ query: '' })} aria-label="검색어 지우기" className="shrink-0" style={{ color: p.muted }}>
              <XMarkIcon width={16} height={16} />
            </button>
          )}
        </span>
        <Button className="shrink-0"><MagnifyingGlassIcon width={15} height={15} /> 검색</Button>
      </div>

      {/* 좌 필터 · 중앙 목록 · 우 랭킹 — 같은 높이로 하단까지 채움 */}
      <div className="grid min-w-0"
        style={{ gap: 16, gridTemplateColumns: narrow ? '1fr' : '316px minmax(0, 1fr) 340px', flex: fill ? '1 1 0%' : undefined, minHeight: 0 }}>
        <FilterPanel f={filters} set={set} onReset={reset} fill={fill} kinds={kinds} models={models} allTags={allTags} />
        <AIList services={results} total={services.length} sort={sort} onSort={setSort} onOpen={openService} onReset={reset} fill={fill} loading={loading} loadError={loadError} />
        <RankingPanel fill={fill} onOpen={openService} services={services} />
      </div>
    </div>
  )
}

// ───────────────────────── 사용량 인사이트(GET /api/market-services/:id/usage raw → 화면 표현값) ─────────────────────────
const nf = (n: number) => n.toLocaleString('en-US')
const compactNum = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n))
// 사용자별 점유 색 — 스택 막대·범례·랭킹 dot 공통.
const consumerColor = (i: number) => `hsl(${(214 + i * 40) % 360}, 64%, 57%)`
// 키 발급일(목업) — keyId 기반 deterministic. 실제 승인일은 backend 필드 추가 시 교체.
const hashKey = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const issuedDate = (keyId: string) => { const h = hashKey(keyId); const m = 1 + (h % 5); const d = 1 + ((h >>> 8) % 28); return `2024.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}` }

interface RankRow { name: string; keyId: string; tag: string; team: string; teamHue: number; requests: number; reqPct: number; tokens: number; tokenPct: number; deltaPct: number; up: boolean; spark: number[]; color: string; issuedAt: string }
interface DayStack { label: string; perUser: number[]; total: number; concurrent: number }
interface UsageInsight { keyCount: number; rows: RankRow[]; days: DayStack[]; totalRequests: number; totalTokens: number; maxRequests: number; maxConcurrent: number; avgConcurrent: number; todayDeltaPct: number; todayUp: boolean }

// backend raw 집계 → 비율·색·축 스케일 등 화면 표현값 계산(색·정렬·스케일은 프론트 책임).
function toUsageInsight(raw: MarketServiceUsage): UsageInsight {
  const rows: RankRow[] = raw.rows.map((r, i) => ({
    name: r.owner, keyId: r.keyId, tag: r.tag, team: r.team, teamHue: r.teamHue,
    requests: r.requests, reqPct: 0, tokens: r.tokens, tokenPct: 0,
    deltaPct: r.deltaPct, up: r.deltaPct >= 0, spark: r.spark, color: consumerColor(i), issuedAt: issuedDate(r.keyId),
  }))
  const totalRequests = rows.reduce((a, r) => a + r.requests, 0) || 1
  const totalTokens = rows.reduce((a, r) => a + r.tokens, 0) || 1
  rows.forEach((r) => { r.reqPct = r.requests / totalRequests; r.tokenPct = r.tokens / totalTokens })
  const days: DayStack[] = raw.days.map((d) => ({ label: d.label, perUser: d.perKey, total: d.total, concurrent: d.concurrent }))
  const maxRequests = Math.max(...days.map((d) => d.total), 1)
  const maxConcurrent = Math.max(...days.map((d) => d.concurrent), 1)
  const avgConcurrent = days.length ? Math.round(days.reduce((a, d) => a + d.concurrent, 0) / days.length) : 0
  const last = days[days.length - 1]
  const prev = days[days.length - 2]
  const todayDeltaPct = prev && prev.total ? Math.round(((last.total - prev.total) / prev.total) * 1000) / 10 : 0
  return { keyCount: raw.keyCount, rows, days, totalRequests, totalTokens, maxRequests, maxConcurrent, avgConcurrent, todayDeltaPct, todayUp: todayDeltaPct >= 0 }
}

// 랭킹 요약 — API 키별 요청·점유·변화(Figma 'Group 1' 상단 테이블).
function RankingSummary({ insight }: { insight: UsageInsight }) {
  const p = usePalette()
  const cols = '26px minmax(0,1.55fr) 92px 86px 122px'
  const MEDAL = ['#F4C71A', '#C7CFDB', '#E08A4C']
  const rankStyle = (i: number) => (i <= 2
    ? { background: `linear-gradient(140deg, ${MEDAL[i]}, ${MEDAL[i]}bb)`, color: '#10131c', boxShadow: `0 2px 7px ${MEDAL[i]}55` }
    : { background: p.inset, color: p.muted, border: `1px solid ${p.border}` })
  return (
    <section className="rounded-2xl flex flex-col shrink-0" style={{ background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: '0 2px 10px rgba(0,0,0,0.16)', padding: 20 }}>
      <style>{`@keyframes rankRowIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: p.heading }}>랭킹 요약</h3>
        <span className="rounded-full" style={{ padding: '2px 10px', fontSize: 14, fontWeight: 700, color: p.accent, background: p.accentSoft }}>API 키 {insight.keyCount}개</span>
      </div>
      <div className="grid items-center" style={{ gridTemplateColumns: cols, gap: 14, padding: '0 4px 9px', fontSize: 14, fontWeight: 600, color: p.muted, borderBottom: `1px solid ${p.divider}` }}>
        <span className="text-center">#</span><span>소유자 · 팀</span><span>키 발급일</span>
        <span className="text-right">요청 수</span><span className="text-right">변화 · 7일</span>
      </div>
      <div className="flex flex-col">
        {insight.rows.map((r, i) => (
          <div key={r.keyId} className="grid items-center rounded-xl transition-colors" style={{ gridTemplateColumns: cols, gap: 14, padding: '11px 4px', animation: 'rankRowIn .4s ease both', animationDelay: `${i * 55}ms` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = p.inset }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            <span className="flex items-center justify-center justify-self-center" style={{ width: 24, height: 24, borderRadius: 999, fontSize: 14, fontWeight: 800, ...rankStyle(i) }}>{i + 1}</span>
            <div className="flex items-center min-w-0" style={{ gap: 8 }}>
              <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 28, height: 28, fontSize: 14, fontWeight: 800, color: '#fff', background: `linear-gradient(140deg, hsl(${r.teamHue},64%,56%), hsl(${(r.teamHue + 24) % 360},60%,46%))` }}>{r.name.slice(0, 1)}</span>
              <div className="flex flex-col min-w-0" style={{ gap: 1 }}>
                <span className="truncate" style={{ fontSize: 14, fontWeight: 700, color: p.heading }}>{r.name}</span>
                <span className="truncate" style={{ fontSize: 14, color: p.muted }}>{r.team}</span>
              </div>
            </div>
            <span className="tabular-nums truncate" style={{ fontSize: 14, color: p.muted }}>{r.issuedAt}</span>
            <div className="flex flex-col items-end" style={{ gap: 5 }}>
              <div className="flex items-baseline" style={{ gap: 5 }}>
                <span className="tabular-nums" style={{ fontSize: 14.5, fontWeight: 800, color: p.heading, letterSpacing: '-0.3px' }}>{nf(r.requests)}</span>
                <span className="tabular-nums" style={{ fontSize: 14, color: p.muted }}>{(r.reqPct * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: p.inset }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(5, r.reqPct * 100)}%`, background: r.color }} />
              </div>
            </div>
            <div className="flex items-center justify-end" style={{ gap: 8 }}>
              <div className="shrink-0" style={{ width: 56, height: 22 }}><SparkLine data={r.spark} color={r.up ? p.ok : p.danger} fill /></div>
              <span className="flex items-center tabular-nums shrink-0 rounded-md" style={{ gap: 1, padding: '3px 7px', fontSize: 14, fontWeight: 800, color: r.up ? p.ok : p.danger, background: r.up ? p.okSoft : p.dangerSoft }}>
                {r.up ? '▲' : '▼'}{Math.abs(r.deltaPct).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
      <span style={{ marginTop: 10, fontSize: 14, color: p.muted }}>막대는 전체 요청 대비 점유율 · 변화는 이전 7일 대비예요.</span>
    </section>
  )
}

// 사용량 추이 — 일별 스택 막대(API 키별) + 동시 사용량 라인(Figma 'Group 1' 하단 콤보).
function UsageTrendChart({ insight }: { insight: UsageInsight }) {
  const p = usePalette()
  const { days, rows, maxRequests, maxConcurrent, avgConcurrent, todayDeltaPct, todayUp } = insight
  const last = days[days.length - 1]
  const colW = 64 / days.length // 막대 컬럼 폭(%)
  const yMax = maxRequests * 1.16 // 막대 위 라벨 헤드룸(차트 천장·헤더 침범 방지)
  const cMax = Math.max(1, Math.ceil(maxConcurrent * 1.12)) // 라인 상단 헤드룸
  const pts = days.map((d, i) => ({ x: ((i + 0.5) / days.length) * 100, y: (1 - d.concurrent / cMax) * 100 }))
  const linePath = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
  return (
    <section className="rounded-2xl flex flex-col flex-1 min-h-0" style={{ background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: '0 2px 10px rgba(0,0,0,0.16)', padding: 20 }}>
      <div className="flex items-center justify-between gap-2 shrink-0" style={{ marginBottom: 14 }}>
        <h3 className="flex items-center gap-1.5" style={{ fontSize: 16, fontWeight: 800, color: p.heading }}>
          <ChartBarIcon width={16} height={16} style={{ color: p.accent }} /> 사용량 추이
        </h3>
        <span className="rounded-lg" style={{ padding: '3px 10px', fontSize: 14, fontWeight: 600, color: p.muted, background: p.inset, border: `1px solid ${p.border}` }}>일별 · 최근 7일</span>
      </div>

      <div className="flex flex-1 min-h-0" style={{ gap: 8 }}>
        <div className="flex flex-col justify-between shrink-0 text-right h-full" style={{ fontSize: 14, color: p.muted, width: 36 }}>
          <span>{compactNum(Math.round(yMax))}</span><span>{compactNum(Math.round(yMax / 2))}</span><span>0</span>
        </div>
        <div className="relative flex-1 min-w-0 h-full">
          {[0, 0.5, 1].map((g) => <div key={g} className="absolute left-0 right-0" style={{ top: `${g * 100}%`, borderTop: `1px dashed ${p.border}` }} />)}
          <div className="absolute inset-0 flex items-end justify-around">
            {days.map((d, di) => (
              <div key={di} className="relative flex justify-center" style={{ width: `${colW}%`, height: '100%' }}>
                <div className="absolute bottom-0 w-full flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${(d.total / yMax) * 100}%` }}>
                  {d.perUser.map((v, ui) => <div key={ui} style={{ height: `${(v / d.total) * 100}%`, background: rows[ui]?.color ?? consumerColor(ui) }} />)}
                </div>
              </div>
            ))}
          </div>
          <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <path d={linePath} fill="none" stroke={p.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {pts.map((pt, i) => <span key={i} className="absolute rounded-full" style={{ left: `${pt.x}%`, top: `${pt.y}%`, width: 7, height: 7, background: p.accent, border: `2px solid ${p.modalCard}`, transform: 'translate(-50%,-50%)' }} />)}
          {days.map((d, i) => (
            <span key={`lbl-${i}`} className="absolute whitespace-nowrap rounded" style={{ left: `${((i + 0.5) / days.length) * 100}%`, bottom: `${(d.total / yMax) * 100}%`, transform: 'translateX(-50%)', marginBottom: 5, fontSize: 14, fontWeight: 700, color: p.heading, padding: '0 5px', background: p.modalCard, boxShadow: `0 0 0 1px ${p.border}` }}>{compactNum(d.total)}</span>
          ))}
        </div>
        <div className="flex flex-col justify-between shrink-0 h-full" style={{ fontSize: 14, color: p.accent, width: 28 }}>
          <span>{cMax}</span><span>{Math.round(cMax / 2)}</span><span>0</span>
        </div>
      </div>
      <div className="flex justify-around shrink-0" style={{ marginLeft: 44, marginRight: 36, marginTop: 6, fontSize: 14, color: p.muted }}>
        {days.map((d, i) => <span key={i} className="text-center" style={{ width: `${colW}%` }}>{d.label}</span>)}
      </div>

      <div className="flex flex-wrap items-center shrink-0" style={{ gap: '6px 14px', marginTop: 14 }}>
        {rows.map((r) => (
          <span key={r.keyId} className="flex items-center" style={{ gap: 5, fontSize: 14, color: p.muted }}>
            <span className="rounded-sm" style={{ width: 10, height: 10, background: r.color }} /> {r.keyId}
          </span>
        ))}
        <span className="flex items-center" style={{ gap: 5, fontSize: 14, color: p.muted }}>
          <span style={{ width: 14, height: 2, background: p.accent }} /> 동시 사용량(우축)
        </span>
      </div>

      <div className="rounded-xl shrink-0" style={{ marginTop: 12, padding: '10px 14px', background: p.inset, border: `1px solid ${p.border}`, fontSize: 14, color: p.muted, lineHeight: 1.5 }}>
        <b style={{ color: p.heading }}>{last.label}</b> 총 요청 <b style={{ color: p.heading }}>{compactNum(last.total)}</b>
        <span style={{ color: todayUp ? p.ok : p.danger, fontWeight: 700 }}> (전일 대비 {todayUp ? '+' : ''}{todayDeltaPct}%)</span> · 평균 동시 사용량 <b style={{ color: p.heading }}>{avgConcurrent}</b>
      </div>
    </section>
  )
}

// ───────────────────────── 4.18 서비스 상세(페이지) ─────────────────────────
export function ServiceDetail() {
  const p = usePalette()
  const narrow = useNarrow(760)
  const navigate = useNavigate()
  const { id } = useParams()
  const [service, setService] = useState<Service | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')
  useEffect(() => {
    if (!id) { setState('notfound'); return }
    let alive = true
    setState('loading')
    getMarketService(id)
      .then((s) => { if (alive) { setService(s); setState('ready') } })
      .catch(() => { if (alive) setState('notfound') })
    return () => { alive = false }
  }, [id])
  const [insight, setInsight] = useState<UsageInsight | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    setInsight(null)
    getMarketServiceUsage(id)
      .then((raw) => { if (alive) setInsight(toUsageInsight(raw)) })
      .catch(() => { if (alive) setInsight(null) })
    return () => { alive = false }
  }, [id])
  const fill = !narrow // 넓은 화면: 무스크롤 2열 대시보드(페이지 고정, 콘텐츠는 컬럼 내부 스크롤)
  const panel = { background: p.modalCard, border: `1px solid ${p.borderStrong}`, boxShadow: '0 2px 10px rgba(0,0,0,0.16)' } as const

  return (
    <div data-qa className="anim-fade flex flex-col min-w-0 w-full mx-auto" style={{ gap: 12, height: fill ? '100%' : 'auto', overflow: fill ? 'hidden' : 'visible', maxWidth: fill ? undefined : 1080 }}>
      <QaPolish />
      {state === 'ready' && service && insight ? (
        <div className="grid min-w-0" style={{ gap: 14, flex: fill ? '1 1 0%' : undefined, minHeight: 0, gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)' }}>
          {/* 좌 — 서비스 상세(콘텐츠 많을 때 컬럼 내부에서만 스크롤) */}
          <div className="rounded-2xl min-w-0 min-h-0" style={{ ...panel, overflowY: fill ? 'auto' : 'visible', padding: narrow ? 20 : 24 }}>
            <ServiceDetailCard service={service} narrow={narrow} />
          </div>
          {/* 우 — 랭킹 요약(위) + 사용량 추이(아래) */}
          <div className="flex flex-col min-w-0 min-h-0" style={{ gap: 14, overflowY: fill ? 'auto' : 'visible' }}>
            <RankingSummary insight={insight} />
            <UsageTrendChart insight={insight} />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ ...panel, minHeight: 200, gap: 12, padding: 28 }}>
          <span style={{ fontSize: 14, color: p.muted }}>{state === 'loading' ? '서비스 정보를 불러오는 중…' : '서비스를 찾을 수 없어요.'}</span>
          {state === 'notfound' && <Button variant="outline" onClick={() => navigate('/marketplace')}>마켓플레이스로</Button>}
        </div>
      )}
    </div>
  )
}

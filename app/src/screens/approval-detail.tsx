import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleStackIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  ServerStackIcon,
  Squares2X2Icon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  StatusBadge,
  useToast,
} from '../components/ui'
import { useTheme } from '../lib/theme'
import { useRole } from '../lib/role'
import { modelById, serverById, servers, services, userById } from '../data'
import type { GpuRequest } from '../data/types'
import { approveGpuRequest, fetchGpuRequestById, nowStamp, rejectGpuRequest } from './approval-store'

// 4.10a 신청 상세 심사 (/admin/approvals/gpu/:id) — 4.10 승인 관리의 드로어를 전용 페이지로 승격.
// pending = 2컬럼(좌 할당 판단[멀티스텝 서버→GPU→MIG 슬라이스 · 검색/필터] / 우 신청 상세[명세서 자리]).
// approved·rejected = 1컬럼 조회. 처리 결과는 approval-store 세션 사본에 기록.

// 다크 테마 muted(#525872)가 본문에 너무 어두워 4.6과 동일하게 톤 보정
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

// 페이지 스코프 디테일 — 정적 텍스트는 선택/드래그 차단, 클릭 요소엔 pointer 커서, 입력 필드는 텍스트 선택 유지.
// (morph 트랜지션의 reduced-motion 예외도 같이 둠)
function PolishCss() {
  return (
    <style>{`
      [data-approval]{user-select:none;-webkit-user-select:none}
      [data-approval] button:not(:disabled),[data-approval] a,[data-approval] [role="slider"],[data-approval] select{cursor:pointer}
      [data-approval] button:disabled{cursor:not-allowed}
      [data-approval] input,[data-approval] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      [data-morph]{transition-duration:.8s !important}
    `}</style>
  )
}

// 헤더 뒤로가기 버튼 — 4.10 목록과 동일 외형(38px·border·soft 그림자). 제목 행 인라인 선두 배치.
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="뒤로 가기"
      className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90"
      style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}
    >
      <ArrowLeftIcon style={{ width: 18, height: 18 }} />
    </button>
  )
}

const UNIT_KO: Record<GpuRequest['capacityUnit'], string> = { card: '카드', slice: '슬라이스' }
const PRIORITY_BADGE: Record<NonNullable<GpuRequest['priority']>, { tone: 'danger' | 'info' | 'neutral'; label: string }> = {
  high: { tone: 'danger', label: '높음' },
  normal: { tone: 'info', label: '보통' },
  low: { tone: 'neutral', label: '낮음' },
}

// ── 자원맵(서버별 할당 보기) 요약 트리 — 서버 → GPU → (MIG)슬라이스 ──
type SlotStatus = 'available' | 'full' | 'maintenance'
const STATUS_META: Record<SlotStatus, { label: string; tone: 'ok' | 'neutral' | 'danger'; selectable: boolean }> = {
  available: { label: '가용', tone: 'ok', selectable: true },
  full: { label: '여유 없음', tone: 'neutral', selectable: false },
  maintenance: { label: '점검', tone: 'danger', selectable: false },
}
interface SliceNode { id: string; profile: string; gb: number; free: boolean; tag: string }
interface GpuNode { id: string; name: string; mode: 'cluster' | 'mig'; vramGb: number; load: number; status: SlotStatus; free: boolean; slices: SliceNode[]; freeSlices: number; totalSlices: number; dummy?: boolean }
interface ServerNode { id: string; host: string; models: string; gpus: GpuNode[]; status: SlotStatus; load: number; freeUnits: number; totalUnits: number; dummy?: boolean }

function buildResourceTree(): ServerNode[] {
  const real = servers.map((server): ServerNode => {
    const gpus = server.gpus.map((g): GpuNode => {
      if (g.allocMode === 'mig') {
        const slices: SliceNode[] = (g.slices ?? []).map((s) => {
          const free = !s.ownerUserId && s.usage === 0
          return { id: s.id, profile: s.profile, gb: s.gb, free, tag: free ? '가용' : (userById(s.ownerUserId ?? '')?.name ?? '사용 중') }
        })
        const freeSlices = slices.filter((s) => s.free).length
        const status: SlotStatus = g.xid || g.health === 'danger' ? 'maintenance' : freeSlices > 0 ? 'available' : 'full'
        return { id: g.id, name: g.name, mode: 'mig', vramGb: g.vramGb, load: g.smUtil, status, free: status === 'available', slices, freeSlices, totalSlices: slices.length }
      }
      const free = !g.assignedServiceId && !g.xid && g.health !== 'danger'
      const status: SlotStatus = g.xid || g.health === 'danger' ? 'maintenance' : free ? 'available' : 'full'
      return { id: g.id, name: g.name, mode: 'cluster', vramGb: g.vramGb, load: g.smUtil, status, free, slices: [], freeSlices: 0, totalSlices: 0 }
    })
    const freeUnits = gpus.reduce((a, g) => a + (g.mode === 'mig' ? g.freeSlices : g.free ? 1 : 0), 0)
    const totalUnits = gpus.reduce((a, g) => a + (g.mode === 'mig' ? g.totalSlices : 1), 0)
    const load = gpus.length ? Math.round(gpus.reduce((a, g) => a + g.load, 0) / gpus.length) : 0
    const status: SlotStatus = server.health === 'danger' ? 'maintenance' : freeUnits > 0 ? 'available' : 'full'
    return { id: server.id, host: server.host, models: [...new Set(server.gpus.map((g) => g.model))].join(', '), gpus, status, load, freeUnits, totalUnits }
  })
  return real
    .sort((a, b) => Number(STATUS_META[b.status].selectable) - Number(STATUS_META[a.status].selectable) || b.freeUnits - a.freeUnits)
}

// ── 모델별 권장 자원 제한 — Model 자원 요건(reqVram/Ram/Storage/Cpu) 합산(여러 모델이면 합) ──
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
// 관리자 조절 허용 범위 = 추천의 0.5~2배(플랫폼 절대 캡으로 클램프). 추천은 게이지 마커로 표시.
function limitBounds(rec: number, absMin: number, absMax: number): { min: number; max: number } {
  return { min: clamp(Math.floor(rec * 0.5), absMin, rec), max: clamp(Math.ceil(rec * 2), rec, absMax) }
}
interface Limits { ramGb: number; storageGb: number; cpuCores: number; vramGb: number }
function recommendLimits(models: string[]): Limits & { basis: string[] } {
  const acc = models.reduce((a, id) => {
    const m = modelById(id)
    return {
      vramGb: a.vramGb + (m?.reqVramGb ?? 0),
      ramGb: a.ramGb + (m?.reqRamGb ?? 0),
      storageGb: a.storageGb + (m?.reqStorageGb ?? 0),
      cpuCores: a.cpuCores + (m?.reqCpuCores ?? 0),
    }
  }, { vramGb: 0, ramGb: 0, storageGb: 0, cpuCores: 0 })
  return { ...acc, basis: models.map((id) => modelById(id)?.name ?? id) }
}

// 승인 건 할당 자원 표시 — allocated* 우선(서버 미존재=더미면 raw id), 없으면 serviceName 역추적
function resolveAllocationLabel(req: GpuRequest): { text: string; link?: { serverId: string; gpuId?: string } } | null {
  if (req.allocatedServerId) {
    const server = serverById(req.allocatedServerId)
    if (server) {
      const gpu = server.gpus.find((g) => g.id === req.allocatedGpuId)
      const slice = gpu?.slices?.find((sl) => sl.id === req.allocatedSliceId)
      return { text: `${server.host}${gpu ? ` · ${gpu.name}` : ''}${slice ? ` · ${slice.profile}` : ''}`, link: { serverId: server.id, gpuId: gpu?.id } }
    }
    return { text: [req.allocatedServerId, req.allocatedGpuId, req.allocatedSliceId].filter(Boolean).join(' · ') }
  }
  const svc = services.find((s) => s.name === req.serviceName)
  if (!svc) return null
  for (const server of servers) {
    for (const gpu of server.gpus) {
      if (gpu.assignedServiceId === svc.id) return { text: `${server.host} · ${gpu.name}`, link: { serverId: server.id, gpuId: gpu.id } }
      const slice = gpu.slices?.find((sl) => sl.ownerUserId === svc.ownerUserId && sl.modelId === svc.model)
      if (slice) return { text: `${server.host} · ${gpu.name} · ${slice.profile}`, link: { serverId: server.id, gpuId: gpu.id } }
    }
  }
  return null
}

// ── 프리미티브 ──
function ActionBtn({ children, variant, full, disabled, onClick }: { children: ReactNode; variant: 'primary' | 'dangerOutline' | 'danger' | 'ghost'; full?: boolean; disabled?: boolean; onClick: () => void }) {
  const style: React.CSSProperties =
    variant === 'primary' ? { background: 'var(--c-accent)', color: 'var(--c-onaccent)' }
      : variant === 'danger' ? { background: 'var(--danger-soft)', color: 'var(--c-danger)' }
        : variant === 'dangerOutline' ? { background: 'transparent', color: 'var(--c-danger)', border: '1px solid var(--c-danger)' }
          : { background: 'transparent', color: 'var(--c-text)', border: '1px solid var(--c-border)' }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1.5 font-semibold rounded-[8px] transition-[transform,filter,opacity] duration-100 enabled:active:scale-[0.97] enabled:hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed ${full ? 'flex-1' : ''}`} style={{ height: 40, padding: '0 18px', fontSize: 14, ...style }}>
      {children}
    </button>
  )
}

function LoadBar({ load }: { load: number }) {
  const color = load > 85 ? 'var(--c-warn)' : load >= 1 ? 'var(--c-accent)' : 'var(--c-border)'
  return (
    <span className="flex items-center min-w-0 flex-1" style={{ gap: 8 }}>
      <span className="rounded-full overflow-hidden flex-1" style={{ height: 5, background: 'var(--c-bg)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, load)}%`, background: color }} />
      </span>
      <span className="text-muted tabular-nums shrink-0" style={{ fontSize: 12.5 }}>부하 {load}%</span>
    </span>
  )
}

// 드래그 게이지 — 트랙·채움·썸 + 추천 마커. 허용 범위 [min,max] 안에서만 조절.
function Gauge({ value, min, max, rec, step, onChange }: { value: number; min: number; max: number; rec: number; step: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const span = Math.max(1, max - min)
  const pct = (v: number) => clamp(((v - min) / span) * 100, 0, 100)
  const apply = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const ratio = clamp((clientX - r.left) / r.width, 0, 1)
    onChange(clamp(Math.round((min + ratio * span) / step) * step, min, max))
  }
  const onDown = (e: ReactPointerEvent) => { dragging.current = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); apply(e.clientX) }
  const onMove = (e: ReactPointerEvent) => { if (dragging.current) apply(e.clientX) }
  const stop = () => { dragging.current = false }
  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop} className="relative cursor-pointer select-none" style={{ height: 18, touchAction: 'none' }} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
      <div className="absolute left-0 right-0 rounded-full overflow-hidden" style={{ top: 6, height: 6, background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
        <div className="h-full" style={{ width: `${pct(value)}%`, background: 'var(--c-accent)' }} />
      </div>
      {/* 추천 마커 */}
      <div className="absolute" style={{ left: `${pct(rec)}%`, top: 1, width: 2, height: 16, marginLeft: -1, background: 'var(--c-muted)', opacity: 0.65, borderRadius: 1 }} title={`추천 ${rec}`} />
      {/* 썸 */}
      <div className="absolute rounded-full" style={{ left: `${pct(value)}%`, top: 1, width: 16, height: 16, marginLeft: -8, background: 'var(--c-accent)', border: '2px solid var(--c-card2)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
    </div>
  )
}

// 자원 제한 카드 — 아이콘·라벨 / 큰 편집 숫자 / 드래그 게이지(허용 범위·추천 마커) / min·추천·max.
function LimitCard({ icon, label, value, onChange, unit, rec, min, max, step }: { icon: ReactNode; label: string; value: number; onChange: (v: number) => void; unit: string; rec: number; min: number; max: number; step: number }) {
  const low = value < rec
  return (
    <div className="flex-1 min-w-0 rounded-[10px] border border-line flex flex-col bg-card2" style={{ padding: '10px 12px', gap: 8 }}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="flex items-center justify-center shrink-0 rounded-[6px]" style={{ width: 22, height: 22, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{icon}</span>
        <span className="text-muted truncate" style={{ fontSize: 13 }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value.replace(/[^0-9]/g, '')) || 0, min, max))}
          className="bg-transparent min-w-0 font-bold tabular-nums text-text rounded focus:bg-soft"
          style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.5px', outline: 'none', border: 'none', width: `${Math.max(2, String(value).length)}ch` }}
        />
        <span className="text-muted shrink-0" style={{ fontSize: 13, fontWeight: 500 }}>{unit}</span>
      </div>
      <Gauge value={value} min={min} max={max} rec={rec} step={step} onChange={onChange} />
      <div className="flex items-center justify-between" style={{ fontSize: 11.5 }}>
        <span className="text-muted tabular-nums">{min}{unit}</span>
        <span className="tabular-nums" style={{ color: low ? 'var(--c-warn)' : 'var(--c-muted)', fontWeight: low ? 600 : 400 }}>추천 {rec}</span>
        <span className="text-muted tabular-nums">{max}{unit}</span>
      </div>
    </div>
  )
}


// ── 검색/필터 바 (서버·GPU 모델 검색 + 상태 필터) ──
function PickerSearch({ q, setQ, statusF, setStatusF, count }: { q: string; setQ: (v: string) => void; statusF: string; setStatusF: (v: string) => void; count: number }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex items-center bg-card2 border border-line rounded-[8px] flex-1 min-w-0 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 36, padding: '0 11px', gap: 8 }}>
        <MagnifyingGlassIcon width={16} height={16} style={{ color: 'var(--c-muted)' }} className="shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="서버·GPU 모델 검색 (예: RTX 2060, H100)" className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} />
        {q && <button type="button" onClick={() => setQ('')} className="shrink-0 text-muted hover:text-text" aria-label="지우기"><XCircleIcon width={15} height={15} /></button>}
      </div>
      <div className="relative flex items-center bg-card2 border border-line rounded-[8px] shrink-0" style={{ height: 36, padding: '0 11px', gap: 6, width: 124 }}>
        <span className="text-text font-medium pointer-events-none truncate" style={{ fontSize: 14 }}>{statusF}</span>
        <ChevronDownIcon className="ml-auto shrink-0 pointer-events-none" style={{ width: 15, height: 15, color: 'var(--c-muted)' }} />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="상태 필터" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ fontSize: 14 }}>
          {['전체', '가용만'].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: 13 }}>{count}대</span>
    </div>
  )
}

// 콤팩트 서버 카드 — 서버명·모델·가용 슬롯·부하·상태색
function ServerNodeCard({ node, onSelect }: { node: ServerNode; onSelect: () => void }) {
  const meta = STATUS_META[node.status]
  const sel = meta.selectable
  return (
    <button type="button" disabled={!sel} onClick={onSelect}
      className="text-left rounded-[10px] border flex flex-col transition-[transform,box-shadow] duration-100 disabled:cursor-not-allowed enabled:hover:-translate-y-px enabled:active:scale-[0.99]"
      style={{ padding: '12px 13px', gap: 9, background: 'var(--c-card)', borderColor: 'var(--c-border)', opacity: sel ? 1 : 0.55, backgroundImage: sel ? undefined : 'repeating-linear-gradient(45deg, transparent 0 6px, var(--c-soft) 6px 7px)' }}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <ServerStackIcon width={16} height={16} className="shrink-0" style={{ color: 'var(--c-muted)' }} />
          <span className="font-bold truncate text-text" style={{ fontSize: 14 }}>{node.host}</span>
          {node.dummy && <span className="shrink-0 rounded font-semibold" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>테스트</span>}
        </span>
        <Badge tone={meta.tone} dot>{meta.label}</Badge>
      </div>
      <div className="text-muted truncate" style={{ fontSize: 13 }}>{node.models}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-muted" style={{ fontSize: 13 }}>가용</span>
        <span className="font-bold tabular-nums" style={{ fontSize: 17, color: node.freeUnits > 0 ? 'var(--c-accent)' : 'var(--c-muted)' }}>{node.freeUnits}</span>
        <span className="text-muted tabular-nums" style={{ fontSize: 13 }}>/ {node.totalUnits} 슬롯 · GPU {node.gpus.length}장</span>
      </div>
      <LoadBar load={node.load} />
    </button>
  )
}

// ════════ 멀티스텝 심사 (서버 → GPU·자원 → 검토) · g2 신규 신청과 동일 구조(스텝퍼 + morph + 완료) ════════
const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const WIZARD_STEPS = ['서버 선택', 'GPU·자원', '검토 · 승인']

// 상단 스텝퍼 — 현재 단계 액센트 · 완료 체크 (g2 Stepper 동일)
function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-center">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={s} className={i < WIZARD_STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'} style={{ maxWidth: i < WIZARD_STEPS.length - 1 ? 240 : undefined }}>
            <div className="flex flex-col items-center" style={{ width: 100 }}>
              <span className="flex items-center justify-center rounded-full font-semibold" style={{ width: 30, height: 30, fontSize: 14, background: done || active ? 'var(--c-accent)' : 'transparent', border: done || active ? 'none' : '1.5px solid var(--c-border)', color: done || active ? 'var(--c-onaccent)' : 'var(--c-muted)' }}>
                {done ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-medium whitespace-nowrap" style={{ fontSize: 13, marginTop: 8, color: done || active ? 'var(--c-accent)' : 'var(--c-muted)' }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? 'var(--c-accent)' : 'var(--c-border)', borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── 명세서 프리미티브 (g2 신규 신청 SpecSheet 톤 이식) ──
function Pending({ w = '60%' }: { w?: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: w, height: 16, borderRadius: 3, background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--c-muted) 32%, transparent) 0 1px, transparent 1px 6px)', border: '1px dashed var(--c-border)' }} />
}
// final=true(확정 명세서) → 빈 값은 빗금 대신 안내 문구(emptyText). false(작성 중 심사) → 빗금 placeholder.
function SpecRow({ label, value, pendingW = '60%', last, emptyText, final }: { label: string; value?: ReactNode; pendingW?: string; last?: boolean; emptyText?: string; final?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 92, fontSize: 15, color: 'var(--c-muted)', lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 23 }}>
        {empty
          ? (final ? <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>{emptyText ?? '—'}</span> : <Pending w={pendingW} />)
          : <span className="anim-fade font-medium" style={{ fontSize: 15, color: 'var(--c-text)', lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}
// 섹션 헤더 — 제목 + 가는 구분선 + 액션(수정/결정 중). 문서 양식의 절 구분(g2 SectionHead 동일).
function SpecSection({ title, active, action, children }: { title: string; active?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, padding: '6px 12px', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background .35s ease' }}>
      <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
        <span className="font-bold shrink-0" style={{ fontSize: 15, color: active ? 'var(--c-accent)' : 'var(--c-text)' }}>{title}</span>
        <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
        {action}
      </div>
      {children}
    </div>
  )
}
function CornerMarks() {
  const c = 'color-mix(in srgb, var(--c-muted) 45%, transparent)'
  const base: React.CSSProperties = { position: 'absolute', width: 11, height: 11, zIndex: 2, pointerEvents: 'none' }
  return (
    <>
      <span style={{ ...base, top: 9, left: 9, borderTop: `1.5px solid ${c}`, borderLeft: `1.5px solid ${c}` }} />
      <span style={{ ...base, top: 9, right: 9, borderTop: `1.5px solid ${c}`, borderRight: `1.5px solid ${c}` }} />
      <span style={{ ...base, bottom: 9, left: 9, borderBottom: `1.5px solid ${c}`, borderLeft: `1.5px solid ${c}` }} />
      <span style={{ ...base, bottom: 9, right: 9, borderBottom: `1.5px solid ${c}`, borderRight: `1.5px solid ${c}` }} />
    </>
  )
}

interface Decision { serverHost?: string; gpuLabel?: string; ramGb: number; storageGb: number; cpuCores: number; vramRec: number; selVram?: number; vramLow: boolean }

// 신청 명세서 — 검토 시 가운데로 확장(morph). 좌(신청 정보)는 읽기전용, §3 할당 결정은 관리자 선택 실시간 반영.
function ApplicationSpec({ req, decision, reviewing, onEditAlloc, onBack, memo, setMemo, rejecting, setRejecting, rejectReason, setRejectReason, onApprove, onReject, canApprove }: {
  req: GpuRequest; decision: Decision; reviewing: boolean; onEditAlloc: () => void; onBack: () => void
  memo: string; setMemo: (v: string) => void
  rejecting: boolean; setRejecting: (v: boolean) => void; rejectReason: string; setRejectReason: (v: string) => void
  onApprove: () => void; onReject: () => void; canApprove: boolean
}) {
  const u = userById(req.requesterUserId)
  const name = u?.name ?? req.requesterUserId
  const today = req.createdAt.slice(0, 10)
  const docNo = `ANC-AR-${req.id.toUpperCase()}`
  const modelText = req.models.map((m) => modelById(m)?.name ?? m).join(', ')
  const fileText = req.attachmentUrl?.split('/').pop()
  const accent = reviewing ? 'var(--c-warn)' : 'var(--c-accent)'
  // 진입·선택 시 §할당 결정이 잘리지 않고 온전히 보이도록 자동 스크롤(검토 모드는 전체가 보이므로 제외)
  const allocRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reviewing) return
    allocRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [reviewing, decision.serverHost, decision.gpuLabel])
  return (
    <div data-morph="sheet" className="relative flex flex-col h-full" style={{ background: 'var(--c-card2)', border: '1px solid var(--c-border)', borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: reviewing ? 880 : 'none', margin: reviewing ? '0 auto' : 0, transform: reviewing ? 'scale(1)' : 'scale(0.995)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}` }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 128, fontWeight: 900, color: accent, opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>심사</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: '3px double var(--c-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: 'var(--c-text)' }}>자원 신청 명세서 · 심사</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${accent}`, color: accent, background: reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '검토' : '심사중'}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 13, color: 'var(--c-muted)' }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{docNo}</span></span>
            <span>발급 Anclave GPU 자원관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: 'var(--c-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--c-text)' }}>{name}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
            <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: 13, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{req.id.toUpperCase()}</span>
          </div>
        </div>

        {/* 본문 — 스크롤 영역 + 하단 fade(넘치는 콘텐츠가 카드색으로 부드럽게 사라져 하드 컷 방지) */}
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-auto" style={{ padding: '12px 18px' }}>
          <SpecSection title="신청 정보">
            <SpecRow label="신청자" value={`${name} · ${u?.department ?? '미지정'}`} />
            <SpecRow label="이메일" value={u?.email ?? '—'} pendingW="70%" />
            <SpecRow label="서비스명" value={req.serviceName} pendingW="60%" />
            <SpecRow label="요청 사유" value={req.purpose} pendingW="92%" last />
          </SpecSection>
          <SpecSection title="요청 자원">
            <SpecRow label="요청 모델" value={modelText} pendingW="75%" />
            <SpecRow label="요청 수량" value={`${req.capacity} ${UNIT_KO[req.capacityUnit]}`} pendingW="30%" />
            <SpecRow label="사용 기간" value={req.period} pendingW="35%" />
            <SpecRow label="우선순위" value={req.priority ? PRIORITY_BADGE[req.priority].label : undefined} pendingW="30%" />
            <SpecRow label="운영 환경" value={req.env || undefined} pendingW="55%" />
            <SpecRow label="부가 옵션" value={req.addons.length ? req.addons.join(', ') : '없음'} pendingW="45%" />
            <SpecRow label="첨부 공문" value={fileText} pendingW="55%" last />
          </SpecSection>
          <div ref={allocRef} style={{ scrollMarginBottom: 12 }}>
          <SpecSection title="할당 결정" active={!reviewing} action={reviewing ? <button type="button" onClick={onEditAlloc} className="font-medium hover:underline shrink-0" style={{ fontSize: 13, color: 'var(--c-accent)' }}>수정</button> : <span className="font-semibold shrink-0" style={{ fontSize: 13, color: 'var(--c-accent)' }}>결정 중</span>}>
            <SpecRow label="할당 서버" value={decision.serverHost} pendingW="40%" />
            <SpecRow label="할당 자원" value={decision.gpuLabel} pendingW="70%" />
            <SpecRow label="메모리" value={`${decision.ramGb} GB`} pendingW="25%" />
            <SpecRow label="저장 공간" value={`${decision.storageGb} GB`} pendingW="25%" />
            <SpecRow label="CPU" value={`${decision.cpuCores} 코어`} pendingW="25%" />
            <SpecRow
              label="권장 VRAM"
              value={<span style={{ color: decision.vramLow ? 'var(--c-warn)' : 'var(--c-text)' }}>{decision.vramRec}GB{decision.vramLow && decision.selVram != null ? ` · 선택 ${decision.selVram}GB (부족)` : ''}</span>}
              pendingW="30%" last
            />
          </SpecSection>
          </div>
          </div>
          <div aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 56, background: 'linear-gradient(to bottom, transparent, var(--c-card2))' }} />
        </div>

        {/* 검토 모드 푸터 — 메모 + 반려/승인 */}
        {reviewing && (
          <div className="shrink-0 anim-fade flex flex-col" style={{ borderTop: '1px solid var(--c-border)', padding: '12px 18px', gap: 11 }}>
            {rejecting ? (
              <div className="rounded-[10px] border" style={{ borderColor: 'var(--c-danger)', padding: '11px 13px' }}>
                <div className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 6 }}>반려 사유</div>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 알림으로 전달됩니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 70, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
                <div className="text-muted text-right" style={{ fontSize: 13, marginTop: 3 }}>{rejectReason.length}/300</div>
              </div>
            ) : (
              <div className="flex flex-col" style={{ gap: 6 }}>
                <label className="font-semibold text-text" style={{ fontSize: 14 }} htmlFor="admin-memo">처리 메모 — 신청자에게 표시됩니다</label>
                <textarea id="admin-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="승인·반려와 함께 신청자에게 전달할 메모를 남겨주세요. (선택)" className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 52, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
              </div>
            )}
            <div className="flex items-center gap-2.5">
              {rejecting ? (
                <>
                  <ActionBtn variant="ghost" onClick={() => { setRejecting(false); setRejectReason('') }}>취소</ActionBtn>
                  <ActionBtn variant="danger" full disabled={!rejectReason.trim()} onClick={onReject}><XCircleIcon width={16} height={16} />반려 확정</ActionBtn>
                </>
              ) : (
                <>
                  <ActionBtn variant="ghost" onClick={onBack}>이전</ActionBtn>
                  <ActionBtn variant="dangerOutline" onClick={() => setRejecting(true)}><XCircleIcon width={16} height={16} />반려</ActionBtn>
                  <ActionBtn variant="primary" full disabled={!canApprove} onClick={onApprove}><CheckCircleIcon width={16} height={16} />승인 확정</ActionBtn>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface DoneState { mode: 'approved' | 'rejected'; detail: string; limits?: string; processedAt: string; mapLink?: { serverId: string; gpuId?: string } }

// 처리 완료 화면 — 명세서 테마의 "처리 접수증"(도장 seal + 천공 stub). 자동 이동 없음, 사용자가 직접 이동.
function Completion({ done, reqId, requesterName, processorName, onGo, onMap, mutedFix }: {
  done: DoneState; reqId: string; requesterName: string; processorName: string
  onGo: () => void; onMap?: () => void; mutedFix?: React.CSSProperties
}) {
  const ok = done.mode === 'approved'
  const accent = ok ? 'var(--c-ok)' : 'var(--c-danger)'
  const soft = ok ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const Stub = ({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) => (
    <div className="flex items-start gap-3" style={{ padding: '7px 0', borderTop: '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0 text-muted" style={{ width: 68, fontSize: 13 }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium text-text" style={{ fontSize: 13.5, lineHeight: 1.5, wordBreak: 'break-word', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v}</span>
    </div>
  )
  return (
    <div data-approval className="anim-fade flex flex-col h-full items-center justify-center" style={{ ...mutedFix, padding: 24 }}>
      <PolishCss />
      <div className="relative bg-card2 border border-line overflow-hidden stagger" style={{ borderRadius: 16, maxWidth: 464, width: '100%', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` }} />
        <CornerMarks />
        <div className="flex flex-col items-center text-center" style={{ padding: '32px 38px 30px' }}>
          {/* 처리 도장 — 회전 점선 링 + 채움 원 */}
          <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
            <span className="absolute rounded-full" style={{ inset: 2, border: `2px dashed ${accent}`, opacity: 0.45, transform: 'rotate(-12deg)' }} />
            <span className="flex items-center justify-center rounded-full" style={{ width: 72, height: 72, background: soft, color: accent, boxShadow: `0 0 0 6px color-mix(in srgb, ${accent} 9%, transparent)` }}>
              {ok ? <CheckCircleIcon style={{ width: 40, height: 40 }} /> : <XCircleIcon style={{ width: 40, height: 40 }} />}
            </span>
          </div>
          <span className="font-bold" style={{ fontSize: 12.5, letterSpacing: '0.14em', color: accent, marginTop: 16, fontFamily: 'var(--font-mono)' }}>{ok ? 'APPROVED' : 'REJECTED'}</span>
          <h2 className="font-bold text-text" style={{ fontSize: 21, marginTop: 5, letterSpacing: '-0.3px' }}>{ok ? '승인 처리되었습니다' : '반려 처리되었습니다'}</h2>
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
            {ok ? `${requesterName}님께 알림이 전송되고 자원이 할당되었어요.` : `${requesterName}님께 반려 사유가 알림으로 전송되었어요.`}
          </p>
          <div className="w-full text-left rounded-[10px]" style={{ border: '1px dashed var(--c-border)', background: 'var(--c-card)', padding: '4px 14px 11px', marginTop: 20 }}>
            <Stub k="신청번호" v={reqId.toUpperCase()} mono />
            <Stub k="신청자" v={requesterName} />
            <Stub k={ok ? '할당 자원' : '반려 사유'} v={done.detail} />
            {ok && done.limits && <Stub k="자원 제한" v={done.limits} />}
            <Stub k="처리" v={`${processorName} · ${done.processedAt}`} />
          </div>
          <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
            {onMap && <Button variant="outline" onClick={onMap} className="flex-1 justify-center">자원맵에서 보기</Button>}
            <Button onClick={onGo} className="flex-1 justify-center">승인 관리 목록으로</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 멀티스텝 심사 오케스트레이터 (헤더 + 스텝퍼 + morph[좌 마법사 / 우 명세서] + 완료) ──
function PendingReview({ req }: { req: GpuRequest }) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user: admin } = useRole()

  const tree = useMemo(() => buildResourceTree(), [])
  const rec = useMemo(() => recommendLimits(req.models), [req.models])
  const bounds = useMemo(() => ({
    ram: limitBounds(rec.ramGb, 8, 1024),
    storage: limitBounds(rec.storageGb, 10, 2048),
    cpu: limitBounds(rec.cpuCores, 2, 128),
  }), [rec])

  const [step, setStep] = useState(0) // 0 서버 · 1 GPU·자원 · 2 검토
  const [serverId, setServerId] = useState<string | null>(null)
  const [gpuId, setGpuId] = useState<string | null>(null)
  const [sliceId, setSliceId] = useState<string | null>(null)
  const [expandedGpu, setExpandedGpu] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [ram, setRam] = useState(rec.ramGb)
  const [storage, setStorage] = useState(rec.storageGb)
  const [cpu, setCpu] = useState(rec.cpuCores)
  const [memo, setMemo] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false) // step 1·2 마법사 footer 반려 모달
  const [done, setDone] = useState<null | DoneState>(null)
  const [submitting, setSubmitting] = useState(false)

  const limitsDirty = ram !== rec.ramGb || storage !== rec.storageGb || cpu !== rec.cpuCores
  const resetLimits = () => { setRam(rec.ramGb); setStorage(rec.storageGb); setCpu(rec.cpuCores) }

  const filtered = tree.filter((n) => {
    if (statusF === '가용만' && n.status !== 'available') return false
    if (q.trim() && !`${n.host} ${n.models}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  })
  const node = tree.find((n) => n.id === serverId) ?? null
  const gpu = node?.gpus.find((g) => g.id === gpuId) ?? null
  const slice = gpu?.slices.find((s) => s.id === sliceId) ?? null
  const valid = !!gpu && (gpu.mode === 'cluster' ? gpu.free : !!slice)
  const selVram = slice ? slice.gb : gpu?.vramGb
  const vramLow = valid && selVram != null && selVram < rec.vramGb
  const reviewing = step === 2

  const pickServer = (n: ServerNode) => {
    setServerId(n.id)
    const cluster = n.gpus.find((g) => g.mode === 'cluster' && g.free)
    if (cluster) { setGpuId(cluster.id); setSliceId(null); setExpandedGpu(null) }
    else {
      const mig = n.gpus.find((g) => g.mode === 'mig' && g.freeSlices > 0)
      const fs = mig?.slices.find((s) => s.free)
      setGpuId(mig?.id ?? null); setSliceId(fs?.id ?? null); setExpandedGpu(mig?.id ?? null)
    }
    setStep(1)
  }

  const gpuLabel = gpu ? `${gpu.name}${slice ? ` · ${slice.profile} ${slice.gb}GB` : gpu.mode === 'cluster' ? ` · GPU 단일 ${gpu.vramGb}GB` : ''}` : undefined
  const decision: Decision = { serverHost: node?.host, gpuLabel, ramGb: ram, storageGb: storage, cpuCores: cpu, vramRec: rec.vramGb, selVram, vramLow }

  const requesterName = userById(req.requesterUserId)?.name ?? req.requesterUserId
  const processorName = `${admin.name}${admin.department ? ` · ${admin.department}` : ''}`

  const confirmApprove = async () => {
    if (!node || !gpu || !valid || submitting) return
    setSubmitting(true)
    try {
      const updated = await approveGpuRequest(req.id, {
        processedBy: admin.id, adminMemo: memo.trim() || undefined,
        allocatedServerId: node.id, allocatedGpuId: gpu.id, allocatedSliceId: sliceId ?? undefined,
        allocatedRamGb: ram, allocatedStorageGb: storage, allocatedCpuCores: cpu,
      })
      toast.push(`${requesterName}님의 GPU 신청을 승인했어요 · ${node.host} 할당 (RAM ${ram}GB · 디스크 ${storage}GB · CPU ${cpu}코어).`, 'ok')
      setDone({ mode: 'approved', detail: `${node.host} · ${gpuLabel}`, limits: `메모리 ${ram}GB · 저장 ${storage}GB · CPU ${cpu}코어`, processedAt: updated.processedAt ?? nowStamp(), mapLink: serverById(node.id) ? { serverId: node.id, gpuId: gpu.id } : undefined })
    } catch {
      toast.push('승인 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger')
      setSubmitting(false)
    }
  }
  const confirmReject = async () => {
    const reason = rejectReason.trim()
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      const updated = await rejectGpuRequest(req.id, { processedBy: admin.id, rejectReason: reason, adminMemo: memo.trim() || undefined })
      toast.push(`${requesterName}님의 신청을 반려했어요. 사유가 알림으로 전송됩니다.`, 'warn')
      setDone({ mode: 'rejected', detail: reason, processedAt: updated.processedAt ?? nowStamp() })
    } catch {
      toast.push('반려 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger')
      setSubmitting(false)
    }
  }

  if (done) return (
    <Completion
      done={done} reqId={req.id} requesterName={requesterName} processorName={processorName}
      onGo={() => navigate('/admin/approvals/gpu')}
      onMap={done.mapLink ? () => navigate(`/resource-map/${done.mapLink!.serverId}${done.mapLink!.gpuId ? `/${done.mapLink!.gpuId}` : ''}`) : undefined}
      mutedFix={mutedFix}
    />
  )

  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <header className="flex flex-col shrink-0">
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <BackButton onClick={() => navigate('/admin/approvals/gpu')} />
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2, fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>{req.id.toUpperCase()}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            <CpuChipIcon width={14} height={14} />GPU 승인
          </span>
          <StatusBadge status={req.status} />
          <span className="text-muted" style={{ fontSize: 14 }}>신청일 {req.createdAt}</span>
        </div>
      </header>

      {/* 스텝퍼 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
        <Stepper current={step} />
      </section>

      {/* morph — 좌: 할당 판단 마법사(검토 시 슬라이드아웃) / 우: 명세서(검토 시 가운데) */}
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 14 }}>
        <div
          data-morph="wizard"
          aria-hidden={reviewing}
          style={{ width: reviewing ? '0%' : '56%', flex: '0 0 auto', minWidth: 0, opacity: reviewing ? 0 : 1, transform: reviewing ? 'translateX(-48px)' : 'none', pointerEvents: reviewing ? 'none' : 'auto', transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}` }}
        >
          <section className="bg-card2 border border-line rounded-xl flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* 고정 컨트롤 */}
            <div className="shrink-0 border-b border-line flex flex-col" style={{ padding: '13px 16px', gap: 10 }}>
              {step === 0 ? (
                <>
                  <p className="text-muted" style={{ fontSize: 14 }}>신청 자원 <b className="text-text">{req.capacity} {UNIT_KO[req.capacityUnit]}</b>를 배치할 서버를 선택하세요.</p>
                  <PickerSearch q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} count={filtered.length} />
                </>
              ) : node && (
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 text-muted hover:text-text transition-colors" style={{ fontSize: 14 }}>
                    <ArrowLeftIcon width={15} height={15} />서버 다시 선택
                  </button>
                  <Badge tone={STATUS_META[node.status].tone} dot>{node.host} · 가용 {node.freeUnits}/{node.totalUnits}</Badge>
                </div>
              )}
            </div>

            {/* 본문 */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ padding: 16, gap: 12 }}>
              {step === 0 ? (
                filtered.length ? (
                  <div className="flex-1 min-h-0 overflow-auto">
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {filtered.map((n) => <ServerNodeCard key={n.id} node={n} onSelect={() => pickServer(n)} />)}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted" style={{ fontSize: 14 }}>검색 결과가 없어요.</div>
                )
              ) : node && (
                <>
                  <span className="font-semibold text-text shrink-0" style={{ fontSize: 14 }}>GPU·자원 선택 <span className="text-muted" style={{ fontWeight: 400 }}>— MIG GPU는 펼쳐서 슬라이스를 고르세요</span></span>
                  <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ gap: 8 }}>
                    {node.gpus.map((g) => {
                      const gMeta = STATUS_META[g.status]
                      if (g.mode === 'cluster') {
                        const on = gpuId === g.id && !sliceId
                        return (
                          <button key={g.id} type="button" disabled={!g.free} onClick={() => { setGpuId(g.id); setSliceId(null) }}
                            className="text-left rounded-[9px] border flex items-center gap-2.5 transition-[border-color,background] duration-100 disabled:cursor-not-allowed"
                            style={{ padding: '11px 12px', background: on ? 'var(--accent-soft)' : 'var(--c-card)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none', opacity: g.free ? 1 : 0.55, backgroundImage: g.free ? undefined : 'repeating-linear-gradient(45deg, transparent 0 6px, var(--c-soft) 6px 7px)' }}>
                            <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 18, height: 18, border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`, background: on ? 'var(--c-accent)' : 'transparent' }}>{on && <CheckIcon width={12} height={12} style={{ color: 'var(--c-onaccent)' }} />}</span>
                            <CpuChipIcon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-muted)' }} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-text truncate" style={{ fontSize: 14 }}>{g.name}</span>
                              <span className="block text-muted truncate" style={{ fontSize: 13 }}>GPU 단일 · {g.vramGb}GB · 부하 {g.load}%</span>
                            </span>
                            <Badge tone={gMeta.tone} dot>{gMeta.label}</Badge>
                          </button>
                        )
                      }
                      const open = expandedGpu === g.id
                      return (
                        <div key={g.id} className="rounded-[9px] border" style={{ borderColor: open ? 'var(--c-accent)' : 'var(--c-border)', background: 'var(--c-card)', overflow: 'hidden' }}>
                          <button type="button" onClick={() => setExpandedGpu(open ? null : g.id)} className="w-full text-left flex items-center gap-2.5" style={{ padding: '11px 12px' }}>
                            <ChevronDownIcon width={16} height={16} className="shrink-0 transition-transform" style={{ color: 'var(--c-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                            <Squares2X2Icon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-accent)' }} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-text truncate" style={{ fontSize: 14 }}>{g.name}</span>
                                {g.dummy && <span className="shrink-0 rounded font-semibold" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>테스트</span>}
                              </span>
                              <span className="block text-muted truncate" style={{ fontSize: 13 }}>MIG {g.totalSlices}분할 · 가용 {g.freeSlices} · 부하 {g.load}%</span>
                            </span>
                            <Badge tone={gMeta.tone} dot>{gMeta.label}</Badge>
                          </button>
                          {open && (
                            <div className="grid border-t border-line" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: 10 }}>
                              {g.slices.map((s) => {
                                const on = sliceId === s.id
                                return (
                                  <button key={s.id} type="button" disabled={!s.free} onClick={() => { setGpuId(g.id); setSliceId(s.id) }}
                                    className="text-left rounded-[8px] border flex items-center gap-2 transition-[border-color,background] duration-100 disabled:cursor-not-allowed"
                                    style={{ padding: '8px 10px', background: on ? 'var(--accent-soft)' : 'var(--c-bg)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none', opacity: s.free ? 1 : 0.5, backgroundImage: s.free ? undefined : 'repeating-linear-gradient(45deg, transparent 0 5px, var(--c-soft) 5px 6px)' }}>
                                    <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 16, height: 16, border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`, background: on ? 'var(--c-accent)' : 'transparent' }}>{on && <CheckIcon width={10} height={10} style={{ color: 'var(--c-onaccent)' }} />}</span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-semibold text-text truncate" style={{ fontSize: 13.5 }}>{s.profile}</span>
                                      <span className="block truncate" style={{ fontSize: 12.5, color: s.free ? 'var(--c-ok)' : 'var(--c-muted)' }}>{s.gb}GB · {s.tag}</span>
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 자원 제한 */}
                  <div className="rounded-[12px] border border-line flex flex-col shrink-0" style={{ background: 'var(--c-card)', padding: 13, gap: 11 }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-text" style={{ fontSize: 14 }}>자원 제한</span>
                        <Badge tone="info">모델 {rec.basis.length}개 기준 추천</Badge>
                      </span>
                      <button type="button" onClick={resetLimits} disabled={!limitsDirty} className="inline-flex items-center gap-1 font-semibold transition-opacity disabled:opacity-0" style={{ fontSize: 12.5, color: 'var(--c-accent)' }}>
                        <ArrowDownTrayIcon width={13} height={13} style={{ transform: 'rotate(180deg)' }} />추천값 적용
                      </button>
                    </div>
                    <div className="flex" style={{ gap: 8 }}>
                      <LimitCard icon={<RectangleStackIcon width={13} height={13} />} label="메모리" value={ram} onChange={setRam} unit="GB" rec={rec.ramGb} min={bounds.ram.min} max={bounds.ram.max} step={4} />
                      <LimitCard icon={<CircleStackIcon width={13} height={13} />} label="저장 공간" value={storage} onChange={setStorage} unit="GB" rec={rec.storageGb} min={bounds.storage.min} max={bounds.storage.max} step={8} />
                      <LimitCard icon={<CpuChipIcon width={13} height={13} />} label="CPU" value={cpu} onChange={setCpu} unit="코어" rec={rec.cpuCores} min={bounds.cpu.min} max={bounds.cpu.max} step={1} />
                    </div>
                    <div className="flex items-start gap-1.5" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                      <span className="shrink-0 rounded-[5px] font-semibold" style={{ padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>권장 VRAM {rec.vramGb}GB</span>
                      <span className="text-muted min-w-0" style={{ paddingTop: 1 }}>
                        {rec.basis.join(', ')} 기준
                        {vramLow && <span style={{ color: 'var(--c-warn)', fontWeight: 600 }}> · 선택 자원 VRAM {selVram}GB가 권장보다 작아요</span>}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 하단 바 — 이전 / 검토하기 */}
            <div className="flex items-center justify-between shrink-0 border-t border-line" style={{ padding: '14px 16px' }}>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>이전</Button>
                {/* 서버/GPU 선택 단계에서도 즉시 반려 — 사유 모달 */}
                <Button variant="danger" onClick={() => { setRejectReason(''); setRejectOpen(true) }}><XCircleIcon width={16} height={16} />반려</Button>
              </div>
              <div className="flex items-center gap-3">
                {step === 0
                  ? <span className="text-muted" style={{ fontSize: 14 }}>가용 서버를 선택하면 다음으로 이동해요.</span>
                  : !valid && <span className="text-muted" style={{ fontSize: 14 }}>할당할 자원을 선택해주세요.</span>}
                {step === 1 && <Button onClick={() => setStep(2)} disabled={!valid}>검토하기</Button>}
              </div>
            </div>
          </section>
        </div>

        {/* 우: 명세서 */}
        <div data-morph="spec" style={{ width: reviewing ? '100%' : '44%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 18, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <ApplicationSpec
            req={req}
            decision={decision}
            reviewing={reviewing}
            onEditAlloc={() => setStep(1)}
            onBack={() => setStep(1)}
            memo={memo} setMemo={setMemo}
            rejecting={rejecting} setRejecting={setRejecting}
            rejectReason={rejectReason} setRejectReason={setRejectReason}
            onApprove={confirmApprove} onReject={confirmReject}
            canApprove={valid}
          />
        </div>
      </div>

      {/* step 1·2(서버·GPU 선택) 즉시 반려 모달 — 사유 입력 후 confirmReject */}
      <Modal
        open={rejectOpen}
        onClose={() => { if (!submitting) setRejectOpen(false) }}
        title="신청 반려"
        width={460}
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={submitting}>취소</Button>
            <Button variant="danger" onClick={confirmReject} disabled={!rejectReason.trim() || submitting}>
              <XCircleIcon width={16} height={16} />반려 확정
            </Button>
          </>
        }
      >
        <p className="text-muted" style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.5 }}>
          <b className="text-text">{requesterName}</b>님의 GPU 신청을 반려합니다. 사유는 신청자에게 알림으로 전달됩니다.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          maxLength={300}
          autoFocus
          placeholder="반려 사유를 입력해주세요."
          className="w-full rounded-[8px] border border-line text-text"
          style={{ background: 'var(--c-bg)', height: 96, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }}
        />
        <div className="text-muted text-right" style={{ fontSize: 13, marginTop: 4 }}>{rejectReason.length}/300</div>
      </Modal>
    </div>
  )
}


// ── 처리 완료 명세서 (조회 모드) — 심사 명세서와 동일 양식 + §3 처리 결과(승인 할당/제한 · 반려 사유) ──
function ProcessedSpec({ req }: { req: GpuRequest }) {
  const navigate = useNavigate()
  const toast = useToast()
  const u = userById(req.requesterUserId)
  const name = u?.name ?? req.requesterUserId
  const today = req.createdAt.slice(0, 10)
  const docNo = `ANC-AR-${req.id.toUpperCase()}`
  const modelText = req.models.map((m) => modelById(m)?.name ?? m).join(', ')
  const fileText = req.attachmentUrl?.split('/').pop()
  const approved = req.status === 'approved'
  const alloc = approved ? resolveAllocationLabel(req) : null
  const processor = req.processedBy ? userById(req.processedBy) : undefined
  const stamp = approved ? 'var(--c-ok)' : 'var(--c-danger)'
  const stampBg = approved ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const hasLimits = req.allocatedRamGb != null || req.allocatedStorageGb != null || req.allocatedCpuCores != null
  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--c-card2)', border: '1px solid var(--c-border)', borderRadius: 14, boxShadow: 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880, margin: '0 auto' }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 128, fontWeight: 900, color: stamp, opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{approved ? '승인' : '반려'}</span>
      </div>
      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: '3px double var(--c-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: 'var(--c-text)' }}>자원 신청 명세서 · 심사</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${stamp}`, color: stamp, background: stampBg, borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{approved ? '승인' : '반려'}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 13, color: 'var(--c-muted)' }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{docNo}</span></span>
            <span>발급 Anclave GPU 자원관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: 'var(--c-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--c-text)' }}>{name}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
            <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: 13, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{req.id.toUpperCase()}</span>
          </div>
        </div>
        {/* 본문 — 스크롤 영역 + 하단 fade(넘치는 콘텐츠가 카드색으로 부드럽게 사라져 하드 컷 방지) */}
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-auto" style={{ padding: '12px 18px' }}>
          <SpecSection title="신청 정보">
            <SpecRow final label="신청자" value={`${name} · ${u?.department ?? '미지정'}`} />
            <SpecRow final label="이메일" value={u?.email} emptyText="미등록" />
            <SpecRow final label="서비스명" value={req.serviceName} />
            <SpecRow final label="요청 사유" value={req.purpose} last />
          </SpecSection>
          <SpecSection title="요청 자원">
            <SpecRow final label="요청 모델" value={modelText} />
            <SpecRow final label="요청 수량" value={`${req.capacity} ${UNIT_KO[req.capacityUnit]}`} />
            <SpecRow final label="사용 기간" value={req.period} emptyText="미지정" />
            <SpecRow final label="우선순위" value={req.priority ? PRIORITY_BADGE[req.priority].label : undefined} emptyText="미지정" />
            <SpecRow final label="운영 환경" value={req.env || undefined} emptyText="미지정" />
            <SpecRow final label="부가 옵션" value={req.addons.length ? req.addons.join(', ') : '없음'} />
            <SpecRow
              final
              label="첨부 공문"
              value={fileText ? <button type="button" onClick={() => toast.push('공문 다운로드 (목업)', 'info')} className="inline-flex items-center gap-1.5 hover:brightness-110" style={{ color: 'var(--c-accent)', fontWeight: 600 }}><ArrowDownTrayIcon width={14} height={14} />{fileText}</button> : undefined}
              emptyText="첨부 없음" last
            />
          </SpecSection>
          <SpecSection title="처리 결과" action={<span className="shrink-0 inline-flex"><StatusBadge status={req.status} /></span>}>
            {approved ? (
              <>
                <SpecRow
                  final
                  label="할당 자원"
                  value={alloc ? (
                    <span className="inline-flex items-center flex-wrap" style={{ gap: 10 }}>
                      <span>{alloc.text}</span>
                      {alloc.link && (
                        <button type="button" onClick={() => navigate(`/resource-map/${alloc.link!.serverId}${alloc.link!.gpuId ? `/${alloc.link!.gpuId}` : ''}`)} className="inline-flex items-center gap-1 font-semibold transition-colors hover:brightness-110" style={{ fontSize: 14, color: 'var(--c-accent)' }}>
                          자원맵에서 보기<ArrowTopRightOnSquareIcon width={14} height={14} />
                        </button>
                      )}
                    </span>
                  ) : undefined}
                  emptyText="할당 정보 없음"
                />
                {hasLimits && <SpecRow final label="자원 제한" value={`메모리 ${req.allocatedRamGb ?? '—'}GB · 저장 ${req.allocatedStorageGb ?? '—'}GB · CPU ${req.allocatedCpuCores ?? '—'}코어`} />}
              </>
            ) : (
              <SpecRow final label="반려 사유" value={req.rejectReason ? <span style={{ color: 'var(--c-danger)' }}>{req.rejectReason}</span> : undefined} emptyText="사유 미기재" />
            )}
            <SpecRow final label="처리자" value={processor ? `${processor.name} · ${processor.department ?? '관리자'}` : req.processedBy} emptyText="—" />
            <SpecRow final label="처리일시" value={req.processedAt} emptyText="—" />
            <SpecRow final label="처리 메모" value={req.adminMemo} emptyText="메모 없음" last />
          </SpecSection>
          </div>
          <div aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 56, background: 'linear-gradient(to bottom, transparent, var(--c-card2))' }} />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════ 4.10a 신청 상세 심사 ════════════════════════════════

export function ApprovalDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const [req, setReq] = useState<GpuRequest | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    fetchGpuRequestById(id)
      .then((r) => { if (alive) { setReq(r); setState('ready') } })
      .catch(() => { if (alive) setState('notfound') })
    return () => { alive = false }
  }, [id])

  if (state === 'loading') {
    return (
      <div data-approval className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <span className="text-muted" style={{ fontSize: 14 }}>신청 정보를 불러오는 중…</span>
      </div>
    )
  }

  if (state === 'notfound' || !req) {
    return (
      <div data-approval className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <EmptyState
          title="신청을 찾을 수 없음"
          description="삭제되었거나 주소가 잘못된 신청이에요."
          cta={<Button onClick={() => navigate('/admin/approvals/gpu')}>목록으로</Button>}
        />
      </div>
    )
  }

  // 대기 = 멀티스텝 심사(서버→자원→검토→완료) / 처리 완료 = 1컬럼 조회
  if (req.status === 'pending') return <PendingReview req={req} />

  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <header className="flex flex-col shrink-0">
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <BackButton onClick={() => navigate('/admin/approvals/gpu')} />
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2, fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>{req.id.toUpperCase()}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            <CpuChipIcon width={14} height={14} />GPU 승인
          </span>
          <StatusBadge status={req.status} />
          <span className="text-muted" style={{ fontSize: 14 }}>신청일 {req.createdAt}</span>
        </div>
      </header>

      <div className="flex-1 min-h-0 anim-fade" style={{ marginTop: 18 }}>
        <ProcessedSpec req={req} />
      </div>
    </div>
  )
}

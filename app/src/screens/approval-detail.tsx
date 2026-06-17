import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
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
import { modelById, servers, services, userById } from '../data'
import type { GpuRequest, GpuServer } from '../data/types'
import { usePolling } from '../data/hooks/usePolling'
import { approveGpuRequest, fetchGpuRequestById, nowStamp, rejectGpuRequest } from './approval-store'
import { CHANGE_TYPE_META, fetchChangeRequests } from './gpu-change-store'
import type { ChangeRequest } from './gpu-change-store'

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
export type SlotStatus = 'available' | 'full' | 'maintenance'
export const STATUS_META: Record<SlotStatus, { label: string; tone: 'ok' | 'neutral' | 'danger'; selectable: boolean }> = {
  available: { label: '가용', tone: 'ok', selectable: true },
  full: { label: '여유 없음', tone: 'neutral', selectable: false },
  maintenance: { label: '점검', tone: 'danger', selectable: false },
}
export interface SliceNode { id: string; profile: string; gb: number; units: number; free: boolean; tag: string }
export interface GpuNode { id: string; name: string; mode: 'cluster' | 'mig'; vramGb: number; load: number; status: SlotStatus; free: boolean; slices: SliceNode[]; freeSlices: number; totalSlices: number; dummy?: boolean }
export interface ServerNode { id: string; host: string; models: string; gpus: GpuNode[]; status: SlotStatus; load: number; freeUnits: number; totalUnits: number; dummy?: boolean }

// fleet = DB(/api/servers) 또는 seed 폴백. DB 응답은 실시간 수치(smUtil·usage 등)를 omit하므로
// 슬롯 가용성 판정만 사용(load 없으면 0). 등록된 서버만 — 더미 패딩 없음.
export function buildResourceTree(fleet: GpuServer[]): ServerNode[] {
  return fleet.map((server): ServerNode => {
    const gpus = server.gpus.map((g): GpuNode => {
      if (g.allocMode === 'mig') {
        const slices: SliceNode[] = (g.slices ?? []).map((s) => {
          const free = !s.ownerUserId // 소유자 없으면 가용 (DB엔 usage 없음)
          return { id: s.id, profile: s.profile, gb: s.gb, units: s.units, free, tag: free ? '가용' : (userById(s.ownerUserId ?? '')?.name ?? '사용 중') }
        })
        const freeSlices = slices.filter((s) => s.free).length
        const status: SlotStatus = g.xid || g.health === 'danger' ? 'maintenance' : freeSlices > 0 ? 'available' : 'full'
        return { id: g.id, name: g.name, mode: 'mig', vramGb: g.vramGb, load: g.smUtil ?? 0, status, free: status === 'available', slices, freeSlices, totalSlices: slices.length }
      }
      const free = !g.assignedServiceId && !g.xid && g.health !== 'danger'
      const status: SlotStatus = g.xid || g.health === 'danger' ? 'maintenance' : free ? 'available' : 'full'
      return { id: g.id, name: g.name, mode: 'cluster', vramGb: g.vramGb, load: g.smUtil ?? 0, status, free, slices: [], freeSlices: 0, totalSlices: 0 }
    })
    const freeUnits = gpus.reduce((a, g) => a + (g.mode === 'mig' ? g.freeSlices : g.free ? 1 : 0), 0)
    const totalUnits = gpus.reduce((a, g) => a + (g.mode === 'mig' ? g.totalSlices : 1), 0)
    const load = gpus.length ? Math.round(gpus.reduce((a, g) => a + g.load, 0) / gpus.length) : 0
    const status: SlotStatus = server.health === 'danger' ? 'maintenance' : freeUnits > 0 ? 'available' : 'full'
    return { id: server.id, host: server.host, models: [...new Set(server.gpus.map((g) => g.model))].join(', '), gpus, status, load, freeUnits, totalUnits }
  })
    .sort((a, b) => Number(STATUS_META[b.status].selectable) - Number(STATUS_META[a.status].selectable) || b.freeUnits - a.freeUnits)
}

// ── 자원 자동 산정 — 서버별 물리 풀(20% 예약) → 통짜 GPU=나머지/GPU수, MIG=GPU몫×(슬라이스 units 비율) ──
// gpu-change 마법사와 동일 로직(단일 진실원). 호스트 스펙은 /api/servers 제공값 우선, 미제공 시 host fallback.
const RESERVE = 0.2 // 시스템 예약
export type HostSpec = { ramGb: number; storageGb: number; cpuCores: number }
const HIGH_RAM_HOSTS = new Set(['192.168.0.41', '192.168.0.63']) // 고사양 호스트(RAM 32GB). 그 외 16GB.
export function hostSpec(srv?: GpuServer): HostSpec {
  const x = (srv ?? {}) as Partial<HostSpec>
  const high = srv ? HIGH_RAM_HOSTS.has(srv.host) : false
  return { ramGb: x.ramGb ?? (high ? 32 : 16), storageGb: x.storageGb ?? 2048, cpuCores: x.cpuCores ?? (high ? 16 : 8) }
}
export function unitAlloc(spec: HostSpec, gpuCount: number, fraction: number): HostSpec {
  const per = (total: number) => Math.round((total * (1 - RESERVE)) / Math.max(1, gpuCount) * fraction)
  return { ramGb: per(spec.ramGb), storageGb: per(spec.storageGb), cpuCores: per(spec.cpuCores) }
}

// 모델 종류 → 대표 서빙 런타임 (운영 환경 자동 표기용)
const KIND_RUNTIME: Record<string, string> = {
  LLM: 'vLLM', Code: 'vLLM', 'Vision-Language': 'vLLM', Image: 'ComfyUI', STT: 'faster-whisper', Embedding: 'TEI',
}
// 운영 환경 자동 산정 — 모델 종류 기준 런타임 + 표준 베이스(Ubuntu 22.04 · CUDA 12.4). 신청서 env 미입력 시 사용.
function modelEnv(models: string[]): string {
  const runtimes = [...new Set(models.map((id) => KIND_RUNTIME[modelById(id)?.kind ?? ''] ?? 'vLLM'))]
  return `Ubuntu 22.04 · CUDA 12.4${runtimes.length ? ` · ${runtimes.join(' / ')}` : ''}`
}

// ── 모델별 권장 VRAM — Model 자원 요건(reqVram) 합산(여러 모델이면 합) · VRAM 적정성 경고용 ──
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

// 승인 건 할당 자원 표시 — allocated* 우선(서버 미존재=더미면 raw id), 없으면 serviceName 역추적.
// fleet = DB(/api/servers) 또는 seed 폴백 — picker 와 동일 인벤토리로 라벨 일관성 유지.
function resolveAllocationLabel(req: GpuRequest, fleet: GpuServer[]): { text: string; link?: { serverId: string; gpuId?: string } } | null {
  if (req.allocatedServerId) {
    const server = fleet.find((s) => s.id === req.allocatedServerId)
    if (server) {
      const gpu = server.gpus.find((g) => g.id === req.allocatedGpuId)
      const slice = gpu?.slices?.find((sl) => sl.id === req.allocatedSliceId)
      return { text: `${server.host}${gpu ? ` · ${gpu.name}` : ''}${slice ? ` · ${slice.profile}` : ''}`, link: { serverId: server.id, gpuId: gpu?.id } }
    }
    return { text: [req.allocatedServerId, req.allocatedGpuId, req.allocatedSliceId].filter(Boolean).join(' · ') }
  }
  const svc = services.find((s) => s.name === req.serviceName)
  if (!svc) return null
  for (const server of fleet) {
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


// ── 검색/필터 바 (서버·GPU 모델 검색 + 상태 필터) ──
export function PickerSearch({ q, setQ, statusF, setStatusF, count }: { q: string; setQ: (v: string) => void; statusF: string; setStatusF: (v: string) => void; count: number }) {
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
export function ServerNodeCard({ node, onSelect }: { node: ServerNode; onSelect: () => void }) {
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
const WIZARD_STEPS = ['서버·GPU 선택', '검토 · 승인']

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
export function SpecRow({ label, value, pendingW = '60%', last, emptyText, final }: { label: string; value?: ReactNode; pendingW?: string; last?: boolean; emptyText?: string; final?: boolean }) {
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
export function SpecSection({ title, active, action, compact, children }: { title: string; active?: boolean; action?: ReactNode; compact?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: compact ? 8 : 12, borderRadius: 10, padding: compact ? '4px 10px' : '6px 12px', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background .35s ease' }}>
      <div className="flex items-center gap-2.5" style={{ marginBottom: compact ? 4 : 6 }}>
        <span className="font-bold shrink-0" style={{ fontSize: compact ? 13.5 : 15, color: active ? 'var(--c-accent)' : 'var(--c-text)' }}>{title}</span>
        <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
        {action}
      </div>
      {children}
    </div>
  )
}
export function CornerMarks() {
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

// 명세서 문서 프레임 — 카드(코너마크·워터마크·이중선 레터헤드·스크롤 본문+하단 fade).
// 처리완료 조회(ProcessedSpec)와 변경요청 조회(ChangeSpecCard)가 동일 박스를 공유하도록 추출.
export function SpecSheetFrame({
  title, stampText, stampColor, stampBg, watermark, docNo, who, dateText, chipText, maxWidth = 880, headerBg, footer, reviewing, compact, bodyRef, children,
}: {
  title: string; stampText: string; stampColor: string; stampBg: string; watermark?: string
  docNo: string; who: string; dateText: string; chipText?: string
  maxWidth?: number | string; headerBg?: string; footer?: ReactNode; reviewing?: boolean; compact?: boolean
  bodyRef?: React.Ref<HTMLDivElement>; children: ReactNode
}) {
  const headPad = compact ? '12px 16px 9px' : '15px 18px 12px'
  const titleFs = compact ? 16 : 18
  const wmFs = compact ? 104 : 128
  const bodyPad = compact ? '10px 16px' : '12px 18px'
  const fadeH = compact ? 44 : 56
  return (
    <div className="relative flex flex-col h-full" style={{ background: 'var(--c-card2)', border: '1px solid var(--c-border)', borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth, margin: '0 auto', transition: 'box-shadow .6s ease' }}>
      <CornerMarks />
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
          <span style={{ fontSize: wmFs, fontWeight: 900, color: stampColor, opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{watermark}</span>
        </div>
      )}
      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: headPad, borderBottom: '3px double var(--c-border)', background: headerBg ?? 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: titleFs, color: 'var(--c-text)' }}>{title}</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${stampColor}`, color: stampColor, background: stampBg, borderRadius: 6, padding: compact ? '2px 9px' : '3px 10px', fontSize: compact ? 13 : 14 }}>{stampText}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: compact ? 6 : 8, fontSize: compact ? 12 : 13, color: 'var(--c-muted)' }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{docNo}</span></span>
            <span>발급 Anclave GPU 자원관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: compact ? 5 : 6, fontSize: compact ? 12.5 : 14, color: 'var(--c-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--c-text)' }}>{who}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{dateText}</span>
            {chipText && <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: compact ? 12 : 13, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{chipText}</span>}
          </div>
        </div>
        {/* 본문 — 스크롤 영역 + 하단 fade */}
        <div className="relative flex-1 min-h-0">
          <div ref={bodyRef} className="h-full overflow-auto" style={{ padding: bodyPad }}>{children}</div>
          <div aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: fadeH, background: 'linear-gradient(to bottom, transparent, var(--c-card2))' }} />
        </div>
        {footer && <div className="shrink-0 anim-fade" style={{ borderTop: '1px solid var(--c-border)', padding: compact ? '10px 16px' : '12px 18px' }}>{footer}</div>}
      </div>
    </div>
  )
}

interface Decision { serverHost?: string; gpuLabel?: string; ramGb?: number; storageGb?: number; cpuCores?: number; vramRec: number; selVram?: number; vramLow: boolean }

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
            <SpecRow label="운영 환경" value={req.env || modelEnv(req.models)} pendingW="55%" />
            <SpecRow label="부가 옵션" value={req.addons.length ? req.addons.join(', ') : '없음'} pendingW="45%" />
            <SpecRow label="첨부 공문" value={fileText} pendingW="55%" last />
          </SpecSection>
          <div ref={allocRef} style={{ scrollMarginBottom: 12 }}>
          <SpecSection title="할당 결정" active={!reviewing} action={reviewing ? <button type="button" onClick={onEditAlloc} className="font-medium hover:underline shrink-0" style={{ fontSize: 13, color: 'var(--c-accent)' }}>수정</button> : <span className="font-semibold shrink-0" style={{ fontSize: 13, color: 'var(--c-accent)' }}>결정 중</span>}>
            <SpecRow label="할당 서버" value={decision.serverHost} pendingW="40%" />
            <SpecRow label="할당 자원" value={decision.gpuLabel} pendingW="70%" />
            <SpecRow label="메모리" value={decision.ramGb != null ? `${decision.ramGb} GB` : undefined} pendingW="25%" />
            <SpecRow label="저장 공간" value={decision.storageGb != null ? `${decision.storageGb} GB` : undefined} pendingW="25%" />
            <SpecRow label="CPU" value={decision.cpuCores != null ? `${decision.cpuCores} 코어` : undefined} pendingW="25%" />
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

// 단일 선택 자원 행 — GPU 단일/MIG 슬라이스 공용. 가용=ok강조 / 여유없음·점검=빗금·딤(선택 불가).
function UnitRow({ label, sub, vramGb, status, on, onPick, isSlice }: { label: string; sub: string; vramGb: number; status: SlotStatus; on: boolean; onPick: () => void; isSlice: boolean }) {
  const meta = STATUS_META[status]
  const disabled = !meta.selectable
  const bd = on ? 'var(--c-accent)' : disabled ? 'var(--c-border)' : 'color-mix(in srgb, var(--c-ok) 55%, var(--c-border))'
  const bg = on ? 'var(--c-card2)' : disabled ? 'var(--c-bg)' : 'color-mix(in srgb, var(--c-ok) 9%, var(--c-card2))'
  const indColor = on ? 'var(--c-accent)' : disabled ? 'var(--c-border)' : 'var(--c-ok)'
  return (
    <button type="button" disabled={disabled} onClick={onPick}
      className="text-left rounded-[10px] flex items-center gap-2.5 transition-[border-color,background,transform] duration-100 disabled:cursor-not-allowed enabled:hover:border-[color:var(--c-accent)] enabled:active:scale-[0.985]"
      style={{ padding: '10px 12px', border: `1.5px solid ${bd}`, background: bg, opacity: disabled ? 0.5 : 1, backgroundImage: disabled ? 'repeating-linear-gradient(45deg, transparent 0 6px, var(--c-soft) 6px 7px)' : undefined }}>
      <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 18, height: 18, border: `1.5px solid ${indColor}`, background: on ? 'var(--c-accent)' : 'transparent' }}>{on && <CheckIcon width={12} height={12} style={{ color: 'var(--c-onaccent)' }} />}</span>
      {isSlice ? <Squares2X2Icon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-accent)' }} /> : <CpuChipIcon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-muted)' }} />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-text truncate" style={{ fontSize: 14 }}>{label}</span>
        <span className="block text-muted truncate" style={{ fontSize: 13 }}>{sub}</span>
      </span>
      <Badge tone={meta.tone} dot>{meta.label}</Badge>
      <span className="shrink-0 rounded-[6px] font-semibold tabular-nums" style={{ fontSize: 12, padding: '2px 8px', background: 'var(--c-soft)', color: 'var(--c-muted)' }}>{vramGb}GB</span>
    </button>
  )
}

// ── 멀티스텝 심사 오케스트레이터 (헤더 + 스텝퍼 + morph[좌 마법사 / 우 명세서] + 완료) ──
function PendingReview({ req }: { req: GpuRequest }) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user: admin } = useRole()

  // GPU 현황 — DB(/api/servers) 폴링, 로딩/에러 시 seed 폴백
  const fleet = usePolling<GpuServer[]>('/api/servers')
  const inventory = fleet.data ?? servers
  const tree = useMemo(() => buildResourceTree(inventory), [inventory])
  const rec = useMemo(() => recommendLimits(req.models), [req.models])

  const [step, setStep] = useState(0) // 0 서버·GPU 선택 · 1 검토
  const [serverId, setServerId] = useState<string | null>(null)
  const [gpuId, setGpuId] = useState<string | null>(null)
  const [sliceId, setSliceId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('전체')
  const [memo, setMemo] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false) // 선택 단계 footer 반려 모달
  const [done, setDone] = useState<null | DoneState>(null)
  const [submitting, setSubmitting] = useState(false)

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
  const reviewing = step === 1

  // 선택 자원 기준 자원 자동 산정(gpu-change 동일) — 호스트 풀 20% 예약 후 GPU 몫 × (슬라이스 units 비율).
  const alloc = useMemo<HostSpec | null>(() => {
    if (!node || !gpu || !valid) return null
    const spec = hostSpec(inventory.find((s) => s.id === node.id))
    const gpuCount = node.gpus.length
    if (gpu.mode === 'cluster') return unitAlloc(spec, gpuCount, 1)
    const totalUnits = gpu.slices.reduce((a, sl) => a + (sl.units || 1), 0) || 1
    return unitAlloc(spec, gpuCount, (slice?.units || 1) / totalUnits)
  }, [inventory, node, gpu, slice, valid])

  // 단일 선택 — 서버·GPU(·슬라이스)를 한 번에 지정(이전 선택 교체).
  const pickUnit = (n: ServerNode, g: GpuNode, s: SliceNode | null) => {
    setServerId(n.id); setGpuId(g.id); setSliceId(s?.id ?? null)
  }

  const gpuLabel = gpu ? `${gpu.name}${slice ? ` · ${slice.profile} ${slice.gb}GB` : gpu.mode === 'cluster' ? ` · GPU 단일 ${gpu.vramGb}GB` : ''}` : undefined
  const decision: Decision = { serverHost: node?.host, gpuLabel, ramGb: alloc?.ramGb, storageGb: alloc?.storageGb, cpuCores: alloc?.cpuCores, vramRec: rec.vramGb, selVram, vramLow }

  const requesterName = userById(req.requesterUserId)?.name ?? req.requesterUserId
  const processorName = `${admin.name}${admin.department ? ` · ${admin.department}` : ''}`

  const confirmApprove = async () => {
    if (!node || !gpu || !valid || !alloc || submitting) return
    setSubmitting(true)
    try {
      const updated = await approveGpuRequest(req.id, {
        processedBy: admin.id, adminMemo: memo.trim() || undefined,
        allocatedServerId: node.id, allocatedGpuId: gpu.id, allocatedSliceId: sliceId ?? undefined,
        allocatedRamGb: alloc.ramGb, allocatedStorageGb: alloc.storageGb, allocatedCpuCores: alloc.cpuCores,
      })
      toast.push(`${requesterName}님의 GPU 신청을 승인했어요 · ${node.host} 할당 (RAM ${alloc.ramGb}GB · 디스크 ${alloc.storageGb}GB · CPU ${alloc.cpuCores}코어).`, 'ok')
      setDone({ mode: 'approved', detail: `${node.host} · ${gpuLabel}`, limits: `메모리 ${alloc.ramGb}GB · 저장 ${alloc.storageGb}GB · CPU ${alloc.cpuCores}코어`, processedAt: updated.processedAt ?? nowStamp(), mapLink: inventory.some((s) => s.id === node.id) ? { serverId: node.id, gpuId: gpu.id } : undefined })
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
            {/* 고정 컨트롤 — 안내 + 검색/필터 */}
            <div className="shrink-0 border-b border-line flex flex-col" style={{ padding: '13px 16px', gap: 10 }}>
              <p className="text-muted" style={{ fontSize: 14 }}>신청 자원 <b className="text-text">{req.capacity} {UNIT_KO[req.capacityUnit]}</b>를 할당할 GPU·슬라이스를 선택하세요. 메모리·저장·CPU는 선택 자원에 맞춰 자동 산정됩니다.</p>
              <PickerSearch q={q} setQ={setQ} statusF={statusF} setStatusF={setStatusF} count={filtered.length} />
            </div>

            {/* 본문 — 서버별 그룹 + GPU/슬라이스 단일 선택(가용/여유 없음/점검 시각 구분) */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ padding: 16, gap: 12 }}>
              {filtered.length ? (
                <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ gap: 10 }}>
                  {filtered.map((n) => {
                    const sel = n.id === serverId
                    return (
                      <div key={n.id} className="rounded-[12px]" style={{ border: `1.5px solid ${sel ? 'var(--c-accent)' : 'var(--c-border)'}`, background: sel ? 'var(--accent-soft)' : 'var(--c-card)', padding: 11 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 9, padding: '0 2px' }}>
                          <ServerStackIcon width={15} height={15} className="shrink-0" style={{ color: sel ? 'var(--c-accent)' : 'var(--c-muted)' }} />
                          <span className="font-bold text-text" style={{ fontSize: 13.5 }}>{n.host}</span>
                          {n.dummy && <span className="rounded font-semibold shrink-0" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>테스트</span>}
                          <span className="ml-auto text-muted tabular-nums shrink-0" style={{ fontSize: 12 }}>가용 {n.freeUnits}/{n.totalUnits} · GPU {n.gpus.length}장</span>
                        </div>
                        <div className="flex flex-col" style={{ gap: 8 }}>
                          {n.gpus.map((g) => g.mode === 'cluster'
                            ? <UnitRow key={g.id} label={g.name} sub={`GPU 단일 · ${g.vramGb}GB · 부하 ${g.load}%`} vramGb={g.vramGb} status={g.status} on={gpuId === g.id && !sliceId} onPick={() => pickUnit(n, g, null)} isSlice={false} />
                            : g.slices.map((s) => {
                                const st: SlotStatus = g.status === 'maintenance' ? 'maintenance' : s.free ? 'available' : 'full'
                                return <UnitRow key={s.id} label={`${g.name} · ${s.profile}`} sub={`MIG ${s.gb}GB · ${s.tag}`} vramGb={s.gb} status={st} on={sliceId === s.id} onPick={() => pickUnit(n, g, s)} isSlice />
                              }))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted" style={{ fontSize: 14 }}>검색 결과가 없어요.</div>
              )}

              {/* 권장 VRAM 적정성 — 자원 제한은 자동 산정(수동 입력 없음) */}
              {valid && (
                <div className="flex items-start gap-1.5 shrink-0" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  <span className="shrink-0 rounded-[5px] font-semibold" style={{ padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>권장 VRAM {rec.vramGb}GB</span>
                  <span className="text-muted min-w-0" style={{ paddingTop: 1 }}>
                    {rec.basis.join(', ')} 기준
                    {vramLow && <span style={{ color: 'var(--c-warn)', fontWeight: 600 }}> · 선택 자원 VRAM {selVram}GB가 권장보다 작아요</span>}
                  </span>
                </div>
              )}
            </div>

            {/* 하단 바 — 반려 / 검토하기 */}
            <div className="flex items-center justify-between shrink-0 border-t border-line" style={{ padding: '14px 16px' }}>
              <Button variant="danger" onClick={() => { setRejectReason(''); setRejectOpen(true) }}><XCircleIcon width={16} height={16} />반려</Button>
              <div className="flex items-center gap-3">
                {!valid && <span className="text-muted" style={{ fontSize: 14 }}>할당할 GPU·슬라이스를 선택해주세요.</span>}
                <Button onClick={() => setStep(1)} disabled={!valid}>검토하기</Button>
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
            onEditAlloc={() => setStep(0)}
            onBack={() => setStep(0)}
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
  const fleet = usePolling<GpuServer[]>('/api/servers')
  const alloc = approved ? resolveAllocationLabel(req, fleet.data ?? servers) : null
  const processor = req.processedBy ? userById(req.processedBy) : undefined
  const stamp = approved ? 'var(--c-ok)' : 'var(--c-danger)'
  const stampBg = approved ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const hasLimits = req.allocatedRamGb != null || req.allocatedStorageGb != null || req.allocatedCpuCores != null
  // 변경 이력 — 이 할당(req.id)을 대상으로 한 변경·회수 요청. 있으면 하단에 '이전 변경 이력 보기'.
  const [history, setHistory] = useState<ChangeRequest[]>([])
  const [histOpen, setHistOpen] = useState(false)
  useEffect(() => {
    let alive = true
    fetchChangeRequests()
      .then((all) => { if (alive) setHistory(all.filter((c) => c.before.requestId === req.id)) })
      .catch(() => { if (alive) setHistory([]) })
    return () => { alive = false }
  }, [req.id])
  return (
    <SpecSheetFrame
      title="자원 신청 명세서 · 심사"
      stampText={approved ? '승인' : '반려'} stampColor={stamp} stampBg={stampBg}
      watermark={approved ? '승인' : '반려'}
      docNo={docNo} who={name} dateText={today} chipText={req.id.toUpperCase()}
    >
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
          {history.length > 0 && (
            <SpecSection title="변경 이력">
              <button
                type="button"
                onClick={() => setHistOpen((v) => !v)}
                className="w-full flex items-center gap-2 rounded-[10px] border border-line transition-[background-color,border-color] duration-150 hover:border-[color:var(--c-accent)] hover:bg-soft"
                style={{ padding: '11px 13px', background: histOpen ? 'var(--accent-soft)' : 'var(--c-card)' }}
              >
                <ArrowsRightLeftIcon width={16} height={16} className="shrink-0" style={{ color: 'var(--c-accent)' }} />
                <span className="font-semibold text-text" style={{ fontSize: 14 }}>이전 변경 이력 보기</span>
                <span className="rounded-full font-bold tabular-nums" style={{ fontSize: 12, padding: '1px 8px', background: 'var(--c-accent)', color: 'var(--c-onaccent)' }}>{history.length}</span>
                <ChevronDownIcon width={16} height={16} className="ml-auto shrink-0 transition-transform" style={{ color: 'var(--c-muted)', transform: histOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {histOpen && (
                <div className="anim-fade flex flex-col" style={{ gap: 8, marginTop: 10 }}>
                  {history.map((c) => {
                    const meta = CHANGE_TYPE_META[c.type]
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(`/requests/gpu-change/${c.id}`)}
                        className="text-left flex items-center gap-2.5 rounded-[10px] border border-line transition-[transform,border-color] duration-100 hover:border-[color:var(--c-accent)] active:scale-[0.99]"
                        style={{ padding: '10px 12px', background: 'var(--c-card)' }}
                      >
                        <Badge tone={meta.tone === 'warn' ? 'neutral' : meta.tone}>{meta.label}</Badge>
                        <span className="min-w-0 flex-1 truncate text-text" style={{ fontSize: 14 }}>{c.reason || '사유 미기재'}</span>
                        <span className="shrink-0 text-muted tabular-nums" style={{ fontSize: 12.5 }}>{c.createdAt.slice(0, 10)}</span>
                        <StatusBadge status={c.status} />
                        <ArrowTopRightOnSquareIcon width={14} height={14} className="shrink-0" style={{ color: 'var(--c-muted)' }} />
                      </button>
                    )
                  })}
                </div>
              )}
            </SpecSection>
          )}
    </SpecSheetFrame>
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

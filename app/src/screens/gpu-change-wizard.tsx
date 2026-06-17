import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleStackIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  ServerStackIcon,
  Squares2X2Icon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Badge, Button, EmptyState, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { gpuRequests, modelById, servers, userById } from '../data'
import type { ChangeType, GpuRequest } from '../data/types'
import {
  CHANGE_TYPE_META,
  allocLabel,
  createChangeRequest,
  fetchChangeRequestById,
  fetchMyAllocations,
  reviewChangeRequest,
} from './gpu-change-store'
import type { AllocSpec, ChangeRequest, HistoryEntry } from './gpu-change-store'
import { buildResourceTree, SpecSection, SpecSheetFrame } from './approval-detail'

// 4.11 변경·확장·이전·회수 마법사 — 관리자 심사(GpuChangeReview) / 사용자 신청(GpuChangeRequestNew) 공용.
// 좌: 멀티스텝(기존값 prefill·수정) / 우: 기존 명세서 + 변경 후 + 히스토리.

const TYPE_TONE: Record<ChangeType, 'info' | 'ok' | 'warn' | 'danger'> = {
  change: 'info', expand: 'ok', migrate: 'warn', reclaim: 'danger',
}

// 관리자 자원 선택 목록의 단위(클러스터 GPU 또는 MIG 슬라이스)
interface PickUnit {
  id: string // `${serverId}/${gpuId}[/${sliceId}]`
  serverId: string; serverHost: string; gpuId: string; sliceId?: string
  label: string; sub: string; vramGb: number
  free: boolean; isCurrent: boolean; sameServer: boolean; dummy?: boolean
}

// 검토 단계 morph(좌 마법사 접힘 → 우 명세서 가운데로) — requests/new·approval-detail 동일 이징
const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

// 추가 자원 신청 시 참고용 예시 자원 카드(사용자는 인벤토리를 직접 못 보므로 카탈로그에서 고르고 텍스트로 작성)
const EXTRA_RESOURCES: { id: string; label: string; sub: string }[] = [
  { id: 'rtx4500', label: 'RTX PRO 4500 Blackwell', sub: '32GB · MIG 분할 가능' },
  { id: 'h100', label: 'H100 80GB', sub: '대형 학습 · 추론' },
  { id: 'a100', label: 'A100 40GB', sub: '범용 학습' },
  { id: 'mig', label: 'MIG 슬라이스 1g.16gb', sub: '경량 추론' },
]

// ── 프리미티브 ──
// 현재 할당받은 자원 표시 태그(picker 카드/행)
function CurTag() {
  return <span className="shrink-0 rounded font-semibold" style={{ fontSize: 11, padding: '1px 7px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>현재 사용</span>
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="뒤로 가기" className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90" style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}>
      <ArrowLeftIcon style={{ width: 18, height: 18 }} />
    </button>
  )
}

function Stepper({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center" style={{ gap: 0 }}>
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex items-center" style={{ flex: i === steps.length - 1 ? '0 0 auto' : '1 1 0' }}>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center justify-center rounded-full font-bold shrink-0" style={{ width: 26, height: 26, fontSize: 13, background: done || active ? 'var(--c-accent)' : 'var(--c-soft)', color: done || active ? 'var(--c-onaccent)' : 'var(--c-muted)' }}>
                {done ? <CheckIcon width={14} height={14} /> : i + 1}
              </span>
              <span className="font-semibold whitespace-nowrap" style={{ fontSize: 14, color: active ? 'var(--c-text)' : 'var(--c-muted)' }}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className="mx-3" style={{ flex: '1 1 0', height: 2, borderRadius: 2, background: done ? 'var(--c-accent)' : 'var(--c-border)' }} />}
          </div>
        )
      })}
    </div>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// 자원 제한 게이지 슬라이더 — 드래그로 올리거나 줄임. 현재값(base) 마커 표시 + 증감 델타.
function LimitSlider({ icon, label, value, base, min, max, step, unit, onChange }: { icon: ReactNode; label: string; value: number; base?: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
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
  const delta = base != null ? value - base : 0
  return (
    <div className="rounded-[10px] border border-line" style={{ background: 'var(--c-card)', padding: '12px 14px' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-muted" style={{ fontSize: 13 }}>{icon}{label}</span>
        <span className="flex items-baseline gap-2">
          {base != null && delta !== 0 && <span className="text-muted line-through" style={{ fontSize: 12.5 }}>{base}{unit}</span>}
          <span className="font-bold text-text tabular-nums" style={{ fontSize: 17 }}>{value}<span className="text-muted font-medium" style={{ fontSize: 12, marginLeft: 2 }}>{unit}</span></span>
          {base != null && delta !== 0 && <span className="font-semibold" style={{ fontSize: 12, color: delta > 0 ? 'var(--c-ok)' : 'var(--c-danger)' }}>{delta > 0 ? '+' : ''}{delta}</span>}
        </span>
      </div>
      <div ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop} className="relative select-none cursor-pointer" style={{ height: 18, marginTop: 9, touchAction: 'none' }} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="absolute left-0 right-0 rounded-full overflow-hidden" style={{ top: 6, height: 6, background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="h-full" style={{ width: `${pct(value)}%`, background: 'var(--c-accent)' }} />
        </div>
        {base != null && <div className="absolute" style={{ left: `${pct(base)}%`, top: 1, width: 2, height: 16, marginLeft: -1, background: 'var(--c-muted)', opacity: 0.6, borderRadius: 1 }} title={`현재 ${base}${unit}`} />}
        <div className="absolute rounded-full" style={{ left: `${pct(value)}%`, top: 1, width: 16, height: 16, marginLeft: -8, background: 'var(--c-accent)', border: '2px solid var(--c-card2)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
      </div>
      <div className="flex justify-between text-muted" style={{ fontSize: 11, marginTop: 3 }}><span>{min}{unit}</span><span>{max}{unit}</span></div>
    </div>
  )
}

function HistoryTimeline({ history }: { history: HistoryEntry[] }) {
  const toneColor = (t?: HistoryEntry['tone']) => t === 'ok' ? 'var(--c-ok)' : t === 'danger' ? 'var(--c-danger)' : t === 'accent' ? 'var(--c-accent)' : 'var(--c-muted)'
  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      {history.map((h, i) => (
        <div key={i} className="flex gap-3 min-w-0">
          <div className="flex flex-col items-center shrink-0" style={{ width: 14 }}>
            <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: toneColor(h.tone), marginTop: 4 }} />
            {i < history.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--c-border)', marginTop: 2 }} />}
          </div>
          <div className="min-w-0" style={{ paddingBottom: i < history.length - 1 ? 14 : 0 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-text" style={{ fontSize: 14 }}>{h.label}</span>
              <span className="text-muted" style={{ fontSize: 12.5 }}>{h.at}</span>
            </div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 1 }}>{h.actor}{h.detail ? ` · ${h.detail}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// (구 컴팩트 SpecSheet 제거 — 검토 우측 패널은 ReviewSpec(문서형)로 대체)

// ── 완료 접수증 ──
function Completion({ mode, type, onGo }: { mode: 'submitted' | 'approved' | 'rejected'; type: ChangeType; onGo: () => void }) {
  const ok = mode !== 'rejected'
  const color = mode === 'rejected' ? 'var(--c-danger)' : mode === 'approved' ? 'var(--c-ok)' : 'var(--c-accent)'
  const soft = mode === 'rejected' ? 'var(--danger-soft)' : mode === 'approved' ? 'var(--ok-soft)' : 'var(--accent-soft)'
  const title = mode === 'submitted' ? '변경 요청이 접수되었습니다' : mode === 'approved' ? '승인 처리되었습니다' : '반려 처리되었습니다'
  const desc = mode === 'submitted' ? '관리자 검토 후 결과가 알림으로 전달됩니다.' : ok ? '신청자에게 알림이 전송되고 할당이 반영됩니다.' : '신청자에게 반려 사유가 알림으로 전송되었습니다.'
  return (
    <div className="anim-fade flex items-center justify-center" style={{ minHeight: 400 }}>
      <div className="bg-card2 border border-line rounded-xl text-center" style={{ borderTop: `3px solid ${color}`, boxShadow: 'var(--shadow-pop)', padding: '34px 40px', width: 460 }}>
        <span className="flex items-center justify-center rounded-full mx-auto" style={{ width: 64, height: 64, background: soft }}>
          {ok ? <CheckCircleIcon width={34} height={34} style={{ color }} /> : <XCircleIcon width={34} height={34} style={{ color }} />}
        </span>
        <div className="font-bold tracking-widest" style={{ fontSize: 12, color, marginTop: 14 }}>{CHANGE_TYPE_META[type].label.toUpperCase?.() ?? CHANGE_TYPE_META[type].label}</div>
        <h2 className="font-bold text-text" style={{ fontSize: 20, marginTop: 6 }}>{title}</h2>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{desc}</p>
        <Button className="w-full justify-center" onClick={onGo} style={{ marginTop: 22 }}>목록으로</Button>
      </div>
    </div>
  )
}

// ════════════ 공용 마법사 본문 ════════════
function Wizard({ mode, id, initialType, before: initBefore, initAfter, reviewReq }: {
  mode: 'review' | 'new'
  id?: string
  initialType: ChangeType
  before: AllocSpec
  initAfter?: AllocSpec // review 모드: 신청자가 요청한 변경 후 명세(슬라이더 초기값)
  reviewReq?: ChangeRequest // review 모드: 상위에서 조회한 변경요청(신청자·사유·일시)
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useRole()
  const goList = () => navigate('/requests/gpu-change')

  // 사용자 신청: 본인 할당 목록(backend). review 모드는 사용 안 함.
  const [myAllocs, setMyAllocs] = useState<AllocSpec[]>([])
  useEffect(() => {
    if (mode !== 'new') return
    let alive = true
    fetchMyAllocations(user.id).then((rows) => { if (alive) setMyAllocs(rows) }).catch(() => { if (alive) setMyAllocs([]) })
    return () => { alive = false }
  }, [mode, user.id])
  const [allocIdx, setAllocIdx] = useState(0)
  const before = mode === 'new' ? (myAllocs[allocIdx] ?? initBefore) : initBefore
  const seed = mode === 'review' ? (initAfter ?? before) : before // 슬라이더 초기값 기준

  const [type, setType] = useState<ChangeType>(initialType)
  const [step, setStep] = useState(0)
  const [ram, setRam] = useState(seed.ramGb ?? 64)
  const [storage, setStorage] = useState(seed.storageGb ?? 100)
  const [cpu, setCpu] = useState(seed.cpuCores ?? 8)
  const [targetServerId, setTargetServerId] = useState(seed.serverId ?? before.serverId ?? '')
  const [extraSel, setExtraSel] = useState(initAfter?.extra?.label ?? '')
  const [extraNote, setExtraNote] = useState(initAfter?.extra?.note ?? '')
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  // 관리자 자원 선택 — 가용 자원 목록에서 체크(변경=단일/확장=복수). 현재 할당 자원이 기본 선택.
  const currentUnitId = before.serverId && before.gpuId
    ? `${before.serverId}/${before.gpuId}${before.sliceId ? `/${before.sliceId}` : ''}`
    : ''
  const [selUnitIds, setSelUnitIds] = useState<string[]>(currentUnitId ? [currentUnitId] : [])
  const [resQ, setResQ] = useState('') // 자원 검색
  const [resPage, setResPage] = useState(1) // 자원 목록 페이지
  const [done, setDone] = useState<null | 'submitted' | 'approved' | 'rejected'>(null)

  const reclaim = type === 'reclaim'
  const migrate = type === 'migrate'

  // 자원 선택 목록 — 가용 자원 + 현재 할당 자원을 평면 나열(서버별 그룹). 같은 서버는 박스로 강조.
  const tree = useMemo(() => buildResourceTree(), [])
  const units = useMemo<PickUnit[]>(() => {
    const out: PickUnit[] = []
    for (const s of tree) {
      for (const g of s.gpus) {
        if (g.mode === 'cluster') {
          const uid = `${s.id}/${g.id}`
          const isCurrent = uid === currentUnitId
          if (!g.free && !isCurrent) continue
          out.push({ id: uid, serverId: s.id, serverHost: s.host, gpuId: g.id, label: g.name, sub: `GPU 단일 · ${g.vramGb}GB · 부하 ${g.load}%`, vramGb: g.vramGb, free: g.free, isCurrent, sameServer: s.id === before.serverId, dummy: s.dummy })
        } else {
          for (const sl of g.slices) {
            const uid = `${s.id}/${g.id}/${sl.id}`
            const isCurrent = uid === currentUnitId
            if (!sl.free && !isCurrent) continue
            out.push({ id: uid, serverId: s.id, serverHost: s.host, gpuId: g.id, sliceId: sl.id, label: `${g.name} · ${sl.profile}`, sub: `MIG ${sl.gb}GB · ${sl.free ? '가용' : sl.tag}`, vramGb: sl.gb, free: sl.free, isCurrent, sameServer: s.id === before.serverId, dummy: s.dummy })
          }
        }
      }
    }
    return out
  }, [tree, currentUnitId, before.serverId])
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const serverGroups = useMemo(() => {
    const m = new Map<string, { serverId: string; serverHost: string; sameServer: boolean; dummy?: boolean; units: PickUnit[] }>()
    for (const u of units) {
      if (!m.has(u.serverId)) m.set(u.serverId, { serverId: u.serverId, serverHost: u.serverHost, sameServer: u.sameServer, dummy: u.dummy, units: [] })
      m.get(u.serverId)!.units.push(u)
    }
    return [...m.values()].sort((a, b) => Number(b.sameServer) - Number(a.sameServer) || a.serverHost.localeCompare(b.serverHost))
  }, [units])

  // 검색(서버 호스트·GPU 모델) + 페이지네이션(서버 그룹 단위)
  const RES_PER_PAGE = 4
  const filteredGroups = useMemo(() => {
    const q = resQ.trim().toLowerCase()
    if (!q) return serverGroups
    return serverGroups.filter((g) => g.serverHost.toLowerCase().includes(q) || g.units.some((u) => u.label.toLowerCase().includes(q)))
  }, [serverGroups, resQ])
  const resPageCount = Math.max(1, Math.ceil(filteredGroups.length / RES_PER_PAGE))
  const resCurPage = Math.min(resPage, resPageCount)
  const pageGroups = filteredGroups.slice((resCurPage - 1) * RES_PER_PAGE, resCurPage * RES_PER_PAGE)
  const onSearch = (v: string) => { setResQ(v); setResPage(1) }

  const singleSel = type === 'change' // 변경=1개만(라디오) / 확장=복수(체크)
  const selUnits = selUnitIds.map((uid) => unitById.get(uid)).filter(Boolean) as PickUnit[]
  // 기준 자원(서버·GPU 표시) — 변경=선택 1개 / 확장=현재 유지 시 현재, 아니면 첫 선택분(현재 해제 시 완전 교체)
  const baseUnit = singleSel ? selUnits[0] : (selUnits.find((u) => u.isCurrent) ?? selUnits[0])
  const changeTarget = baseUnit && !baseUnit.isCurrent ? baseUnit : undefined // 서버·GPU 교체 여부
  const addUnits = type === 'expand' ? selUnits.filter((u) => u.id !== baseUnit?.id) : [] // 확장: 추가 선택분
  const toggleUnit = (uid: string) => {
    if (singleSel) { setSelUnitIds([uid]); return } // 변경=라디오(1개)
    setSelUnitIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid])) // 확장=체크(현재 자원도 해제 가능)
  }

  // 추가 자원 — 사용자=카탈로그 텍스트 / 관리자=선택한 자원(없으면 신청자 요청 유지)
  const extra: AllocSpec['extra'] = mode === 'review'
    ? (addUnits.length ? { label: addUnits.map((u) => `${u.serverHost} · ${u.label} ${u.vramGb}GB`).join(', '), note: initAfter?.extra?.note ?? '' } : (type === 'expand' ? initAfter?.extra : undefined))
    : (type === 'expand' && extraSel ? { label: extraSel, note: extraNote.trim() } : undefined)

  const after: AllocSpec | undefined = reclaim ? undefined : {
    ...before,
    ramGb: ram, storageGb: storage, cpuCores: cpu,
    extra,
    serverId: changeTarget ? changeTarget.serverId : before.serverId,
    serverHost: changeTarget ? changeTarget.serverHost : before.serverHost,
    gpuId: changeTarget ? changeTarget.gpuId : before.gpuId,
    sliceId: changeTarget ? changeTarget.sliceId : before.sliceId,
    gpuLabel: changeTarget ? `${changeTarget.label} · ${changeTarget.vramGb}GB` : before.gpuLabel,
  }

  // 신청(사용자)=2스텝. 심사(관리자): 회수=2스텝 / 그 외=3스텝(조정 → 추가 자원 → 검토).
  const steps = mode === 'new'
    ? ['변경 요청', '검토 · 신청']
    : reclaim
      ? ['신청 확인', '검토 · 승인']
      : ['신청 · 조정', type === 'change' ? '대상 자원' : '추가 자원', '검토 · 승인']
  const lastStep = steps.length - 1
  const reviewing = step === lastStep

  const requesterName = mode === 'new' ? user.name : (reviewReq ? (userById(reviewReq.requesterUserId)?.name ?? reviewReq.requesterUserId) : '')

  // 우측 명세서(ReviewSpec)용 — 원본 신청서·신청자 정보·변경 사유
  const reviewUser = mode === 'review' ? userById(reviewReq?.requesterUserId ?? '') : user
  const reviewDept = reviewUser?.department ?? '미지정'
  const origReq = before.requestId ? gpuRequests.find((r) => r.id === before.requestId) : undefined
  const reviewReason = mode === 'review' ? reviewReq?.reason : (reason.trim() || undefined)

  const busyRef = useRef(false) // 중복 제출 방지
  const submitNew = async () => {
    if (!reason.trim() || busyRef.current) return
    busyRef.current = true
    try {
      await createChangeRequest({ requesterUserId: user.id, type, reason: reason.trim(), before, after })
      toast.push(`${CHANGE_TYPE_META[type].label} 요청이 접수되었어요. (검토중)`, 'ok')
      setDone('submitted')
    } catch { busyRef.current = false; toast.push('요청 접수에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger') }
  }
  const approve = async () => {
    if (!id || busyRef.current) return
    busyRef.current = true
    try {
      await reviewChangeRequest(id, { action: 'approve', processedBy: user.id, adminMemo: memo.trim() || undefined, after })
      toast.push(`${requesterName}님의 ${CHANGE_TYPE_META[type].label} 요청을 승인했어요.`, 'ok')
      setDone('approved')
    } catch { busyRef.current = false; toast.push('승인 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger') }
  }
  const reject = async () => {
    if (!id || !rejectReason.trim() || busyRef.current) return
    busyRef.current = true
    try {
      await reviewChangeRequest(id, { action: 'reject', processedBy: user.id, adminMemo: memo.trim() || undefined, rejectReason: rejectReason.trim() })
      toast.push(`${requesterName}님의 요청을 반려했어요.`, 'warn')
      setDone('rejected')
    } catch { busyRef.current = false; toast.push('반려 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger') }
  }

  if (done) return (
    <div data-approval className="anim-fade flex flex-col h-full" style={{ minHeight: 0 }}>
      <Completion mode={done} type={type} onGo={goList} />
    </div>
  )

  // 자원 선택 단계(심사·비회수)에서는 최소 1개 선택해야 다음으로
  const pickerStep = mode === 'review' && !reclaim && step === 1
  const canNext = !pickerStep || selUnits.length > 0

  // 회수 확인 박스
  const reclaimBlock = (
    <div className="flex flex-col items-center justify-center text-center" style={{ gap: 12, padding: '24px 0' }}>
      <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'var(--danger-soft)' }}><XCircleIcon width={30} height={30} style={{ color: 'var(--c-danger)' }} /></span>
      <div className="font-bold text-text" style={{ fontSize: 16 }}>{allocLabel(before)} 회수</div>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 360 }}>{mode === 'new' ? '회수 신청 시 최종 관리자 승인 후 할당이 해제됩니다.' : '승인하면 위 할당이 해제되고 자원이 가용 풀로 반환됩니다.'}</p>
    </div>
  )

  // 자원 제한 슬라이더(+migrate 서버) — 신청 step0 · 심사 '신청 · 조정' step
  const sliderBlock = (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {migrate && (
        <div>
          <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>이전할 서버</div>
          <div className="flex flex-col" style={{ gap: 8, maxHeight: 200, overflow: 'auto' }}>
            {servers.slice(0, 8).map((s) => {
              const on = targetServerId === s.id
              return (
                <button key={s.id} type="button" onClick={() => setTargetServerId(s.id)} className="text-left rounded-[10px] border flex items-center gap-2.5 transition" style={{ padding: '10px 12px', background: on ? 'var(--accent-soft)' : 'var(--c-card)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none' }}>
                  <ServerStackIcon width={17} height={17} className="shrink-0" style={{ color: on ? 'var(--c-accent)' : 'var(--c-muted)' }} />
                  <span className="font-semibold text-text truncate" style={{ fontSize: 14 }}>{s.host}</span>
                  {s.id === before.serverId && <span className="text-muted" style={{ fontSize: 12 }}>(현재)</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>자원 제한 {mode === 'review' ? '조정' : '조절'} <span className="text-muted font-normal" style={{ fontSize: 13 }}>— 게이지를 끌어 올리거나 줄이세요</span></div>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <LimitSlider icon={<RectangleStackIcon width={13} height={13} />} label="메모리" value={ram} unit="GB" onChange={setRam} step={8} min={8} max={1024} base={before.ramGb} />
          <LimitSlider icon={<CircleStackIcon width={13} height={13} />} label="저장 공간" value={storage} unit="GB" onChange={setStorage} step={20} min={20} max={4096} base={before.storageGb} />
          <LimitSlider icon={<CpuChipIcon width={13} height={13} />} label="CPU" value={cpu} unit="코어" onChange={setCpu} step={2} min={2} max={128} base={before.cpuCores} />
        </div>
      </div>
    </div>
  )

  // 사용자 추가 자원(카탈로그 카드 + 텍스트) — '확장'일 때만. 인벤토리를 직접 못 보므로 텍스트로 신청
  const extraCardsBlock = type === 'expand' ? (
    <div>
      <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>추가 자원 신청 <span className="text-muted font-normal" style={{ fontSize: 13 }}>(선택) — 필요한 자원을 고르고 수량·사유를 적어주세요</span></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {EXTRA_RESOURCES.map((r) => {
          const on = extraSel === r.label
          return (
            <button key={r.id} type="button" onClick={() => { setExtraSel(r.label); if (!extraNote.trim()) setExtraNote(`${r.label} `) }} className="text-left rounded-[10px] border flex items-center gap-2.5 transition" style={{ padding: '10px 12px', background: on ? 'var(--accent-soft)' : 'var(--c-card)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none' }}>
              <Squares2X2Icon width={16} height={16} className="shrink-0" style={{ color: on ? 'var(--c-accent)' : 'var(--c-muted)' }} />
              <span className="min-w-0 flex-1"><span className="block font-semibold text-text truncate" style={{ fontSize: 13.5 }}>{r.label}</span><span className="block text-muted truncate" style={{ fontSize: 12 }}>{r.sub}</span></span>
            </button>
          )
        })}
      </div>
      {extraSel && (
        <textarea value={extraNote} onChange={(e) => setExtraNote(e.target.value)} maxLength={200} placeholder="예: RTX PRO 4500 2장, 멀티-GPU 학습용으로 필요합니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 64, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5, marginTop: 8 }} />
      )}
    </div>
  ) : null

  // 현재 할당받은 자원 배너(관리자 추가 자원 picker 상단)
  const currentAllocBanner = (
    <div className="rounded-[10px] border shrink-0" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)', padding: '11px 13px' }}>
      <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 4 }}>현재 할당받은 자원</div>
      <div className="flex items-center flex-wrap" style={{ gap: '2px 12px' }}>
        <span className="font-bold text-text" style={{ fontSize: 14 }}>{allocLabel(before)}</span>
        <span className="text-muted" style={{ fontSize: 13 }}>메모리 {before.ramGb ?? '—'}GB · 저장 {before.storageGb ?? '—'}GB · CPU {before.cpuCores ?? '—'}코어</span>
      </div>
    </div>
  )

  // 관리자 자원 선택 — 가용 자원 + 현재 자원을 서버별 박스로 평면 나열. 변경=라디오(1개)/확장=체크(복수).
  // 모든 박스 테두리 두께 1.5px 고정(색으로만 상태 구분) · 검색 · 서버 그룹 페이지네이션.
  const selCount = selUnits.length
  const resourceListBlock = (
    <div className="flex flex-col h-full min-h-0" style={{ gap: 12 }}>
      {currentAllocBanner}
      <div className="shrink-0 flex flex-col" style={{ gap: 8 }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-text" style={{ fontSize: 14 }}>{type === 'change' ? '변경할 자원 선택' : '추가할 자원 선택'}</span>
          <span className="text-muted tabular-nums" style={{ fontSize: 12.5 }}>{selCount}개 선택 · 서버 {filteredGroups.length}대</span>
        </div>
        <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {type === 'change' ? '현재 자원 대신 사용할 자원 1개를 고르세요.' : '현재 자원에 더해 할당할 자원을 고르세요 (복수). 현재 자원을 해제하면 완전히 교체할 수도 있어요.'}
        </p>
        {/* 검색 */}
        <div className="flex items-center bg-card2 border border-line rounded-[9px] transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 38, padding: '0 11px', gap: 8 }}>
          <MagnifyingGlassIcon width={16} height={16} className="shrink-0" style={{ color: 'var(--c-muted)' }} />
          <input value={resQ} onChange={(e) => onSearch(e.target.value)} placeholder="서버·GPU 모델 검색 (예: H100, gpu-a01)" className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: 14, outline: 'none', border: 'none' }} />
          {resQ && <button type="button" onClick={() => onSearch('')} className="shrink-0 text-muted hover:text-text" aria-label="지우기"><XCircleIcon width={15} height={15} /></button>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ gap: 12 }}>
        {pageGroups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted" style={{ fontSize: 14 }}>검색 결과가 없어요.</div>
        ) : pageGroups.map((grp) => {
          const freeCnt = grp.units.filter((u) => u.free).length
          return (
            <div key={grp.serverId} className="rounded-[12px]" style={{ border: `1.5px solid ${grp.sameServer ? 'var(--c-accent)' : 'var(--c-border)'}`, background: grp.sameServer ? 'var(--accent-soft)' : 'var(--c-card)', padding: 11 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 9, padding: '0 2px' }}>
                <ServerStackIcon width={15} height={15} className="shrink-0" style={{ color: grp.sameServer ? 'var(--c-accent)' : 'var(--c-muted)' }} />
                <span className="font-bold text-text" style={{ fontSize: 13.5 }}>{grp.serverHost}</span>
                {grp.sameServer && <span className="rounded-full font-bold shrink-0" style={{ fontSize: 11, padding: '1px 8px', background: 'var(--c-accent)', color: 'var(--c-onaccent)' }}>현재 서버</span>}
                {grp.dummy && <span className="rounded font-semibold shrink-0" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>테스트</span>}
                <span className="ml-auto text-muted tabular-nums shrink-0" style={{ fontSize: 12 }}>가용 {freeCnt}</span>
              </div>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {grp.units.map((u) => {
                  const on = selUnitIds.includes(u.id)
                  const disabled = !u.free && !u.isCurrent
                  return (
                    <button key={u.id} type="button" disabled={disabled} onClick={() => toggleUnit(u.id)}
                      className="text-left rounded-[10px] flex items-center gap-2.5 transition-[border-color,background,transform] duration-100 disabled:cursor-not-allowed enabled:hover:border-[color:var(--c-accent)] enabled:active:scale-[0.995]"
                      style={{ padding: '10px 12px', border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`, background: on ? 'var(--c-card2)' : 'var(--c-bg)', opacity: disabled ? 0.5 : 1 }}>
                      {/* 변경=원형(라디오) / 확장=사각(체크) */}
                      <span className="flex items-center justify-center shrink-0" style={{ width: 18, height: 18, borderRadius: singleSel ? '50%' : 6, border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`, background: on ? 'var(--c-accent)' : 'transparent' }}>{on && <CheckIcon width={12} height={12} style={{ color: 'var(--c-onaccent)' }} />}</span>
                      {u.sliceId ? <Squares2X2Icon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-accent)' }} /> : <CpuChipIcon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-muted)' }} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-text truncate" style={{ fontSize: 14 }}>{u.label}</span>
                          {u.isCurrent && <CurTag />}
                        </span>
                        <span className="block text-muted truncate" style={{ fontSize: 13 }}>{u.sub}</span>
                      </span>
                      <span className="shrink-0 rounded-[6px] font-semibold tabular-nums" style={{ fontSize: 12, padding: '2px 8px', background: 'var(--c-soft)', color: 'var(--c-muted)' }}>{u.vramGb}GB</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 페이지네이션 — 서버 그룹이 한 페이지를 넘으면 */}
      {resPageCount > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3" style={{ paddingTop: 2 }}>
          <button type="button" onClick={() => setResPage((p) => Math.max(1, p - 1))} disabled={resCurPage <= 1}
            className="flex items-center justify-center rounded-[8px] border border-line bg-card2 text-muted transition enabled:hover:text-text enabled:hover:bg-soft disabled:opacity-40 disabled:cursor-not-allowed" style={{ width: 32, height: 32 }} aria-label="이전 페이지">
            <ArrowLeftIcon width={15} height={15} />
          </button>
          <span className="text-muted tabular-nums" style={{ fontSize: 13 }}>{resCurPage} / {resPageCount}</span>
          <button type="button" onClick={() => setResPage((p) => Math.min(resPageCount, p + 1))} disabled={resCurPage >= resPageCount}
            className="flex items-center justify-center rounded-[8px] border border-line bg-card2 text-muted transition enabled:hover:text-text enabled:hover:bg-soft disabled:opacity-40 disabled:cursor-not-allowed" style={{ width: 32, height: 32 }} aria-label="다음 페이지">
            <ArrowLeftIcon width={15} height={15} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      )}
    </div>
  )

  const leftContent = mode === 'new' ? (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>대상 할당 선택</div>
        {myAllocs.length === 0 ? (
          <div className="text-muted rounded-[10px] border border-line" style={{ fontSize: 14, padding: 14, background: 'var(--c-card)' }}>변경할 수 있는 승인된 할당이 없어요.</div>
        ) : (
          <div className="flex flex-col" style={{ gap: 8 }}>
            {myAllocs.map((a, i) => {
              const on = i === allocIdx
              return (
                <button key={a.requestId ?? i} type="button" onClick={() => { setAllocIdx(i); setRam(a.ramGb ?? 64); setStorage(a.storageGb ?? 100); setCpu(a.cpuCores ?? 8); setTargetServerId(a.serverId ?? ''); setExtraSel(''); setExtraNote('') }}
                  className="text-left rounded-[10px] border flex items-center gap-2.5 transition" style={{ padding: '11px 13px', background: on ? 'var(--accent-soft)' : 'var(--c-card)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none' }}>
                  <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 18, height: 18, border: `1.5px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}`, background: on ? 'var(--c-accent)' : 'transparent' }}>{on && <CheckIcon width={12} height={12} style={{ color: 'var(--c-onaccent)' }} />}</span>
                  <ServerStackIcon width={18} height={18} className="shrink-0" style={{ color: 'var(--c-muted)' }} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-text truncate" style={{ fontSize: 14 }}>{allocLabel(a)}</span><span className="block text-muted truncate" style={{ fontSize: 13 }}>메모리 {a.ramGb ?? '—'}GB · 저장 {a.storageGb ?? '—'}GB · CPU {a.cpuCores ?? '—'}코어</span></span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>요청 유형</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(['change', 'reclaim'] as ChangeType[]).map((t) => {
            const on = type === t
            return (
              <button key={t} type="button" onClick={() => setType(t)} className="rounded-[10px] border text-center transition" style={{ padding: '12px 8px', background: on ? 'var(--accent-soft)' : 'var(--c-card)', borderColor: on ? 'var(--c-accent)' : 'var(--c-border)', boxShadow: on ? '0 0 0 1px var(--c-accent)' : 'none' }}>
                <span className="block font-bold text-text" style={{ fontSize: 14 }}>{CHANGE_TYPE_META[t].label}</span>
                <span className="block text-muted" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{CHANGE_TYPE_META[t].desc}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="border-t border-line" style={{ paddingTop: 16 }}>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 10 }}>{reclaim ? '회수 확인' : '변경 내용'}</div>
        {reclaim ? reclaimBlock : <div className="flex flex-col" style={{ gap: 16 }}>{sliderBlock}{extraCardsBlock}</div>}
      </div>
    </div>
  ) : step === 0 ? (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6 }}><b className="text-text">{requesterName}</b>님이 <b className="text-text">{allocLabel(before)}</b> 할당에 대해 <b className="text-text">{CHANGE_TYPE_META[type].label}</b>을 요청했습니다. {reclaim ? '회수를 검토하세요.' : `기존 명세를 참고해 자원을 조정하고, 다음 단계에서 ${type === 'change' ? '사용할 자원을 선택하세요.' : '추가 자원을 선택하세요.'}`}</p>
      <div className="rounded-[10px] border border-line" style={{ background: 'var(--c-card)', padding: '13px 15px' }}>
        <div className="text-muted" style={{ fontSize: 13 }}>요청 사유</div>
        <div className="text-text" style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{reviewReq?.reason ?? ''}</div>
        {initAfter?.extra && <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>요청 추가 자원 · <b className="text-text">{initAfter.extra.label}</b>{initAfter.extra.note ? ` — ${initAfter.extra.note}` : ''}</div>}
      </div>
      {reclaim ? reclaimBlock : sliderBlock}
    </div>
  ) : resourceListBlock

  // 검토(morph) 시 명세서 안에 들어가는 액션 footer
  const actionFooter = mode === 'new' ? (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 6 }}>요청 사유 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder={`${CHANGE_TYPE_META[type].label} 사유를 입력해주세요. 관리자 검토에 사용됩니다.`} className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 76, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(lastStep - 1)}>이전</Button>
        <Button onClick={submitNew} disabled={!reason.trim()}>신청 제출</Button>
      </div>
    </div>
  ) : rejecting ? (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)' }}>반려 사유 <span>*</span></div>
      <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 전달됩니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 70, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setRejecting(false)}>취소</Button>
        <Button variant="danger" onClick={reject} disabled={!rejectReason.trim()}>반려 확정</Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div>
        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 6 }}>처리 메모 <span className="text-muted font-normal">(선택)</span></div>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} placeholder="승인·반려와 함께 신청자에게 전달할 메모를 남겨주세요." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 60, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(lastStep - 1)}>이전</Button>
        <div className="flex items-center gap-2">
          <Button variant="danger" onClick={() => setRejecting(true)}><XCircleIcon width={16} height={16} />반려</Button>
          <Button onClick={approve}><CheckCircleIcon width={16} height={16} />{reclaim ? '회수 승인' : '승인'}</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full">
      <style>{`
        [data-approval]{user-select:none;-webkit-user-select:none}
        [data-approval] button:not(:disabled),[data-approval] a,[data-approval] select{cursor:pointer}
        [data-approval] input,[data-approval] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
        [data-morph]{transition-duration:.8s !important}
      `}</style>

      <header className="flex flex-col shrink-0">
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <BackButton onClick={goList} />
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>{mode === 'review' ? '변경 요청 심사' : '신규 변경 요청'}</h1>
          <Badge tone={TYPE_TONE[type]}>{CHANGE_TYPE_META[type].label}</Badge>
          {mode === 'review' && requesterName && <span className="text-muted" style={{ fontSize: 14 }}>신청자 {requesterName}</span>}
        </div>
      </header>

      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px', marginTop: 18 }}>
        <Stepper current={step} steps={steps} />
      </section>

      {/* morph — 좌: 마법사(검토 시 접힘) / 우: 명세서(검토 시 가운데) */}
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 18 }}>
        <div
          data-morph
          aria-hidden={reviewing}
          style={{ width: reviewing ? '0%' : '56%', flex: '0 0 auto', minWidth: 0, opacity: reviewing ? 0 : 1, transform: reviewing ? 'translateX(-40px)' : 'none', pointerEvents: reviewing ? 'none' : 'auto', transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}` }}
        >
          <section className="bg-card2 border border-line rounded-xl flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '16px 18px' }}>{leftContent}</div>
            <div className="flex items-center justify-between shrink-0 border-t border-line" style={{ padding: '14px 18px' }}>
              {step === 0
                ? <Button variant="ghost" onClick={goList}>목록</Button>
                : <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>이전</Button>}
              <Button onClick={() => setStep((s) => Math.min(lastStep, s + 1))} disabled={!canNext}>{step === lastStep - 1 ? '검토' : '다음'}</Button>
            </div>
          </section>
        </div>

        <div data-morph style={{ width: reviewing ? '100%' : '44%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 18, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <div style={{ height: '100%', maxWidth: reviewing ? 900 : 'none', margin: reviewing ? '0 auto' : 0, transition: `max-width .8s ${MORPH_EASE}` }}>
            <ReviewSpec
              orig={origReq} requesterName={requesterName || user.name} dept={reviewDept} email={reviewUser?.email}
              before={before} after={after} type={type} reviewing={reviewing}
              docId={id ?? ''} createdAt={reviewReq?.createdAt ?? ''} reason={reviewReason}
              footer={reviewing ? actionFooter : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const TONE_VAR: Record<'info' | 'ok' | 'warn' | 'danger', string> = {
  info: 'var(--c-accent)', ok: 'var(--c-ok)', warn: 'var(--c-warn)', danger: 'var(--c-danger)',
}

const UNIT_KO: Record<'card' | 'slice', string> = { card: '카드', slice: '슬라이스' }
const PRIORITY_KO: Record<'low' | 'normal' | 'high', string> = { high: '높음', normal: '보통', low: '낮음' }

// 변경요청 대상의 원본 GPU 신청서(시드) — before.requestId 로 동기 조회. 데모 건은 없을 수 있음(빈 칸 안내).
function originalRequestOf(req: ChangeRequest): GpuRequest | undefined {
  return req.before.requestId ? gpuRequests.find((r) => r.id === req.before.requestId) : undefined
}

// 명세서 라벨-값 행(읽기전용) — approval-detail SpecRow(final)과 동일 룩 + compact 축소 지원.
function DocRow({ label, value, emptyText, last, compact }: { label: string; value?: ReactNode; emptyText?: string; last?: boolean; compact?: boolean }) {
  const fs = compact ? 13 : 15
  const lw = compact ? 78 : 92
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: compact ? '6px 0' : '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: lw, fontSize: fs, color: 'var(--c-muted)', lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: compact ? 18 : 23 }}>
        {empty
          ? <span style={{ fontSize: fs, color: 'var(--c-muted)' }}>{emptyText ?? '—'}</span>
          : <span className="anim-fade font-medium" style={{ fontSize: fs, color: 'var(--c-text)', lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}

// 변경 후 명세서의 바뀐 행 — 기존값(취소선) → 변경값을 톤 색 박스(테두리)로 강조. DocRow와 동일 치수.
function ChangedDocRow({ label, before, after, tone, last, compact }: { label: string; before: ReactNode; after: ReactNode; tone: string; last?: boolean; compact?: boolean }) {
  const fs = compact ? 13 : 15
  const lw = compact ? 78 : 92
  return (
    <div className="flex items-start gap-3" style={{ padding: compact ? '6px 0' : '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: lw, fontSize: fs, color: 'var(--c-muted)', lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center flex-wrap" style={{ minHeight: compact ? 18 : 23, gap: compact ? 6 : 8 }}>
        <span className="inline-flex items-center anim-fade" style={{ gap: compact ? 6 : 8, padding: compact ? '2px 9px' : '3px 11px', borderRadius: 8, border: `1.5px solid ${tone}`, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}>
          <span className="line-through tabular-nums" style={{ fontSize: fs - 1, color: 'var(--c-muted)', opacity: 0.7 }}>{before}</span>
          <ChevronRightIcon width={compact ? 12 : 13} height={compact ? 12 : 13} style={{ color: tone }} />
          <span className="font-bold tabular-nums" style={{ fontSize: fs, color: tone }}>{after}</span>
        </span>
        <span className="rounded font-semibold shrink-0" style={{ fontSize: compact ? 10.5 : 11, padding: '1px 7px', background: tone, color: 'var(--c-onaccent)' }}>변경</span>
      </div>
    </div>
  )
}

// 신청 정보 + 요청 자원 — 원본 GPU 신청서(자원 신청 명세서) 그대로. 조회·심사 명세서 공용.
function IntakeSections({ orig, requesterName, dept, email, compact }: { orig?: GpuRequest; requesterName: string; dept: string; email?: string; compact?: boolean }) {
  const modelText = orig ? orig.models.map((m) => modelById(m)?.name ?? m).join(', ') : undefined
  const fileText = orig?.attachmentUrl?.split('/').pop()
  return (
    <>
      <SpecSection title="신청 정보" compact={compact}>
        <DocRow compact={compact} label="신청자" value={`${requesterName} · ${dept}`} />
        <DocRow compact={compact} label="이메일" value={email} emptyText="미등록" />
        <DocRow compact={compact} label="서비스명" value={orig?.serviceName} emptyText="미지정" />
        <DocRow compact={compact} label="요청 사유" value={orig?.purpose} emptyText="미지정" last />
      </SpecSection>
      <SpecSection title="요청 자원" compact={compact}>
        <DocRow compact={compact} label="요청 모델" value={modelText} emptyText="미지정" />
        <DocRow compact={compact} label="요청 수량" value={orig ? `${orig.capacity} ${UNIT_KO[orig.capacityUnit]}` : undefined} emptyText="미지정" />
        <DocRow compact={compact} label="사용 기간" value={orig?.period} emptyText="미지정" />
        <DocRow compact={compact} label="우선순위" value={orig?.priority ? PRIORITY_KO[orig.priority] : undefined} emptyText="미지정" />
        <DocRow compact={compact} label="운영 환경" value={orig?.env || undefined} emptyText="미지정" />
        <DocRow compact={compact} label="부가 옵션" value={orig ? (orig.addons.length ? orig.addons.join(', ') : '없음') : undefined} emptyText="없음" />
        <DocRow compact={compact} label="첨부 공문" value={fileText} emptyText="첨부 없음" last />
      </SpecSection>
    </>
  )
}

// 할당 섹션 — marked=false(기존 그대로) / marked=true(변경분 before→after 강조).
// 확장 추가 자원은 별도 행이 아니라 'GPU(할당 자원)' 행에 화살표로 합쳐서 표현.
function AllocSection({ title, before, after, type, marked, compact }: { title: string; before: AllocSpec; after?: AllocSpec; type: ChangeType; marked: boolean; compact?: boolean }) {
  const reclaim = type === 'reclaim'
  const tone = TONE_VAR[TYPE_TONE[type]]
  // 백엔드 after 는 '바뀐 필드만' 채운 sparse delta(나머지 null) → 안 바뀐 값은 before 로 폴백.
  const a = marked && !reclaim ? (after ?? {}) : {}
  const fb = <T,>(av: T | undefined, bv: T | undefined): T | undefined => (av != null ? av : bv)
  const sv = fb(a.serverHost, before.serverHost)
  const gl = fb(a.gpuLabel, before.gpuLabel)
  const ram = fb(a.ramGb, before.ramGb)
  const sto = fb(a.storageGb, before.storageGb)
  const cpu = fb(a.cpuCores, before.cpuCores)
  const chg = (av?: number | string, bv?: number | string) => av != null && av !== bv
  const addLabel = a.extra?.label
  const gpuAfter = addLabel ? `${gl ?? '—'} + ${addLabel}` : (gl ?? '—')
  const gpuChanged = (a.gpuLabel != null && a.gpuLabel !== before.gpuLabel) || !!addLabel
  return (
    <SpecSection title={title} compact={compact}>
      {chg(a.serverHost, before.serverHost)
        ? <ChangedDocRow compact={compact} label="할당 서버" before={before.serverHost ?? '—'} after={sv ?? '—'} tone={tone} />
        : <DocRow compact={compact} label="할당 서버" value={sv} emptyText="—" />}
      {gpuChanged
        ? <ChangedDocRow compact={compact} label="할당 자원" before={before.gpuLabel ?? '—'} after={gpuAfter} tone={tone} />
        : <DocRow compact={compact} label="할당 자원" value={gl} emptyText="—" />}
      {chg(a.ramGb, before.ramGb)
        ? <ChangedDocRow compact={compact} label="메모리" before={`${before.ramGb}GB`} after={`${ram}GB`} tone={tone} />
        : <DocRow compact={compact} label="메모리" value={`${ram ?? '—'}GB`} />}
      {chg(a.storageGb, before.storageGb)
        ? <ChangedDocRow compact={compact} label="저장 공간" before={`${before.storageGb}GB`} after={`${sto}GB`} tone={tone} />
        : <DocRow compact={compact} label="저장 공간" value={`${sto ?? '—'}GB`} />}
      {chg(a.cpuCores, before.cpuCores)
        ? <ChangedDocRow compact={compact} label="CPU" before={`${before.cpuCores}코어`} after={`${cpu}코어`} tone={tone} last />
        : <DocRow compact={compact} label="CPU" value={`${cpu ?? '—'}코어`} last />}
    </SpecSection>
  )
}

// 심사 우측 명세서 — 원본 자원 신청 명세서와 동일 문서 프레임 + 변경분 강조 + (검토 시)액션 footer.
function ReviewSpec({ orig, requesterName, dept, email, before, after, type, reviewing, docId, createdAt, reason, footer }: {
  orig?: GpuRequest; requesterName: string; dept: string; email?: string
  before: AllocSpec; after?: AllocSpec; type: ChangeType; reviewing: boolean
  docId: string; createdAt: string; reason?: string; footer?: ReactNode
}) {
  const reclaim = type === 'reclaim'
  const tone = TONE_VAR[TYPE_TONE[type]]
  const stampText = reclaim ? '회수' : CHANGE_TYPE_META[type].label
  // 검토 진입 시 — 관리자가 봐야 할 변경분(변경 요청·변경 후 할당)이 하단에 있으므로 그 위치로 자동 스크롤.
  // morph(폭 0.8s) 도중 reflow 로 위치가 어긋나므로, 컨테이너를 직접 제어하며 morph 종료 시점까지 여러 번 보정.
  const bodyRef = useRef<HTMLDivElement>(null)
  const changeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!reviewing) return
    const scrollToChange = (behavior: ScrollBehavior) => {
      const body = bodyRef.current, target = changeRef.current
      if (!body || !target) return
      const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 6
      body.scrollTo({ top: Math.max(0, top), behavior })
    }
    // 즉시 1회(부드럽게) + morph 종료(약 0.85s) 후 보정(정확 위치로 스냅)
    const t1 = setTimeout(() => scrollToChange('smooth'), 240)
    const t2 = setTimeout(() => scrollToChange('auto'), 880)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [reviewing])
  return (
    <SpecSheetFrame
      title="변경 후 명세서"
      stampText={stampText} stampColor={tone} stampBg={`color-mix(in srgb, ${tone} 14%, transparent)`} watermark={stampText}
      docNo={`ANC-CR-${docId.toUpperCase()}`} who={requesterName} dateText={createdAt.slice(0, 10)} chipText={CHANGE_TYPE_META[type].label}
      maxWidth="none" reviewing={reviewing} footer={footer} bodyRef={bodyRef}
    >
      <IntakeSections orig={orig} requesterName={requesterName} dept={dept} email={email} />
      <div ref={changeRef} style={{ scrollMarginTop: 4 }}>
        <SpecSection title="변경 요청">
          <DocRow label="변경 유형" value={CHANGE_TYPE_META[type].label} />
          <DocRow label="변경 사유" value={reason} emptyText="사유 미기재" last />
        </SpecSection>
        <AllocSection title={reclaim ? '회수 결과' : '변경 후 할당'} before={before} after={after} type={type} marked />
      </div>
      {reclaim && (
        <div className="rounded-[10px] flex items-start gap-2" style={{ margin: '2px 0 4px', padding: '11px 13px', background: 'var(--danger-soft)' }}>
          <XCircleIcon width={18} height={18} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13.5, color: 'var(--c-danger)', lineHeight: 1.5 }}>승인하면 위 할당이 해제되고 자원이 가용 풀로 반환됩니다.</span>
        </div>
      )}
    </SpecSheetFrame>
  )
}

// 변경요청 조회 명세서 카드 — 자원 신청 명세서 조회(ProcessedSpec)와 동일 프레임/섹션.
// 좌(before): 원본 신청서 그대로 / 우(after): 동일 구조 + 변경 행 색 박스 강조 + 변경 처리결과·히스토리.
function ChangeSpecCard({ kind, req, requesterName }: { kind: 'before' | 'after'; req: ChangeRequest; requesterName: string }) {
  const isAfter = kind === 'after'
  const reclaim = req.type === 'reclaim'
  const before = req.before
  const after = req.after ?? before
  const orig = originalRequestOf(req)
  const u = userById(req.requesterUserId)
  const dept = u?.department ?? '미지정'
  const today = req.createdAt.slice(0, 10)
  const typeColor = TONE_VAR[TYPE_TONE[req.type]]

  // 레터헤드 — 좌(기존): 중립 '기존' 톤 / 우(변경 후): 변경유형 톤
  const stampText = isAfter ? CHANGE_TYPE_META[req.type].label : '기존'
  const stampColor = isAfter ? typeColor : 'var(--c-muted)'
  const stampBg = isAfter ? `color-mix(in srgb, ${typeColor} 14%, transparent)` : 'var(--c-soft)'
  const docNo = isAfter ? `ANC-CR-${req.id.toUpperCase()}` : `ANC-AR-${(orig?.id ?? req.id).toUpperCase()}`
  const chipText = isAfter ? CHANGE_TYPE_META[req.type].label : (orig?.id.toUpperCase() ?? req.id.toUpperCase())

  const approved = req.status === 'approved'

  return (
    <SpecSheetFrame
      title={isAfter ? '변경 후 명세서' : '기존 할당 명세서'}
      stampText={stampText} stampColor={stampColor} stampBg={stampBg} watermark={stampText}
      docNo={docNo} who={requesterName} dateText={today} chipText={chipText}
      maxWidth="none" compact
    >
      <IntakeSections orig={orig} requesterName={requesterName} dept={dept} email={u?.email} compact />
      <AllocSection title={isAfter ? (reclaim ? '회수 결과' : '변경 후 할당') : '현재 할당'} before={before} after={after} type={req.type} marked={isAfter} compact />

      {isAfter && reclaim && (
        <div className="rounded-[10px] flex items-start gap-2" style={{ margin: '2px 0 10px', padding: '9px 12px', background: 'var(--danger-soft)' }}>
          <XCircleIcon width={16} height={16} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--c-danger)', lineHeight: 1.5 }}>{approved ? '이 할당은 회수되어 자원이 가용 풀로 반환되었습니다.' : '회수 요청 — 승인 시 위 할당이 해제됩니다.'}</span>
        </div>
      )}
    </SpecSheetFrame>
  )
}

// 변경 처리 결과 + 처리 히스토리 — 조회 화면 맨 오른쪽 별도 패널.
function ProcessingPanel({ req }: { req: ChangeRequest }) {
  const pending = req.status === 'pending'
  const approved = req.status === 'approved'
  const stColor = pending ? 'var(--c-warn)' : approved ? 'var(--c-ok)' : 'var(--c-danger)'
  const stSoft = pending ? 'var(--warn-soft)' : approved ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const stLabel = pending ? '검토 중' : approved ? '승인' : '반려'
  const processor = req.processedBy ? userById(req.processedBy) : undefined
  return (
    <section className="bg-card2 border border-line rounded-[14px] flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="shrink-0 flex items-center justify-between gap-2" style={{ padding: '13px 16px', borderBottom: '1px solid var(--c-border)' }}>
        <h3 className="font-bold text-text" style={{ fontSize: 14 }}>변경 처리 결과</h3>
        <span className="inline-flex items-center rounded-full font-bold shrink-0" style={{ fontSize: 11.5, padding: '2px 10px', background: stSoft, color: stColor }}>{stLabel}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '6px 16px 14px' }}>
        <DocRow compact label="변경 유형" value={CHANGE_TYPE_META[req.type].label} />
        <DocRow compact label="변경 사유" value={req.reason} emptyText="사유 미기재" />
        {req.status === 'rejected' && <DocRow compact label="반려 사유" value={req.rejectReason ? <span style={{ color: 'var(--c-danger)' }}>{req.rejectReason}</span> : undefined} emptyText="사유 미기재" />}
        <DocRow compact label="처리자" value={processor ? `${processor.name}${processor.department ? ` · ${processor.department}` : ''}` : req.processedBy} emptyText="검토 중" />
        <DocRow compact label="처리일시" value={req.processedAt} emptyText="—" />
        <DocRow compact label="처리 메모" value={req.adminMemo} emptyText="메모 없음" last />
        {req.history.length > 0 && (
          <>
            <div className="flex items-center gap-2.5" style={{ margin: '14px 0 8px' }}>
              <span className="font-bold shrink-0 text-text" style={{ fontSize: 13.5 }}>처리 히스토리</span>
              <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
            </div>
            <HistoryTimeline history={req.history} />
          </>
        )}
      </div>
    </section>
  )
}

// ── 변경 요청 조회 (읽기전용) — 처리완료 건 + 비관리자(본인 요청) ──
// 좌: 기존 할당 명세서 / 우: 변경 후 명세서(변경분 강조) + 처리 결과 + 히스토리
function ProcessedView({ req }: { req: ChangeRequest }) {
  const navigate = useNavigate()
  const goList = () => navigate('/requests/gpu-change')
  const pending = req.status === 'pending'
  const approved = req.status === 'approved'
  const color = pending ? 'var(--c-warn)' : approved ? 'var(--c-ok)' : 'var(--c-danger)'
  const soft = pending ? 'var(--warn-soft)' : approved ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const statusLabel = pending ? '검토 중' : approved ? '승인' : '반려'
  const requesterName = userById(req.requesterUserId)?.name ?? req.requesterUserId
  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full">
      <style>{`[data-approval]{user-select:none;-webkit-user-select:none}[data-approval] button:not(:disabled),[data-approval] a{cursor:pointer}`}</style>
      <header className="flex flex-col shrink-0">
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <BackButton onClick={goList} />
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>변경 요청 조회</h1>
          <Badge tone={TYPE_TONE[req.type]}>{CHANGE_TYPE_META[req.type].label}</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: soft, color }}>{statusLabel}</span>
          <span className="text-muted" style={{ fontSize: 14 }}>신청자 {requesterName}</span>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex items-stretch w-full" style={{ marginTop: 18, gap: 12 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}><ChangeSpecCard kind="before" req={req} requesterName={requesterName} /></div>
        {/* 기존 → 변경 후 전이 표시 */}
        <div className="shrink-0 flex flex-col items-center justify-center" style={{ width: 38, gap: 6 }}>
          <span className="text-muted font-semibold" style={{ fontSize: 11 }}>기존</span>
          <span className="flex items-center justify-center rounded-full anim-fade" style={{ width: 34, height: 34, background: TONE_VAR[TYPE_TONE[req.type]], color: 'var(--c-onaccent)', boxShadow: 'var(--shadow-card)' }}>
            <ChevronRightIcon width={18} height={18} />
          </span>
          <span className="font-semibold" style={{ fontSize: 11, color: TONE_VAR[TYPE_TONE[req.type]] }}>변경 후</span>
        </div>
        <div style={{ flex: '1 1 0', minWidth: 0 }}><ChangeSpecCard kind="after" req={req} requesterName={requesterName} /></div>
        {/* 맨 오른쪽 — 변경 처리 결과 + 처리 히스토리 */}
        <div className="shrink-0" style={{ width: 320, minWidth: 0 }}><ProcessingPanel req={req} /></div>
      </div>
    </div>
  )
}

// ── 변경 요청 심사(관리자) / 조회 진입 — backend 단건 조회(비동기) ──
export function GpuChangeReview() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useRole()
  const [req, setReq] = useState<ChangeRequest | null | undefined>(undefined) // undefined=로딩, null=없음

  useEffect(() => {
    let alive = true
    setReq(undefined)
    fetchChangeRequestById(id).then((r) => { if (alive) setReq(r ?? null) }).catch(() => { if (alive) setReq(null) })
    return () => { alive = false }
  }, [id])

  if (req === undefined) {
    return <div className="anim-fade flex items-center justify-center text-muted" style={{ minHeight: 360, fontSize: 14 }}>변경 요청을 불러오는 중…</div>
  }
  if (req === null) {
    return (
      <div className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <EmptyState title="변경 요청을 찾을 수 없음" description="삭제되었거나 주소가 잘못된 요청이에요." cta={<Button onClick={() => navigate('/requests/gpu-change')}>목록으로</Button>} />
      </div>
    )
  }
  // 심사(승인·반려)는 최종 관리자만. 비관리자(본인 요청)·처리완료 건은 읽기전용 조회.
  if (req.status !== 'pending' || !isAdmin) return <ProcessedView req={req} />
  return <Wizard mode="review" id={id} reviewReq={req} initialType={req.type} before={req.before} initAfter={req.after} />
}

// ── 사용자 신규 신청 진입 — 대상 할당은 Wizard 가 backend 에서 로드 ──
export function GpuChangeRequestNew() {
  const before: AllocSpec = { ramGb: 64, storageGb: 100, cpuCores: 8 }
  return <Wizard mode="new" initialType="change" before={before} />
}

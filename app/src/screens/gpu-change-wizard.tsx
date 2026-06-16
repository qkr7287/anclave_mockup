import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleStackIcon,
  CpuChipIcon,
  RectangleStackIcon,
  ServerStackIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Badge, Button, EmptyState, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { servers, userById } from '../data'
import type { ChangeType } from '../data/types'
import {
  CHANGE_TYPE_META,
  allocLabel,
  allocationsOf,
  createChangeRequest,
  getChangeRequestById,
  reviewChangeRequest,
} from './gpu-change-store'
import type { AllocSpec, ChangeRequest, HistoryEntry } from './gpu-change-store'

// 4.11 변경·확장·이전·회수 마법사 — 관리자 심사(GpuChangeReview) / 사용자 신청(GpuChangeRequestNew) 공용.
// 좌: 멀티스텝(기존값 prefill·수정) / 우: 기존 명세서 + 변경 후 + 히스토리.

const TYPE_TONE: Record<ChangeType, 'info' | 'ok' | 'warn' | 'danger'> = {
  change: 'info', expand: 'ok', migrate: 'warn', reclaim: 'danger',
}

// ── 프리미티브 ──
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

function NumStep({ icon, label, value, unit, onChange, step, min, base }: { icon: ReactNode; label: string; value: number; unit: string; onChange: (v: number) => void; step: number; min: number; base?: number }) {
  const delta = base != null ? value - base : 0
  return (
    <div className="rounded-[10px] border border-line flex-1 min-w-0" style={{ background: 'var(--c-card)', padding: '11px 12px' }}>
      <div className="flex items-center gap-1.5 text-muted" style={{ fontSize: 13 }}>{icon}{label}</div>
      <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} className="flex items-center justify-center rounded-[7px] border border-line text-text hover:bg-soft active:scale-90 transition" style={{ width: 26, height: 26, fontSize: 16 }}>−</button>
        <span className="font-bold text-text tabular-nums" style={{ fontSize: 17 }}>{value}<span className="text-muted font-medium" style={{ fontSize: 12, marginLeft: 2 }}>{unit}</span></span>
        <button type="button" onClick={() => onChange(value + step)} className="flex items-center justify-center rounded-[7px] border border-line text-text hover:bg-soft active:scale-90 transition" style={{ width: 26, height: 26, fontSize: 16 }}>+</button>
      </div>
      {base != null && delta !== 0 && (
        <div className="text-right font-semibold" style={{ fontSize: 12, marginTop: 4, color: delta > 0 ? 'var(--c-ok)' : 'var(--c-danger)' }}>{delta > 0 ? '+' : ''}{delta}{unit} {delta > 0 ? '증가' : '감소'}</div>
      )}
    </div>
  )
}

function SpecRow({ label, value, after, changed }: { label: string; value: ReactNode; after?: ReactNode; changed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderBottom: '1px solid var(--c-border-s)' }}>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-right min-w-0 flex items-center gap-2" style={{ fontSize: 14 }}>
        <span className={changed ? 'text-muted line-through' : 'text-text font-medium'} style={{ opacity: changed ? 0.6 : 1 }}>{value}</span>
        {changed && after != null && (<><ChevronRightIcon width={13} height={13} style={{ color: 'var(--c-muted)' }} /><span className="text-text font-bold" style={{ color: 'var(--c-accent)' }}>{after}</span></>)}
      </span>
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

// 우측 명세서 — 기존 할당 + 변경 후 + (옵션)히스토리
function SpecSheet({ type, before, after, history }: { type: ChangeType; before: AllocSpec; after?: AllocSpec; history?: HistoryEntry[] }) {
  const reclaim = type === 'reclaim'
  const ch = (a?: number, b?: number) => a != null && b != null && a !== b
  return (
    <section className="bg-card2 border border-line rounded-xl flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="shrink-0 border-b border-line flex items-center justify-between" style={{ padding: '14px 18px' }}>
        <h2 className="font-bold text-text" style={{ fontSize: 15 }}>할당 명세서</h2>
        <Badge tone={TYPE_TONE[type]}>{CHANGE_TYPE_META[type].label}</Badge>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '14px 18px' }}>
        <div className="font-bold text-text" style={{ fontSize: 13.5, marginBottom: 2 }}>현재 할당</div>
        <SpecRow label="서버" value={before.serverHost ?? '—'} after={after?.serverHost} changed={!reclaim && before.serverHost !== after?.serverHost && type === 'migrate'} />
        <SpecRow label="GPU" value={before.gpuLabel ?? '—'} />
        <SpecRow label="메모리" value={`${before.ramGb ?? '—'}GB`} after={after ? `${after.ramGb}GB` : undefined} changed={!reclaim && ch(before.ramGb, after?.ramGb)} />
        <SpecRow label="저장 공간" value={`${before.storageGb ?? '—'}GB`} after={after ? `${after.storageGb}GB` : undefined} changed={!reclaim && ch(before.storageGb, after?.storageGb)} />
        <SpecRow label="CPU" value={`${before.cpuCores ?? '—'}코어`} after={after ? `${after.cpuCores}코어` : undefined} changed={!reclaim && ch(before.cpuCores, after?.cpuCores)} />

        {reclaim ? (
          <div className="rounded-[10px] flex items-start gap-2" style={{ marginTop: 14, padding: '11px 13px', background: 'var(--danger-soft)' }}>
            <XCircleIcon width={18} height={18} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13.5, color: 'var(--c-danger)', lineHeight: 1.5 }}>회수 처리되면 위 할당이 해제되고 자원이 가용 풀로 반환됩니다.</span>
          </div>
        ) : (
          <div className="rounded-[10px] flex items-start gap-2" style={{ marginTop: 14, padding: '11px 13px', background: 'var(--accent-soft)' }}>
            <ArrowsRightLeftIcon width={18} height={18} style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13.5, color: 'var(--c-accent)', lineHeight: 1.5 }}>좌측에서 기존 값을 참고해 변경 후 명세를 조정하세요. 변경분은 위에 강조됩니다.</span>
          </div>
        )}

        {history && history.length > 0 && (
          <>
            <div className="font-bold text-text" style={{ fontSize: 13.5, margin: '20px 0 10px' }}>처리 히스토리</div>
            <HistoryTimeline history={history} />
          </>
        )}
      </div>
    </section>
  )
}

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
function Wizard({ mode, id, initialType, before: initBefore, history }: {
  mode: 'review' | 'new'
  id?: string
  initialType: ChangeType
  before: AllocSpec
  history?: HistoryEntry[]
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useRole()
  const goList = () => navigate('/requests/gpu-change')

  // 사용자 신청: 본인 할당 목록에서 선택 가능
  const myAllocs = useMemo(() => allocationsOf(user.id), [user.id])
  const [allocIdx, setAllocIdx] = useState(0)
  const before = mode === 'new' ? (myAllocs[allocIdx] ?? initBefore) : initBefore

  const [type, setType] = useState<ChangeType>(initialType)
  const [step, setStep] = useState(0)
  const [ram, setRam] = useState(before.ramGb ?? 64)
  const [storage, setStorage] = useState(before.storageGb ?? 100)
  const [cpu, setCpu] = useState(before.cpuCores ?? 8)
  const [targetServerId, setTargetServerId] = useState(before.serverId ?? '')
  const [reason, setReason] = useState('')
  const [memo, setMemo] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [done, setDone] = useState<null | 'submitted' | 'approved' | 'rejected'>(null)

  const reclaim = type === 'reclaim'
  const migrate = type === 'migrate'
  const targetServer = servers.find((s) => s.id === targetServerId)
  const after: AllocSpec | undefined = reclaim ? undefined : {
    ...before,
    ramGb: ram, storageGb: storage, cpuCores: cpu,
    serverId: migrate ? targetServerId : before.serverId,
    serverHost: migrate ? (targetServer?.host ?? targetServerId) : before.serverHost,
  }

  const steps = mode === 'new'
    ? ['대상 · 유형', reclaim ? '회수 확인' : '변경 내용', '검토 · 신청']
    : ['신청 확인', reclaim ? '회수 확인' : '할당 조정', '검토 · 승인']

  const requesterName = mode === 'new' ? user.name : (id ? userById(getChangeRequestById(id)?.requesterUserId ?? '')?.name : '') ?? ''
  const processorName = `${user.name}${user.department ? ` · ${user.department}` : ''}`

  const submitNew = () => {
    if (!reason.trim()) return
    createChangeRequest({ requesterUserId: user.id, type, reason: reason.trim(), before, after })
    toast.push(`${CHANGE_TYPE_META[type].label} 요청이 접수되었어요. (검토중)`, 'ok')
    setDone('submitted')
  }
  const approve = () => {
    if (!id) return
    reviewChangeRequest(id, { action: 'approve', processedBy: user.id, processorName, adminMemo: memo.trim() || undefined, after })
    toast.push(`${requesterName}님의 ${CHANGE_TYPE_META[type].label} 요청을 승인했어요.`, 'ok')
    setDone('approved')
  }
  const reject = () => {
    if (!id || !rejectReason.trim()) return
    reviewChangeRequest(id, { action: 'reject', processedBy: user.id, processorName, adminMemo: memo.trim() || undefined, rejectReason: rejectReason.trim() })
    toast.push(`${requesterName}님의 요청을 반려했어요.`, 'warn')
    setDone('rejected')
  }

  if (done) return (
    <div data-approval className="anim-fade flex flex-col h-full" style={{ minHeight: 0 }}>
      <Completion mode={done} type={type} onGo={goList} />
    </div>
  )

  const canNext = step === 0 ? (mode === 'new' ? !!before.serverHost || !!before.ramGb : true) : true

  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full">
      <style>{`
        [data-approval]{user-select:none;-webkit-user-select:none}
        [data-approval] button:not(:disabled),[data-approval] a,[data-approval] select{cursor:pointer}
        [data-approval] input,[data-approval] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
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

      <div className="flex-1 min-h-0 flex" style={{ marginTop: 18, gap: 18 }}>
        {/* 좌: 단계별 컨트롤 */}
        <div style={{ flex: '0 0 56%', minWidth: 0 }}>
          <section className="bg-card2 border border-line rounded-xl flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '16px 18px' }}>
              {step === 0 && (
                <div className="flex flex-col" style={{ gap: 16 }}>
                  {mode === 'new' ? (
                    <>
                      <div>
                        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>대상 할당 선택</div>
                        {myAllocs.length === 0 ? (
                          <div className="text-muted rounded-[10px] border border-line" style={{ fontSize: 14, padding: 14, background: 'var(--c-card)' }}>변경할 수 있는 승인된 할당이 없어요.</div>
                        ) : (
                          <div className="flex flex-col" style={{ gap: 8 }}>
                            {myAllocs.map((a, i) => {
                              const on = i === allocIdx
                              return (
                                <button key={a.requestId ?? i} type="button" onClick={() => { setAllocIdx(i); setRam(a.ramGb ?? 64); setStorage(a.storageGb ?? 100); setCpu(a.cpuCores ?? 8); setTargetServerId(a.serverId ?? '') }}
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
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {(['change', 'expand', 'reclaim'] as ChangeType[]).map((t) => {
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
                    </>
                  ) : (
                    <div className="flex flex-col" style={{ gap: 12 }}>
                      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6 }}><b className="text-text">{requesterName}</b>님이 <b className="text-text">{allocLabel(before)}</b> 할당에 대해 <b className="text-text">{CHANGE_TYPE_META[type].label}</b>을 요청했습니다. 다음 단계에서 기존 명세를 참고해 조정·결정하세요.</p>
                      <div className="rounded-[10px] border border-line" style={{ background: 'var(--c-card)', padding: '13px 15px' }}>
                        <div className="text-muted" style={{ fontSize: 13 }}>요청 사유</div>
                        <div className="text-text" style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{id ? getChangeRequestById(id)?.reason : ''}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                reclaim ? (
                  <div className="flex flex-col items-center justify-center text-center h-full" style={{ gap: 12, padding: '20px 0' }}>
                    <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'var(--danger-soft)' }}><XCircleIcon width={30} height={30} style={{ color: 'var(--c-danger)' }} /></span>
                    <div className="font-bold text-text" style={{ fontSize: 16 }}>{allocLabel(before)} 회수</div>
                    <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 360 }}>{mode === 'new' ? '회수 신청 시 관리자 승인 후 할당이 해제됩니다.' : '승인하면 위 할당이 해제되고 자원이 가용 풀로 반환됩니다.'}</p>
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: 16 }}>
                    {migrate && (
                      <div>
                        <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>이전할 서버</div>
                        <div className="flex flex-col" style={{ gap: 8, maxHeight: 220, overflow: 'auto' }}>
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
                      <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 8 }}>자원 제한 {mode === 'review' ? '조정' : ''}</div>
                      <div className="flex" style={{ gap: 8 }}>
                        <NumStep icon={<RectangleStackIcon width={13} height={13} />} label="메모리" value={ram} unit="GB" onChange={setRam} step={8} min={8} base={before.ramGb} />
                        <NumStep icon={<CircleStackIcon width={13} height={13} />} label="저장" value={storage} unit="GB" onChange={setStorage} step={20} min={20} base={before.storageGb} />
                        <NumStep icon={<CpuChipIcon width={13} height={13} />} label="CPU" value={cpu} unit="코어" onChange={setCpu} step={2} min={2} base={before.cpuCores} />
                      </div>
                    </div>
                  </div>
                )
              )}

              {step === 2 && (
                <div className="flex flex-col" style={{ gap: 14 }}>
                  {mode === 'new' ? (
                    <div>
                      <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 6 }}>요청 사유 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder={`${CHANGE_TYPE_META[type].label} 사유를 입력해주세요. 관리자 검토에 사용됩니다.`} className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 110, padding: 12, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
                      <div className="text-muted text-right" style={{ fontSize: 13, marginTop: 3 }}>{reason.length}/300</div>
                    </div>
                  ) : rejecting ? (
                    <div>
                      <div className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 6 }}>반려 사유 <span>*</span></div>
                      <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 전달됩니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 90, padding: 12, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
                      <div className="text-muted text-right" style={{ fontSize: 13, marginTop: 3 }}>{rejectReason.length}/300</div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-semibold text-text" style={{ fontSize: 14, marginBottom: 6 }}>처리 메모 <span className="text-muted font-normal">(선택)</span></div>
                      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} placeholder="승인·반려와 함께 신청자에게 전달할 메모를 남겨주세요." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 90, padding: 12, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하단 바 */}
            <div className="flex items-center justify-between shrink-0 border-t border-line" style={{ padding: '14px 18px' }}>
              <Button variant="ghost" onClick={() => { setRejecting(false); setStep((s) => Math.max(0, s - 1)) }} disabled={step === 0}>이전</Button>
              <div className="flex items-center gap-2">
                {step < 2 && <Button onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={!canNext}>다음</Button>}
                {step === 2 && mode === 'new' && <Button onClick={submitNew} disabled={!reason.trim()}>신청 제출</Button>}
                {step === 2 && mode === 'review' && !rejecting && (
                  <>
                    <Button variant="danger" onClick={() => setRejecting(true)}><XCircleIcon width={16} height={16} />반려</Button>
                    <Button onClick={approve}><CheckCircleIcon width={16} height={16} />{reclaim ? '회수 승인' : '승인'}</Button>
                  </>
                )}
                {step === 2 && mode === 'review' && rejecting && (
                  <>
                    <Button variant="ghost" onClick={() => setRejecting(false)}>취소</Button>
                    <Button variant="danger" onClick={reject} disabled={!rejectReason.trim()}>반려 확정</Button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 우: 명세서 + 히스토리 */}
        <div style={{ flex: '0 0 calc(44% - 18px)', minWidth: 0 }}>
          <SpecSheet type={type} before={before} after={after} history={history} />
        </div>
      </div>
    </div>
  )
}

// ── 처리 완료 조회 (승인/반려된 건) ──
function ProcessedView({ req }: { req: ChangeRequest }) {
  const navigate = useNavigate()
  const goList = () => navigate('/requests/gpu-change')
  const approved = req.status === 'approved'
  const color = approved ? 'var(--c-ok)' : 'var(--c-danger)'
  const soft = approved ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const requesterName = userById(req.requesterUserId)?.name ?? req.requesterUserId
  return (
    <div data-approval className="anim-fade flex flex-col min-w-0 h-full">
      <style>{`[data-approval]{user-select:none;-webkit-user-select:none}[data-approval] button:not(:disabled),[data-approval] a{cursor:pointer}`}</style>
      <header className="flex flex-col shrink-0">
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <BackButton onClick={goList} />
          <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2 }}>변경 요청 조회</h1>
          <Badge tone={TYPE_TONE[req.type]}>{CHANGE_TYPE_META[req.type].label}</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: soft, color }}>{approved ? '승인' : '반려'}</span>
          <span className="text-muted" style={{ fontSize: 14 }}>신청자 {requesterName}</span>
        </div>
      </header>
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 18, gap: 18 }}>
        <div style={{ flex: '0 0 56%', minWidth: 0 }}>
          <section className="bg-card2 border border-line rounded-xl h-full overflow-auto" style={{ boxShadow: 'var(--shadow-card)', padding: '18px 20px' }}>
            <div className="font-bold text-text" style={{ fontSize: 15, marginBottom: 12 }}>처리 결과</div>
            <SpecRow label="유형" value={CHANGE_TYPE_META[req.type].label} />
            <SpecRow label="요청 사유" value={req.reason} />
            <SpecRow label="처리 상태" value={<span style={{ color, fontWeight: 700 }}>{approved ? '승인 완료' : '반려'}</span>} />
            {!approved && req.rejectReason && <SpecRow label="반려 사유" value={<span style={{ color: 'var(--c-danger)' }}>{req.rejectReason}</span>} />}
            {req.adminMemo && <SpecRow label="처리 메모" value={req.adminMemo} />}
            <SpecRow label="처리자" value={userById(req.processedBy ?? '')?.name ?? req.processedBy ?? '—'} />
            <SpecRow label="처리일시" value={req.processedAt ?? '—'} />
          </section>
        </div>
        <div style={{ flex: '0 0 calc(44% - 18px)', minWidth: 0 }}>
          <SpecSheet type={req.type} before={req.before} after={req.after} history={req.history} />
        </div>
      </div>
    </div>
  )
}

// ── 관리자 심사 진입 ──
export function GpuChangeReview() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const req: ChangeRequest | undefined = getChangeRequestById(id)

  if (!req) {
    return (
      <div className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <EmptyState title="변경 요청을 찾을 수 없음" description="삭제되었거나 주소가 잘못된 요청이에요." cta={<Button onClick={() => navigate('/requests/gpu-change')}>목록으로</Button>} />
      </div>
    )
  }
  // 처리 완료 건은 조회(결과 + 히스토리). 대기 건은 멀티스텝 심사.
  if (req.status !== 'pending') return <ProcessedView req={req} />
  return <Wizard mode="review" id={id} initialType={req.type} before={req.before} history={req.history} />
}

// ── 사용자 신규 신청 진입 ──
export function GpuChangeRequestNew() {
  const { user } = useRole()
  const allocs = allocationsOf(user.id)
  const before: AllocSpec = allocs[0] ?? { ramGb: 64, storageGb: 100, cpuCores: 8 }
  return <Wizard mode="new" initialType="change" before={before} />
}

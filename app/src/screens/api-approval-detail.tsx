import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CheckIcon,
  KeyIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button, EmptyState, StatusBadge, useToast } from '../components/ui'
import { useTheme } from '../lib/theme'
import { useRole } from '../lib/role'
import { modelById, serviceById, userById } from '../data'
import { approveApiRequest, getApiRequest, rejectApiRequest, type ApiRecord } from './api-store'

// G8 · 4.19a API 키 신청 심사 (/api-approvals/:id) — 4.19 API 신청 관리의 페이지 승격(소유자).
// pending = 2스텝(키 발급 → 명세서 검토·승인/반려) morph / 처리 완료 = 1컬럼 조회. 상태는 api-store 세션 사본.

const REJECT_REASON_MIN = 5

const M = {
  surface: 'var(--c-card2)', text: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  inputBg: 'var(--c-bg)', border: 'var(--c-border)', blue: 'var(--c-accent)',
  onAccent: 'var(--c-onaccent)', value: 'var(--c-text)',
}
const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const WIZARD_STEPS = ['키 발급', '확인 · 승인']

function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

function PolishCss() {
  return (
    <style>{`
      [data-apidetail]{user-select:none;-webkit-user-select:none}
      [data-apidetail] button:not(:disabled),[data-apidetail] a{cursor:pointer}
      [data-apidetail] button:disabled{cursor:not-allowed}
      [data-apidetail] input,[data-apidetail] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      [data-morph]{transition-duration:.8s !important}
    `}</style>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="뒤로 가기" className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90" style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}>
      <ArrowLeftIcon style={{ width: 18, height: 18 }} />
    </button>
  )
}

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

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-center">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={s} className={i < WIZARD_STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'} style={{ maxWidth: i < WIZARD_STEPS.length - 1 ? 300 : undefined }}>
            <div className="flex flex-col items-center" style={{ width: 110 }}>
              <span className="flex items-center justify-center rounded-full font-semibold" style={{ width: 30, height: 30, fontSize: 14, background: done || active ? M.blue : 'transparent', border: done || active ? 'none' : `1.5px solid ${M.border}`, color: done || active ? M.onAccent : M.idle }}>
                {done ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-medium whitespace-nowrap" style={{ fontSize: 14, marginTop: 8, color: done || active ? M.blue : M.idle }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? M.blue : M.border, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

function Pending({ w = '60%' }: { w?: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: w, height: 16, borderRadius: 3, background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--c-muted) 32%, transparent) 0 1px, transparent 1px 6px)', border: '1px dashed var(--c-border)' }} />
}
function SpecRow({ label, value, emptyText, reviewing = true, pendingW = '60%', last, mono }: { label: string; value?: ReactNode; emptyText?: string; reviewing?: boolean; pendingW?: string; last?: boolean; mono?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 96, fontSize: 15, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 23 }}>
        {empty
          ? (reviewing ? <span style={{ fontSize: 15, color: M.idle }}>{emptyText ?? '—'}</span> : <Pending w={pendingW} />)
          : <span className="anim-fade font-medium" style={{ fontSize: 15, color: M.text, lineHeight: 1.45, wordBreak: 'break-word', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</span>}
      </div>
    </div>
  )
}
function SpecSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, padding: '6px 12px' }}>
      <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
        <span className="font-bold shrink-0" style={{ fontSize: 15, color: M.text }}>{title}</span>
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

function meta(req: ApiRecord) {
  const svc = serviceById(req.serviceId)
  const u = userById(req.requesterUserId)
  return {
    serviceName: svc?.name ?? req.serviceId,
    kind: svc?.kind ?? '서비스',
    requester: u?.name ?? req.requesterUserId,
    requesterEmail: u?.email,
    modelName: modelById(req.model)?.name ?? req.model,
  }
}
function randomKey(serviceName: string): string {
  const slug = serviceName.split('-')[0] || 'svc'
  const hex = Array.from({ length: 10 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `ak_live_${slug}_${hex}`
}

// 신청 명세서(읽기전용/검토 공용) — 요청 정보 + (처리 완료 시) 처리 결과.
function ApiSpec({ req, reviewing, issuedKey, footer }: { req: ApiRecord; reviewing: boolean; issuedKey?: string; footer?: ReactNode }) {
  const m = meta(req)
  const today = req.createdAt.slice(0, 10)
  const docNo = `ANC-AK-${req.id.toUpperCase()}`
  const approved = req.status === 'approved'
  const rejected = req.status === 'rejected'
  const processed = approved || rejected
  const accent = reviewing ? 'var(--c-warn)' : 'var(--c-accent)'
  const stamp = approved ? 'var(--c-ok)' : rejected ? 'var(--c-danger)' : accent
  const stampLabel = approved ? '발급' : rejected ? '반려' : reviewing ? '검토' : '심사중'
  const stampBg = approved ? 'var(--ok-soft)' : rejected ? 'var(--danger-soft)' : reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)'
  const keyShown = issuedKey ?? req.apiKey
  return (
    <div data-morph="sheet" className="relative flex flex-col h-full mx-auto" style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880, transform: reviewing ? 'scale(1)' : 'scale(0.995)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}` }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 128, fontWeight: 900, color: stamp, opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{approved ? '발급' : rejected ? '반려' : '심사'}</span>
      </div>
      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: '3px double var(--c-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>API 키 신청서 · 심사</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${stamp}`, color: stamp, background: stampBg, borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{stampLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 14, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.text }}>{docNo}</span></span>
            <span>발급 Anclave 마켓플레이스</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.text }}>{m.requester}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
            <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: 14, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{req.id.toUpperCase()}</span>
          </div>
        </div>

        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-auto" style={{ padding: '12px 18px' }}>
            <SpecSection title="요청 정보">
              <SpecRow label="요청자" value={`${m.requester}${m.requesterEmail ? ` · ${m.requesterEmail}` : ''}`} />
              <SpecRow label="대상 서비스" value={m.serviceName} />
              <SpecRow label="사용 모델" value={m.modelName} />
              <SpecRow label="사용처 URL" value={req.targetServiceUrl} />
              <SpecRow label="사용 목적" value={req.purpose} emptyText="미기재" last />
            </SpecSection>
            <SpecSection title={processed ? '처리 결과' : '발급 키'} action={processed ? <span className="shrink-0 inline-flex"><StatusBadge status={req.status} /></span> : undefined}>
              {rejected
                ? <SpecRow label="반려 사유" value={req.rejectReason ? <span style={{ color: 'var(--c-danger)' }}>{req.rejectReason}</span> : undefined} emptyText="사유 미기재" />
                : <SpecRow label="API 키" value={keyShown} emptyText="발급 전" mono />}
              {processed && <SpecRow label="처리자" value={req.processedBy ? (userById(req.processedBy)?.name ?? req.processedBy) : undefined} emptyText="—" />}
              {processed && <SpecRow label="처리일시" value={req.processedAt} emptyText="—" last />}
            </SpecSection>
          </div>
          <div aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 56, background: 'linear-gradient(to bottom, transparent, var(--c-card2))' }} />
        </div>

        {footer}
      </div>
    </div>
  )
}

interface DoneState { mode: 'approved' | 'rejected'; detail: string; processedAt: string }

function Completion({ done, reqId, requesterName, serviceName, onList, mutedFix }: {
  done: DoneState; reqId: string; requesterName: string; serviceName: string; onList: () => void; mutedFix?: React.CSSProperties
}) {
  const ok = done.mode === 'approved'
  const accent = ok ? 'var(--c-ok)' : 'var(--c-danger)'
  const soft = ok ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const Stub = ({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) => (
    <div className="flex items-start gap-3" style={{ padding: '7px 0', borderTop: '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0 text-muted" style={{ width: 72, fontSize: 14 }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium text-text" style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v}</span>
    </div>
  )
  return (
    <div data-apidetail className="anim-fade flex flex-col h-full items-center justify-center" style={{ ...mutedFix, padding: 24 }}>
      <PolishCss />
      <div className="relative bg-card2 border border-line overflow-hidden stagger" style={{ borderRadius: 16, maxWidth: 464, width: '100%', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` }} />
        <CornerMarks />
        <div className="flex flex-col items-center text-center" style={{ padding: '32px 38px 30px' }}>
          <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
            <span className="absolute rounded-full" style={{ inset: 2, border: `2px dashed ${accent}`, opacity: 0.45, transform: 'rotate(-12deg)' }} />
            <span className="flex items-center justify-center rounded-full" style={{ width: 72, height: 72, background: soft, color: accent, boxShadow: `0 0 0 6px color-mix(in srgb, ${accent} 9%, transparent)` }}>
              {ok ? <KeyIcon style={{ width: 38, height: 38 }} /> : <XCircleIcon style={{ width: 40, height: 40 }} />}
            </span>
          </div>
          <span className="font-bold" style={{ fontSize: 14, letterSpacing: '0.14em', color: accent, marginTop: 16, fontFamily: 'var(--font-mono)' }}>{ok ? 'ISSUED' : 'REJECTED'}</span>
          <h2 className="font-bold text-text" style={{ fontSize: 21, marginTop: 5, letterSpacing: '-0.3px' }}>{ok ? 'API 키를 발급했습니다' : '신청을 반려했습니다'}</h2>
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
            {ok ? `${requesterName}님께 발급 키와 알림이 전송되었어요.` : `${requesterName}님께 반려 사유가 알림으로 전송되었어요.`}
          </p>
          <div className="w-full text-left rounded-[10px]" style={{ border: '1px dashed var(--c-border)', background: 'var(--c-card)', padding: '4px 14px 11px', marginTop: 20 }}>
            <Stub k="신청번호" v={reqId.toUpperCase()} mono />
            <Stub k="서비스" v={serviceName} />
            <Stub k={ok ? '발급 키' : '반려 사유'} v={done.detail} mono={ok} />
          </div>
          <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
            <Button onClick={onList} className="flex-1 justify-center">API 신청 관리로</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Header({ req, onBack }: { req: ApiRecord; onBack: () => void }) {
  return (
    <header className="flex flex-col shrink-0">
      <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
        <BackButton onClick={onBack} />
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2, fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>{req.id.toUpperCase()}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
          <KeyIcon width={14} height={14} />API 키 발급
        </span>
        <StatusBadge status={req.status} />
        <span className="text-muted" style={{ fontSize: 14 }}>신청일 {req.createdAt}</span>
      </div>
    </header>
  )
}

// 대기 건 심사 — 2스텝(키 발급 → 명세서 검토·승인/반려) morph → 완료.
function PendingReview({ req }: { req: ApiRecord }) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user: owner } = useRole()
  const m = meta(req)

  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [done, setDone] = useState<DoneState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const keyOk = apiKey.trim().length >= 8
  const reasonOk = rejectReason.trim().length >= REJECT_REASON_MIN
  const reviewing = step === 1

  const confirmApprove = () => {
    if (!keyOk || submitting) return
    setSubmitting(true)
    approveApiRequest(req.id, owner.id, apiKey.trim())
    toast.push(`${m.requester}님께 API 키를 발급했어요.`, 'ok')
    setDone({ mode: 'approved', detail: apiKey.trim(), processedAt: nowLocal() })
  }
  const confirmReject = () => {
    if (!reasonOk || submitting) return
    setSubmitting(true)
    rejectApiRequest(req.id, owner.id, rejectReason.trim())
    toast.push(`${m.requester}님의 신청을 반려했어요.`, 'warn')
    setDone({ mode: 'rejected', detail: rejectReason.trim(), processedAt: nowLocal() })
  }

  if (done) return <Completion done={done} reqId={req.id} requesterName={m.requester} serviceName={m.serviceName} onList={() => navigate('/api-approvals')} mutedFix={mutedFix} />

  const footer = (
    <div className="shrink-0 anim-fade flex flex-col" style={{ borderTop: '1px solid var(--c-border)', padding: '12px 18px', gap: 11 }}>
      {rejecting ? (
        <div className="rounded-[10px] border" style={{ borderColor: 'var(--c-danger)', padding: '11px 13px' }}>
          <div className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 6 }}>반려 사유</div>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 알림으로 전달됩니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 70, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
          <div className="text-right" style={{ fontSize: 14, marginTop: 3, color: reasonOk ? 'var(--c-muted)' : 'var(--c-danger)' }}>{reasonOk ? `${rejectReason.length}/300` : `최소 ${REJECT_REASON_MIN}자`}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[8px]" style={{ background: 'var(--c-soft)', border: '1px solid var(--c-border)', padding: '9px 12px' }}>
          <KeyIcon width={15} height={15} className="text-accent shrink-0" />
          <span className="text-muted" style={{ fontSize: 14 }}>발급 키</span>
          <span className="flex-1 truncate font-medium text-text" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{apiKey.trim() || '—'}</span>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        {rejecting ? (
          <>
            <ActionBtn variant="ghost" onClick={() => { setRejecting(false); setRejectReason('') }}>취소</ActionBtn>
            <ActionBtn variant="danger" full disabled={!reasonOk} onClick={confirmReject}><XCircleIcon width={16} height={16} />반려 확정</ActionBtn>
          </>
        ) : (
          <>
            <ActionBtn variant="ghost" onClick={() => setStep(0)}>이전</ActionBtn>
            <ActionBtn variant="dangerOutline" onClick={() => setRejecting(true)}><XCircleIcon width={16} height={16} />반려</ActionBtn>
            <ActionBtn variant="primary" full disabled={!keyOk || submitting} onClick={confirmApprove}><CheckCircleIcon width={16} height={16} />승인 · 발급</ActionBtn>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div data-apidetail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <Header req={req} onBack={() => navigate('/api-approvals')} />
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
        <Stepper current={step} />
      </section>
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 14 }}>
        <div data-morph="wizard" aria-hidden={reviewing} style={{ width: reviewing ? '0%' : '56%', flex: '0 0 auto', minWidth: 0, opacity: reviewing ? 0 : 1, transform: reviewing ? 'translateX(-48px)' : 'none', pointerEvents: reviewing ? 'none' : 'auto', transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}` }}>
          <section className="bg-card2 border border-line rounded-xl flex flex-col h-full min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '22px 24px' }}>
              <h3 className="font-semibold shrink-0" style={{ fontSize: 14, color: M.text, marginBottom: 16 }}>발급할 API 키를 입력해주세요.</h3>
              <div className="shrink-0 rounded-[10px]" style={{ padding: '12px 14px', background: M.inputBg, border: `1px solid ${M.border}`, marginBottom: 20 }}>
                <div className="flex items-baseline" style={{ fontSize: 14, gap: 8, marginBottom: 6 }}><span className="shrink-0" style={{ color: M.help, width: 76 }}>요청자</span><span className="truncate font-medium" style={{ color: M.text }}>{m.requester}</span></div>
                <div className="flex items-baseline" style={{ fontSize: 14, gap: 8, marginBottom: 6 }}><span className="shrink-0" style={{ color: M.help, width: 76 }}>대상 서비스</span><span className="truncate font-medium" style={{ color: M.text }}>{m.serviceName} · {m.modelName}</span></div>
                <div className="flex items-baseline" style={{ fontSize: 14, gap: 8 }}><span className="shrink-0" style={{ color: M.help, width: 76 }}>사용처 URL</span><span className="truncate font-medium" style={{ color: M.text }}>{req.targetServiceUrl}</span></div>
              </div>
              <div className="font-semibold shrink-0" style={{ fontSize: 14, color: M.text, marginBottom: 4 }}>API 키 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
              <div className="shrink-0" style={{ fontSize: 14, color: M.help, marginBottom: 10 }}>서비스에서 자체 발급한 API 키를 붙여넣거나 자동 생성하세요. (최소 8자)</div>
              <div className="flex items-center gap-2 shrink-0">
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ak_live_..." className="flex-1 min-w-0" style={{ height: 44, background: M.inputBg, border: `1px solid ${M.border}`, borderRadius: 8, padding: '0 14px', fontSize: 14, color: M.text, outline: 'none', fontFamily: 'var(--font-mono)' }} />
                <button type="button" onClick={() => setApiKey(randomKey(m.serviceName))} className="inline-flex items-center gap-1.5 shrink-0 rounded-[8px] font-medium transition-colors hover:bg-soft" style={{ height: 44, padding: '0 14px', fontSize: 14, border: `1px solid ${M.border}`, color: M.text, background: 'var(--c-card2)' }}>
                  <ArrowPathIcon width={15} height={15} /> 자동 생성
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 24px' }}>
              <div />
              <div className="flex items-center gap-3">
                {!keyOk && <span className="text-muted" style={{ fontSize: 14 }}>API 키를 입력하면 진행할 수 있어요.</span>}
                <Button onClick={() => setStep(1)} disabled={!keyOk}>검토하기</Button>
              </div>
            </div>
          </section>
        </div>
        <div data-morph="spec" style={{ width: reviewing ? '100%' : '44%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 16, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <ApiSpec req={req} reviewing issuedKey={apiKey.trim() || undefined} footer={footer} />
        </div>
      </div>
    </div>
  )
}

export function ApiApprovalDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  // api-store는 동기 인메모리 — 매 렌더 조회(저렴). 처리 후 목록 복귀 시 재마운트로 반영.
  const req = getApiRequest(id)

  if (!req) {
    return (
      <div data-apidetail className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <EmptyState title="신청을 찾을 수 없음" description="삭제되었거나 주소가 잘못된 API 키 신청이에요." cta={<Button onClick={() => navigate('/api-approvals')}>목록으로</Button>} />
      </div>
    )
  }

  if (req.status === 'pending') return <PendingReview req={req} />

  return (
    <div data-apidetail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <Header req={req} onBack={() => navigate('/api-approvals')} />
      <div className="flex-1 min-h-0 anim-fade flex" style={{ marginTop: 18 }}>
        <ApiSpec req={req} reviewing={false} />
      </div>
    </div>
  )
}

function nowLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

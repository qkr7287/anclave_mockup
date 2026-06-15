import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CheckIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  KeyIcon,
} from '@heroicons/react/24/outline'
import { Button, EmptyState, StepBack, useToast } from '../components/ui'
import { modelById, serviceById, services, userById } from '../data'
import type { Service } from '../data/types'
import { useRole } from '../lib/role'
import { useTheme } from '../lib/theme'
import { Logo } from './catalog'
import { createApiRequest } from './api-store'

// G8 · 4.20 API 키 요청(/marketplace/api-request/:id) — 마켓 서비스 상세의 'API 키 요청'에서 진입.
// 4.6b 신규 신청과 동일 구조(스텝퍼 + morph[좌 마법사 / 우 명세서] + 완료). 2스텝: 상세 내용 → 확인·요청.

function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

const M = {
  surface: 'var(--c-card2)', text: 'var(--c-text)', label: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  req: 'var(--c-danger)', inputBg: 'var(--c-bg)', border: 'var(--c-border)',
  stepLine: 'var(--c-border)', blue: 'var(--c-accent)', blueText: 'var(--c-accent)',
  onAccent: 'var(--c-onaccent)', activeBg: 'var(--accent-soft)', value: 'var(--c-text)',
}

const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const WIZARD_STEPS = ['상세 내용', '확인 · 요청']
const SCALE_OPTS = [
  { v: '소규모', desc: '~ 수십 호출/일' },
  { v: '중규모', desc: '~ 수천 호출/일' },
  { v: '대규모', desc: '수만 호출/일 이상' },
] as const
const PURPOSE_MIN = 10

const inputBase: React.CSSProperties = {
  height: 44, width: '100%', background: M.inputBg, border: `1px solid ${M.border}`,
  borderRadius: 8, padding: '0 14px', fontSize: 14, color: M.text, outline: 'none',
}

function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function FieldLabel({ text, required, help }: { text: string; required?: boolean; help?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="font-semibold" style={{ fontSize: 14, color: M.label }}>
        {text}
        {required && <span style={{ color: M.req, marginLeft: 5 }}>*</span>}
      </div>
      {help && <div style={{ fontSize: 14, color: M.help, marginTop: 4 }}>{help}</div>}
    </div>
  )
}

function SelectCard({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-[8px] transition-colors text-left w-full"
      style={{ minHeight: 44, padding: '10px 14px', background: active ? M.activeBg : M.inputBg, border: `1px solid ${active ? M.blue : M.border}`, color: active ? M.text : M.value, fontSize: 14, fontWeight: active ? 600 : 500 }}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block font-normal truncate" style={{ fontSize: 14, color: M.help, marginTop: 2 }}>{sub}</span>}
      </span>
      {active && <CheckIcon className="shrink-0" style={{ width: 16, height: 16, color: M.blue }} />}
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
              <span className="font-medium whitespace-nowrap" style={{ fontSize: 14, marginTop: 8, color: done || active ? M.blueText : M.idle }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? M.blue : M.stepLine, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

// 대상 서비스 요약 카드(읽기전용) — 로고 + 이름 + 소유자·모델·API.
function TargetCard({ svc, owner, modelName }: { svc: Service; owner: string; modelName: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px]" style={{ padding: 14, background: M.inputBg, border: `1px solid ${M.border}` }}>
      <Logo id={svc.id} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-bold truncate" style={{ fontSize: 14, color: M.text }}>{svc.name}</span>
          <span className="shrink-0 rounded-[5px] font-medium" style={{ fontSize: 14, padding: '1px 6px', background: M.activeBg, color: M.blue }}>API</span>
        </div>
        <div className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 3 }}>{svc.kind} · {modelName}</div>
        <div className="truncate" style={{ fontSize: 14, color: M.help, marginTop: 2 }}>소유자 {owner}</div>
      </div>
    </div>
  )
}

// ── 명세서 ──
function Pending({ w = '60%' }: { w?: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: w, height: 16, borderRadius: 3, background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--c-muted) 32%, transparent) 0 1px, transparent 1px 6px)', border: '1px dashed var(--c-border)' }} />
}

function SpecRow({ label, value, emptyText, reviewing, pendingW = '60%', last }: { label: string; value?: ReactNode; emptyText?: string; reviewing: boolean; pendingW?: string; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 96, fontSize: 15, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 23 }}>
        {empty
          ? (reviewing ? <span style={{ fontSize: 15, color: M.idle }}>{emptyText ?? '—'}</span> : <Pending w={pendingW} />)
          : <span key="filled" className="anim-fade font-medium" style={{ fontSize: 15, color: M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}

function SectionHead({ title, active, reviewing, onEdit }: { title: string; active: boolean; reviewing: boolean; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
      <span className="font-bold shrink-0" style={{ fontSize: 15, color: active ? M.blueText : M.text }}>{title}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
      {reviewing
        ? <button type="button" onClick={onEdit} className="font-medium hover:underline shrink-0" style={{ fontSize: 14, color: M.blueText }}>수정</button>
        : active && <span className="font-semibold shrink-0" style={{ fontSize: 14, color: M.blueText }}>입력 중</span>}
    </div>
  )
}

function SpecSection({ title, index, currentStep, reviewing, onEdit, children }: { title: string; index: number; currentStep: number; reviewing: boolean; onEdit: () => void; children: ReactNode }) {
  const active = !reviewing && currentStep === index
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, padding: '6px 12px', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background .35s ease' }}>
      <SectionHead title={title} active={active} reviewing={reviewing} onEdit={onEdit} />
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

interface ApiForm { targetUrl: string; purpose: string; scale: string }

function SpecSheet({ f, svc, owner, modelName, userName, today, currentStep, reviewing, onEdit, onBack, onSubmit, canSubmit }: {
  f: ApiForm; svc: Service; owner: string; modelName: string; userName: string; today: string
  currentStep: number; reviewing: boolean; onEdit: (i: number) => void; onBack: () => void; onSubmit: () => void; canSubmit: boolean
}) {
  const filled = [!!f.targetUrl.trim(), f.purpose.trim().length >= PURPOSE_MIN].filter(Boolean).length
  const pct = Math.round((filled / 2) * 100)
  const done = filled === 2
  const docNo = `API-${today.slice(0, 4)}-${today.slice(5, 7)}${today.slice(8, 10)}`
  return (
    <div data-morph="sheet" className="relative flex flex-col h-full" style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880, margin: '0 auto', transform: reviewing ? 'scale(1)' : 'scale(0.99)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}` }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 132, fontWeight: 900, color: reviewing ? 'var(--c-warn)' : 'var(--c-accent)', opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{reviewing ? '검토' : '초안'}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: `3px double ${M.border}`, background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>API 키 요청서</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-warn)' : M.blue}`, color: reviewing ? 'var(--c-warn)' : M.blue, background: reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '검토' : '초안'}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 14, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{docNo}</span></span>
            <span>발급 Anclave 마켓플레이스</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.value }}>{userName}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="flex items-center justify-between" style={{ fontSize: 14, color: M.help, marginBottom: 6 }}>
              <span>필수 항목</span>
              <span className="font-semibold" style={{ color: done ? 'var(--c-ok)' : M.blueText }}>{filled} / 2</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: M.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--c-ok)' : M.blue, borderRadius: 2, transition: 'width .45s cubic-bezier(.4,0,.2,1), background .3s' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '12px 18px' }}>
          <SpecSection title="요청 정보" index={0} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(0)}>
            <SpecRow label="요청자" value={userName} reviewing={reviewing} />
            <SpecRow label="대상 서비스" value={svc.name} reviewing={reviewing} pendingW="60%" />
            <SpecRow label="서비스 소유자" value={owner} reviewing={reviewing} pendingW="40%" />
            <SpecRow label="사용 모델" value={modelName} reviewing={reviewing} pendingW="45%" last />
          </SpecSection>
          <SpecSection title="요청 내용" index={0} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(0)}>
            <SpecRow label="사용처 URL" value={f.targetUrl} reviewing={reviewing} pendingW="80%" />
            <SpecRow label="예상 규모" value={f.scale} reviewing={reviewing} pendingW="35%" />
            <SpecRow label="사용 목적" value={f.purpose} reviewing={reviewing} pendingW="92%" last />
          </SpecSection>
          {/* 안내 — 남는 높이를 끝까지 채움 */}
          <div className="flex flex-col flex-1 min-h-0" style={{ padding: '6px 12px', minHeight: 92 }}>
            <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
              <span className="font-bold shrink-0" style={{ fontSize: 15, color: M.text }}>안내</span>
              <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
            </div>
            <div className="flex-1 min-h-0 rounded-[8px]" style={{ border: `1px dashed ${M.border}`, background: 'color-mix(in srgb, var(--c-muted) 5%, transparent)', padding: '12px 14px', overflow: 'auto' }}>
              <p style={{ fontSize: 14, color: M.help, lineHeight: 1.65 }}>제출하면 <b style={{ color: M.text }}>{svc.name}</b> 소유자(<b style={{ color: M.text }}>{owner}</b>)에게 요청이 전달됩니다. 소유자가 API 키를 발급·승인하면 발급 키가 알림으로 전송돼요. 반려 시 사유가 함께 안내됩니다.</p>
            </div>
          </div>
        </div>

        {reviewing && (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>
            <p style={{ fontSize: 14, color: M.help, marginBottom: 10, lineHeight: 1.5 }}>요청 시 서비스 소유자에게 전달되며, 소유자가 키를 발급·승인하면 사용할 수 있습니다.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onBack}>이전</Button>
              <Button onClick={onSubmit} disabled={!canSubmit} className="flex-1 justify-center">API 키 요청</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ApiRequestNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user } = useRole()
  const { id = '' } = useParams()

  // 라우트 :id = data 서비스 id, 없으면 마켓 서비스 id(= data name)로 역매칭.
  const svc = serviceById(id) ?? services.find((s) => s.name === id)
  const owner = svc ? (userById(svc.ownerUserId)?.name ?? svc.ownerUserId) : ''
  const modelName = svc ? (modelById(svc.model)?.name ?? svc.model) : ''

  const [step, setStep] = useState(0)
  const [f, setF] = useState<ApiForm>({ targetUrl: '', purpose: '', scale: SCALE_OPTS[1].v })
  const [doneId, setDoneId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const set = <K extends keyof ApiForm>(k: K, v: ApiForm[K]) => setF((p) => ({ ...p, [k]: v }))

  const valid = [!!f.targetUrl.trim() && f.purpose.trim().length >= PURPOSE_MIN, true]
  const canNext = valid[step]
  const isLast = step === WIZARD_STEPS.length - 1
  const reviewing = step === 1
  const wizardStep = reviewing ? 0 : step
  const go = (d: number) => setStep((s) => Math.max(0, Math.min(WIZARD_STEPS.length - 1, s + d)))

  const submit = () => {
    if (submitting || !svc) return
    setSubmitting(true)
    const created = createApiRequest({
      requesterUserId: user.id,
      serviceId: svc.id,
      model: svc.model,
      targetServiceUrl: f.targetUrl.trim(),
      purpose: f.purpose.trim(),
    })
    setDoneId(created.id)
    toast.push('API 키 요청을 보냈어요. 서비스 소유자 승인 후 발급됩니다.', 'ok')
  }
  const next = () => {
    if (!canNext) return
    if (isLast) submit()
    else go(1)
  }

  if (!svc) {
    return (
      <div className="anim-fade flex flex-col h-full" style={mutedFix}>
        <header className="flex flex-col shrink-0">
          <StepBack to="/marketplace" label="마켓플레이스" />
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <EmptyState title="서비스를 찾을 수 없음" description="주소가 잘못되었거나 API를 제공하지 않는 서비스예요." cta={<Button onClick={() => navigate('/marketplace')}>마켓플레이스로</Button>} />
        </div>
      </div>
    )
  }

  if (doneId) {
    return (
      <div className="anim-fade flex flex-col h-full" style={mutedFix}>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="bg-card2 border border-line rounded-[16px] flex flex-col items-center text-center" style={{ boxShadow: 'var(--shadow-card)', padding: '40px 44px', maxWidth: 480, width: '100%' }}>
            <span className="relative flex items-center justify-center rounded-full" style={{ width: 66, height: 66, background: 'var(--ok-soft)', color: 'var(--c-ok)' }}>
              <span className="absolute rounded-full" style={{ inset: 0, boxShadow: '0 0 0 6px var(--ok-soft)', opacity: 0.5 }} />
              <CheckCircleIcon style={{ width: 38, height: 38 }} />
            </span>
            <h2 className="font-bold text-text" style={{ fontSize: 20, marginTop: 18 }}>API 키 요청이 접수되었습니다</h2>
            <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
              <b className="text-text">{svc.name}</b> 소유자({owner}) 승인 후 API 키가 발급됩니다. 진행 상태는 알림으로 안내됩니다.
            </p>
            <div className="w-full rounded-[12px]" style={{ marginTop: 22, padding: '14px 16px', background: 'var(--c-soft)', border: '1px solid var(--c-border-s)' }}>
              <div className="flex items-center justify-center gap-1.5 text-muted" style={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.2px' }}>
                요청번호
                <span className="rounded-[5px] font-semibold" style={{ fontSize: 14, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>검토 중</span>
              </div>
              <div className="flex items-center justify-center gap-2" style={{ marginTop: 7 }}>
                <span className="font-bold text-text" style={{ fontSize: 18, fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>{doneId.toUpperCase()}</span>
                <button type="button" aria-label="요청번호 복사" onClick={() => { navigator.clipboard?.writeText(doneId).then(() => toast.push('요청번호를 복사했어요.', 'ok')).catch(() => {}) }} className="flex items-center justify-center rounded-[7px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors" style={{ width: 28, height: 28 }}>
                  <ClipboardDocumentIcon style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
            <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
              <Button variant="outline" className="flex-1 justify-center" onClick={() => navigate('/marketplace')}>마켓플레이스로</Button>
              <Button className="flex-1 justify-center" onClick={() => navigate(`/marketplace?service=${encodeURIComponent(id)}`)}>서비스 상세로</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`[data-morph]{transition-duration:.8s !important}`}</style>
      <header className="flex flex-col shrink-0">
        <StepBack to="/marketplace" label="마켓플레이스" />
        <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
          <h1 className="font-bold text-text" style={{ fontSize: 22, lineHeight: 1.2 }}>API 키 요청</h1>
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>
          <b className="text-text">{svc.name}</b>의 API 키를 요청합니다. 단계는 순서대로만 진행할 수 있어요.
        </p>
      </header>

      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
        <Stepper current={step} />
      </section>

      <div className="flex-1 min-h-0 flex" style={{ marginTop: 14 }}>
        <div
          className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden"
          data-morph="wizard"
          aria-hidden={reviewing}
          style={{ width: reviewing ? '0%' : '64%', flex: '0 0 auto', minWidth: 0, boxShadow: 'var(--shadow-card)', opacity: reviewing ? 0 : 1, transform: reviewing ? 'translateX(-56px)' : 'none', pointerEvents: reviewing ? 'none' : 'auto', transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}` }}
        >
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ padding: '22px 26px' }}>
            {wizardStep === 0 && (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold shrink-0" style={{ fontSize: 14, color: M.text, marginBottom: 16 }}>API 키 요청 상세 내용을 입력해주세요.</h3>
                <div className="shrink-0" style={{ marginBottom: 20 }}>
                  <FieldLabel text="대상 서비스" />
                  <TargetCard svc={svc} owner={owner} modelName={modelName} />
                </div>
                <FieldLabel text="사용처 URL" required help="발급받은 키를 사용할 내 서비스·앱 주소를 입력해주세요." />
                <div className="shrink-0" style={{ marginBottom: 20 }}>
                  <input value={f.targetUrl} onChange={(e) => set('targetUrl', e.target.value)} placeholder="예: http://app.anclave.local/my-service" style={inputBase} />
                </div>
                <div className="shrink-0" style={{ marginBottom: 20 }}>
                  <FieldLabel text="예상 호출 규모" />
                  <div className="grid grid-cols-3" style={{ gap: 10 }}>
                    {SCALE_OPTS.map((o) => <SelectCard key={o.v} label={o.v} sub={o.desc} active={f.scale === o.v} onClick={() => set('scale', o.v)} />)}
                  </div>
                </div>
                <div className="flex flex-col flex-1 min-h-0">
                  <FieldLabel text="사용 목적" required help={`이 API 키로 무엇을 하려는지 적어주세요. 소유자 검토에 사용됩니다. (최소 ${PURPOSE_MIN}자)`} />
                  <div className="relative flex-1 min-h-0">
                    <textarea value={f.purpose} maxLength={300} onChange={(e) => set('purpose', e.target.value)} placeholder="예: 사내 상담 앱에서 문서 검색(RAG) 호출에 사용 예정" style={{ ...inputBase, height: '100%', minHeight: 96, padding: '14px', resize: 'none', lineHeight: 1.5 }} />
                    <span className="absolute" style={{ right: 14, bottom: 12, fontSize: 14, color: f.purpose.trim().length >= PURPOSE_MIN ? M.meta : 'var(--c-danger)' }}>{f.purpose.trim().length}/{PURPOSE_MIN}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
            <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>이전</Button>
            <div className="flex items-center gap-3">
              {!canNext && <span className="text-muted" style={{ fontSize: 14 }}>필수 항목을 입력하면 진행할 수 있어요.</span>}
              <Button onClick={next} disabled={!canNext}><KeyIcon width={15} height={15} /> 검토하기</Button>
            </div>
          </div>
        </div>

        <div data-morph="spec" style={{ width: reviewing ? '100%' : '36%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 16, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <SpecSheet
            f={f}
            svc={svc}
            owner={owner}
            modelName={modelName}
            userName={user.name}
            today={fmtNow().slice(0, 10)}
            currentStep={step}
            reviewing={reviewing}
            onEdit={(i) => setStep(i)}
            onBack={() => setStep(0)}
            onSubmit={submit}
            canSubmit={valid[0] && !submitting}
          />
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { Button, StepBack, useToast } from '../components/ui'
import { modelById, servers, services } from '../data'
import type { Service } from '../data/types'
import { useRole } from '../lib/role'
import { useTheme } from '../lib/theme'
import { Logo } from './catalog'
import { createPublishRequest } from './publish-store'

// G8 · 4.29a 서비스 게시 신규 신청(/marketplace/publish/new) — 4.6b 신규 신청과 동일 구조
// (스텝퍼 + morph[좌 마법사 / 우 명세서] + 완료). 모달 대신 전용 페이지. 디자인 시안 없음 — 토큰·컴포넌트 재사용.

function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

const M = {
  surface: 'var(--c-card2)', text: 'var(--c-text)', label: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  ph: 'color-mix(in srgb, var(--c-text) 62%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  req: 'var(--c-danger)', inputBg: 'var(--c-bg)', border: 'var(--c-border)',
  stepLine: 'var(--c-border)', blue: 'var(--c-accent)', blueText: 'var(--c-accent)',
  onAccent: 'var(--c-onaccent)', activeBg: 'var(--accent-soft)', value: 'var(--c-text)',
}

const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const WIZARD_STEPS = ['서비스 선택', '상세 내용', '확인 · 제출']
const VIS_OPTS = [
  { v: '전사 공개', desc: '모든 사내 사용자에게 노출' },
  { v: '팀 한정', desc: '소속 팀·부서만 접근' },
  { v: '링크 보유자', desc: '링크를 받은 사용자만' },
] as const
const INTRO_MIN = 10

const inputBase: React.CSSProperties = {
  height: 44, width: '100%', background: M.inputBg, border: `1px solid ${M.border}`,
  borderRadius: 8, padding: '0 14px', fontSize: 14, color: M.text, outline: 'none',
}

function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 서비스가 배포된 할당 자원(서버·GPU) 라벨 — assignedServiceId 또는 owner·model 슬라이스로 역추적.
function allocLabel(svc: Service): string {
  for (const server of servers) {
    for (const gpu of server.gpus) {
      if (gpu.assignedServiceId === svc.id) return `${server.host} · ${gpu.name}`
      const slice = gpu.slices?.find((sl) => sl.ownerUserId === svc.ownerUserId && sl.modelId === svc.model)
      if (slice) return `${server.host} · ${gpu.name} · ${slice.profile}`
    }
  }
  return '할당 정보 없음'
}
const kindOf = (svc: Service) => svc.kind
const modelOf = (svc: Service) => modelById(svc.model)?.name ?? svc.model

function FieldLabel({ text, required, help }: { text: string; required?: boolean; help?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="font-semibold" style={{ fontSize: 14, color: M.label }}>
        {text}
        {required && <span style={{ color: M.req, marginLeft: 5 }}>*</span>}
      </div>
      {help && <div style={{ fontSize: 13, color: M.help, marginTop: 4 }}>{help}</div>}
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
        {sub && <span className="block font-normal truncate" style={{ fontSize: 12, color: M.help, marginTop: 2 }}>{sub}</span>}
      </span>
      {active && <CheckIcon className="shrink-0" style={{ width: 16, height: 16, color: M.blue }} />}
    </button>
  )
}

// 상단 stepper — 4.6b와 동일
function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-center">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={s} className={i < WIZARD_STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'} style={{ maxWidth: i < WIZARD_STEPS.length - 1 ? 260 : undefined }}>
            <div className="flex flex-col items-center" style={{ width: 110 }}>
              <span className="flex items-center justify-center rounded-full font-semibold" style={{ width: 30, height: 30, fontSize: 14, background: done || active ? M.blue : 'transparent', border: done || active ? 'none' : `1.5px solid ${M.border}`, color: done || active ? M.onAccent : M.idle }}>
                {done ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-medium whitespace-nowrap" style={{ fontSize: 13, marginTop: 8, color: done || active ? M.blueText : M.idle }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? M.blue : M.stepLine, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

// 서비스 카드(단일 선택) — 로고 + 이름 + 종류·모델 + 할당 자원
function ServiceCard({ svc, active, onClick }: { svc: Service; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left rounded-[12px] transition-[transform,background-color,border-color] duration-100 active:scale-[0.985] flex flex-col"
      style={{ padding: 14, background: active ? M.activeBg : M.inputBg, border: `1px solid ${active ? M.blue : M.border}` }}
    >
      {active && (
        <span className="absolute flex items-center justify-center rounded-full" style={{ top: 10, right: 10, width: 20, height: 20, background: M.blue }}>
          <CheckIcon style={{ width: 13, height: 13, color: M.onAccent }} />
        </span>
      )}
      <div className="flex items-start gap-3 w-full">
        <Logo id={svc.id} size={40} />
        <div className="min-w-0 flex-1" style={{ paddingRight: active ? 22 : 0 }}>
          <div className="flex items-center gap-1.5">
            <span className="font-bold truncate" style={{ fontSize: 14, color: M.text }}>{svc.name}</span>
            <span className="shrink-0 rounded-[5px] font-medium" style={{ fontSize: 11, padding: '1px 6px', background: M.inputBg, border: `1px solid ${M.border}`, color: M.help }}>{svc.hasApi ? 'API' : '웹 UI'}</span>
          </div>
          <div className="truncate" style={{ fontSize: 12.5, color: M.help, marginTop: 2 }}>{kindOf(svc)} · {modelOf(svc)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between w-full" style={{ marginTop: 10 }}>
        <span className="truncate rounded-[5px] font-medium" style={{ fontSize: 11, padding: '2px 7px', background: M.inputBg, border: `1px solid ${M.border}`, color: M.help }}>{allocLabel(svc)}</span>
        <span className="shrink-0" style={{ fontSize: 11.5, color: M.help, marginLeft: 8 }}>호출 {svc.usageCount.toLocaleString('en-US')}</span>
      </div>
    </button>
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
      <span className="shrink-0" style={{ width: 92, fontSize: 15, color: M.help, lineHeight: 1.5 }}>{label}</span>
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
        ? <button type="button" onClick={onEdit} className="font-medium hover:underline shrink-0" style={{ fontSize: 13, color: M.blueText }}>수정</button>
        : active && <span className="font-semibold shrink-0" style={{ fontSize: 13, color: M.blueText }}>입력 중</span>}
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

interface PubForm { serviceId: string; intro: string; visibility: string; tags: string; demoNote: string }

function SpecSheet({ f, svc, userName, today, currentStep, reviewing, onEdit, onBack, onSubmit, canSubmit }: {
  f: PubForm; svc: Service | undefined; userName: string; today: string
  currentStep: number; reviewing: boolean; onEdit: (i: number) => void; onBack: () => void; onSubmit: () => void; canSubmit: boolean
}) {
  const filled = [!!f.serviceId, f.intro.trim().length >= INTRO_MIN, !!f.visibility].filter(Boolean).length
  const pct = Math.round((filled / 3) * 100)
  const done = filled === 3
  const docNo = `게시-${today.slice(0, 4)}-${today.slice(5, 7)}${today.slice(8, 10)}`
  return (
    <div data-morph="sheet" className="relative flex flex-col h-full" style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880, margin: '0 auto', transform: reviewing ? 'scale(1)' : 'scale(0.99)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}` }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 132, fontWeight: 900, color: reviewing ? 'var(--c-warn)' : 'var(--c-accent)', opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{reviewing ? '검토' : '초안'}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: `3px double ${M.border}`, background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>서비스 게시 신청서</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-warn)' : M.blue}`, color: reviewing ? 'var(--c-warn)' : M.blue, background: reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '검토' : '초안'}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 13, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{docNo}</span></span>
            <span>발급 Anclave 마켓플레이스</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.value }}>{userName}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="flex items-center justify-between" style={{ fontSize: 13, color: M.help, marginBottom: 6 }}>
              <span>필수 항목</span>
              <span className="font-semibold" style={{ color: done ? 'var(--c-ok)' : M.blueText }}>{filled} / 3</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: M.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--c-ok)' : M.blue, borderRadius: 2, transition: 'width .45s cubic-bezier(.4,0,.2,1), background .3s' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '12px 18px' }}>
          <SpecSection title="서비스" index={0} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(0)}>
            <SpecRow label="서비스명" value={svc?.name} reviewing={reviewing} pendingW="70%" />
            <SpecRow label="종류 / 모델" value={svc ? `${kindOf(svc)} · ${modelOf(svc)}` : undefined} reviewing={reviewing} pendingW="60%" />
            <SpecRow label="할당 자원" value={svc ? allocLabel(svc) : undefined} reviewing={reviewing} pendingW="55%" last />
          </SpecSection>
          <SpecSection title="게시 정보" index={1} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(1)}>
            <SpecRow label="소개" value={f.intro} reviewing={reviewing} pendingW="92%" />
            <SpecRow label="공개 범위" value={f.visibility} reviewing={reviewing} pendingW="35%" />
            <SpecRow label="태그" value={f.tags} emptyText="없음" reviewing={reviewing} pendingW="50%" />
            <SpecRow label="데모 안내" value={f.demoNote} emptyText="없음" reviewing={reviewing} pendingW="60%" last />
          </SpecSection>
        </div>

        {reviewing && (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>
            <p style={{ fontSize: 14, color: M.help, marginBottom: 10, lineHeight: 1.5 }}>제출 시 게시 신청이 접수되며, 관리자 게시 승인 후 마켓플레이스에 노출됩니다.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onBack}>이전</Button>
              <Button onClick={onSubmit} disabled={!canSubmit} className="flex-1 justify-center">게시 신청 제출</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function PublishNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user } = useRole()

  // 본인이 배포(소유)한 서비스 — 게시 신청 대상.
  const myServices = services.filter((s) => s.ownerUserId === user.id)

  const [step, setStep] = useState(0)
  const [f, setF] = useState<PubForm>({ serviceId: '', intro: '', visibility: VIS_OPTS[0].v, tags: '', demoNote: '' })
  const [svcQ, setSvcQ] = useState('')
  const [doneId, setDoneId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const set = <K extends keyof PubForm>(k: K, v: PubForm[K]) => setF((p) => ({ ...p, [k]: v }))

  const svc = myServices.find((s) => s.id === f.serviceId)
  const valid = [
    !!f.serviceId,
    f.intro.trim().length >= INTRO_MIN && !!f.visibility,
    true,
  ]
  const canNext = valid[step]
  const isLast = step === WIZARD_STEPS.length - 1
  const reviewing = step === 2
  const wizardStep = reviewing ? 1 : step
  const go = (d: number) => setStep((s) => Math.max(0, Math.min(WIZARD_STEPS.length - 1, s + d)))

  const submit = () => {
    if (submitting || !svc) return
    setSubmitting(true)
    const created = createPublishRequest({
      requesterUserId: user.id,
      serviceName: svc.name,
      serviceUrl: svc.serviceUrl,
      demoUrl: svc.testUrl ?? svc.serviceUrl,
      meta: `${kindOf(svc)} · ${modelOf(svc)}`,
    })
    setDoneId(created.id)
    toast.push('게시 신청을 접수했어요. 관리자 검토 후 마켓에 노출됩니다.', 'ok')
  }
  const next = () => {
    if (!canNext) return
    if (isLast) submit()
    else go(1)
  }

  // ── 완료 화면 ──
  if (doneId) {
    return (
      <div className="anim-fade flex flex-col h-full" style={mutedFix}>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="bg-card2 border border-line rounded-[16px] flex flex-col items-center text-center" style={{ boxShadow: 'var(--shadow-card)', padding: '40px 44px', maxWidth: 480, width: '100%' }}>
            <span className="relative flex items-center justify-center rounded-full" style={{ width: 66, height: 66, background: 'var(--ok-soft)', color: 'var(--c-ok)' }}>
              <span className="absolute rounded-full" style={{ inset: 0, boxShadow: '0 0 0 6px var(--ok-soft)', opacity: 0.5 }} />
              <CheckCircleIcon style={{ width: 38, height: 38 }} />
            </span>
            <h2 className="font-bold text-text" style={{ fontSize: 20, marginTop: 18 }}>게시 신청이 접수되었습니다</h2>
            <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
              관리자 게시 승인 후 마켓플레이스에 노출됩니다. 진행 상태는 게시 신청 목록에서 확인할 수 있어요.
            </p>
            <div className="w-full rounded-[12px]" style={{ marginTop: 22, padding: '14px 16px', background: 'var(--c-soft)', border: '1px solid var(--c-border-s)' }}>
              <div className="flex items-center justify-center gap-1.5 text-muted" style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.2px' }}>
                신청번호
                <span className="rounded-[5px] font-semibold" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>검토 중</span>
              </div>
              <div className="flex items-center justify-center gap-2" style={{ marginTop: 7 }}>
                <span className="font-bold text-text" style={{ fontSize: 18, fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>{doneId.toUpperCase()}</span>
                <button type="button" aria-label="신청번호 복사" onClick={() => { navigator.clipboard?.writeText(doneId).then(() => toast.push('신청번호를 복사했어요.', 'ok')).catch(() => {}) }} className="flex items-center justify-center rounded-[7px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors" style={{ width: 28, height: 28 }}>
                  <ClipboardDocumentIcon style={{ width: 15, height: 15 }} />
                </button>
              </div>
              <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 7 }}>이 번호로 게시 신청 목록에서 진행 상태를 조회할 수 있어요.</div>
            </div>
            <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
              <Button variant="outline" className="flex-1 justify-center" onClick={() => navigate('/marketplace')}>마켓플레이스로</Button>
              <Button className="flex-1 justify-center" onClick={() => navigate('/marketplace/publish')}>게시 신청 목록으로</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const filteredSvcs = myServices.filter((s) => {
    const q = svcQ.trim().toLowerCase()
    return !q || `${s.name} ${s.kind} ${modelOf(s)}`.toLowerCase().includes(q)
  })

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`[data-morph]{transition-duration:.8s !important}`}</style>
      <header className="flex flex-col shrink-0">
        <StepBack to="/marketplace/publish" label="서비스 게시 신청" />
        <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
          <h1 className="font-bold text-text" style={{ fontSize: 22, lineHeight: 1.2 }}>신규 게시 신청</h1>
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>
          할당받은 자원에 배포한 서비스를 마켓플레이스에 게시 신청합니다. 단계는 순서대로만 진행할 수 있어요.
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
                <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 6 }}>게시할 서비스를 선택해주세요.</h3>
                <p className="shrink-0" style={{ fontSize: 13, color: M.help, marginBottom: 14 }}>내가 배포한 서비스 {myServices.length}개 중 하나를 선택해 게시 신청해요.</p>
                <div className="relative shrink-0" style={{ marginBottom: 12 }}>
                  <MagnifyingGlassIcon className="absolute" style={{ left: 14, top: 13, width: 16, height: 16, color: M.idle }} />
                  <input value={svcQ} onChange={(e) => setSvcQ(e.target.value)} placeholder="서비스명, 종류, 모델 검색" style={{ ...inputBase, height: 42, paddingLeft: 40 }} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto" style={{ marginRight: -6, paddingRight: 6 }}>
                  {myServices.length === 0 ? (
                    <div className="text-center" style={{ fontSize: 14, color: M.help, padding: '40px 0', lineHeight: 1.6 }}>
                      배포한 서비스가 없어요.<br />할당받은 자원에 서비스를 먼저 배포해주세요.
                    </div>
                  ) : (
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      {filteredSvcs.map((s) => <ServiceCard key={s.id} svc={s} active={f.serviceId === s.id} onClick={() => set('serviceId', s.id)} />)}
                    </div>
                  )}
                  {myServices.length > 0 && filteredSvcs.length === 0 && <div className="text-center" style={{ fontSize: 14, color: M.help, padding: '32px 0' }}>검색 결과가 없어요.</div>}
                </div>
                <div className="shrink-0 flex items-center" style={{ marginTop: 10, fontSize: 13, color: M.help }}>
                  <span>{svc ? `선택: ${svc.name}` : '아직 선택한 서비스가 없어요'}</span>
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 18 }}>마켓플레이스에 노출될 상세 내용을 작성해주세요.</h3>
                <FieldLabel text="서비스 소개" required help={`마켓플레이스 방문자에게 보일 소개를 작성해주세요. (최소 ${INTRO_MIN}자)`} />
                <div className="relative shrink-0" style={{ marginBottom: 22 }}>
                  <textarea value={f.intro} maxLength={300} onChange={(e) => set('intro', e.target.value)} placeholder={svc ? `예: ${svc.description}` : '먼저 서비스를 선택해주세요.'} style={{ ...inputBase, height: 96, padding: '14px', resize: 'none', lineHeight: 1.5 }} />
                  <span className="absolute" style={{ right: 14, bottom: 12, fontSize: 12, color: f.intro.trim().length >= INTRO_MIN ? M.meta : 'var(--c-danger)' }}>{f.intro.trim().length}/{INTRO_MIN}</span>
                </div>
                <div style={{ marginBottom: 22 }}>
                  <FieldLabel text="공개 범위" required />
                  <div className="grid grid-cols-3" style={{ gap: 10 }}>
                    {VIS_OPTS.map((o) => <SelectCard key={o.v} label={o.v} sub={o.desc} active={f.visibility === o.v} onClick={() => set('visibility', o.v)} />)}
                  </div>
                </div>
                <div className="grid grid-cols-2 flex-1 min-h-0" style={{ gap: 18 }}>
                  <div className="flex flex-col min-h-0">
                    <FieldLabel text="태그" help="쉼표로 구분해 입력해주세요. (선택)" />
                    <input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="예: RAG, 검색, 문서" style={inputBase} />
                  </div>
                  <div className="flex flex-col min-h-0">
                    <FieldLabel text="데모 안내" help="데모 사용 방법·계정 등 안내. (선택)" />
                    <input value={f.demoNote} onChange={(e) => set('demoNote', e.target.value)} placeholder="예: 게스트 계정으로 바로 체험 가능" style={inputBase} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
            <Button variant="ghost" onClick={() => go(-1)} disabled={step === 0}>이전</Button>
            <div className="flex items-center gap-3">
              {!canNext && <span className="text-muted" style={{ fontSize: 14 }}>필수 항목을 입력하면 진행할 수 있어요.</span>}
              <Button onClick={next} disabled={!canNext}>{step === 1 ? '검토하기' : '다음'}</Button>
            </div>
          </div>
        </div>

        <div data-morph="spec" style={{ width: reviewing ? '100%' : '36%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 16, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <SpecSheet
            f={f}
            svc={svc}
            userName={user.name}
            today={fmtNow().slice(0, 10)}
            currentStep={step}
            reviewing={reviewing}
            onEdit={(i) => setStep(i)}
            onBack={() => setStep(1)}
            onSubmit={submit}
            canSubmit={valid[0] && valid[1] && !submitting}
          />
        </div>
      </div>
    </div>
  )
}

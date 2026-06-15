import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Button, useToast } from '../components/ui'
import type { ModelKind } from '../data/types'
import { useRole } from '../lib/role'
import {
  CornerMarks,
  FieldLabel,
  M,
  MorphFrame,
  MORPH_EASE,
  Pending,
  SectionHead,
  SelectCard,
  SpecSection,
  Stepper,
  inputBase,
} from './model-wizard-ui'
import { createRequest } from './model-requests-shared'

// G5 · 4.14 사용자(B/C) 모델 등록 신청 — 별도 페이지. g2 request-new 와 같은 좌우+morph.
// 사용자는 신청만, 반입·스캔·명세·배포는 전부 관리자(A) 몫.
// 라우트/App.tsx 등록은 deny → 메인에서 연결(보고).

const LIST_PATH = '/admin/models/requests'
const STEPS = ['신청 작성', '검토 · 제출']
const KIND_OPTS: ModelKind[] = ['LLM', 'Code', 'Vision-Language', 'Image', 'STT', 'Embedding']

function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface ReqForm {
  modelName: string
  kind: ModelKind | ''
  source: string
  reason: string
  usage: string
  files: string[]
  remark: string
}
const EMPTY: ReqForm = { modelName: '', kind: '', source: '', reason: '', usage: '', files: [], remark: '' }

function SpecRow({ label, value, pendingW = '60%', reviewing, last }: { label: string; value?: ReactNode; pendingW?: string; reviewing: boolean; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 84, fontSize: 14, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 22 }}>
        {empty ? (reviewing ? <span style={{ fontSize: 14, color: M.idle }}>—</span> : <Pending w={pendingW} />)
          : <span className="anim-fade" style={{ fontSize: 14, color: M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}

function RequestSpecSheet({ f, userName, today, reviewing, onEdit, onSubmit, onBack, canSubmit }: {
  f: ReqForm
  userName: string
  today: string
  reviewing: boolean
  onEdit: () => void
  onSubmit: () => void
  onBack: () => void
  canSubmit: boolean
}) {
  const reqFilled = [f.modelName.trim(), f.reason.trim()].filter(Boolean).length
  const pct = Math.round((reqFilled / 2) * 100)
  const done = reqFilled === 2
  const docNo = `모델신청-${today.slice(0, 4)}-${today.slice(5, 7)}${today.slice(8, 10)}`
  return (
    <div
      data-morph="sheet"
      className="relative flex flex-col h-full"
      style={{
        background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14,
        boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden',
        width: '100%', maxWidth: reviewing ? 820 : '100%', margin: '0 auto',
        transform: reviewing ? 'scale(1)' : 'scale(0.99)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}`,
      }}
    >
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 124, fontWeight: 900, color: reviewing ? 'var(--c-warn)' : 'var(--c-accent)', opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{reviewing ? '검토' : '초안'}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: `3px double ${M.border}`, background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>모델 등록 신청서</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-warn)' : M.blue}`, color: reviewing ? 'var(--c-warn)' : M.blue, background: reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '검토' : '초안'}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 14, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{docNo}</span></span>
            <span>발급 Anclave 모델관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.value }}>{userName}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="flex items-center justify-between" style={{ fontSize: 14, color: M.help, marginBottom: 6 }}>
              <span>필수 항목</span>
              <span className="font-semibold" style={{ color: done ? 'var(--c-ok)' : M.blueText }}>{reqFilled} / 2</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: M.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--c-ok)' : M.blue, borderRadius: 2, transition: 'width .45s cubic-bezier(.4,0,.2,1), background .3s' }} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '6px 12px 14px' }}>
          <SpecSection title="신청 정보" active={!reviewing} reviewing={reviewing} onEdit={onEdit}>
            <SpecRow label="신청자" value={userName} reviewing={reviewing} />
            <SpecRow label="모델명" value={f.modelName} pendingW="70%" reviewing={reviewing} />
            <SpecRow label="종류" value={f.kind || ''} pendingW="40%" reviewing={reviewing} />
            <SpecRow label="출처" value={f.source ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{f.source}</span> : ''} pendingW="80%" reviewing={reviewing} last />
          </SpecSection>

          <SpecSection title="신청 사유" active={false} reviewing={reviewing} onEdit={onEdit}>
            <SpecRow label="사유" value={f.reason} pendingW="92%" reviewing={reviewing} />
            <SpecRow label="사용처" value={f.usage} pendingW="65%" reviewing={reviewing} last />
          </SpecSection>

          <SpecSection title="참고 자료" active={false} reviewing={reviewing} onEdit={onEdit}>
            <SpecRow label="첨부" value={f.files.length ? f.files.join(', ') : ''} pendingW="60%" reviewing={reviewing} last />
          </SpecSection>

          <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: 6, minHeight: 90, padding: '0 12px' }}>
            <SectionHead title="비고" active={false} reviewing={reviewing} onEdit={onEdit} />
            <div className="flex-1 min-h-0 rounded-[8px]" style={{ border: '1px dashed var(--c-border)', background: 'color-mix(in srgb, var(--c-muted) 5%, transparent)', padding: '11px 13px', overflow: 'auto' }}>
              {f.remark
                ? <p className="anim-fade" style={{ fontSize: 14, color: M.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.remark}</p>
                : <span style={{ fontSize: 14, color: M.idle }}>{reviewing ? '특이사항 없음' : '비고를 입력하면 여기에 표시됩니다'}</span>}
            </div>
          </div>
        </div>

        {reviewing && (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>
            <p style={{ fontSize: 14, color: M.help, marginBottom: 10, lineHeight: 1.5 }}>제출 시 신청이 접수되며, 관리자 검토 후 반입·배포가 진행됩니다.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onBack}>이전</Button>
              <Button onClick={onSubmit} disabled={!canSubmit} className="flex-1 justify-center">신청 제출</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ModelRequestNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useRole()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [f, setF] = useState<ReqForm>(EMPTY)
  const [doneId, setDoneId] = useState<string | null>(null)
  const set = <K extends keyof ReqForm>(k: K, v: ReqForm[K]) => setF((p) => ({ ...p, [k]: v }))

  const valid0 = Boolean(f.modelName.trim() && f.reason.trim())
  const reviewing = step === 1

  const addFiles = (list: FileList | null | undefined) => {
    if (!list?.length) return
    const names = Array.from(list).map((x) => x.name)
    setF((p) => ({ ...p, files: [...p.files, ...names.filter((n) => !p.files.includes(n))] }))
  }

  const submit = async () => {
    const created = await createRequest({
      requesterUserId: user.id,
      modelName: f.modelName.trim(),
      kind: f.kind || undefined,
      source: f.source.trim() || undefined,
      reason: f.reason.trim(),
    })
    setDoneId(created.id) // 서버 발급 id
    toast.push('모델 등록 신청이 접수되었어요. (검토 대기)', 'ok')
  }

  if (doneId) {
    return (
      <div className="anim-fade flex flex-col h-full">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="bg-card2 border border-line rounded-[14px] flex flex-col items-center text-center" style={{ boxShadow: 'var(--shadow-card)', padding: '44px 48px', maxWidth: 460, width: '100%' }}>
            <span className="flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: 'var(--ok-soft)', color: 'var(--c-ok)' }}>
              <CheckCircleIcon style={{ width: 36, height: 36 }} />
            </span>
            <h2 className="font-bold" style={{ fontSize: 19, marginTop: 18, color: 'var(--c-text)' }}>신청이 접수되었습니다</h2>
            <p style={{ fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.55, marginTop: 8 }}>
              관리자 검토 후 반입·보안점검·배포가 진행됩니다. 진행 상황은 모델 신청 관리에서 확인할 수 있어요.
            </p>
            <div className="rounded-[10px] font-bold" style={{ marginTop: 18, padding: '10px 22px', background: 'var(--c-soft)', fontSize: 16, color: 'var(--c-text)', fontFamily: 'var(--font-mono)' }}>{doneId}</div>
            <Button onClick={() => navigate(LIST_PATH)} style={{ marginTop: 22 }}>신청 목록으로</Button>
          </div>
        </div>
      </div>
    )
  }

  const wizardCard: ReactNode = (
    <div className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex-1 min-h-0 flex flex-col overflow-auto" style={{ padding: '22px 26px' }}>
        <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 18 }}>신청할 모델 정보를 입력해주세요.</h3>
        <FieldLabel text="모델명" required help="등록을 원하는 모델 이름을 입력해주세요." />
        <input value={f.modelName} maxLength={60} onChange={(e) => set('modelName', e.target.value)} placeholder="예: Qwen2.5-72B-Instruct" style={{ ...inputBase, marginBottom: 18 }} />
        <FieldLabel text="모델 종류" help="(선택) 해당하는 종류를 선택해주세요." />
        <div className="grid grid-cols-3 shrink-0" style={{ gap: 8, marginBottom: 18 }}>
          {KIND_OPTS.map((k) => <SelectCard key={k} label={k} active={f.kind === k} onClick={() => set('kind', f.kind === k ? '' : k)} />)}
        </div>
        <FieldLabel text="출처" help="(선택) HuggingFace 등 모델 출처 URL." />
        <input value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="예: huggingface.co/Qwen/Qwen2.5-72B" style={{ ...inputBase, fontFamily: 'var(--font-mono)', fontSize: 14, marginBottom: 18 }} />
        <FieldLabel text="신청 사유" required help="이 모델이 필요한 이유를 입력해주세요." />
        <textarea value={f.reason} maxLength={300} onChange={(e) => set('reason', e.target.value)} placeholder="예: 코드 자동화 에이전트용 최신 LLM 필요" style={{ ...inputBase, height: 80, padding: '12px 14px', resize: 'none', lineHeight: 1.5, marginBottom: 18 }} />
        <FieldLabel text="사용처" help="(선택) 어떤 서비스·업무에 사용할 예정인가요?" />
        <input value={f.usage} onChange={(e) => set('usage', e.target.value)} placeholder="예: 사내 고객 상담 챗봇" style={{ ...inputBase, marginBottom: 18 }} />
        <FieldLabel text="참고 자료" help="(선택) 평가 자료·요청 공문 등 파일을 첨부할 수 있어요." />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          className="flex flex-col items-center justify-center rounded-[10px] cursor-pointer transition-colors shrink-0"
          style={{ minHeight: 96, border: `1.5px dashed ${f.files.length ? M.blue : M.border}`, background: f.files.length ? M.activeBg : M.inputBg, padding: 14, marginBottom: f.files.length ? 12 : 18 }}
        >
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <DocumentArrowUpIcon style={{ width: 26, height: 26, color: f.files.length ? M.blue : M.idle }} />
          <span className="font-medium text-center" style={{ fontSize: 14, color: M.text, marginTop: 8 }}>파일을 끌어다 놓거나 클릭해 선택</span>
        </div>
        {f.files.length > 0 && (
          <div className="flex flex-col shrink-0" style={{ gap: 8, marginBottom: 18 }}>
            {f.files.map((name) => (
              <div key={name} className="flex items-center gap-2.5 rounded-[8px]" style={{ background: M.inputBg, border: `1px solid ${M.border}`, padding: '8px 12px' }}>
                <DocumentArrowUpIcon className="shrink-0" style={{ width: 16, height: 16, color: M.idle }} />
                <span className="flex-1 min-w-0 truncate font-medium" style={{ fontSize: 14, color: M.text }}>{name}</span>
                <button type="button" onClick={() => set('files', f.files.filter((x) => x !== name))} aria-label="첨부 제거" style={{ color: M.idle }}><XMarkIcon style={{ width: 15, height: 15 }} /></button>
              </div>
            ))}
          </div>
        )}
        <FieldLabel text="비고" help="(선택) 추가로 전달할 내용이 있으면 적어주세요." />
        <textarea value={f.remark} maxLength={200} onChange={(e) => set('remark', e.target.value)} placeholder="예: 기존 모델 대비 한국어 성능 우수" style={{ ...inputBase, height: 72, padding: '12px 14px', resize: 'none', lineHeight: 1.5 }} />
      </div>
      <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
        <Button variant="ghost" onClick={() => navigate(LIST_PATH)}>취소</Button>
        <div className="flex items-center gap-3">
          {!valid0 && <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>모델명·사유를 입력해주세요.</span>}
          <Button onClick={() => setStep(1)} disabled={!valid0}>검토하기</Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={{ minHeight: '100%' }}>
      <header className="flex flex-col shrink-0">
        <button type="button" onClick={() => navigate(LIST_PATH)} className="inline-flex items-center gap-1.5 self-start transition-colors" style={{ fontSize: 14, color: 'var(--c-muted)' }}>
          <ArrowLeftIcon style={{ width: 15, height: 15 }} />
          모델 신청 관리
        </button>
        <h1 className="font-bold" style={{ fontSize: 22, lineHeight: 1.2, marginTop: 12, color: 'var(--c-text)' }}>모델 등록 신청</h1>
        <p style={{ fontSize: 14, color: 'var(--c-muted)', marginTop: 6 }}>카탈로그에 없는 모델 등록을 신청합니다. 반입·보안점검·배포는 관리자가 처리합니다.</p>
      </header>

      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
        <Stepper steps={STEPS} current={step} />
      </section>

      <MorphFrame
        reviewing={reviewing}
        wizard={wizardCard}
        sheet={
          <RequestSpecSheet
            f={f}
            userName={user.name}
            today={fmtNow().slice(0, 10)}
            reviewing={reviewing}
            onEdit={() => setStep(0)}
            onSubmit={submit}
            onBack={() => setStep(0)}
            canSubmit={valid0}
          />
        }
      />
    </div>
  )
}

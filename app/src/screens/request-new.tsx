import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  DocumentArrowUpIcon,
  CalendarDaysIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { Button, StepBack, useToast } from '../components/ui'
import { models } from '../data'
import type { Model } from '../data/types'
import { useRole } from '../lib/role'
import { useTheme } from '../lib/theme'
import { findRequestSync } from './requests-shared'
import { apiPost } from '../lib/api'
import { Logo, providerName } from './catalog'

// G2 · 4.6b 신규 신청(/requests/new) — 좌: 멀티스텝 / 우: 신청 명세서(실시간 채움) → 검토 시 명세서 센터.
// 디자인 시안 없음 — 기존 토큰·컴포넌트 재사용, 라이트/다크 양립.

// 다크에서 공유 --c-muted 대비 부족 → 페이지 스코프 오버라이드(dashboard.tsx와 동일 패턴).
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

// 폼 토큰 — 보조 텍스트는 본문색 반투명으로 테마 자동 적응.
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

const WIZARD_STEPS = ['기본 정보', '모델 선택', '상세 설정', '제출 전 검토']
const PERIOD_OPTS = ['1개월', '3개월', '6개월', '무기한'] as const
const PRIORITY_OPTS = ['낮음', '보통', '높음'] as const
const PRIORITY_EN: Record<string, 'low' | 'normal' | 'high'> = { 낮음: 'low', 보통: 'normal', 높음: 'high' }
const PRIORITY_KR: Record<string, string> = { low: '낮음', normal: '보통', high: '높음' }
// 상세 설정 — 운영 의도 신호(자원 산정은 관리자 몫이라 기술 스펙은 받지 않음)
// 공개 여부 — 마켓플레이스 게시(공개) 여부. 비공개=소유자·팀 내부 사용.
const SECURITY_OPTS = [
  { v: '비공개', desc: '소유자·팀 내부에서만 사용' },
  { v: '공개', desc: '마켓플레이스에 게시·공유' },
] as const
const SCALE_OPTS = [
  { v: '소규모', desc: '~ 수십 요청/일' },
  { v: '중규모', desc: '~ 수천 요청/일' },
  { v: '대규모', desc: '수만 요청/일 이상' },
] as const

// morph 모션 — 천천히 부드럽게(스르륵). easeInOut으로 가감속을 고르게 퍼뜨려 글라이드 느낌.
const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

// 조직도(소속 팀/부서) — 본부·팀(조직 단위)만. 개인은 넣지 않는다.
interface OrgNode { label: string; selectable?: boolean; children?: OrgNode[] }
const ORG: OrgNode[] = [
  {
    label: '기술개발본부', children: [
      { label: '서비스 기술개발팀' },
      { label: '시스템 통합개발팀' },
    ],
  },
  { label: '사업기획본부' },
]

// 모델 종류 필터 — 시드에 존재하는 kind만
const MODEL_KINDS = ['전체', ...Array.from(new Set(models.map((m) => m.kind)))]

interface ReqForm {
  serviceName: string
  team: string
  reason: string
  modelIds: string[] // 다중 선택
  period: string
  startDate: string
  priority: string
  security: string
  scale: string
  files: string[] // 첨부 파일명(공문·기타 문서)
  remark: string
}
const EMPTY_FORM: ReqForm = {
  serviceName: '', team: '', reason: '', modelIds: [], period: '', startDate: '', priority: '보통', security: '비공개', scale: '중규모', files: [], remark: '',
}

// ?from=<id> 재신청 프리필 — 로컬/시드에서 동기 조회
function prefillFrom(id: string | null): ReqForm {
  const src = id ? findRequestSync(id) : null
  if (!src) return EMPTY_FORM
  const file = src.attachmentUrl?.split('/').pop()
  return {
    serviceName: src.serviceName ?? '',
    team: src.team ?? '',
    reason: src.purpose ?? '',
    modelIds: src.models ?? [],
    period: src.period ?? '',
    startDate: src.startDate ?? '',
    priority: PRIORITY_KR[src.priority ?? 'normal'] ?? '보통',
    security: src.security ?? '비공개',
    scale: src.scale ?? '중규모',
    files: file ? [file] : [],
    remark: src.remark ?? '',
  }
}

function fmtNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const inputBase: React.CSSProperties = {
  height: 44, width: '100%', background: M.inputBg, border: `1px solid ${M.border}`,
  borderRadius: 8, padding: '0 14px', fontSize: 14, color: M.text, outline: 'none',
}

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

// 세그먼트/토글 선택 카드(기간·우선순위·보안 등급·예상 규모)
function SelectCard({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-[8px] transition-colors text-left w-full"
      style={{
        minHeight: 44, padding: '10px 14px',
        background: active ? M.activeBg : M.inputBg,
        border: `1px solid ${active ? M.blue : M.border}`,
        color: active ? M.text : M.value, fontSize: 14, fontWeight: active ? 600 : 500,
      }}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block font-normal truncate" style={{ fontSize: 12, color: M.help, marginTop: 2 }}>{sub}</span>}
      </span>
      {active && <CheckIcon className="shrink-0" style={{ width: 16, height: 16, color: M.blue }} />}
    </button>
  )
}

// ── 소속 팀/부서 조직도 드롭다운(트리) — 본부 헤더 + 들여쓰기 선택 ──
function OrgNodeRow({ node, depth, value, onPick }: { node: OrgNode; depth: number; value: string; onPick: (v: string) => void }) {
  const selectable = node.selectable !== false
  const selected = value === node.label
  return (
    <>
      {selectable ? (
        <button
          type="button"
          onClick={() => onPick(node.label)}
          className="flex items-center w-full text-left transition-colors hover:bg-soft"
          style={{ padding: '7px 12px', paddingLeft: 12 + depth * 16, fontSize: 13, fontWeight: selected ? 600 : 500, color: selected ? M.blueText : M.value, background: selected ? 'var(--accent-soft)' : 'transparent' }}
        >
          {depth > 0 && <span className="shrink-0" style={{ color: M.idle, marginRight: 6 }}>ㄴ</span>}
          <span className="flex-1 truncate">{node.label}</span>
          {selected && <CheckIcon className="shrink-0" style={{ width: 14, height: 14, color: M.blue }} />}
        </button>
      ) : (
        <div className="font-bold" style={{ padding: '8px 12px 4px', paddingLeft: 12 + depth * 16, fontSize: 11.5, letterSpacing: '0.04em', color: M.help }}>{node.label}</div>
      )}
      {node.children?.map((c) => <OrgNodeRow key={c.label} node={c} depth={depth + 1} value={value} onPick={onPick} />)}
    </>
  )
}

function OrgSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    setOpen((o) => !o)
  }
  // 열려 있는 동안 스크롤/리사이즈되면 위치가 어긋나므로 닫는다.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex items-center justify-between transition-[border-color,box-shadow]"
        style={{ ...inputBase, cursor: 'pointer', color: value ? M.text : M.ph, borderColor: open ? M.blue : M.border, boxShadow: open ? '0 0 0 3px var(--accent-soft)' : 'none' }}
      >
        <span className="truncate">{value || '소속을 선택해주세요'}</span>
        <ChevronDownIcon className="shrink-0" style={{ width: 16, height: 16, color: M.idle, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {/* document.body로 portal — transform된 조상이 position:fixed 기준을 바꾸는 문제 회피 */}
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 60 }} onClick={() => setOpen(false)} />
          <div
            className="anim-fade"
            style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxHeight: 360, overflow: 'auto', background: M.surface, border: `1px solid ${M.border}`, borderRadius: 10, boxShadow: 'var(--shadow-pop)', zIndex: 61, padding: '6px 0' }}
          >
            {ORG.map((node) => <OrgNodeRow key={node.label} node={node} depth={0} value={value} onPick={(v) => { onChange(v); setOpen(false) }} />)}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// 상단 stepper — 현재 단계 액센트 · 완료 체크
function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-center">
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={s} className={i < WIZARD_STEPS.length - 1 ? 'flex items-start flex-1' : 'flex items-start'} style={{ maxWidth: i < WIZARD_STEPS.length - 1 ? 230 : undefined }}>
            <div className="flex flex-col items-center" style={{ width: 110 }}>
              <span
                className="flex items-center justify-center rounded-full font-semibold"
                style={{
                  width: 30, height: 30, fontSize: 14,
                  background: done || active ? M.blue : 'transparent',
                  border: done || active ? 'none' : `1.5px solid ${M.border}`,
                  color: done || active ? M.onAccent : M.idle,
                }}
              >
                {done ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-medium whitespace-nowrap" style={{ fontSize: 13, marginTop: 8, color: done || active ? M.blueText : M.idle }}>{s}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? M.blue : M.stepLine, borderRadius: 1 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// 모델 카드 — 제공사 로고(모델 카탈로그와 동일) + 다중 선택(체크 토글)
function ModelCard({ m, active, onClick }: { m: Model; active: boolean; onClick: () => void }) {
  const provider = providerName(m.id)
  const meta = provider !== '—' ? `${provider} · ${m.kind} · ${m.params}` : `${m.kind} · ${m.params}`
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-[12px] transition-[transform,background-color,border-color] duration-100 active:scale-[0.99] flex items-center gap-3.5 w-full"
      style={{ padding: '12px 16px', background: active ? M.activeBg : M.inputBg, border: `1px solid ${active ? M.blue : M.border}` }}
    >
      <Logo id={m.id} size={42} />
      {/* 본문 — 모델명·인기 / 메타·설명(1줄 말줄임) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-bold truncate" style={{ fontSize: 14, color: M.text }}>{m.name}</span>
          {m.usageRank <= 3 && (
            <span className="shrink-0 rounded-[5px] font-medium" style={{ fontSize: 11, padding: '1px 6px', background: M.activeBg, color: M.blue }}>인기</span>
          )}
        </div>
        <div className="truncate" style={{ fontSize: 12.5, color: M.help, marginTop: 3 }}>
          <span style={{ color: M.value }}>{meta}</span> · {m.description}
        </div>
      </div>
      {/* 우측 메타 — 권장 GPU · 사용순위 · 선택 표시 */}
      <div className="shrink-0 flex items-center" style={{ gap: 12 }}>
        <span className="truncate rounded-[6px] font-medium" style={{ fontSize: 11, padding: '3px 8px', background: M.inputBg, border: `1px solid ${M.border}`, color: M.help, maxWidth: 180 }}>{m.recommendedGpu}</span>
        <span style={{ fontSize: 11.5, color: M.help, whiteSpace: 'nowrap' }}>사용 {m.usageRank}위</span>
        <span className="flex items-center justify-center rounded-full" style={{ width: 22, height: 22, background: active ? M.blue : 'transparent', border: active ? 'none' : `1.5px solid ${M.border}` }}>
          {active && <CheckIcon style={{ width: 14, height: 14, color: M.onAccent }} />}
        </span>
      </div>
    </button>
  )
}

// ── 신청 명세서(우측) — 멀티스텝 입력 실시간 반영. 빈 칸은 빗금 placeholder, 채움 시 anim-fade ──
function Pending({ w = '60%' }: { w?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: w, height: 16, borderRadius: 3,
        background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--c-muted) 32%, transparent) 0 1px, transparent 1px 6px)',
        border: '1px dashed var(--c-border)',
      }}
    />
  )
}

function SpecRow({ label, value, emptyText, reviewing, pendingW = '60%', last }: { label: string; value?: ReactNode; emptyText?: string; reviewing: boolean; pendingW?: string; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 92, fontSize: 15, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 23 }}>
        {empty ? (
          reviewing
            ? <span style={{ fontSize: 15, color: M.idle }}>{emptyText ?? '—'}</span>
            : <Pending w={pendingW} />
        ) : (
          <span key="filled" className="anim-fade font-medium" style={{ fontSize: 15, color: M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>
        )}
      </div>
    </div>
  )
}

// 섹션 헤더 — 제목 + 가는 구분선 + 액션(수정/입력 중). 문서 양식의 절 구분처럼.
function SectionHead({ title, active, reviewing, onEdit }: { title: string; active: boolean; reviewing: boolean; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
      <span className="font-bold shrink-0" style={{ fontSize: 15, color: active ? M.blueText : M.text }}>{title}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
      {reviewing ? (
        <button type="button" onClick={onEdit} className="font-medium hover:underline shrink-0" style={{ fontSize: 13, color: M.blueText }}>수정</button>
      ) : (
        active && <span className="font-semibold shrink-0" style={{ fontSize: 13, color: M.blueText }}>입력 중</span>
      )}
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

// 모서리 등록 마크(스캔/인쇄 문서 느낌) — L자 4개
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

function SpecSheet({ f, modelText, fileText, userName, today, fromId, currentStep, reviewing, onEdit, onBack, onSubmit, canSubmit }: {
  f: ReqForm; modelText: string; fileText: string; userName: string; today: string; fromId: string | null
  currentStep: number; reviewing: boolean; onEdit: (i: number) => void; onBack: () => void; onSubmit: () => void; canSubmit: boolean
}) {
  const reqFilled = [f.serviceName.trim(), f.team, f.reason.trim(), f.modelIds.length > 0, f.period].filter(Boolean).length
  const pct = Math.round((reqFilled / 5) * 100)
  const done = reqFilled === 5
  const docNo = `자원-${today.slice(0, 4)}-${today.slice(5, 7)}${today.slice(8, 10)}`
  return (
    <div data-morph="sheet" className="relative flex flex-col h-full" style={{ background: M.surface, border: `1px solid ${M.border}`, borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880, margin: '0 auto', transform: reviewing ? 'scale(1)' : 'scale(0.99)', transition: `box-shadow .6s ease, transform .8s ${MORPH_EASE}` }}>
      {/* 모서리 마크 */}
      <CornerMarks />
      {/* 워터마크(초안/검토) */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 132, fontWeight: 900, color: reviewing ? 'var(--c-warn)' : 'var(--c-accent)', opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{reviewing ? '검토' : '초안'}</span>
      </div>

      {/* 콘텐츠 (워터마크 위) */}
      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: `3px double ${M.border}`, background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>자원 신청 명세서</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${reviewing ? 'var(--c-warn)' : M.blue}`, color: reviewing ? 'var(--c-warn)' : M.blue, background: reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)', borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{reviewing ? '검토' : '초안'}</span>
          </div>
          {/* 문서번호 · 발급처 */}
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 13, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{docNo}</span></span>
            <span>발급 Anclave GPU 자원관리</span>
          </div>
          {/* 신청자 · 날짜 */}
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.value }}>{userName}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
            {fromId && <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: 13, background: 'var(--accent-soft)', color: M.blueText }}>재신청 {fromId}</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="flex items-center justify-between" style={{ fontSize: 13, color: M.help, marginBottom: 6 }}>
              <span>필수 항목</span>
              <span className="font-semibold" style={{ color: done ? 'var(--c-ok)' : M.blueText }}>{reqFilled} / 5</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: M.border, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--c-ok)' : M.blue, borderRadius: 2, transition: 'width .45s cubic-bezier(.4,0,.2,1), background .3s' }} />
            </div>
          </div>
        </div>

        {/* 명세서 본문 — 비고란이 남는 높이를 끝까지 채움 */}
        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '12px 18px' }}>
          <SpecSection title="기본 정보" index={0} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(0)}>
            <SpecRow label="신청자" value={userName} reviewing={reviewing} />
            <SpecRow label="서비스명" value={f.serviceName} reviewing={reviewing} pendingW="70%" />
            <SpecRow label="소속" value={f.team} reviewing={reviewing} pendingW="55%" />
            <SpecRow label="요청 사유" value={f.reason} reviewing={reviewing} pendingW="92%" last />
          </SpecSection>
          <SpecSection title="모델" index={1} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(1)}>
            <SpecRow label="선택 모델" value={modelText} reviewing={reviewing} pendingW="75%" last />
          </SpecSection>
          <SpecSection title="상세 설정" index={2} currentStep={currentStep} reviewing={reviewing} onEdit={() => onEdit(2)}>
            <SpecRow label="사용 기간" value={f.period} reviewing={reviewing} pendingW="40%" />
            <SpecRow label="희망 시작일" value={f.startDate} emptyText="미정" reviewing={reviewing} pendingW="42%" />
            <SpecRow label="우선순위" value={f.priority} reviewing={reviewing} pendingW="35%" />
            <SpecRow label="공개 여부" value={f.security} reviewing={reviewing} pendingW="38%" />
            <SpecRow label="예상 규모" value={f.scale} reviewing={reviewing} pendingW="38%" />
            <SpecRow label="파일 첨부" value={fileText} emptyText="첨부 없음" reviewing={reviewing} pendingW="60%" last />
          </SpecSection>
          {/* 비고 — 남는 높이를 끝까지 채움 */}
          <div className="flex flex-col flex-1 min-h-0" style={{ padding: '6px 12px', minHeight: 110 }}>
            <SectionHead title="비고" active={false} reviewing={reviewing} onEdit={() => onEdit(2)} />
            <div className="flex-1 min-h-0 rounded-[8px]" style={{ border: `1px dashed ${M.border}`, background: 'color-mix(in srgb, var(--c-muted) 5%, transparent)', padding: '11px 13px', overflow: 'auto' }}>
              {f.remark
                ? <p key="rmk" className="anim-fade" style={{ fontSize: 15, color: M.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.remark}</p>
                : <span style={{ fontSize: 14, color: M.idle }}>{reviewing ? '특이사항 없음' : '비고를 입력하면 여기에 표시됩니다'}</span>}
            </div>
          </div>
        </div>

        {/* 검토 모드 푸터 */}
        {reviewing && (
          <div className="shrink-0 anim-fade" style={{ borderTop: `1px solid ${M.border}`, padding: '12px 18px' }}>
            <p style={{ fontSize: 14, color: M.help, marginBottom: 10, lineHeight: 1.5 }}>제출 시 신청이 접수되며, 관리자 검토 후 자원이 할당됩니다.</p>
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

export function RequestNew() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user } = useRole()
  const [params] = useSearchParams()
  const fromId = params.get('from')

  const [step, setStep] = useState(0)
  const [f, setF] = useState<ReqForm>(() => prefillFrom(fromId))
  const [modelQ, setModelQ] = useState('')
  const [modelKind, setModelKind] = useState('전체')
  const [doneId, setDoneId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof ReqForm>(k: K, v: ReqForm[K]) => setF((p) => ({ ...p, [k]: v }))
  const toggleModel = (id: string) => setF((p) => ({ ...p, modelIds: p.modelIds.includes(id) ? p.modelIds.filter((x) => x !== id) : [...p.modelIds, id] }))

  const valid = [
    Boolean(f.serviceName.trim() && f.team && f.reason.trim()),
    f.modelIds.length > 0,
    Boolean(f.period && f.priority),
    true,
  ]
  const canNext = valid[step]
  const isLast = step === WIZARD_STEPS.length - 1
  const reviewing = step === 3 // 검토·제출 단계 = 멀티스텝 슬라이드아웃 + 명세서 센터
  const wizardStep = reviewing ? 2 : step // 슬라이드아웃 동안 직전(상세 설정) 내용 유지
  const go = (d: number) => setStep((s) => Math.max(0, Math.min(WIZARD_STEPS.length - 1, s + d)))

  // 신규 신청 — backend(/api/gpu-requests)로 POST. id·status·createdAt 은 서버 생성.
  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const created = await apiPost<{ id: string }>('/api/gpu-requests', {
        requesterUserId: user.id,
        capacity: 1,
        capacityUnit: 'card',
        models: f.modelIds,
        serviceName: f.serviceName.trim(),
        purpose: f.reason.trim(),
        attachmentUrl: f.files[0] ? `/docs/${f.files[0]}` : undefined,
        period: f.period,
        priority: PRIORITY_EN[f.priority] ?? 'normal',
        team: f.team || undefined,
        startDate: f.startDate || undefined,
        security: f.security,
        scale: f.scale,
        remark: f.remark.trim() || undefined,
      })
      setDoneId(created.id)
      toast.push('신규 자원 신청이 접수되었어요. (검토중)', 'ok')
    } catch {
      setSubmitting(false)
      toast.push('신청 제출에 실패했어요. 잠시 후 다시 시도해 주세요.', 'warn')
    }
  }
  const next = () => {
    if (!canNext) return
    if (isLast) void submit()
    else go(1)
  }

  const addFiles = (list: FileList | null | undefined) => {
    if (!list || !list.length) return
    const names = Array.from(list).map((x) => x.name)
    setF((p) => ({ ...p, files: [...p.files, ...names.filter((n) => !p.files.includes(n))] }))
  }
  const removeFile = (name: string) => setF((p) => ({ ...p, files: p.files.filter((x) => x !== name) }))

  // ── 제출 완료 화면 ──
  if (doneId) {
    return (
      <div className="anim-fade flex flex-col h-full" style={mutedFix}>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="bg-card2 border border-line rounded-[16px] flex flex-col items-center text-center" style={{ boxShadow: 'var(--shadow-card)', padding: '40px 44px', maxWidth: 480, width: '100%' }}>
            <span className="relative flex items-center justify-center rounded-full" style={{ width: 66, height: 66, background: 'var(--ok-soft)', color: 'var(--c-ok)' }}>
              <span className="absolute rounded-full" style={{ inset: 0, boxShadow: '0 0 0 6px var(--ok-soft)', opacity: 0.5 }} />
              <CheckCircleIcon style={{ width: 38, height: 38 }} />
            </span>
            <h2 className="font-bold text-text" style={{ fontSize: 20, marginTop: 18 }}>신청이 접수되었습니다</h2>
            <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
              관리자 검토 후 자원이 할당됩니다. 진행 상태는 신청 현황과 알림 센터에서 확인할 수 있어요.
            </p>
            {/* 신청번호 — 라벨·상태·복사로 맥락 부여(정체불명 코드처럼 보이지 않게) */}
            <div className="w-full rounded-[12px]" style={{ marginTop: 22, padding: '14px 16px', background: 'var(--c-soft)', border: '1px solid var(--c-border-s)' }}>
              <div className="flex items-center justify-center gap-1.5 text-muted" style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.2px' }}>
                신청번호
                <span className="rounded-[5px] font-semibold" style={{ fontSize: 11, padding: '1px 6px', background: 'var(--warn-soft)', color: 'var(--c-warn)' }}>검토 중</span>
              </div>
              <div className="flex items-center justify-center gap-2" style={{ marginTop: 7 }}>
                <span className="font-bold text-text" style={{ fontSize: 18, fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>{doneId}</span>
                <button
                  type="button"
                  aria-label="신청번호 복사"
                  onClick={() => { navigator.clipboard?.writeText(doneId).then(() => toast.push('신청번호를 복사했어요.', 'ok')).catch(() => {}) }}
                  className="flex items-center justify-center rounded-[7px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors"
                  style={{ width: 28, height: 28 }}
                >
                  <ClipboardDocumentIcon style={{ width: 15, height: 15 }} />
                </button>
              </div>
              <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 7 }}>
                이 번호로 신청 현황에서 진행 상태를 조회할 수 있어요.
              </div>
            </div>
            {/* 액션 — 현황 / 방금 신청 상세 */}
            <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
              <Button variant="outline" className="flex-1 justify-center" onClick={() => navigate('/requests/status')}>신청 현황으로</Button>
              <Button className="flex-1 justify-center" onClick={() => navigate(`/requests/status/${doneId}`)}>신청 상세 보기</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 모델 검색·필터(다중 선택)
  const list = models.filter((m) => {
    if (modelKind !== '전체' && m.kind !== modelKind) return false
    const s = modelQ.trim().toLowerCase()
    return !s || `${m.name} ${m.kind} ${m.params} ${m.description} ${m.recommendedGpu}`.toLowerCase().includes(s)
  })
  const selectedModels = models.filter((m) => f.modelIds.includes(m.id))
  const modelText = selectedModels.map((m) => m.name).join(', ')
  const fileText = f.files.join(', ')

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      {/* morph(좌 멀티스텝 → 우 명세서 센터)는 공간 전환을 전달하는 핵심 모션 →
          전역 reduced-motion(index.css의 transition-duration:0.001ms!important)을 이 요소들만 예외 처리. */}
      <style>{`[data-morph]{transition-duration:.8s !important}`}</style>
      {/* 1) 헤더 */}
      <header className="flex flex-col shrink-0">
        <StepBack to="/requests/status" label="자원 신청현황" />
        <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
          <h1 className="font-bold text-text" style={{ fontSize: 22, lineHeight: 1.2 }}>신규 자원 신청</h1>
          {fromId && (
            <span className="inline-flex items-center rounded-[6px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', padding: '3px 10px', fontSize: 14 }}>
              재신청 · {fromId}
            </span>
          )}
        </div>
        <p className="text-muted" style={{ fontSize: 14, marginTop: 6 }}>
          GPU 자원 신청서를 작성합니다. 단계는 순서대로만 진행할 수 있어요.
        </p>
      </header>

      {/* 2) 스텝퍼 */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '20px 28px 14px', marginTop: 18 }}>
        <Stepper current={step} />
      </section>

      {/* 3) morph 레이아웃 — 좌: 멀티스텝(검토 시 슬라이드아웃) / 우: 신청 명세서(검토 시 가운데로) */}
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 14 }}>
        {/* 좌: 멀티스텝 마법사 (minWidth:0 으로 width 트랜지션 활성) */}
        <div
          className="bg-card2 border border-line rounded-[14px] flex flex-col overflow-hidden"
          data-morph="wizard"
          aria-hidden={reviewing}
          style={{
            width: reviewing ? '0%' : '64%', flex: '0 0 auto', minWidth: 0,
            boxShadow: 'var(--shadow-card)',
            opacity: reviewing ? 0 : 1,
            transform: reviewing ? 'translateX(-56px)' : 'none',
            pointerEvents: reviewing ? 'none' : 'auto',
            transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}`,
          }}
        >
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ padding: '22px 26px' }}>
            {wizardStep === 0 && (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 20 }}>기본 정보를 입력해주세요.</h3>
                <FieldLabel text="서비스명" required help="서비스를 식별할 수 있는 이름을 입력해주세요." />
                <div className="relative shrink-0" style={{ marginBottom: 22 }}>
                  <input value={f.serviceName} maxLength={50} onChange={(e) => set('serviceName', e.target.value)} placeholder="예: 고객 챗봇 서비스" style={inputBase} />
                  <span className="absolute" style={{ right: 14, top: 15, fontSize: 12, color: M.meta }}>{f.serviceName.length}/50</span>
                </div>
                <FieldLabel text="소속 팀/부서" required help="조직도에서 본인 소속을 선택해주세요." />
                <div className="shrink-0" style={{ marginBottom: 22 }}>
                  <OrgSelect value={f.team} onChange={(v) => set('team', v)} />
                </div>
                <FieldLabel text="요청자" />
                <input readOnly value={`${user.name} (${user.email})`} className="shrink-0" style={{ ...inputBase, color: M.value, marginBottom: 22, cursor: 'default' }} />
                <FieldLabel text="요청 사유" required help="자원 요청 목적과 사용 계획을 입력해주세요." />
                <div className="relative flex-1 min-h-0" style={{ minHeight: 120 }}>
                  <textarea
                    value={f.reason}
                    maxLength={300}
                    onChange={(e) => set('reason', e.target.value)}
                    placeholder="예: 고객 상담 자동화를 위한 LLM 추론 서비스 운영"
                    style={{ ...inputBase, height: '100%', padding: '14px', resize: 'none', lineHeight: 1.5 }}
                  />
                  <span className="absolute" style={{ right: 14, bottom: 12, fontSize: 12, color: M.meta }}>{f.reason.length}/300</span>
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 6 }}>사용할 모델을 선택해주세요.</h3>
                <p className="shrink-0" style={{ fontSize: 13, color: M.help, marginBottom: 14 }}>여러 개를 선택할 수 있어요. (총 {models.length}개)</p>
                {/* 검색 */}
                <div className="relative shrink-0" style={{ marginBottom: 10 }}>
                  <MagnifyingGlassIcon className="absolute" style={{ left: 14, top: 13, width: 16, height: 16, color: M.idle }} />
                  <input value={modelQ} onChange={(e) => setModelQ(e.target.value)} placeholder="모델명, 종류, 권장 GPU 검색 (예: Llama, Code, H100)" style={{ ...inputBase, height: 42, paddingLeft: 40 }} />
                </div>
                {/* 종류 필터 칩 */}
                <div className="flex items-center gap-2 flex-wrap shrink-0" style={{ marginBottom: 12 }}>
                  {MODEL_KINDS.map((k) => {
                    const on = modelKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setModelKind(k)}
                        className="rounded-full font-medium transition-colors"
                        style={{ fontSize: 12.5, padding: '4px 12px', background: on ? M.blue : M.inputBg, color: on ? M.onAccent : M.value, border: `1px solid ${on ? M.blue : M.border}` }}
                      >
                        {k}
                      </button>
                    )
                  })}
                </div>
                {/* 모델 그리드 — 남는 높이 채우고 스크롤 */}
                <div className="flex-1 min-h-0 overflow-auto" style={{ marginRight: -6, paddingRight: 6 }}>
                  <div className="flex flex-col" style={{ gap: 10 }}>
                    {list.map((m) => (
                      <ModelCard key={m.id} m={m} active={f.modelIds.includes(m.id)} onClick={() => toggleModel(m.id)} />
                    ))}
                  </div>
                  {list.length === 0 && <div className="text-center" style={{ fontSize: 14, color: M.help, padding: '32px 0' }}>검색 결과가 없어요.</div>}
                </div>
                {/* 선택 개수 */}
                <div className="shrink-0 flex items-center justify-between" style={{ marginTop: 10, fontSize: 13, color: M.help }}>
                  <span>{f.modelIds.length ? `${f.modelIds.length}개 모델 선택됨` : '아직 선택한 모델이 없어요'}</span>
                  {f.modelIds.length > 0 && (
                    <button type="button" onClick={() => set('modelIds', [])} className="hover:underline" style={{ color: M.blueText }}>선택 해제</button>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="font-semibold shrink-0" style={{ fontSize: 15, color: M.text, marginBottom: 18 }}>세부 운영 조건을 설정해주세요.</h3>
                {/* 사용 기간 + 희망 시작일 */}
                <div className="grid grid-cols-2" style={{ gap: 18, marginBottom: 24 }}>
                  <div>
                    <FieldLabel text="사용 기간" required />
                    <div className="grid grid-cols-2" style={{ gap: 10 }}>
                      {PERIOD_OPTS.map((p) => <SelectCard key={p} label={p} active={f.period === p} onClick={() => set('period', p)} />)}
                    </div>
                  </div>
                  <div>
                    <FieldLabel text="희망 시작일" help="자원이 필요한 시점을 알려주세요. (선택)" />
                    <div className="relative">
                      <CalendarDaysIcon className="absolute pointer-events-none" style={{ left: 14, top: 14, width: 16, height: 16, color: M.idle }} />
                      <input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} style={{ ...inputBase, paddingLeft: 40, colorScheme: 'inherit' }} />
                    </div>
                  </div>
                </div>
                <FieldLabel text="우선순위" required />
                <div className="grid grid-cols-3" style={{ gap: 10, marginBottom: 24 }}>
                  {PRIORITY_OPTS.map((p) => <SelectCard key={p} label={p} active={f.priority === p} onClick={() => set('priority', p)} />)}
                </div>
                <FieldLabel text="공개 여부" required help="서비스를 마켓플레이스에 공개할지 선택해주세요." />
                <div className="grid grid-cols-2" style={{ gap: 10, marginBottom: 24 }}>
                  {SECURITY_OPTS.map((o) => <SelectCard key={o.v} label={o.v} sub={o.desc} active={f.security === o.v} onClick={() => set('security', o.v)} />)}
                </div>
                <FieldLabel text="예상 규모" required help="예상 운영 트래픽 규모입니다. 관리자의 자원 산정에 참고됩니다." />
                <div className="grid grid-cols-3" style={{ gap: 10, marginBottom: 24 }}>
                  {SCALE_OPTS.map((o) => <SelectCard key={o.v} label={o.v} sub={o.desc} active={f.scale === o.v} onClick={() => set('scale', o.v)} />)}
                </div>
                {/* 파일 첨부 + 비고 — 남는 높이를 끝까지 채움 */}
                <div className="grid grid-cols-2 flex-1 min-h-0" style={{ gap: 18 }}>
                  {/* 파일 첨부 */}
                  <div className="flex flex-col min-h-0">
                    <FieldLabel text="파일 첨부" help="결재 공문이나 기타 참고 문서 파일을 첨부할 수 있어요. (선택)" />
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                      className="flex flex-col items-center justify-center rounded-[10px] cursor-pointer transition-colors flex-1 min-h-0"
                      style={{ minHeight: 110, border: `1.5px dashed ${f.files.length ? M.blue : M.border}`, background: f.files.length ? M.activeBg : M.inputBg, padding: '14px' }}
                    >
                      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                      <DocumentArrowUpIcon style={{ width: 28, height: 28, color: f.files.length ? M.blue : M.idle }} />
                      <span className="font-medium text-center" style={{ fontSize: 14, color: M.text, marginTop: 10 }}>파일을 끌어다 놓거나 클릭해 선택</span>
                      <span className="text-center" style={{ fontSize: 13, color: M.help, marginTop: 4 }}>결재 공문 · 기타 문서 (여러 개 가능)</span>
                    </div>
                    {f.files.length > 0 && (
                      <div className="flex flex-col shrink-0" style={{ gap: 8, marginTop: 12, maxHeight: 120, overflowY: 'auto' }}>
                        {f.files.map((name) => (
                          <div key={name} className="flex items-center gap-2.5 rounded-[8px]" style={{ background: M.inputBg, border: `1px solid ${M.border}`, padding: '8px 12px' }}>
                            <DocumentArrowUpIcon className="shrink-0" style={{ width: 16, height: 16, color: M.idle }} />
                            <span className="flex-1 min-w-0 truncate font-medium" style={{ fontSize: 14, color: M.text }}>{name}</span>
                            <button type="button" onClick={() => removeFile(name)} className="shrink-0 flex items-center justify-center rounded-md transition-transform active:scale-90 hover:opacity-70" style={{ width: 22, height: 22, color: M.idle }} aria-label="첨부 제거">
                              <XMarkIcon style={{ width: 15, height: 15 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 비고 */}
                  <div className="flex flex-col min-h-0">
                    <FieldLabel text="비고" help="추가로 전달할 내용이 있으면 적어주세요. (선택)" />
                    <div className="relative flex-1 min-h-0">
                      <textarea
                        value={f.remark}
                        maxLength={200}
                        onChange={(e) => set('remark', e.target.value)}
                        placeholder="예: 기존 서비스에서 마이그레이션 예정, 야간 배치 위주 사용"
                        style={{ ...inputBase, height: '100%', minHeight: 110, padding: '14px', resize: 'none', lineHeight: 1.5 }}
                      />
                      <span className="absolute" style={{ right: 14, bottom: 12, fontSize: 12, color: M.meta }}>{f.remark.length}/200</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 좌 하단 고정 바 */}
          <div className="flex items-center justify-between shrink-0" style={{ borderTop: '1px solid var(--c-border)', padding: '14px 26px' }}>
            {step === 0
              ? <Button variant="ghost" onClick={() => navigate('/requests/status')}>목록</Button>
              : <Button variant="ghost" onClick={() => go(-1)}>이전</Button>}
            <div className="flex items-center gap-3">
              {!canNext && (
                <span className="text-muted" style={{ fontSize: 14 }}>필수 항목을 입력하면 진행할 수 있어요.</span>
              )}
              <Button onClick={next} disabled={!canNext}>{step === 2 ? '검토하기' : '다음'}</Button>
            </div>
          </div>
        </div>

        {/* 우: 신청 명세서 — 검토 시 100%로 확장되며 가운데(maxWidth 720)로 */}
        <div data-morph="spec" style={{ width: reviewing ? '100%' : '36%', flex: '0 0 auto', minWidth: 0, paddingLeft: reviewing ? 0 : 16, transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}` }}>
          <SpecSheet
            f={f}
            modelText={modelText}
            fileText={fileText}
            userName={user.name}
            today={fmtNow().slice(0, 10)}
            fromId={fromId}
            currentStep={step}
            reviewing={reviewing}
            onEdit={(i) => setStep(i)}
            onBack={() => setStep(2)}
            onSubmit={submit}
            canSubmit={valid[0] && valid[1] && valid[2] && !submitting}
          />
        </div>
      </div>
    </div>
  )
}

import type { CSSProperties, ReactNode } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'

// 4.14 모델 신청/반입 마법사 공용 프리미티브 — g2 request-new 의 좌우+morph 비주얼 체계 통일.
// 기존 토큰·컴포넌트만(새 색·라이브러리 금지). model-import / model-request-new 양쪽이 공유.

// morph 모션 — 천천히 부드럽게(스르륵). easeInOut으로 가감속 고르게.
export const MORPH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'

// 폼 토큰 — 보조 텍스트는 본문색 반투명으로 테마 자동 적응.
export const M = {
  surface: 'var(--c-card2)',
  text: 'var(--c-text)',
  label: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  ph: 'color-mix(in srgb, var(--c-text) 62%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  req: 'var(--c-danger)',
  inputBg: 'var(--c-bg)',
  border: 'var(--c-border)',
  blue: 'var(--c-accent)',
  blueText: 'var(--c-accent)',
  onAccent: 'var(--c-onaccent)',
  activeBg: 'var(--accent-soft)',
  value: 'var(--c-text)',
} as const

export const inputBase: CSSProperties = {
  height: 44,
  width: '100%',
  background: M.inputBg,
  border: `1px solid ${M.border}`,
  borderRadius: 8,
  padding: '0 14px',
  fontSize: 14,
  color: M.text,
  outline: 'none',
}

export function FieldLabel({ text, required, help }: { text: string; required?: boolean; help?: string }) {
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

// 세그먼트/토글 선택 카드.
export function SelectCard({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-[8px] transition-colors text-left w-full"
      style={{
        minHeight: 44,
        padding: '10px 14px',
        background: active ? M.activeBg : M.inputBg,
        border: `1px solid ${active ? M.blue : M.border}`,
        color: active ? M.text : M.value,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
      }}
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sub && <span className="block font-normal truncate" style={{ fontSize: 14, color: M.help, marginTop: 2 }}>{sub}</span>}
      </span>
      {active && <CheckIcon className="shrink-0" style={{ width: 16, height: 16, color: M.blue }} />}
    </button>
  )
}

// 상단 stepper — 현재 단계 액센트 · 완료 체크.
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-start justify-center">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        const isLast = i === steps.length - 1
        return (
          <div key={s} className={isLast ? 'flex items-start' : 'flex items-start flex-1'} style={{ maxWidth: isLast ? undefined : 220 }}>
            <div className="flex flex-col items-center" style={{ width: 104 }}>
              <span
                className="flex items-center justify-center rounded-full font-semibold"
                style={{
                  width: 30,
                  height: 30,
                  fontSize: 14,
                  background: done || active ? M.blue : 'transparent',
                  border: done || active ? 'none' : `1.5px solid ${M.border}`,
                  color: done || active ? M.onAccent : M.idle,
                }}
              >
                {done ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-medium whitespace-nowrap text-center" style={{ fontSize: 14, marginTop: 8, color: done || active ? M.blueText : M.idle }}>
                {s}
              </span>
            </div>
            {!isLast && <span style={{ flex: 1, height: 2, marginTop: 14, background: done ? M.blue : M.border, borderRadius: 1 }} />}
          </div>
        )
      })}
    </div>
  )
}

// 빗금 placeholder — 명세서 미입력 칸.
export function Pending({ w = '60%' }: { w?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: w,
        height: 16,
        borderRadius: 3,
        background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--c-muted) 32%, transparent) 0 1px, transparent 1px 6px)',
        border: '1px dashed var(--c-border)',
      }}
    />
  )
}

// 모서리 등록 마크(스캔/인쇄 문서 느낌) — L자 4개.
export function CornerMarks() {
  const c = 'color-mix(in srgb, var(--c-muted) 45%, transparent)'
  const base: CSSProperties = { position: 'absolute', width: 11, height: 11, zIndex: 2, pointerEvents: 'none' }
  return (
    <>
      <span style={{ ...base, top: 9, left: 9, borderTop: `1.5px solid ${c}`, borderLeft: `1.5px solid ${c}` }} />
      <span style={{ ...base, top: 9, right: 9, borderTop: `1.5px solid ${c}`, borderRight: `1.5px solid ${c}` }} />
      <span style={{ ...base, bottom: 9, left: 9, borderBottom: `1.5px solid ${c}`, borderLeft: `1.5px solid ${c}` }} />
      <span style={{ ...base, bottom: 9, right: 9, borderBottom: `1.5px solid ${c}`, borderRight: `1.5px solid ${c}` }} />
    </>
  )
}

// 모델 프로필 — 업로드 이미지(dataURL) 있으면 표시, 없으면 이니셜 플레이스홀더(테마 토큰).
function initials(name: string): string {
  const t = name.trim()
  if (!t) return 'M'
  const parts = t.split(/[\s_-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}
export function ModelAvatar({ name, img, size = 44 }: { name: string; img?: string; size?: number }) {
  const radius = Math.round(size * 0.27)
  if (img) {
    return <img src={img} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', display: 'block', flexShrink: 0 }} />
  }
  return (
    <span
      className="flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--accent-soft)',
        color: 'var(--c-accent)',
        fontSize: size * 0.36,
        letterSpacing: '-0.5px',
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

// 명세서 섹션 헤더 — g2 동일: 제목 + 가는 구분선 + (검토 시 "수정" / 편집 중 "입력 중").
export function SectionHead({ title, active, reviewing, onEdit }: { title: string; active: boolean; reviewing: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
      <span className="font-bold shrink-0" style={{ fontSize: 14, color: active ? M.blueText : M.text }}>{title}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
      {reviewing
        ? onEdit && <button type="button" onClick={onEdit} className="font-medium hover:underline shrink-0" style={{ fontSize: 14, color: M.blueText }}>수정</button>
        : active && <span className="font-semibold shrink-0" style={{ fontSize: 14, color: M.blueText }}>입력 중</span>}
    </div>
  )
}

// 명세서 절(節) — g2 동일: 편집 중 현재 절은 accent-soft 배경으로 강조(.35s transition).
export function SpecSection({ title, active, reviewing, onEdit, children }: { title: string; active: boolean; reviewing: boolean; onEdit?: () => void; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10, borderRadius: 10, padding: '6px 12px', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'background .35s ease' }}>
      <SectionHead title={title} active={active} reviewing={reviewing} onEdit={onEdit} />
      {children}
    </div>
  )
}

// 좌(멀티스텝) → 우(명세서 센터) morph 레이아웃. 검토 시 좌 슬라이드아웃 + 우 100% 센터.
export function MorphFrame({
  reviewing,
  wizardWidth = '64%',
  wizard,
  sheet,
}: {
  reviewing: boolean
  wizardWidth?: string
  wizard: ReactNode
  sheet: ReactNode
}) {
  return (
    <div className="flex-1 min-h-0 flex" style={{ marginTop: 14 }}>
      {/* morph 는 공간 전환의 핵심 모션 → 전역 reduced-motion 예외 처리(이 요소만). */}
      <style>{`[data-morph]{transition-duration:.8s !important}`}</style>
      <div
        data-morph="wizard"
        aria-hidden={reviewing}
        className="flex flex-col overflow-hidden"
        style={{
          width: reviewing ? '0%' : wizardWidth,
          flex: '0 0 auto',
          minWidth: 0,
          opacity: reviewing ? 0 : 1,
          transform: reviewing ? 'translateX(-56px)' : 'none',
          pointerEvents: reviewing ? 'none' : 'auto',
          transition: `width .8s ${MORPH_EASE}, opacity .6s ease, transform .8s ${MORPH_EASE}`,
        }}
      >
        {wizard}
      </div>
      <div
        data-morph="spec"
        style={{
          width: reviewing ? '100%' : `calc(100% - ${wizardWidth})`,
          flex: '0 0 auto',
          minWidth: 0,
          paddingLeft: reviewing ? 0 : 16,
          transition: `width .8s ${MORPH_EASE}, padding .8s ${MORPH_EASE}`,
        }}
      >
        {sheet}
      </div>
    </div>
  )
}

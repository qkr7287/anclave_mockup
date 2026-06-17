import type { ReactNode } from 'react'
import type { RequestItem } from './requests-shared'
import { useUserLookup, useModelLookup } from './db-lookups'

// 읽기전용 "자원 신청 명세서" — 신규 신청(4.6b)의 명세서와 동일한 룩.
// 신청 상세(4.6a)에서 제출된 신청을 문서 형태로 보여준다.

const M = {
  text: 'var(--c-text)',
  help: 'color-mix(in srgb, var(--c-text) 68%, transparent)',
  meta: 'color-mix(in srgb, var(--c-text) 64%, transparent)',
  idle: 'color-mix(in srgb, var(--c-text) 66%, transparent)',
  border: 'var(--c-border)', value: 'var(--c-text)',
}
const PRIORITY_KR: Record<string, string> = { low: '낮음', normal: '보통', high: '높음' }

// 라벨-값 행(읽기전용) — 값 없으면 '—'
function Row({ label, value, last }: { label: string; value?: ReactNode; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 92, fontSize: 15, color: M.help, lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 font-medium" style={{ fontSize: 15, color: empty ? M.idle : M.text, lineHeight: 1.45, wordBreak: 'break-word' }}>{empty ? '—' : value}</div>
    </div>
  )
}

// 섹션 헤더 — 제목 + 가는 구분선
function Head({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
      <span className="font-bold shrink-0" style={{ fontSize: 15, color: M.text }}>{title}</span>
      <span className="flex-1" style={{ height: 1, background: 'var(--c-border)' }} />
    </div>
  )
}

// 모서리 등록 마크(스캔/인쇄 문서 느낌)
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

// 상태 → 스탬프/워터마크
const STAMP: Record<RequestItem['status'], { label: string; color: string; soft: string }> = {
  pending: { label: '대기', color: 'var(--c-warn)', soft: 'var(--warn-soft)' },
  approved: { label: '승인', color: 'var(--c-ok)', soft: 'var(--ok-soft)' },
  rejected: { label: '반려', color: 'var(--c-danger)', soft: 'var(--danger-soft)' },
}

export function RequestSpec({ item }: { item: RequestItem }) {
  const userLk = useUserLookup()
  const modelLk = useModelLookup()
  const rDept = userLk.dept(item.requesterUserId)
  const reqName = `${userLk.name(item.requesterUserId) ?? item.requesterUserId}${rDept ? ` · ${rDept}` : ''}`
  const modelText = item.models.map((mid) => modelLk(mid) ?? mid).join(', ')
  const unitLabel = item.capacityUnit === 'slice' ? 'MIG 슬라이스' : 'GPU 카드'
  const fileName = item.attachmentUrl?.split('/').pop()
  const st = STAMP[item.status] ?? STAMP.pending

  return (
    <div className="relative bg-card2 border border-line rounded-[14px] overflow-hidden flex flex-col h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
      <CornerMarks />
      {/* 워터마크(상태) */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 132, fontWeight: 900, color: st.color, opacity: 0.05, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{st.label}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: `3px double ${M.border}`, background: `linear-gradient(180deg, ${st.soft}, transparent)` }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: M.text }}>자원 신청 명세서</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${st.color}`, color: st.color, background: st.soft, borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{st.label}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 14, color: M.help }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: M.meta }}>{item.id}</span></span>
            <span>발급 Anclave GPU 자원관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: M.meta }}>
            <span className="font-medium" style={{ color: M.value }}>{reqName}</span>
            <span>·</span>
            <span>신청일 {item.createdAt}</span>
          </div>
        </div>

        {/* 본문 — 비고가 남는 높이를 채움 */}
        <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '12px 18px 16px' }}>
          <div style={{ marginBottom: 14, padding: '0 4px' }}>
            <Head title="기본 정보" />
            <Row label="신청자" value={reqName} />
            <Row label="서비스명" value={item.serviceName} />
            <Row label="소속" value={item.team} />
            <Row label="요청 사유" value={item.purpose} last />
          </div>
          <div style={{ marginBottom: 14, padding: '0 4px' }}>
            <Head title="모델 · 자원" />
            <Row label="선택 모델" value={modelText} />
            <Row label="요청 자원" value={`${item.capacity} ${unitLabel}`} last />
          </div>
          <div style={{ marginBottom: 14, padding: '0 4px' }}>
            <Head title="상세 설정" />
            <Row label="사용 기간" value={item.period} />
            <Row label="희망 시작일" value={item.startDate} />
            <Row label="우선순위" value={PRIORITY_KR[item.priority ?? 'normal']} />
            <Row label="공개 여부" value={item.security} />
            <Row label="예상 규모" value={item.scale} />
            <Row label="파일 첨부" value={fileName} last />
          </div>
          <div className="flex flex-col flex-1 min-h-0" style={{ padding: '0 4px' }}>
            <Head title="비고" />
            <div className="flex-1 min-h-0 rounded-[8px]" style={{ border: `1px dashed ${M.border}`, background: 'color-mix(in srgb, var(--c-muted) 5%, transparent)', padding: '11px 13px', marginTop: 2, minHeight: 64 }}>
              <p style={{ fontSize: 15, color: item.remark ? M.text : M.idle, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.remark || '특이사항 없음'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

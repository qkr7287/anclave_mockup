import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  MegaphoneIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button, EmptyState, Modal, StatusBadge, useToast } from '../components/ui'
import { useTheme } from '../lib/theme'
import { useRole } from '../lib/role'
import { modelById, services, userById } from '../data'
import {
  approvePublishRequest,
  deletePublishRequest,
  getPublishRequest,
  rejectPublishRequest,
  type PubRecord,
} from './publish-store'

// 4.9a 게시 승인 심사 (/admin/approvals/publish/:id) — 4.9 게시 승인 관리의 페이지 승격.
// GPU 심사(4.10a)의 명세서·완료 영수증 디자인을 이식하되, 게시 승인은 이진 결정이라 단일 컬럼.
// pending = 명세서 + 처리 메모 + 승인/반려 푸터 / 처리 완료 = 1컬럼 조회. 상태는 publish-store 세션 사본.

const REJECT_REASON_MIN = 5

// 다크 테마 muted 톤 보정 — 4.6/4.10과 동일.
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

function PolishCss() {
  return (
    <style>{`
      [data-pubdetail]{user-select:none;-webkit-user-select:none}
      [data-pubdetail] button:not(:disabled),[data-pubdetail] a,[data-pubdetail] select{cursor:pointer}
      [data-pubdetail] button:disabled{cursor:not-allowed}
      [data-pubdetail] input,[data-pubdetail] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
    `}</style>
  )
}

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

// ── 명세서 프리미티브 (GPU 심사 SpecSheet 톤 이식) ──
function SpecRow({ label, value, last, emptyText }: { label: string; value?: ReactNode; last?: boolean; emptyText?: string }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 96, fontSize: 15, color: 'var(--c-muted)', lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0 flex items-center" style={{ minHeight: 23 }}>
        {empty
          ? <span style={{ fontSize: 15, color: 'var(--c-muted)' }}>{emptyText ?? '—'}</span>
          : <span className="anim-fade font-medium" style={{ fontSize: 15, color: 'var(--c-text)', lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</span>}
      </div>
    </div>
  )
}

function SpecSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, padding: '6px 12px' }}>
      <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
        <span className="font-bold shrink-0" style={{ fontSize: 15, color: 'var(--c-text)' }}>{title}</span>
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

// 게시 신청 → 표시 메타(종류·모델·서비스 정보). 4.9 목록 pubRow와 동일 규칙.
function deriveMeta(req: PubRecord) {
  const u = userById(req.requesterUserId)
  const svc = services.find((s) => s.name === req.serviceName)
  const [metaKind, metaModel] = (req.meta || '').split('·').map((s) => s.trim())
  const kind = svc?.kind ?? metaKind ?? '서비스'
  const model = svc ? (modelById(svc.model)?.name ?? metaModel ?? '—') : (metaModel ?? '—')
  return {
    name: u?.name ?? req.requesterUserId,
    department: u?.department ?? '미지정',
    email: u?.email,
    kind,
    model,
    hasApi: svc?.hasApi ?? false,
    tags: svc?.tags ?? [],
    usage: svc?.usageCount ?? 0,
    usageRank: svc?.usageRank ?? 0,
    intro: svc?.description ?? '',
  }
}

function UrlValue({ url, onCopy }: { url: string; onCopy: (url: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
      <span className="truncate" style={{ color: 'var(--c-accent)' }}>{url}</span>
      <button type="button" onClick={() => onCopy(url)} aria-label="URL 복사" className="shrink-0 text-muted hover:text-text transition-transform active:scale-90">
        <ClipboardDocumentCheckIcon style={{ width: 14, height: 14 }} />
      </button>
    </span>
  )
}

// 신청 명세서 — 게시 신청 정보 + 서비스 정보 + (처리 완료 시) 처리 결과. 검토 시 푸터(메모·승인/반려).
function PublishSpec({ req, reviewing, onCopy, footer }: { req: PubRecord; reviewing: boolean; onCopy: (url: string) => void; footer?: ReactNode }) {
  const m = deriveMeta(req)
  const today = req.createdAt.slice(0, 10)
  const docNo = `ANC-PR-${req.id.toUpperCase()}`
  const approved = req.status === 'approved'
  const rejected = req.status === 'rejected'
  const processed = approved || rejected
  const accent = reviewing ? 'var(--c-warn)' : 'var(--c-accent)'
  const stamp = approved ? 'var(--c-ok)' : rejected ? 'var(--c-danger)' : accent
  const stampLabel = approved ? '승인' : rejected ? '반려' : reviewing ? '검토' : '심사중'
  const stampBg = approved ? 'var(--ok-soft)' : rejected ? 'var(--danger-soft)' : reviewing ? 'var(--warn-soft)' : 'var(--accent-soft)'
  return (
    <div className="relative flex flex-col h-full mx-auto" style={{ background: 'var(--c-card2)', border: '1px solid var(--c-border)', borderRadius: 14, boxShadow: reviewing ? 'var(--shadow-pop)' : 'var(--shadow-card)', overflow: 'hidden', width: '100%', maxWidth: 880 }}>
      <CornerMarks />
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        <span style={{ fontSize: 128, fontWeight: 900, color: stamp, opacity: 0.055, transform: 'rotate(-20deg)', letterSpacing: '0.14em', whiteSpace: 'nowrap', userSelect: 'none' }}>{approved ? '승인' : rejected ? '반려' : '심사'}</span>
      </div>

      <div className="relative flex flex-col h-full min-h-0" style={{ zIndex: 1 }}>
        {/* 레터헤드 */}
        <div className="shrink-0" style={{ padding: '15px 18px 12px', borderBottom: '3px double var(--c-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0" style={{ fontSize: 18, color: 'var(--c-text)' }}>서비스 게시 신청서 · 심사</h3>
            <span className="shrink-0 font-bold" style={{ alignSelf: 'flex-start', transform: 'rotate(-5deg)', border: `1.5px solid ${stamp}`, color: stamp, background: stampBg, borderRadius: 6, padding: '3px 10px', fontSize: 14 }}>{stampLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 8, fontSize: 14, color: 'var(--c-muted)' }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{docNo}</span></span>
            <span>발급 Anclave 마켓플레이스</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: 'var(--c-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--c-text)' }}>{m.name}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{today}</span>
            <span className="rounded-[5px] font-medium" style={{ marginLeft: 2, padding: '1px 8px', fontSize: 14, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>{req.id.toUpperCase()}</span>
          </div>
        </div>

        {/* 본문 */}
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-auto" style={{ padding: '12px 18px' }}>
            <SpecSection title="신청 정보">
              <SpecRow label="신청자" value={`${m.name} · ${m.department}`} />
              <SpecRow label="이메일" value={m.email} emptyText="미등록" />
              <SpecRow label="서비스명" value={req.serviceName} />
              <SpecRow label="게시 사유" value={`${m.kind} 서비스를 마켓플레이스에 노출(게시)하기 위한 승인 요청`} last />
            </SpecSection>

            <SpecSection title="서비스 정보">
              <SpecRow label="종류 / 모델" value={`${m.kind} · ${m.model}`} />
              <SpecRow label="API 제공" value={m.hasApi ? '예 (REST API)' : '아니오 (웹 UI)'} />
              <SpecRow label="태그" value={m.tags.length ? m.tags.join(', ') : undefined} emptyText="없음" />
              <SpecRow label="누적 호출" value={m.usage ? `${m.usage.toLocaleString('en-US')}회${m.usageRank ? ` · 사용 ${m.usageRank}위` : ''}` : '신규 서비스'} />
              <SpecRow label="소개" value={m.intro || undefined} emptyText="소개 미등록" />
              <SpecRow label="서비스 URL" value={<UrlValue url={req.serviceUrl} onCopy={onCopy} />} />
              <SpecRow label="데모 URL" value={<UrlValue url={req.demoUrl} onCopy={onCopy} />} last />
            </SpecSection>

            {processed && (
              <SpecSection title="처리 결과" action={<span className="shrink-0 inline-flex"><StatusBadge status={req.status} /></span>}>
                {approved
                  ? <SpecRow label="게시" value="마켓플레이스 노출 완료" />
                  : <SpecRow label="반려 사유" value={req.rejectReason ? <span style={{ color: 'var(--c-danger)' }}>{req.rejectReason}</span> : undefined} emptyText="사유 미기재" />}
                <SpecRow label="처리자" value={req.processedBy ? (userById(req.processedBy)?.name ?? req.processedBy) : undefined} emptyText="—" />
                <SpecRow label="처리일시" value={req.processedAt} emptyText="—" />
                <SpecRow label="처리 메모" value={req.adminMemo} emptyText="메모 없음" last />
              </SpecSection>
            )}
          </div>
          <div aria-hidden className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: 56, background: 'linear-gradient(to bottom, transparent, var(--c-card2))' }} />
        </div>

        {footer}
      </div>
    </div>
  )
}

interface DoneState { mode: 'approved' | 'rejected'; detail: string; processedAt: string }

// 처리 완료 화면 — 명세서 테마의 "처리 접수증"(도장 seal + 천공 stub). GPU 심사 Completion 이식.
function Completion({ done, reqId, requesterName, processorName, serviceName, onList, onMarket, mutedFix }: {
  done: DoneState; reqId: string; requesterName: string; processorName: string; serviceName: string
  onList: () => void; onMarket?: () => void; mutedFix?: React.CSSProperties
}) {
  const ok = done.mode === 'approved'
  const accent = ok ? 'var(--c-ok)' : 'var(--c-danger)'
  const soft = ok ? 'var(--ok-soft)' : 'var(--danger-soft)'
  const Stub = ({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) => (
    <div className="flex items-start gap-3" style={{ padding: '7px 0', borderTop: '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0 text-muted" style={{ width: 68, fontSize: 14 }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium text-text" style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v}</span>
    </div>
  )
  return (
    <div data-pubdetail className="anim-fade flex flex-col h-full items-center justify-center" style={{ ...mutedFix, padding: 24 }}>
      <PolishCss />
      <div className="relative bg-card2 border border-line overflow-hidden stagger" style={{ borderRadius: 16, maxWidth: 464, width: '100%', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))` }} />
        <CornerMarks />
        <div className="flex flex-col items-center text-center" style={{ padding: '32px 38px 30px' }}>
          <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
            <span className="absolute rounded-full" style={{ inset: 2, border: `2px dashed ${accent}`, opacity: 0.45, transform: 'rotate(-12deg)' }} />
            <span className="flex items-center justify-center rounded-full" style={{ width: 72, height: 72, background: soft, color: accent, boxShadow: `0 0 0 6px color-mix(in srgb, ${accent} 9%, transparent)` }}>
              {ok ? <CheckCircleIcon style={{ width: 40, height: 40 }} /> : <XCircleIcon style={{ width: 40, height: 40 }} />}
            </span>
          </div>
          <span className="font-bold" style={{ fontSize: 14, letterSpacing: '0.14em', color: accent, marginTop: 16, fontFamily: 'var(--font-mono)' }}>{ok ? 'APPROVED' : 'REJECTED'}</span>
          <h2 className="font-bold text-text" style={{ fontSize: 21, marginTop: 5, letterSpacing: '-0.3px' }}>{ok ? '게시를 승인했습니다' : '게시를 반려했습니다'}</h2>
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
            {ok ? `${requesterName}님께 알림이 전송되고 마켓플레이스에 노출됩니다.` : `${requesterName}님께 반려 사유가 알림으로 전송되었어요.`}
          </p>
          <div className="w-full text-left rounded-[10px]" style={{ border: '1px dashed var(--c-border)', background: 'var(--c-card)', padding: '4px 14px 11px', marginTop: 20 }}>
            <Stub k="신청번호" v={reqId.toUpperCase()} mono />
            <Stub k="서비스" v={serviceName} />
            <Stub k={ok ? '게시' : '반려 사유'} v={done.detail} />
            <Stub k="처리" v={`${processorName} · ${done.processedAt}`} />
          </div>
          <div className="flex w-full" style={{ gap: 10, marginTop: 22 }}>
            {ok && onMarket && <Button variant="outline" onClick={onMarket} className="flex-1 justify-center">마켓플레이스로</Button>}
            <Button onClick={onList} className="flex-1 justify-center">게시 승인 관리 목록으로</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 대기 건 심사 — 명세서 + 처리 메모 + 승인/반려 푸터 → 완료 영수증.
function PendingReview({ req }: { req: PubRecord }) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user: admin } = useRole()
  const m = deriveMeta(req)

  const [memo, setMemo] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [done, setDone] = useState<DoneState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reasonOk = rejectReason.trim().length >= REJECT_REASON_MIN
  const processorName = `${admin.name}${admin.department ? ` · ${admin.department}` : ''}`

  const copyUrl = (url: string) => {
    const p = navigator.clipboard?.writeText(url)
    if (p) p.then(() => toast.push('URL을 복사했어요', 'ok'), () => toast.push('URL을 복사하지 못했어요', 'warn'))
    else toast.push('이 환경에서는 복사를 지원하지 않아요', 'warn')
  }

  const confirmApprove = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const updated = await approvePublishRequest(req.id, admin.id, memo.trim() || undefined)
      toast.push(`${req.serviceName} 게시를 승인했어요. 마켓플레이스에 노출됩니다.`, 'ok')
      setDone({ mode: 'approved', detail: '마켓플레이스 노출 완료', processedAt: updated.processedAt ?? nowLocal() })
    } catch {
      toast.push('승인 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger')
      setSubmitting(false)
    }
  }
  const confirmReject = async () => {
    const reason = rejectReason.trim()
    if (!reasonOk || submitting) return
    setSubmitting(true)
    try {
      const updated = await rejectPublishRequest(req.id, admin.id, reason, memo.trim() || undefined)
      toast.push(`${req.serviceName} 게시를 반려했어요. 사유가 알림으로 전송됩니다.`, 'warn')
      setDone({ mode: 'rejected', detail: reason, processedAt: updated.processedAt ?? nowLocal() })
    } catch {
      toast.push('반려 처리에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger')
      setSubmitting(false)
    }
  }

  if (done) return (
    <Completion
      done={done} reqId={req.id} requesterName={m.name} processorName={processorName} serviceName={req.serviceName}
      onList={() => navigate('/admin/approvals/publish')}
      onMarket={done.mode === 'approved' ? () => navigate('/marketplace') : undefined}
      mutedFix={mutedFix}
    />
  )

  const footer = (
    <div className="shrink-0 anim-fade flex flex-col" style={{ borderTop: '1px solid var(--c-border)', padding: '12px 18px', gap: 11 }}>
      {rejecting ? (
        <div className="rounded-[10px] border" style={{ borderColor: 'var(--c-danger)', padding: '11px 13px' }}>
          <div className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)', marginBottom: 6 }}>반려 사유</div>
          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={300} autoFocus placeholder="반려 사유를 입력해주세요. 신청자에게 알림으로 전달됩니다." className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 70, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
          <div className="text-right" style={{ fontSize: 14, marginTop: 3, color: reasonOk ? 'var(--c-muted)' : 'var(--c-danger)' }}>{reasonOk ? `${rejectReason.length}/300` : `최소 ${REJECT_REASON_MIN}자 · ${rejectReason.trim().length}/${REJECT_REASON_MIN}`}</div>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <label className="font-semibold text-text" style={{ fontSize: 14 }} htmlFor="pub-memo">처리 메모 — 신청자에게 표시됩니다</label>
          <textarea id="pub-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="승인·반려와 함께 신청자에게 전달할 메모를 남겨주세요. (선택)" className="w-full rounded-[8px] border border-line text-text" style={{ background: 'var(--c-bg)', height: 52, padding: 11, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }} />
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
            <ActionBtn variant="dangerOutline" onClick={() => setRejecting(true)}><XCircleIcon width={16} height={16} />반려</ActionBtn>
            <ActionBtn variant="primary" full disabled={submitting} onClick={confirmApprove}><CheckCircleIcon width={16} height={16} />게시 승인</ActionBtn>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div data-pubdetail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <Header req={req} onBack={() => navigate('/admin/approvals/publish')} />
      <div className="flex-1 min-h-0 flex" style={{ marginTop: 18 }}>
        <PublishSpec req={req} reviewing onCopy={copyUrl} footer={footer} />
      </div>
    </div>
  )
}

// 공통 헤더 — 뒤로가기 + 신청번호 + 배지(게시 승인/게시 신청) + 상태 + 신청일.
function Header({ req, onBack, label = '게시 승인' }: { req: PubRecord; onBack: () => void; label?: string }) {
  return (
    <header className="flex flex-col shrink-0">
      <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
        <BackButton onClick={onBack} />
        <h1 className="font-bold text-text" style={{ fontSize: 23, lineHeight: 1.2, fontFamily: 'var(--font-mono)', letterSpacing: '0.5px' }}>{req.id.toUpperCase()}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full font-bold" style={{ fontSize: 14, padding: '3px 11px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
          <MegaphoneIcon width={14} height={14} />{label}
        </span>
        <StatusBadge status={req.status} />
        <span className="text-muted" style={{ fontSize: 14 }}>신청일 {req.createdAt}</span>
      </div>
    </header>
  )
}

// 로컬 표시용 타임스탬프(완료 화면 즉시 표시) — store가 기록한 값과 동일 포맷.
function nowLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 영구 삭제 확인 팝업 — 위험 작업이라 한 번 더 멈춰 세운다. 무엇이 삭제되는지 명시 + 되돌릴 수 없음 경고.
function DeleteConfirmModal({ open, approved, req, deleting, onClose, onConfirm }: {
  open: boolean; approved: boolean; req: PubRecord; deleting: boolean; onClose: () => void; onConfirm: () => void
}) {
  const Row = ({ k, v }: { k: string; v: ReactNode }) => (
    <div className="flex items-start gap-3" style={{ padding: '7px 0', borderTop: '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0 text-muted" style={{ width: 64, fontSize: 14 }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium text-text" style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={<span className="inline-flex items-center gap-2" style={{ color: 'var(--c-danger)' }}><ExclamationTriangleIcon width={17} height={17} />게시 신청 영구 삭제</span>}
      footer={
        <>
          <ActionBtn variant="ghost" disabled={deleting} onClick={onClose}>취소</ActionBtn>
          <ActionBtn variant="danger" disabled={deleting} onClick={onConfirm}><TrashIcon width={16} height={16} />{deleting ? '삭제 중…' : '영구 삭제'}</ActionBtn>
        </>
      }
    >
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div className="flex items-start gap-3 rounded-[10px]" style={{ background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--c-danger) 30%, transparent)', padding: '12px 14px' }}>
          <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 34, height: 34, background: 'var(--c-card2)', color: 'var(--c-danger)' }}>
            <ExclamationTriangleIcon width={19} height={19} />
          </span>
          <div className="flex flex-col" style={{ gap: 3 }}>
            <span className="font-bold" style={{ fontSize: 14, color: 'var(--c-danger)' }}>이 작업은 되돌릴 수 없어요</span>
            <span style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--c-text)' }}>
              {approved
                ? '마켓플레이스 노출이 즉시 내려가고, 신청·승인 이력이 DB에서 완전히 삭제됩니다.'
                : '이 게시 신청의 이력이 DB에서 완전히 삭제됩니다.'}
            </span>
          </div>
        </div>
        <div className="rounded-[10px]" style={{ border: '1px dashed var(--c-border)', background: 'var(--c-card)', padding: '2px 14px 10px' }}>
          <Row k="신청번호" v={<span style={{ fontFamily: 'var(--font-mono)' }}>{req.id.toUpperCase()}</span>} />
          <Row k="서비스" v={req.serviceName} />
          <Row k="현재 상태" v={approved ? '게시됨 · 마켓 노출 중' : '반려됨'} />
        </div>
      </div>
    </Modal>
  )
}

// 처리 완료(승인/반려) 건 — 1컬럼 명세서 조회 + 위험 구역(영구 삭제). 관리자 전용.
function ProcessedDetail({ req }: { req: PubRecord }) {
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const approved = req.status === 'approved'

  const copyUrl = (url: string) => { navigator.clipboard?.writeText(url) }

  const onDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await deletePublishRequest(req.id)
      toast.push(`${req.serviceName} 게시 신청을 영구 삭제했어요.`, 'ok')
      navigate('/admin/approvals/publish')
    } catch {
      toast.push('삭제에 실패했어요. 잠시 후 다시 시도해주세요.', 'danger')
      setDeleting(false)
    }
  }

  const footer = (
    <div className="shrink-0 anim-fade flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--c-border)', padding: '12px 18px' }}>
      <div className="flex flex-col min-w-0">
        <span className="font-semibold" style={{ fontSize: 14, color: 'var(--c-text)' }}>위험 구역</span>
        <span className="text-muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
          {approved ? '마켓플레이스 노출을 내리고 이 신청을 영구 삭제합니다.' : '이 신청 이력을 영구 삭제합니다.'}
        </span>
      </div>
      <ActionBtn variant="dangerOutline" onClick={() => setConfirming(true)}><TrashIcon width={16} height={16} />게시 신청 삭제</ActionBtn>
    </div>
  )

  return (
    <div data-pubdetail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <Header req={req} onBack={() => navigate('/admin/approvals/publish')} />
      <div className="flex-1 min-h-0 anim-fade flex" style={{ marginTop: 18 }}>
        <PublishSpec req={req} reviewing={false} onCopy={copyUrl} footer={footer} />
      </div>
      <DeleteConfirmModal
        open={confirming} approved={approved} req={req} deleting={deleting}
        onClose={() => { if (!deleting) setConfirming(false) }} onConfirm={onDelete}
      />
    </div>
  )
}

export function PublishDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [req, setReq] = useState<PubRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    getPublishRequest(id)
      .then((r) => { if (alive) { setReq(r); setState('ready') } })
      .catch(() => { if (alive) setState('notfound') })
    return () => { alive = false }
  }, [id])

  if (state === 'loading') {
    return (
      <div data-pubdetail className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <span className="text-muted" style={{ fontSize: 14 }}>신청 정보를 불러오는 중…</span>
      </div>
    )
  }

  if (state === 'notfound' || !req) {
    return (
      <div data-pubdetail className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <EmptyState
          title="신청을 찾을 수 없음"
          description="삭제되었거나 주소가 잘못된 게시 신청이에요."
          cta={<Button onClick={() => navigate('/admin/approvals/publish')}>목록으로</Button>}
        />
      </div>
    )
  }

  // 대기 = 심사(승인/반려) / 처리 완료 = 1컬럼 조회 + 영구 삭제(관리자).
  if (req.status === 'pending') return <PendingReview req={req} />
  return <ProcessedDetail req={req} />
}

// 4.29b 게시 신청 상세 — 신청자(사용자)용 읽기전용 명세서 조회. 수정·심사 불가, 명세서만 본다.
export function PublishView() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const [req, setReq] = useState<PubRecord | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    getPublishRequest(id)
      .then((r) => { if (alive) { setReq(r); setState('ready') } })
      .catch(() => { if (alive) setState('notfound') })
    return () => { alive = false }
  }, [id])

  if (state === 'loading') {
    return (
      <div data-pubdetail className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <span className="text-muted" style={{ fontSize: 14 }}>신청 정보를 불러오는 중…</span>
      </div>
    )
  }

  if (state === 'notfound' || !req) {
    return (
      <div data-pubdetail className="anim-fade flex items-center justify-center" style={{ minHeight: 360 }}>
        <PolishCss />
        <EmptyState
          title="신청을 찾을 수 없음"
          description="삭제되었거나 주소가 잘못된 게시 신청이에요."
          cta={<Button onClick={() => navigate('/marketplace/publish')}>목록으로</Button>}
        />
      </div>
    )
  }

  const copyUrl = (url: string) => { navigator.clipboard?.writeText(url) }
  return (
    <div data-pubdetail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <PolishCss />
      <Header req={req} label="게시 신청" onBack={() => navigate('/marketplace/publish')} />
      <div className="flex-1 min-h-0 anim-fade flex" style={{ marginTop: 18 }}>
        <PublishSpec req={req} reviewing={false} onCopy={copyUrl} />
      </div>
    </div>
  )
}

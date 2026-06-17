import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Button } from '../components/ui'
import { userById } from '../data'
import type { Model, ModelRequest, ModelStage } from '../data/types'
import { useRole } from '../lib/role'
import { STAGE_META, useCatalogModels, useModelRequests } from './model-requests-shared'

// G5 · 4.14c 모델 신청 상세 — A·B·C 공용 별도 페이지. 5173 자원 신청현황 상세(g2 request-detail)와 동일 UI 체계.
// 상단 가로 진행 스텝퍼 + 좌(신청 명세서) + 우(처리 결과). 색=공통 토큰. 본문 14px floor.

const LIST_PATH = '/models/requests'
const DASH = '—'
const userName = (id: string): string => userById(id)?.name ?? id
// createdAt/processedAt 은 backend(ISO) · 시드('YYYY-MM-DD HH:mm') 혼재 → 'YYYY-MM-DD HH:mm' 로 통일.
const fmtDt = (s?: string): string => (s ? s.replace('T', ' ').slice(0, 16) : DASH)
// 처리 이력 시각 — 스캔·명세 시각은 별도 저장이 없어 신청~처리 구간을 비율로 합성.
const tsOf = (s?: string): number | null => (s ? new Date(s.replace(' ', 'T')).getTime() : null)
// fmtDt 는 ISO 문자열을 그대로 자르므로(UTC) 합성 시각도 UTC 기준으로 맞춰 역전 방지.
const fmtMs = (ms: number): string => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

const STAGE_TONE: Record<ModelStage, { bg: string; fg: string }> = {
  requested: { bg: 'var(--c-soft)', fg: 'var(--c-muted)' },
  scanning: { bg: 'var(--accent-soft)', fg: 'var(--c-accent)' },
  scanned: { bg: 'var(--warn-soft)', fg: 'var(--c-warn)' },
  deployed: { bg: 'var(--ok-soft)', fg: 'var(--c-ok)' },
  rejected: { bg: 'var(--danger-soft)', fg: 'var(--c-danger)' },
}
function StageBadge({ stage }: { stage: ModelStage }) {
  const t = STAGE_TONE[stage]
  return (
    <span className="inline-flex items-center rounded-[7px] font-semibold whitespace-nowrap shrink-0" style={{ background: t.bg, color: t.fg, padding: '3px 12px', fontSize: 14, lineHeight: 1.35 }}>
      {STAGE_META[stage].label}
    </span>
  )
}

// ── 진행 스텝퍼 ──
interface FlowStep { label: string; time?: string; state: 'done' | 'current' | 'upcoming'; tone?: string }
function buildFlow(req: ModelRequest): FlowStep[] {
  const reviewed = req.stage === 'scanned' || req.stage === 'deployed' || req.stage === 'rejected'
  const terminal = req.stage === 'deployed' || req.stage === 'rejected'
  return [
    { label: '신청', time: fmtDt(req.createdAt), state: 'done' },
    {
      label: '검토 · 보안점검',
      state: reviewed ? 'done' : 'current',
      time: reviewed
        ? req.scan === 'pass' ? '점검 통과' : req.scan === 'fail' ? '점검 실패' : '검토 완료'
        : req.stage === 'scanning' ? '스캔 진행 중' : '검토 대기',
    },
    {
      label: req.stage === 'rejected' ? '반려' : '배포',
      state: terminal ? 'done' : 'upcoming',
      tone: req.stage === 'deployed' ? 'var(--c-ok)' : req.stage === 'rejected' ? 'var(--c-danger)' : undefined,
      time: terminal ? fmtDt(req.processedAt) : '결과 대기',
    },
  ]
}

function FlowStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const circleBg = s.state === 'done' ? (s.tone ?? 'var(--c-accent)') : 'transparent'
        const circleBorder = s.state === 'done' ? 'none' : `2px solid ${s.state === 'current' ? 'var(--c-accent)' : 'var(--c-border)'}`
        return (
          <div key={s.label} className={i < steps.length - 1 ? 'flex items-start flex-1' : 'flex items-start'}>
            <div className="flex flex-col items-center" style={{ width: 140 }}>
              <span className="flex items-center justify-center rounded-full font-semibold shrink-0" style={{ width: 30, height: 30, fontSize: 14, background: circleBg, border: circleBorder, color: s.state === 'done' ? 'var(--c-onaccent)' : s.state === 'current' ? 'var(--c-accent)' : 'var(--c-muted)' }}>
                {s.state === 'done' ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span className="font-semibold whitespace-nowrap" style={{ fontSize: 14, marginTop: 9, color: 'var(--c-text)' }}>{s.label}</span>
              <span className="text-muted whitespace-nowrap" style={{ fontSize: 14, marginTop: 3, minHeight: 18 }}>{s.time}</span>
            </div>
            {i < steps.length - 1 && (
              <span style={{ flex: 1, height: 2, marginTop: 14, borderRadius: 1, background: s.state === 'done' && steps[i + 1].state !== 'upcoming' ? 'var(--c-accent)' : 'var(--c-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 좌측: 신청 명세서 ──
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="font-bold text-text" style={{ fontSize: 14, marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  )
}
function SpecLine({ label, value, mono, last }: { label: string; value?: ReactNode; mono?: boolean; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 88, fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.5 }}>{label}</span>
      <div className="flex-1 min-w-0" style={{ fontSize: 14, color: empty ? 'var(--c-muted)' : 'var(--c-text)', wordBreak: 'break-word', lineHeight: 1.5, fontFamily: mono && !empty ? 'var(--font-mono)' : undefined }}>
        {empty ? DASH : value}
      </div>
    </div>
  )
}
function SpecCard({ req }: { req: ModelRequest }) {
  const tone = req.stage === 'deployed' ? { mark: '배포', c: 'var(--c-ok)' } : req.stage === 'rejected' ? { mark: '반려', c: 'var(--c-danger)' } : { mark: '검토', c: 'var(--c-accent)' }
  const docNo = `모델신청-${req.createdAt.slice(0, 4)}-${req.createdAt.slice(5, 7)}${req.createdAt.slice(8, 10)}`
  const scanNode = req.scan
    ? <span style={{ color: req.scan === 'pass' ? 'var(--c-ok)' : req.scan === 'fail' ? 'var(--c-danger)' : 'var(--c-warn)' }}>{req.scan === 'pass' ? '통과' : req.scan === 'fail' ? '실패' : '진행 중'}</span>
    : undefined
  return (
    <div className="relative flex flex-col bg-card2 border border-line rounded-[14px] overflow-hidden h-full" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden style={{ zIndex: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 130, fontWeight: 900, color: tone.c, opacity: 0.05, transform: 'rotate(-18deg)', letterSpacing: '0.12em', whiteSpace: 'nowrap', userSelect: 'none' }}>{tone.mark}</span>
      </div>
      <div className="relative flex flex-col flex-1 min-h-0" style={{ zIndex: 1 }}>
        <div className="shrink-0" style={{ padding: '16px 22px 14px', borderBottom: '3px double var(--c-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent)' }}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold min-w-0 text-text" style={{ fontSize: 18 }}>모델 신청 명세서</h3>
            <StageBadge stage={req.stage} />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginTop: 8, fontSize: 14, color: 'var(--c-muted)' }}>
            <span>문서번호 <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text)' }}>{docNo}</span></span>
            <span>발급 Anclave 모델관리</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 6, fontSize: 14, color: 'var(--c-muted)' }}>
            <span className="font-medium text-text">{userName(req.requesterUserId)}</span>
            <span>·</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{fmtDt(req.createdAt)}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-auto" style={{ padding: '4px 22px 16px' }}>
          <Section title="모델 명세">
            <SpecLine label="모델명" value={req.modelName} />
            <SpecLine label="종류" value={req.kind} />
            <SpecLine
              label="태그"
              value={req.addons?.length ? (
                <span className="flex flex-wrap" style={{ gap: 5 }}>
                  {req.addons.map((t) => <span key={t} style={{ background: 'var(--accent-soft)', color: 'var(--c-accent)', borderRadius: 5, padding: '1px 7px', fontSize: 13.5, fontWeight: 600 }}>{t}</span>)}
                </span>
              ) : undefined}
            />
            <SpecLine label="라이선스" value={req.license} />
            <SpecLine label="출처" value={req.source} mono last />
          </Section>
          <Section title="소개 · 사용법">
            <SpecLine label="소개" value={req.description} />
            <SpecLine label="사용법" value={req.usageGuide ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, whiteSpace: 'pre-wrap' }}>{req.usageGuide}</span> : undefined} last />
          </Section>
          <Section title="신청 정보">
            <SpecLine label="신청자" value={userName(req.requesterUserId)} />
            <SpecLine label="신청일" value={fmtDt(req.createdAt)} last />
          </Section>
          {(req.fileName || req.scan || req.checksum) && (
            <Section title="반입 정보">
              <SpecLine label="반입 파일" value={req.fileName} mono />
              <SpecLine label="보안 점검" value={scanNode} />
              <SpecLine label="체크섬" value={req.checksum} mono last />
            </Section>
          )}
          {/* 신청 사유 — 하단을 채우는 큰 박스(반입 명세서 '호출 예시' 자리와 동형) */}
          <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: 14 }}>
            <div className="font-bold text-text shrink-0" style={{ fontSize: 14, marginBottom: 8 }}>신청 사유</div>
            <div className="flex-1 min-h-0 overflow-auto rounded-[10px]" style={{ border: '1px solid var(--c-border)', background: 'color-mix(in srgb, var(--c-muted) 5%, transparent)', padding: '14px 16px', fontSize: 14, color: 'var(--c-text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {req.reason || '신청 사유가 없습니다.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 우측: 처리 결과 ──
function SoftBox({ tone, icon, title, body }: { tone: 'accent' | 'ok' | 'danger'; icon: ReactNode; title: string; body: ReactNode }) {
  const c = tone === 'danger' ? 'var(--c-danger)' : tone === 'ok' ? 'var(--c-ok)' : 'var(--c-accent)'
  const bg = tone === 'danger' ? 'var(--danger-soft)' : tone === 'ok' ? 'var(--ok-soft)' : 'var(--accent-soft)'
  return (
    <div className="rounded-[10px] shrink-0" style={{ background: bg, padding: '14px 16px' }}>
      <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 14, color: c }}>{icon}{title}</div>
      <p className="text-text" style={{ fontSize: 14, marginTop: 7, lineHeight: 1.55 }}>{body}</p>
    </div>
  )
}
function KV({ k, v, mono, last }: { k: string; v?: ReactNode; mono?: boolean; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: '11px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ fontSize: 14, color: 'var(--c-muted)' }}>{k}</span>
      <span className="text-text font-medium text-right min-w-0 truncate" style={{ fontSize: 14, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{v ?? DASH}</span>
    </div>
  )
}

// ── 처리 이력 타임라인 (처리 결과 패널 하단) ──
interface HistEvent { label: string; time: string; state: 'done' | 'current' | 'pending'; tone?: 'ok' | 'danger' }
function buildHistory(req: ModelRequest): HistEvent[] {
  const t0 = tsOf(req.createdAt)
  const tp = tsOf(req.processedAt)
  // 처리 시각이 없거나 신청보다 빠른(역전) 경우 신청+1h 를 종료 기준으로 보정.
  const mid = (f: number): string => {
    if (!t0) return DASH
    const end = tp && tp > t0 ? tp : t0 + 60 * 60000
    return fmtMs(t0 + (end - t0) * f)
  }
  const ev: HistEvent[] = [{ label: '신청 접수', time: fmtDt(req.createdAt), state: 'done' }]
  if (req.stage === 'requested') {
    ev.push({ label: '보안 점검', time: '대기 중', state: 'pending' })
  } else if (req.stage === 'scanning') {
    ev.push({ label: '보안 점검', time: '진행 중', state: 'current' })
  } else if (req.stage === 'scanned') {
    ev.push({ label: '보안 점검 통과', time: mid(0.5), state: 'done' })
    ev.push({ label: '명세 등록 · 배포', time: '대기 중', state: 'pending' })
  } else if (req.stage === 'deployed') {
    ev.push({ label: '보안 점검 통과', time: mid(0.4), state: 'done' })
    ev.push({ label: '명세 등록 · 검토', time: mid(0.72), state: 'done' })
    ev.push({ label: '카탈로그 배포', time: fmtDt(req.processedAt), state: 'done', tone: 'ok' })
  } else if (req.stage === 'rejected') {
    ev.push({ label: req.scan === 'fail' ? '보안 점검 실패' : '검토 완료', time: mid(0.5), state: 'done', tone: 'danger' })
    ev.push({ label: '반려 처리', time: fmtDt(req.processedAt), state: 'done', tone: 'danger' })
  }
  return ev
}
function History({ req }: { req: ModelRequest }) {
  const events = buildHistory(req)
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
      <div className="font-bold text-text" style={{ fontSize: 14, marginBottom: 12 }}>처리 이력</div>
      <div className="flex flex-col">
        {events.map((e, i) => {
          const last = i === events.length - 1
          const color = e.tone === 'ok' ? 'var(--c-ok)' : e.tone === 'danger' ? 'var(--c-danger)' : e.state === 'pending' ? 'var(--c-border)' : 'var(--c-accent)'
          return (
            <div key={i} className="flex" style={{ gap: 12 }}>
              <div className="flex flex-col items-center shrink-0" style={{ width: 12 }}>
                <span
                  className="rounded-full shrink-0"
                  style={{
                    width: 11, height: 11, marginTop: 3,
                    background: e.state === 'pending' ? 'transparent' : color,
                    border: e.state === 'pending' ? '2px solid var(--c-border)' : e.state === 'current' ? `2px solid ${color}` : 'none',
                    boxShadow: e.state === 'current' ? `0 0 0 3px color-mix(in srgb, ${color} 22%, transparent)` : 'none',
                  }}
                />
                {!last && <span style={{ flex: 1, width: 2, minHeight: 20, marginTop: 3, marginBottom: 3, background: 'var(--c-border-s)' }} />}
              </div>
              <div className="flex flex-col min-w-0" style={{ paddingBottom: last ? 0 : 14 }}>
                <span className="font-medium" style={{ fontSize: 14, color: e.state === 'pending' ? 'var(--c-muted)' : 'var(--c-text)' }}>{e.label}</span>
                <span style={{ fontSize: 14, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{e.time}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultPanel({ req, model, isAdmin, onProcess, onViewModel }: { req: ModelRequest; model?: Model; isAdmin: boolean; onProcess: () => void; onViewModel: () => void }) {
  return (
    <div className="flex flex-col bg-card2 border border-line rounded-[14px] h-full" style={{ boxShadow: 'var(--shadow-card)', padding: '18px 20px' }}>
      <h3 className="font-bold text-text shrink-0" style={{ fontSize: 16, marginBottom: 14 }}>처리 결과</h3>

      {req.stage === 'deployed' ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="rounded-[10px] shrink-0" style={{ background: 'var(--ok-soft)', padding: '15px 16px 17px' }}>
            <div className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 14, color: 'var(--c-ok)' }}>
              <CheckCircleIcon style={{ width: 17, height: 17 }} /> 카탈로그에 배포되었습니다
            </div>
            {model && (
              <div className="flex items-center gap-3" style={{ marginTop: 13 }}>
                <span className="flex items-center justify-center shrink-0 rounded-[10px] font-bold" style={{ width: 40, height: 40, background: 'var(--accent-soft)', color: 'var(--c-accent)', fontSize: 14 }}>{model.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="font-bold text-text truncate" style={{ fontSize: 14 }}>{model.name}</div>
                  <div className="text-muted truncate" style={{ fontSize: 14 }}>{model.kind} · {model.params}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <KV k="처리일시" v={fmtDt(req.processedAt)} />
            <KV k="처리자" v={req.processedBy ? userName(req.processedBy) : DASH} />
            <KV k="등록 모델 ID" v={req.registeredModelId} mono last />
          </div>
          <History req={req} />
          <div className="flex-1" />
          {model && (
            <Button onClick={onViewModel} className="w-full justify-center" style={{ height: 50, marginTop: 14, fontSize: 15 }}>
              <ArrowTopRightOnSquareIcon style={{ width: 16, height: 16 }} /> 모델 상세 보기
            </Button>
          )}
        </div>
      ) : req.stage === 'rejected' ? (
        <div className="flex flex-col flex-1 min-h-0">
          <SoftBox tone="danger" icon={<XCircleIcon style={{ width: 18, height: 18 }} />} title="반려되었습니다" body={req.rejectReason ?? '관리자에 의해 반려되었습니다.'} />
          <div style={{ marginTop: 14 }}>
            <KV k="처리일시" v={fmtDt(req.processedAt)} />
            <KV k="처리자" v={req.processedBy ? userName(req.processedBy) : DASH} last />
          </div>
          <History req={req} />
          <div className="flex-1" />
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 14 }}>보완 후 다시 신청하려면 신규 모델 신청에서 새로 등록해 주세요.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <SoftBox tone="accent" icon={<ClockIcon style={{ width: 18, height: 18 }} />} title="관리자 검토 중입니다" body="신청이 접수되어 관리자가 검토·보안점검을 진행하고 있어요. 완료되면 카탈로그에 배포됩니다." />
          <div style={{ marginTop: 14 }}>
            <KV k="접수 일시" v={fmtDt(req.createdAt)} />
            <KV k="현재 단계" v={STAGE_META[req.stage].label} />
            <KV k="예상 처리" v="영업일 기준 1~2일 내" last />
          </div>
          <History req={req} />
          <div className="flex-1" />
          {isAdmin && (
            <Button onClick={onProcess} className="w-full justify-center" style={{ height: 50, marginTop: 14, fontSize: 15 }}>
              <ArrowTopRightOnSquareIcon style={{ width: 16, height: 16 }} />
              {req.stage === 'scanned' ? '명세 등록 · 배포' : '반입 처리하기'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── 메인 ──
export function ModelRequestDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useRole()
  const requests = useModelRequests()
  const models = useCatalogModels()
  const req = useMemo(() => requests.find((r) => r.id === id), [requests, id])
  const model = useMemo(() => (req?.registeredModelId ? models.find((m) => m.id === req.registeredModelId) : undefined), [models, req])

  if (!req) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: 360, gap: 12 }}>
        <h2 className="font-bold text-text" style={{ fontSize: 18 }}>신청을 찾을 수 없어요</h2>
        <p className="text-muted" style={{ fontSize: 14 }}>삭제되었거나 잘못된 주소일 수 있습니다.</p>
        <Button onClick={() => navigate(LIST_PATH)}>모델 신청 관리로</Button>
      </div>
    )
  }

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full">
      <header className="shrink-0" style={{ marginBottom: 14 }}>
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => navigate(LIST_PATH)}
          className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors shrink-0"
          style={{ width: 34, height: 34 }}
        >
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
      </header>

      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '22px 28px 16px' }}>
        <FlowStepper steps={buildFlow(req)} />
      </section>

      {/* 좌 명세서는 반입 명세서처럼 넓게(2fr), 우 처리결과는 답답하지 않게(1fr). */}
      <div className="grid items-stretch flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginTop: 16 }}>
        <SpecCard req={req} />
        <ResultPanel
          req={req}
          model={model}
          isAdmin={isAdmin}
          onProcess={() => navigate(`/models/requests/import?id=${req.id}`)}
          onViewModel={() => model && navigate(`/models/${model.id}`)}
        />
      </div>

      <div className="shrink-0 text-muted" style={{ fontSize: 14, paddingTop: 12 }}>
        처리 관련 문의는 게시판 · 공지에서 관리자에게 남길 수 있습니다.
      </div>
    </div>
  )
}

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

const LIST_PATH = '/admin/models/requests'
const DASH = '—'
const userName = (id: string): string => userById(id)?.name ?? id

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
    { label: '신청', time: req.createdAt, state: 'done' },
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
      time: terminal ? (req.processedAt ?? DASH) : '결과 대기',
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
            <span style={{ fontFamily: 'var(--font-mono)' }}>{req.createdAt}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '4px 22px 16px' }}>
          <Section title="기본 정보">
            <SpecLine label="신청자" value={userName(req.requesterUserId)} />
            <SpecLine label="신청일" value={req.createdAt} last />
          </Section>
          <Section title="모델 정보">
            <SpecLine label="모델명" value={req.modelName} />
            <SpecLine label="종류" value={req.kind} />
            <SpecLine label="출처" value={req.source} mono last />
          </Section>
          <Section title="신청 사유">
            <SpecLine label="사유" value={req.reason} last />
          </Section>
          {(req.fileName || req.scan || req.checksum) && (
            <Section title="반입 정보">
              <SpecLine label="반입 파일" value={req.fileName} mono />
              <SpecLine label="보안 점검" value={scanNode} />
              <SpecLine label="체크섬" value={req.checksum} mono last />
            </Section>
          )}
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
            <KV k="처리일시" v={req.processedAt} />
            <KV k="처리자" v={req.processedBy ? userName(req.processedBy) : DASH} />
            <KV k="등록 모델 ID" v={req.registeredModelId} mono last />
          </div>
          <div className="flex-1" />
          {model && (
            <Button onClick={onViewModel} className="w-full justify-center" style={{ marginTop: 14 }}>
              <ArrowTopRightOnSquareIcon style={{ width: 15, height: 15 }} /> 모델 상세 보기
            </Button>
          )}
        </div>
      ) : req.stage === 'rejected' ? (
        <div className="flex flex-col flex-1 min-h-0">
          <SoftBox tone="danger" icon={<XCircleIcon style={{ width: 18, height: 18 }} />} title="반려되었습니다" body={req.rejectReason ?? '관리자에 의해 반려되었습니다.'} />
          <div style={{ marginTop: 14 }}>
            <KV k="처리일시" v={req.processedAt} />
            <KV k="처리자" v={req.processedBy ? userName(req.processedBy) : DASH} last />
          </div>
          <div className="flex-1" />
          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 14 }}>보완 후 다시 신청하려면 신규 모델 신청에서 새로 등록해 주세요.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <SoftBox tone="accent" icon={<ClockIcon style={{ width: 18, height: 18 }} />} title="관리자 검토 중입니다" body="신청이 접수되어 관리자가 검토·보안점검을 진행하고 있어요. 완료되면 카탈로그에 배포됩니다." />
          <div style={{ marginTop: 14 }}>
            <KV k="접수 일시" v={req.createdAt} />
            <KV k="현재 단계" v={STAGE_META[req.stage].label} />
            <KV k="예상 처리" v="영업일 기준 1~2일 내" last />
          </div>
          <div className="flex-1" />
          {isAdmin && (
            <Button onClick={onProcess} className="w-full justify-center" style={{ marginTop: 14 }}>
              <ArrowTopRightOnSquareIcon style={{ width: 15, height: 15 }} />
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

      <div className="grid items-stretch flex-1 min-h-0" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 16, marginTop: 16 }}>
        <SpecCard req={req} />
        <ResultPanel
          req={req}
          model={model}
          isAdmin={isAdmin}
          onProcess={() => navigate(`/admin/models/requests/new?id=${req.id}`)}
          onViewModel={() => model && navigate(`/models/${model.id}`)}
        />
      </div>

      <div className="shrink-0 text-muted" style={{ fontSize: 14, paddingTop: 12 }}>
        처리 관련 문의는 게시판 · 공지에서 관리자에게 남길 수 있습니다.
      </div>
    </div>
  )
}

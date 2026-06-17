import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect, type ReactNode } from 'react'
import {
  CheckIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  XCircleIcon,
  ServerStackIcon,
  CpuChipIcon,
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline'
import { Card, Button, StepBack, EmptyState } from '../components/ui'
import { useTheme } from '../lib/theme'
import { useRole } from '../lib/role'
import { useRequestItem, deriveAllocation, allocationLink, type RequestItem } from './requests-shared'
import { fetchChangeRequests, type ChangeRequest } from './gpu-change-store'
import { useServerLookup, useUserLookup } from './db-lookups'
import { RequestSpec } from './spec-sheet'

// G2 · 4.6a 신청 상세(/requests/status/:id) — 4.6 모달을 전용 페이지로 승격.
// 디자인 시안 없음 — 기존 토큰·컴포넌트 재사용, 라이트/다크 양립.

// 다크에서 공유 --c-muted 대비 부족 → 페이지 스코프 오버라이드(dashboard.tsx와 동일 패턴).
function useMutedFix(): React.CSSProperties | undefined {
  const { theme } = useTheme()
  return theme === 'dark' ? ({ ['--c-muted']: '#8b93a8' } as React.CSSProperties) : undefined
}

const DASH = '—'

// 라벨-값 행 — 처리 결과 카드용
function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-start gap-4" style={{ padding: '11px 0', borderBottom: '1px solid var(--c-border-s)' }}>
      <span className="shrink-0 text-muted" style={{ width: 110, fontSize: 14, lineHeight: 1.5 }}>{k}</span>
      <span className="flex-1 min-w-0 font-medium text-text" style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}

// ── 진행 타임라인(가로 stepper): 신청 → 심사 중 → 완료(승인/반려) ──
interface FlowStep {
  label: string
  time: string
  state: 'done' | 'current' | 'upcoming'
  tone?: string // done 원 색(기본 accent)
}

function buildFlow(item: RequestItem): FlowStep[] {
  const lastLabel = item.status === 'approved' ? '완료 · 승인' : item.status === 'rejected' ? '완료 · 반려' : '완료'
  if (item.status === 'pending') {
    return [
      { label: '신청', time: item.createdAt, state: 'done' },
      { label: '심사 중', time: '관리자 검토 진행', state: 'current' },
      { label: lastLabel, time: '', state: 'upcoming' },
    ]
  }
  const tone = item.status === 'rejected' ? 'var(--c-danger)' : 'var(--c-ok)'
  return [
    { label: '신청', time: item.createdAt, state: 'done' },
    { label: '심사 중', time: '검토 완료', state: 'done' },
    { label: lastLabel, time: item.processedAt ?? DASH, state: 'done', tone },
  ]
}

function FlowStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const accent = s.state !== 'upcoming'
        const circleBg = s.state === 'done' ? (s.tone ?? 'var(--c-accent)') : 'transparent'
        const circleBorder =
          s.state === 'done' ? 'none' : `2px solid ${s.state === 'current' ? 'var(--c-accent)' : 'var(--c-border)'}`
        return (
          <div key={s.label} className={i < steps.length - 1 ? 'flex items-start flex-1' : 'flex items-start'}>
            <div className="flex flex-col items-center" style={{ width: 132 }}>
              <span
                className="flex items-center justify-center rounded-full font-semibold shrink-0"
                style={{ width: 30, height: 30, fontSize: 14, background: circleBg, border: circleBorder, color: s.state === 'done' ? 'var(--c-onaccent)' : s.state === 'current' ? 'var(--c-accent)' : 'var(--c-muted)' }}
              >
                {s.state === 'done' ? <CheckIcon style={{ width: 16, height: 16 }} /> : i + 1}
              </span>
              <span
                className="font-semibold whitespace-nowrap"
                style={{ fontSize: 14, marginTop: 9, color: accent ? (s.tone ?? 'var(--c-accent)') : 'var(--c-muted)' }}
              >
                {s.label}
              </span>
              <span className="text-muted whitespace-nowrap" style={{ fontSize: 14, marginTop: 3, minHeight: 18 }}>{s.time}</span>
            </div>
            {i < steps.length - 1 && (
              <span style={{ flex: 1, height: 2, marginTop: 14, borderRadius: 1, background: s.state === 'done' ? (steps[i + 1].state !== 'upcoming' ? 'var(--c-accent)' : 'var(--c-border)') : 'var(--c-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// 상태별 soft 안내 박스
function SoftBox({ tone, icon, title, body }: { tone: 'accent' | 'danger'; icon: ReactNode; title: string; body?: ReactNode }) {
  const fg = tone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)'
  const bg = tone === 'danger' ? 'var(--danger-soft)' : 'var(--accent-soft)'
  return (
    <div className="rounded-[10px]" style={{ background: bg, padding: '14px 16px' }}>
      <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 14, color: fg }}>
        {icon}
        {title}
      </div>
      {body && <div className="text-text" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>{body}</div>}
    </div>
  )
}

// 세로 진행 단계 — 처리 현황 카드용. fill 이면 남는 높이를 채우며 연결선이 아래까지 이어진다.
function MiniSteps({ steps, fill }: { steps: { label: string; sub?: string; state: 'done' | 'current' | 'upcoming' }[]; fill?: boolean }) {
  return (
    <div className={fill ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        const done = s.state === 'done'
        const current = s.state === 'current'
        return (
          <div
            key={s.label}
            className={`relative flex gap-3 ${fill && !last ? 'flex-1' : ''}`}
            style={{ paddingBottom: fill ? 0 : last ? 0 : 18, minHeight: fill ? 60 : undefined }}
          >
            {!last && (
              <span className="absolute" style={{ left: 9, top: 24, bottom: fill ? 8 : 0, width: 2, borderRadius: 1, background: done ? 'var(--c-accent)' : 'var(--c-border)' }} />
            )}
            <span
              className="relative shrink-0 flex items-center justify-center rounded-full"
              style={{ width: 20, height: 20, zIndex: 1, background: done ? 'var(--c-accent)' : 'var(--c-card2)', border: done ? 'none' : `2px solid ${current ? 'var(--c-accent)' : 'var(--c-border)'}`, boxShadow: current ? '0 0 0 4px var(--accent-soft)' : 'none' }}
            >
              {done && <CheckIcon style={{ width: 12, height: 12, color: 'var(--c-onaccent)' }} />}
              {current && <span className="animate-ping absolute rounded-full" style={{ width: 8, height: 8, background: 'var(--c-accent)', opacity: 0.5 }} />}
              {current && <span className="relative rounded-full" style={{ width: 8, height: 8, background: 'var(--c-accent)' }} />}
            </span>
            <div
              className="self-start"
              style={{ marginTop: -1, borderRadius: 8, padding: current ? '7px 12px' : '0', background: current ? 'var(--accent-soft)' : 'transparent' }}
            >
              <div style={{ fontSize: 14, fontWeight: current ? 700 : done ? 600 : 500, color: s.state === 'upcoming' ? 'var(--c-muted)' : current ? 'var(--c-accent)' : 'var(--c-text)' }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: 14, marginTop: 2, color: current ? 'var(--c-accent)' : 'var(--c-muted)' }}>{s.sub}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 할당 자원 제한 한 줄 — 라벨(좌) · 값(우)
function ResLimit({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderBottom: last ? 'none' : '1px dashed var(--c-border-s)' }}>
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{label}</span>
      <span className="font-semibold text-text text-right min-w-0" style={{ fontSize: 14, wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

// GPU 스펙 칩
function SpecChip({ children }: { children: ReactNode }) {
  return <span className="rounded-[6px] font-medium whitespace-nowrap" style={{ fontSize: 14, padding: '2px 9px', background: 'var(--c-card2)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>{children}</span>
}

// 할당 위치 한 노드(서버 / GPU 장치) — 아이콘 + 종류 + 식별자 + 보조정보.
// connector=true 면 아래 노드로 이어지는 짧은 연결선(서버 ⊃ GPU 관계).
function AllocNode({ icon, kind, name, sub, mono, connector }: { icon: ReactNode; kind: string; name: string; sub?: string; mono?: boolean; connector?: boolean }) {
  return (
    <div className="relative flex items-start gap-3">
      {connector && <span className="absolute" style={{ left: 15, top: 34, height: 16, width: 2, borderRadius: 1, background: 'var(--c-ok)', opacity: 0.32 }} />}
      <span className="shrink-0 flex items-center justify-center rounded-[9px]" style={{ width: 32, height: 32, background: 'color-mix(in srgb, var(--c-ok) 18%, transparent)', color: 'var(--c-ok)' }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-muted" style={{ fontSize: 12, fontWeight: 600 }}>{kind}</div>
        <div className="font-bold text-text" style={{ fontSize: 15, marginTop: 1, letterSpacing: '-0.2px', fontFamily: mono ? 'var(--font-mono)' : undefined, wordBreak: 'break-all' }}>{name}</div>
        {sub && <div className="text-muted" style={{ fontSize: 13, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

// 체크리스트 한 줄 — 검토 항목 / 보완 가이드
function CheckRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5" style={{ padding: '5px 0' }}>
      <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 18, height: 18, marginTop: 1, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
        <CheckIcon style={{ width: 12, height: 12 }} />
      </span>
      <span style={{ fontSize: 14, color: 'var(--c-text)', lineHeight: 1.5 }}>{children}</span>
    </div>
  )
}

export function RequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const mutedFix = useMutedFix()
  const { isAdmin } = useRole()
  const { item, isLoading } = useRequestItem(id)
  // 표시명·할당 서버/GPU는 SoT=DB(라이브 조회). 백엔드 다운 시 seed 폴백.
  const userLk = useUserLookup()
  const srvLk = useServerLookup()
  // 이 신청(할당)에 달린 변경/회수 요청 — 있으면 변경 이력 상세로 가는 버튼 노출.
  const [changeReq, setChangeReq] = useState<ChangeRequest | null>(null)
  useEffect(() => {
    if (!item || item.status !== 'approved') { setChangeReq(null); return }
    let alive = true
    const reqId = item.id
    fetchChangeRequests(item.requesterUserId)
      .then((list) => { if (alive) setChangeReq(list.find((c) => c.before?.requestId === reqId) ?? null) })
      .catch(() => { if (alive) setChangeReq(null) })
    return () => { alive = false }
  }, [item])

  if (!item) {
    return (
      <div className="anim-fade flex flex-col h-full" style={mutedFix}>
        <StepBack to="/requests/status" label="자원 신청현황" />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {isLoading ? (
            <span className="text-muted" style={{ fontSize: 14 }}>신청 정보를 불러오는 중…</span>
          ) : (
            <EmptyState
              title="신청을 찾을 수 없어요"
              description="신청번호가 올바른지 확인해 주세요."
              cta={<Button variant="outline" onClick={() => navigate('/requests/status')}>신청 현황으로</Button>}
            />
          )}
        </div>
      </div>
    )
  }

  const alloc = deriveAllocation(item)
  const allocServer = alloc ? srvLk.server(alloc.serverId) : undefined
  const allocGpu = alloc ? srvLk.gpu(alloc.serverId, alloc.gpuId) : undefined
  // 할당된 MIG 슬라이스(있으면) — 자원 제한(VRAM) 표시용
  const allocSlice = allocGpu?.slices?.find((s) => s.requestId === item.id || s.id === item.allocatedSliceId)
  const vramLimit = allocSlice?.gb ?? allocGpu?.vramGb
  const isSlice = item.capacityUnit === 'slice'
  // 할당 자원 제한 — DB 확정값(allocated_*) 우선, 없으면 유형별 기본 쿼터(폴백)
  const cpuLimit = item.allocatedCpuCores != null ? `${item.allocatedCpuCores} vCPU` : isSlice ? '8 vCPU' : '16 vCPU'
  const memLimit = item.allocatedRamGb != null ? `${item.allocatedRamGb} GB` : isSlice ? '32 GB' : '64 GB'
  const storeLimit = item.allocatedStorageGb != null ? `${item.allocatedStorageGb} GB` : isSlice ? '200 GB' : '500 GB'
  // 관리자=자원맵 딥링크 / 사용자(B/C)=본인 할당 화면(/dashboard). 자원맵은 관리자 전용 라우트라 분기.
  const resourceLink = allocationLink(item, isAdmin)
  const priorityKr = item.priority === 'high' ? '높음' : item.priority === 'low' ? '낮음' : '보통'

  return (
    <div className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      {/* 상단 — 뒤로가기(목록 4.6 목록 페이지와 동일 버튼). 신청번호·상태는 명세서 레터헤드. */}
      <header className="shrink-0" style={{ marginBottom: 14 }}>
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => navigate(-1)}
          className="flex items-center justify-center rounded-[9px] border border-line bg-card2 text-muted hover:text-text hover:bg-soft cursor-pointer transition-colors"
          style={{ width: 34, height: 34 }}
        >
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
      </header>

      {/* 진행 타임라인 — 상단 브레드크럼은 전역 헤더가 표기. */}
      <section className="bg-card2 border border-line rounded-[14px] shrink-0" style={{ boxShadow: 'var(--shadow-card)', padding: '22px 28px 16px' }}>
        <FlowStepper steps={buildFlow(item)} />
      </section>

      {/* 3) 자원 신청 명세서 + 상태별 처리 카드 — 남는 높이를 끝까지 채움 */}
      <div className="grid items-stretch flex-1 min-h-0" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 16, marginTop: 16 }}>
        <RequestSpec item={item} />

        {/* 상태별 — pending: 검토 안내 / approved: 처리 결과 / rejected: 반려 사유 + 재신청 */}
        {item.status === 'pending' && (
          <Card title="처리 현황" fill>
            <div className="flex flex-col h-full">
              <SoftBox
                tone="accent"
                icon={<ClockIcon style={{ width: 16, height: 16 }} />}
                title="관리자 검토 중입니다"
                body="신청이 접수되어 관리자가 검토하고 있어요. 처리 결과는 이 페이지와 알림 센터에서 확인할 수 있어요."
              />
              <div style={{ marginTop: 14 }}>
                <KV k="접수 일시" v={item.createdAt} />
                <KV k="우선순위" v={priorityKr} />
                <KV k="예상 처리" v="영업일 기준 1~2일 내" />
              </div>
              {/* 관리자 검토 항목 — 내용 크기만큼만 */}
              <div className="rounded-[10px]" style={{ marginTop: 16, background: 'var(--c-soft)', padding: '12px 14px' }}>
                <div className="font-bold text-text" style={{ fontSize: 14, marginBottom: 6 }}>관리자 검토 항목</div>
                <CheckRow>요청 모델 대비 자원 가용성 확인</CheckRow>
                <CheckRow>보안 등급 · 운영 환경 적정성 검토</CheckRow>
                <CheckRow>사용 목적 · 첨부 문서 확인</CheckRow>
              </div>
              {/* 처리 단계 — 남는 높이 채움 */}
              <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: 18 }}>
                <div className="font-bold text-text shrink-0" style={{ fontSize: 14, marginBottom: 14 }}>처리 단계</div>
                <MiniSteps
                  fill
                  steps={[
                    { label: '접수 완료', sub: item.createdAt, state: 'done' },
                    { label: '관리자 검토', sub: '진행 중 · 영업일 1~2일', state: 'current' },
                    { label: '승인 · 자원 할당', sub: '결과 통보 대기', state: 'upcoming' },
                  ]}
                />
              </div>
            </div>
          </Card>
        )}

        {item.status === 'approved' && (
          <Card title="처리 결과" fill>
            <div className="flex flex-col h-full">
              {/* 할당 위치 — 어떤 서버에 어떤 GPU 장치가 배정됐는지(서버 ⊃ GPU) */}
              <div className="rounded-[10px]" style={{ background: 'var(--ok-soft)', padding: '15px 16px 17px' }}>
                <div className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 14, color: 'var(--c-ok)' }}>
                  <CheckIcon style={{ width: 16, height: 16 }} />
                  자원이 할당되었습니다
                </div>
                <div className="flex flex-col" style={{ gap: 14, marginTop: 14 }}>
                  <AllocNode
                    icon={<ServerStackIcon style={{ width: 17, height: 17 }} />}
                    kind="할당 서버"
                    name={allocServer?.host ?? alloc?.serverId ?? DASH}
                    sub={allocServer?.network ? `${allocServer.network} 네트워크` : undefined}
                    mono
                    connector={!!allocGpu}
                  />
                  {allocGpu && (
                    <AllocNode
                      icon={<CpuChipIcon style={{ width: 17, height: 17 }} />}
                      kind={allocGpu.allocMode === 'mig' ? '할당 GPU · MIG 슬라이스' : '할당 GPU · 단독'}
                      name={allocGpu.model ?? DASH}
                      sub={[allocGpu.serial, allocGpu.interconnect].filter(Boolean).join(' · ') || undefined}
                    />
                  )}
                </div>
                {allocGpu && (
                  <div className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: 14 }}>
                    <SpecChip>{allocGpu.arch}</SpecChip>
                    <SpecChip>VRAM {allocGpu.vramGb}GB</SpecChip>
                    <SpecChip>{allocGpu.allocMode === 'mig' ? 'MIG 분할' : '단독 할당'}</SpecChip>
                  </div>
                )}
              </div>
              {/* 할당 자원 제한 — GPU·VRAM·CPU·메모리·저장 */}
              <div style={{ marginTop: 14 }}>
                <div className="font-bold text-text" style={{ fontSize: 14, marginBottom: 6 }}>할당 자원 제한</div>
                <div className="rounded-[10px]" style={{ background: 'var(--c-soft)', padding: '2px 14px' }}>
                  <ResLimit label="VRAM" value={vramLimit ? `${vramLimit} GB` : DASH} />
                  <ResLimit label="CPU" value={cpuLimit} />
                  <ResLimit label="메모리" value={memLimit} />
                  <ResLimit label="저장 공간" value={storeLimit} last />
                </div>
              </div>
              {/* 처리 정보 */}
              <div style={{ marginTop: 16 }}>
                <KV k="처리일시" v={item.processedAt ?? DASH} />
                <KV k="처리자" v={item.processedBy ? (userLk.name(item.processedBy) ?? item.processedBy) : DASH} />
              </div>
              <div className="flex flex-col flex-1 min-h-0" style={{ marginTop: 14 }}>
                <div className="text-muted shrink-0" style={{ fontSize: 14 }}>관리자 메모</div>
                <p className="text-text rounded-[10px] flex-1 min-h-0" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8, padding: '12px 14px', background: 'var(--c-soft)' }}>
                  {item.adminMemo ?? '메모 없음'}
                </p>
              </div>
              {/* 액션 — (변경/회수 요청 있으면) 변경 이력 보기 + 할당 자원 보기 */}
              <div className="flex" style={{ paddingTop: 14, gap: 10 }}>
                {changeReq && (
                  <Button
                    variant="outline"
                    className="flex-1 justify-center"
                    onClick={() => navigate(`/requests/gpu-change/${changeReq.id}`)}
                  >
                    <ArrowsRightLeftIcon style={{ width: 16, height: 16 }} />
                    변경 이력 보기
                  </Button>
                )}
                <Button
                  disabled={!resourceLink}
                  onClick={() => resourceLink && navigate(resourceLink)}
                  className="flex-1 justify-center"
                >
                  <ArrowTopRightOnSquareIcon style={{ width: 16, height: 16 }} />
                  할당 자원 보기
                </Button>
              </div>
            </div>
          </Card>
        )}

        {item.status === 'rejected' && (
          <Card title="처리 결과" fill>
            <div className="flex flex-col h-full">
              <SoftBox
                tone="danger"
                icon={<XCircleIcon style={{ width: 16, height: 16 }} />}
                title="반려되었습니다"
                body={item.rejectReason ?? DASH}
              />
              <div style={{ marginTop: 12 }}>
                <div className="text-muted" style={{ fontSize: 14 }}>관리자 메모</div>
                <p className="text-text rounded-[10px]" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8, padding: '12px 14px', background: 'var(--c-soft)' }}>
                  {item.adminMemo ?? '메모 없음'}
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <KV k="처리일시" v={item.processedAt ?? DASH} />
                <KV k="처리자" v={item.processedBy ? (userLk.name(item.processedBy) ?? item.processedBy) : DASH} />
              </div>
              {/* 보완 가이드 — 남는 높이 채움 */}
              <div className="flex flex-col flex-1 min-h-0 rounded-[10px]" style={{ marginTop: 12, background: 'var(--c-soft)', padding: '12px 14px' }}>
                <div className="font-bold text-text" style={{ fontSize: 14, marginBottom: 6 }}>재신청 전 보완 가이드</div>
                <CheckRow>반려 사유와 관리자 메모를 먼저 확인하세요</CheckRow>
                <CheckRow>요청 규모 · 사용 목적을 구체적으로 보완</CheckRow>
                <CheckRow>보안 등급 · 운영 환경을 다시 점검</CheckRow>
                <CheckRow>필요 시 결재 공문을 첨부</CheckRow>
                <p className="text-muted mt-auto" style={{ fontSize: 14, lineHeight: 1.55, paddingTop: 10 }}>
                  재신청하면 이전 신청 내용이 그대로 채워진 채로 시작됩니다.
                </p>
              </div>
              <div className="mt-auto" style={{ paddingTop: 14 }}>
                <Button variant="outline" className="w-full justify-center" onClick={() => navigate(`/requests/new?from=${item.id}`)}>
                  <ArrowPathIcon style={{ width: 16, height: 16 }} />
                  재신청
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="shrink-0 flex items-center gap-1.5 text-muted" style={{ fontSize: 14, paddingTop: 12 }}>
        <DocumentTextIcon style={{ width: 15, height: 15 }} />
        처리 관련 문의는 게시판 · 공지에서 관리자에게 남길 수 있습니다.
      </div>
    </div>
  )
}

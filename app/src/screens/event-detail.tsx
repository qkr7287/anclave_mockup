import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CheckCircleIcon,
  CpuChipIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  FireIcon,
  ServerStackIcon,
  SignalIcon,
  Squares2X2Icon,
  ViewfinderCircleIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { Badge, Button, EmptyState, SeverityBadge, useToast } from '../components/ui'
import { useRole } from '../lib/role'
import { gpuById, serverById, userById } from '../data'
import { fmtPower, fmtTemp, gpuServices, trend } from '../lib/metrics'
import type { EventLog, EventStatus, Gpu, GpuServer, Severity } from '../data/types'
import { useMutedFix } from './approvals'
import {
  eventRowToLog,
  filterEventRowsForUser,
  getEventById,
  getEventsForUser,
  markRead,
  resolveEvent,
  serverIdOf,
  targetOf,
  targetPath,
  useEvent,
} from './event-store'

// 4.21a 이벤트 상세 — "발생 순간 스냅샷" 컨셉.
//   이벤트가 발생한 그 시점의 시스템 상태를 캡처해 동결(freeze)했다는 가정 →
//   좌: 발생 시점 스냅샷(캡처값 + 발생 직전 추이) / 우: 이벤트 내용 + 처리.
//   화면 높이에 꽉 채움 · 폰트 14px(프로젝트 floor) 통일 · 토큰만 · 수치/코드 monospace.

const FS = 14 // 폰트 floor — 본문 전부 14px, 위계는 weight·color 로.

const SEV: Record<Severity, { label: string; color: string; soft: string }> = {
  critical: { label: '위험', color: 'var(--c-danger)', soft: 'var(--danger-soft)' },
  warn: { label: '경고', color: 'var(--c-warn)', soft: 'var(--warn-soft)' },
  info: { label: '정보', color: 'var(--c-accent)', soft: 'var(--accent-soft)' },
  recovered: { label: '복구', color: 'var(--c-ok)', soft: 'var(--ok-soft)' },
}

function EventStatusBadge({ status }: { status: EventStatus }) {
  return status === 'open' ? <Badge tone="warn">미해결</Badge> : <Badge tone="ok">해결</Badge>
}

// 발생 상황 1줄 설명 + 원인 메트릭(임계 대비).
function describe(event: EventLog, gpu?: Gpu): { lead: string; cause?: { label: string; value: string; note: string; tone: typeof SEV[Severity] } } {
  const sev = SEV[event.severity]
  if (gpu?.xid) return { lead: `GPU 하드웨어 장애(${gpu.xid})가 감지되어 점검 모드로 전환됐어요. 드라이버 응답이 없는 상태로 캡처됐습니다.`, cause: { label: '장애 코드', value: gpu.xid, note: 'XID 하드웨어 오류', tone: SEV.critical } }
  if (gpu && gpu.temp >= 75) return { lead: '발생 시점 GPU 온도가 경고 임계(75°C)를 초과했어요. 과열 직전 상태로 스냅샷이 캡처됐습니다.', cause: { label: '온도', value: fmtTemp(gpu.temp), note: '임계 75°C 초과', tone: sev } }
  if (event.severity === 'warn') return { lead: '자원 사용률이 높아 모니터링 대상으로 표시됐어요. 발생 시점 상태를 스냅샷으로 남겼습니다.', cause: gpu ? { label: 'SM 사용률', value: `${gpu.smUtil}%`, note: '부하 모니터링', tone: sev } : undefined }
  if (event.severity === 'recovered') return { lead: '자원이 회수되어 가용 상태로 복구됐어요. 회수 시점 상태를 스냅샷으로 남겼습니다.' }
  return { lead: '배포가 정상 완료된 시점의 상태를 스냅샷으로 캡처했어요.' }
}

// 캡처값 메트릭 칩 — 라벨/값(mono)/게이지 바. tone 지정 시 임계 강조.
function Metric({ label, value, ratio, tone, Icon }: { label: string; value: string; ratio: number; tone?: typeof SEV[Severity]; Icon: typeof FireIcon }) {
  const color = tone?.color ?? 'var(--c-accent)'
  return (
    <div className="rounded-[10px] border min-w-0 flex flex-col justify-center" style={{ borderColor: tone ? color : 'var(--c-border)', background: tone ? tone.soft : 'var(--c-card)', padding: '11px 13px', minHeight: 64 }}>
      <div className="flex items-center gap-1.5" style={{ color: tone ? color : 'var(--c-muted)' }}>
        <Icon style={{ width: 15, height: 15 }} />
        <span className="font-medium truncate" style={{ fontSize: FS }}>{label}</span>
      </div>
      <div className="font-mono font-bold text-text" style={{ fontSize: FS, marginTop: 5, letterSpacing: '-0.2px' }}>{value}</div>
      <div className="rounded-full overflow-hidden" style={{ height: 5, marginTop: 8, background: 'var(--c-track)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, ratio * 100))}%`, background: color }} />
      </div>
    </div>
  )
}

// 발생 직전 추이 — Y축 온도 눈금(그리드+라벨) + 라인/면적(SVG, 가변) + 정원 끝점 마커(HTML 오버레이).
// 좌측 거터에 눈금 라벨을 두어 라인과 겹치지 않게, 임계(75°C)는 강조.
function CaptureTrend({ data, color, threshold, domain, ticks }: { data: number[]; color: string; threshold?: number; domain: [number, number]; ticks: number[] }) {
  const W = 320
  const H = 100
  const pad = 6
  const [lo, hi] = domain
  const span = Math.max(1, hi - lo)
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2)
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2)
  const yPct = (v: number) => (y(v) / H) * 100
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`
  const lx = x(data.length - 1)
  const gid = `cap-${color.replace(/[^a-z]/gi, '')}`
  return (
    <div className="relative w-full h-full flex">
      {/* 좌측 Y축 눈금 라벨 거터 */}
      <div className="relative shrink-0" style={{ width: 38 }}>
        {ticks.map((t) => (
          <span key={t} className="absolute font-mono" style={{ right: 7, top: `${yPct(t)}%`, transform: 'translateY(-50%)', fontSize: FS, lineHeight: 1, whiteSpace: 'nowrap', color: t === threshold ? (color) : 'var(--c-muted)', fontWeight: t === threshold ? 700 : 400, opacity: t === threshold ? 1 : 0.6 }}>{t}°</span>
        ))}
      </div>
      {/* 플롯 영역 */}
      <div className="relative flex-1 min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.26" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Y 그리드라인 — 임계는 강조 점선 */}
          {ticks.map((t) => (
            <line key={t} x1={0} y1={y(t)} x2={W} y2={y(t)}
              stroke={t === threshold ? color : 'var(--c-border)'}
              strokeWidth={1}
              strokeDasharray={t === threshold ? '4 3' : undefined}
              opacity={t === threshold ? 0.65 : 0.5}
              vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {/* 발생(캡처) 지점 세로 가이드 */}
          <line x1={lx} y1={pad} x2={lx} y2={H - pad} stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.55} vectorEffect="non-scaling-stroke" />
        </svg>
        {/* 발생 끝점 — HTML 오버레이로 정원 유지 */}
        <span className="absolute rounded-full" style={{ left: '100%', top: `${yPct(data[data.length - 1])}%`, width: 12, height: 12, marginLeft: -10, marginTop: -6, background: color, boxShadow: `0 0 0 5px ${color}33`, pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

// 컴팩트 키–값 행.
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0" style={{ padding: '8px 0', borderBottom: '1px solid var(--c-border-s)' }}>
      <span className="text-muted shrink-0" style={{ fontSize: FS, width: 74 }}>{label}</span>
      <span className="text-text min-w-0 flex-1 flex items-center" style={{ fontSize: FS }}>{children}</span>
    </div>
  )
}

export function EventDetail({ id: idProp, onBack }: { id?: string; onBack?: () => void } = {}) {
  const params = useParams()
  const id = idProp ?? params.id
  const navigate = useNavigate()
  const toast = useToast()
  const mutedFix = useMutedFix()
  const { user, isAdmin } = useRole()
  const goBack = onBack ?? (() => navigate('/events'))

  // 상세 = DB(/api/events/:id). 접근 허용·표시 모두 DB 우선, 없으면(로딩·404·다운) 시드 폴백.
  const { data: dbEvent } = useEvent(id ?? null)

  const allowed = useMemo(() => {
    if (isAdmin) return true
    if (dbEvent) return filterEventRowsForUser([dbEvent], user.id).length > 0
    return getEventsForUser(user.id).some((e) => e.id === id)
  }, [isAdmin, user.id, id, dbEvent])

  const [event, setEvent] = useState<EventLog | undefined>(() => (id ? getEventById(id) : undefined))
  const [assignee, setAssignee] = useState('')
  const [action, setAction] = useState('')
  // 로컬 해결 처리 후 DB 폴링이 덮어쓰지 않게(백엔드 PATCH 없음 — 낙관적 로컬이 SoT).
  const [resolvedLocal, setResolvedLocal] = useState(false)

  // id 전환 시 읽음 처리 + 로컬 해결 플래그 리셋.
  useEffect(() => {
    if (!id || !allowed) return
    markRead(id)
    setResolvedLocal(false)
  }, [id, allowed])

  // DB(상세) 도착 → 표시 이벤트 갱신(로컬 해결 전까지) · 없으면 시드 폴백.
  useEffect(() => {
    if (!id || !allowed || resolvedLocal) return
    const e = dbEvent ? eventRowToLog(dbEvent) : getEventById(id)
    setEvent(e)
    setAssignee(e?.assignee ?? user.name)
    setAction(e?.action ?? '')
  }, [id, allowed, dbEvent, resolvedLocal, user.name])

  if (!event || !allowed) {
    return (
      <div data-event-detail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
        <div className="flex items-center justify-center flex-1" style={{ minHeight: 360 }}>
          <EmptyState
            tone="danger"
            title={allowed ? '이벤트를 찾을 수 없어요' : '접근할 수 없는 이벤트예요'}
            description={allowed ? '삭제되었거나 주소가 올바르지 않아요.' : '본인 할당 자원에서 발생한 이벤트만 볼 수 있어요.'}
            cta={<Button variant="outline" onClick={goBack}>이벤트 목록으로</Button>}
          />
        </div>
      </div>
    )
  }

  const sev = SEV[event.severity]
  const target = targetOf(event)
  const path = targetPath(event, isAdmin)
  const isOpen = event.status === 'open'
  const srvId = serverIdOf(event)
  const gpu = event.gpuId ? gpuById(event.gpuId) : undefined
  const server: GpuServer | undefined = srvId ? serverById(srvId) : undefined
  const svc = gpu ? gpuServices(gpu)[0] : undefined
  const tempHot = gpu ? gpu.temp >= 75 : false
  // 발생 직전 추이 — 끝점은 실제 캡처 온도로 고정해 라인이 '발생' 점/라벨로 수렴하게(노이즈로 끝이 ↘ 꺾이는 것 방지).
  const captureTemp = gpu?.temp ?? 0
  const series = gpu ? trend(gpu.temp, 30, 7, 4).map((v, i, a) => (i === a.length - 1 ? captureTemp : v)) : []
  const { lead, cause } = describe(event, gpu)

  const submit = () => {
    if (!action.trim()) {
      toast.push('조치 내용을 입력해 주세요.', 'warn')
      return
    }
    // 낙관적 로컬 반영(백엔드 PATCH 미제공) — DB-only 이벤트도 동작. 시드 세션엔 best-effort 반영.
    const updated: EventLog = { ...event, status: 'resolved', read: true, assignee, action, resolution: action }
    resolveEvent(event.id, { assignee, action, resolution: action })
    setResolvedLocal(true)
    setEvent(updated)
    toast.push('이벤트를 해결 처리했어요.', 'info')
  }

  const chip = 'inline-flex items-center gap-1.5 rounded-[7px] font-medium'
  const chipStyle = { fontSize: FS, padding: '4px 10px', background: 'var(--c-soft)', color: 'var(--c-muted)' } as const

  return (
    <div data-event-detail className="anim-fade flex flex-col min-w-0 h-full" style={mutedFix}>
      <style>{`
        [data-event-detail]{user-select:none;-webkit-user-select:none}
        [data-event-detail] button:not(:disabled),[data-event-detail] a,[data-event-detail] select{cursor:pointer}
        [data-event-detail] button:disabled{cursor:not-allowed}
        [data-event-detail] input,[data-event-detail] textarea{user-select:text;-webkit-user-select:text;cursor:auto}
      `}</style>

      {/* ── 인시던트 헤더 ── */}
      <header className="flex items-start gap-3 shrink-0">
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로 가기"
          className="flex items-center justify-center shrink-0 rounded-[10px] border border-line bg-card2 text-muted transition-[transform,background-color,color] duration-100 hover:bg-soft hover:text-text active:scale-90"
          style={{ width: 38, height: 38, boxShadow: 'var(--shadow-card)' }}
        >
          <ArrowLeftIcon style={{ width: 18, height: 18 }} />
        </button>
        <div className="flex-1 min-w-0 bg-card2 border border-line rounded-[12px] overflow-hidden flex" style={{ boxShadow: 'var(--shadow-card)' }}>
          <span className="shrink-0" style={{ width: 4, background: sev.color }} />
          <div className="flex-1 min-w-0 flex items-center gap-4" style={{ padding: '12px 16px' }}>
            <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 38, height: 38, background: sev.soft, color: sev.color }}>
              {event.severity === 'critical' ? <FireIcon style={{ width: 20, height: 20 }} /> : <ExclamationTriangleIcon style={{ width: 20, height: 20 }} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                <SeverityBadge severity={event.severity} />
                <EventStatusBadge status={event.status} />
                <span className="font-mono uppercase shrink-0 truncate" style={{ fontSize: FS, letterSpacing: '0.4px', color: 'var(--c-muted)' }}>incident · {event.id}</span>
              </div>
              <h1 className="font-bold text-text truncate" style={{ fontSize: FS, lineHeight: 1.3 }}>{event.message}</h1>
            </div>
            <div className="hidden md:flex flex-col items-end shrink-0" style={{ gap: 3 }}>
              <span className="font-mono text-text" style={{ fontSize: FS }}>{event.createdAt}</span>
              <span className="flex items-center gap-1.5" style={{ fontSize: FS, color: event.read ? 'var(--c-muted)' : 'var(--c-accent)', fontWeight: 600 }}>
                <span className="rounded-full" style={{ width: 7, height: 7, background: event.read ? 'var(--c-muted)' : 'var(--c-accent)' }} />
                {event.read ? '읽음' : '안읽음'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── 본문 — 높이 꽉 채움 ── */}
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 1fr)', gap: 14, marginTop: 14 }}>

        {/* 좌 — 발생 시점 스냅샷(캡처 프레임) */}
        <section className="bg-card2 border rounded-[13px] flex flex-col min-h-0 overflow-hidden" style={{ borderColor: sev.color, boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 shrink-0 border-b border-line" style={{ padding: '12px 18px' }}>
            <ViewfinderCircleIcon style={{ width: 17, height: 17, color: sev.color }} />
            <h2 className="font-bold text-text" style={{ fontSize: FS }}>발생 시점 스냅샷</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full font-semibold" style={{ fontSize: FS, padding: '2px 10px', background: sev.soft, color: sev.color }}>
              <span className="rounded-full" style={{ width: 5, height: 5, background: sev.color }} />캡처됨
            </span>
            <span className="ml-auto font-mono" style={{ fontSize: FS, color: 'var(--c-muted)' }}>capture · {event.createdAt}</span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col" style={{ padding: '14px 18px', gap: 13 }}>
            {/* 자원 식별 */}
            {gpu ? (
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 40, height: 40, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
                  <CpuChipIcon style={{ width: 21, height: 21 }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text truncate" style={{ fontSize: FS }}>{gpu.model}</div>
                  <div className="font-mono text-muted truncate" style={{ fontSize: FS }}>{target.label} · {gpu.arch} · {gpu.vramGb}GB</div>
                </div>
                {path && (
                  <button type="button" onClick={() => navigate(path)} className="shrink-0 inline-flex items-center gap-1.5 font-medium rounded-[8px] transition-[transform,box-shadow] duration-100 active:scale-95 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)]" style={{ fontSize: FS, padding: '7px 12px', background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
                    <ArrowTopRightOnSquareIcon style={{ width: 15, height: 15 }} />{isAdmin ? '자원맵' : '내 자원'}
                  </button>
                )}
              </div>
            ) : server ? (
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center justify-center shrink-0 rounded-[10px]" style={{ width: 40, height: 40, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
                  <ServerStackIcon style={{ width: 21, height: 21 }} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-text truncate" style={{ fontSize: FS }}>{server.id}</div>
                  <div className="font-mono text-muted truncate" style={{ fontSize: FS }}>{server.host} · {server.rack}</div>
                </div>
              </div>
            ) : (
              <p className="text-muted shrink-0" style={{ fontSize: FS }}>연결된 자원 정보가 없는 이벤트예요.</p>
            )}

            {/* 캡처 컨텍스트 칩 */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <span className={chip} style={chipStyle}><ViewfinderCircleIcon style={{ width: 14, height: 14 }} />발생 시점 동결값</span>
              {svc && <span className={chip} style={chipStyle}><CubeTransparentIcon style={{ width: 14, height: 14 }} />영향 서비스 · {svc.name}</span>}
              {gpu?.xid && <span className="inline-flex items-center gap-1.5 rounded-[7px] font-mono font-semibold" style={{ fontSize: FS, padding: '4px 10px', background: 'var(--danger-soft)', color: 'var(--c-danger)' }}><ExclamationTriangleIcon style={{ width: 14, height: 14 }} />{gpu.xid}</span>}
            </div>

            {/* 캡처값 메트릭 — 2×2 컴팩트 */}
            {gpu && (
              <div className="grid shrink-0" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Metric label="온도" value={fmtTemp(gpu.temp)} ratio={gpu.temp / 100} tone={tempHot ? sev : undefined} Icon={FireIcon} />
                <Metric label="SM 사용률" value={`${gpu.smUtil}%`} ratio={gpu.smUtil / 100} Icon={BoltIcon} />
                <Metric label="VRAM" value={`${gpu.vramUtil}%`} ratio={gpu.vramUtil / 100} Icon={Squares2X2Icon} />
                <Metric label="전력" value={fmtPower(gpu.power)} ratio={gpu.power / 350} Icon={SignalIcon} />
              </div>
            )}
            {!gpu && server && (
              <div className="grid shrink-0" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Metric label="CPU 사용률" value={`${server.cpuUtil}%`} ratio={server.cpuUtil / 100} Icon={BoltIcon} />
                <Metric label="메모리" value={`${server.memUtil}%`} ratio={server.memUtil / 100} Icon={Squares2X2Icon} />
              </div>
            )}

            {/* 발생 직전 추이 — 남은 높이 채움 · 우측 끝 = 캡처(발생) 지점 */}
            {gpu && (
              <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 7 }}>
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-muted" style={{ fontSize: FS }}>발생 직전 온도 추이</span>
                  <span className="font-mono" style={{ fontSize: FS, color: tempHot ? sev.color : 'var(--c-muted)' }}>임계 75°C{tempHot ? ' 초과' : ''}</span>
                </div>
                <div className="flex-1 min-h-0 rounded-[10px] border border-line overflow-hidden" style={{ minHeight: 150, background: 'var(--c-card)', padding: '8px 10px 6px 6px' }}>
                  <CaptureTrend data={series} color={tempHot ? sev.color : 'var(--c-accent)'} threshold={75} domain={[45, 95]} ticks={[55, 65, 75, 85, 95]} />
                </div>
                <div className="flex items-center justify-between font-mono shrink-0" style={{ fontSize: FS, color: 'var(--c-muted)', paddingLeft: 38 }}>
                  <span>-22h 전</span>
                  <span style={{ color: sev.color, fontWeight: 700 }}>● 발생 {fmtTemp(gpu.temp)}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 우 — 이벤트 내용 + 처리 */}
        <section className="bg-card2 border border-line rounded-[13px] flex flex-col min-h-0 overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 shrink-0 border-b border-line" style={{ padding: '12px 18px' }}>
            <WrenchScrewdriverIcon style={{ width: 17, height: 17, color: 'var(--c-accent)' }} />
            <h2 className="font-bold text-text" style={{ fontSize: FS }}>이벤트 내용</h2>
            <span className="ml-auto"><EventStatusBadge status={event.status} /></span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ padding: '14px 18px' }}>
            {/* 메시지 + 발생 상황 */}
            <p className="font-bold text-text shrink-0" style={{ fontSize: FS, lineHeight: 1.45 }}>{event.message}</p>
            <p className="text-muted shrink-0" style={{ fontSize: FS, lineHeight: 1.55, marginTop: 8 }}>{lead}</p>

            {/* 원인 콜아웃 */}
            {cause && (
              <div className="flex items-center gap-3 rounded-[10px] shrink-0" style={{ marginTop: 13, padding: '11px 13px', background: cause.tone.soft, border: `1px solid ${cause.tone.color}` }}>
                <ExclamationTriangleIcon style={{ width: 18, height: 18, color: cause.tone.color, flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <span className="text-muted" style={{ fontSize: FS }}>{cause.label} · {cause.note}</span>
                  <div className="font-mono font-bold" style={{ fontSize: FS, color: cause.tone.color, marginTop: 2 }}>{cause.value}</div>
                </div>
              </div>
            )}

            {/* 팩트 */}
            <div className="shrink-0" style={{ marginTop: 13 }}>
              <Fact label="심각도"><SeverityBadge severity={event.severity} /></Fact>
              <Fact label="대상"><span className="font-mono truncate">{target.label}</span>{svc && <span className="text-muted truncate" style={{ marginLeft: 8 }}>· {svc.name}</span>}</Fact>
              <Fact label="발생일시"><span className="font-mono">{event.createdAt}</span></Fact>
            </div>

            {/* 발생 경위 — 컴팩트 타임라인 */}
            <div className="shrink-0" style={{ marginTop: 14 }}>
              <span className="text-muted" style={{ fontSize: FS }}>발생 경위</span>
              <div className="flex flex-col" style={{ marginTop: 9 }}>
                {[
                  { c: sev.color, t: '이벤트 발생', d: `${sev.label} 등급 감지`, tm: event.createdAt, last: false },
                  { c: event.read ? 'var(--c-accent)' : 'var(--c-muted)', t: event.read ? '관제 확인' : '확인 대기', d: event.read ? '관제 화면 열람' : '미열람', tm: '', last: isOpen },
                  ...(isOpen ? [] : [{ c: 'var(--c-ok)', t: '해결 처리', d: event.assignee ? (userById(event.assignee)?.name ?? event.assignee) : '담당 미지정', tm: '', last: true }]),
                ].map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="rounded-full shrink-0" style={{ width: 10, height: 10, marginTop: 4, background: s.c, boxShadow: `0 0 0 3px ${s.c}22` }} />
                      {!s.last && <span style={{ width: 1.5, flex: 1, minHeight: 14, background: 'var(--c-border)', marginTop: 3 }} />}
                    </div>
                    <div className="min-w-0" style={{ paddingBottom: s.last ? 0 : 11 }}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text" style={{ fontSize: FS }}>{s.t}</span>
                        {s.tm && <span className="font-mono text-muted" style={{ fontSize: FS }}>{s.tm}</span>}
                      </div>
                      <span className="text-muted" style={{ fontSize: FS }}>{s.d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 처리 — 남은 높이 채움 */}
            <div className="flex-1 min-h-0 flex flex-col" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-1.5 shrink-0" style={{ marginBottom: 11 }}>
                <CubeTransparentIcon style={{ width: 15, height: 15, color: 'var(--c-accent)' }} />
                <span className="font-bold text-text" style={{ fontSize: FS }}>{isOpen ? '이벤트 처리' : '처리 결과'}</span>
                <span className="ml-auto font-mono" style={{ fontSize: FS, color: isOpen ? 'var(--c-warn)' : 'var(--c-ok)' }}>{isOpen ? '처리 대기' : '완료'}</span>
              </div>

              {isOpen ? (
                <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 10 }}>
                  <div className="flex items-center bg-card border border-line rounded-[8px] shrink-0 transition-[border-color,box-shadow] focus-within:border-[color:var(--c-accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]" style={{ height: 40, padding: '0 13px' }}>
                    <span className="text-muted shrink-0" style={{ fontSize: FS, marginRight: 9 }}>담당</span>
                    <input value={assignee} onChange={(e) => setAssignee(e.target.value)} className="bg-transparent min-w-0 flex-1 text-text" style={{ fontSize: FS, outline: 'none', border: 'none' }} placeholder="담당자 지정" />
                  </div>
                  <textarea
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="flex-1 min-h-0 bg-card border border-line rounded-[8px] text-text resize-none transition-[border-color,box-shadow] focus:border-[color:var(--c-accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                    style={{ fontSize: FS, padding: '10px 13px', outline: 'none', lineHeight: 1.55, minHeight: 64 }}
                    placeholder="조치 내용 — 입력하면 해결 처리 결과로 기록돼요."
                  />
                  <Button className="w-full justify-center shrink-0" onClick={submit} style={{ height: 40, fontSize: FS }}>
                    <CheckCircleIcon style={{ width: 16, height: 16 }} />해결 처리
                  </Button>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col" style={{ gap: 11 }}>
                  <div className="shrink-0"><Fact label="담당">{event.assignee ? (userById(event.assignee)?.name ?? event.assignee) : '—'}</Fact></div>
                  <div className="flex-1 min-h-0 rounded-[10px] flex flex-col justify-center" style={{ background: 'var(--ok-soft)', border: '1px solid var(--c-ok)', padding: '13px 15px', minHeight: 92 }}>
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--c-ok)' }}>
                      <CheckCircleIcon style={{ width: 16, height: 16 }} />
                      <span className="font-bold" style={{ fontSize: FS }}>해결 처리됨</span>
                    </div>
                    <p className="text-text" style={{ fontSize: FS, lineHeight: 1.55, marginTop: 7 }}>{event.action ?? event.resolution ?? '조치 완료'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

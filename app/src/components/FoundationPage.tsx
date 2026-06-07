import type { ReactNode } from 'react'
import { PageShell, SectionGrid } from './PageShell'
import { Card, KpiStat, Badge, StatusBadge, HealthBadge, SeverityBadge, Table } from './ui'
import type { Column } from './ui'
import { useRole } from '../lib/role'
import {
  servers,
  allGpus,
  users,
  userById,
  models,
  services,
  modelById,
  events,
  notifications,
  auditLogs,
  activationStats,
  boardPosts,
  agents,
  infraIntegrations,
  capabilities,
  accessPolicies,
  gpuRequests,
  apiRequests,
  publishRequests,
  gpuChangeRequests,
} from '../data'
import type {
  GpuServer,
  Model,
  Service,
  EventLog,
  BoardPost,
  AuditLog,
  InfraIntegration,
  GpuRequest,
} from '../data/types'

// ── 실시드 집계(모듈 1회) ──
const pendingReqs =
  gpuRequests.filter((r) => r.status === 'pending').length +
  apiRequests.filter((r) => r.status === 'pending').length +
  publishRequests.filter((r) => r.status === 'pending').length
const approvedReqs =
  gpuRequests.filter((r) => r.status === 'approved').length +
  apiRequests.filter((r) => r.status === 'approved').length +
  publishRequests.filter((r) => r.status === 'approved').length
const rejectedReqs =
  gpuRequests.filter((r) => r.status === 'rejected').length +
  apiRequests.filter((r) => r.status === 'rejected').length
const okServers = servers.filter((s) => s.health === 'normal').length
const dangerServers = servers.filter((s) => s.health === 'danger').length
const avgGpuUtil = Math.round(allGpus.reduce((a, g) => a + g.smUtil, 0) / allGpus.length)
const p95GpuUtil = [...allGpus.map((g) => g.smUtil)].sort((a, b) => a - b)[Math.floor(allGpus.length * 0.95)] ?? avgGpuUtil
const crit = events.filter((e) => e.severity === 'critical').length
const recovered = events.filter((e) => e.severity === 'recovered').length
const unread = notifications.filter((n) => !n.read).length
const apiSvc = services.filter((s) => s.hasApi).length
const totalCalls = activationStats.reduce((a, s) => a + s.calls, 0)
const totalTokens = activationStats.reduce((a, s) => a + s.tokens, 0)
const answeredQna = boardPosts.filter((p) => p.tab === 'qna' && p.answered).length
const openQna = boardPosts.filter((p) => p.tab === 'qna' && !p.answered).length
const onlineAgents = agents.filter((a) => a.status === 'active').length
const infraUp = infraIntegrations.filter((i) => i.status === 'connected').length
const flags = capabilities[0]?.enabledFeatures.length ?? 0
const maxModelUsage = Math.max(...models.map((m) => m.usageCount))
const maxSvcUsage = Math.max(...services.map((s) => s.usageCount))

const abbr = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`

type Kpi = {
  label: string
  value: string | number
  unit?: string
  delta?: string
  deltaTone?: 'ok' | 'danger' | 'muted'
  spark?: number[]
  bar?: number
  gauge?: number
  sub?: string
}

const S = {
  up: [42, 45, 44, 51, 58, 62, 70],
  wave: [60, 52, 64, 58, 70, 66, 74],
  down: [70, 66, 60, 58, 49, 44, 40],
  flat: [50, 54, 52, 56, 53, 57, 55],
}

const KPIS_BY_GROUP: Record<number, Kpi[]> = {
  1: [
    { label: '서버', value: servers.length, unit: '대', delta: `정상 ${okServers}`, deltaTone: 'ok', bar: (okServers / servers.length) * 100, sub: `랙 A·B·C 분산` },
    { label: 'GPU', value: allGpus.length, unit: '장', delta: 'H100', deltaTone: 'muted', spark: S.flat, sub: 'NVLink 클러스터·MIG' },
    { label: '평균 사용률', value: avgGpuUtil, unit: '%', delta: '▲ 3.2%p', deltaTone: 'ok', gauge: avgGpuUtil, sub: `p95 ${p95GpuUtil}%` },
    { label: '장애 서버', value: dangerServers, unit: '대', delta: dangerServers ? '점검 필요' : '없음', deltaTone: dangerServers ? 'danger' : 'ok', bar: (dangerServers / servers.length) * 100, sub: 'XID·헬스 경보' },
  ],
  2: [
    { label: '대기 신청', value: pendingReqs, unit: '건', delta: '검토 대기', deltaTone: 'muted', spark: S.wave, sub: 'GPU·API·게시' },
    { label: '승인', value: approvedReqs, unit: '건', delta: '▲ 이번 주', deltaTone: 'ok', spark: S.up, sub: '자원 배치 완료' },
    { label: '반려', value: rejectedReqs, unit: '건', delta: '사유 첨부', deltaTone: 'danger', bar: 30, sub: '재신청 가능' },
    { label: '변경·회수', value: gpuChangeRequests.length, unit: '건', delta: '4종', deltaTone: 'muted', bar: 50, sub: 'expand·migrate·reclaim' },
  ],
  3: [
    { label: '등록 모델', value: models.length, unit: '종', delta: 'LLM·VL·Image', deltaTone: 'muted', spark: S.flat, sub: '폐쇄망 반입' },
    { label: '서비스', value: services.length, unit: '개', delta: `API ${apiSvc}`, deltaTone: 'ok', bar: (apiSvc / services.length) * 100, sub: '모델 기반' },
    { label: '인기 1위', value: models[0]?.name.split(' ')[0] ?? '—', delta: `사용 ${abbr(models[0]?.usageCount ?? 0)}`, deltaTone: 'ok', spark: S.up, sub: models[0]?.name },
    { label: '노드 에이전트', value: agents.length, unit: '대', delta: `온라인 ${onlineAgents}`, deltaTone: 'ok', gauge: (onlineAgents / agents.length) * 100, sub: '자동 배포' },
  ],
  4: [
    { label: '서비스', value: services.length, unit: '개', delta: `API ${apiSvc}`, deltaTone: 'ok', bar: (apiSvc / services.length) * 100, sub: '마켓 노출' },
    { label: '총 호출', value: abbr(totalCalls), delta: '▲ 12.4%', deltaTone: 'ok', spark: S.up, sub: '최근 7일' },
    { label: '총 토큰', value: abbr(totalTokens), delta: '▲ 8.1%', deltaTone: 'ok', spark: S.wave, sub: '소비자 합산' },
    { label: '소비자', value: new Set(activationStats.map((a) => a.consumerUserId)).size, unit: '명', delta: '활성', deltaTone: 'ok', gauge: 64, sub: '발행자×소비자' },
  ],
  5: [
    { label: '이벤트', value: events.length, unit: '건', delta: '24시간', deltaTone: 'muted', spark: S.wave, sub: '심각도 4분류' },
    { label: '위험', value: crit, unit: '건', delta: crit ? '확인 필요' : '없음', deltaTone: crit ? 'danger' : 'ok', bar: (crit / events.length) * 100, sub: 'XID·ECC·헬스' },
    { label: '복구', value: recovered, unit: '건', delta: '자동 복구', deltaTone: 'ok', spark: S.up, sub: 'self-heal' },
    { label: '안읽음 알림', value: unread, unit: '건', delta: '미확인', deltaTone: 'danger', gauge: (unread / notifications.length) * 100, sub: `전체 ${notifications.length}건` },
  ],
  6: [
    { label: '전체 글', value: boardPosts.length, unit: '건', delta: '공지·문의·매뉴얼', deltaTone: 'muted', spark: S.flat, sub: '공통 게시판' },
    { label: '공지', value: boardPosts.filter((p) => p.tab === 'notice').length, unit: '건', delta: '최신', deltaTone: 'muted', bar: 40, sub: '운영 공지' },
    { label: '문의 답변', value: answeredQna, unit: '건', delta: `대기 ${openQna}`, deltaTone: openQna ? 'muted' : 'ok', gauge: answeredQna + openQna ? (answeredQna / (answeredQna + openQna)) * 100 : 0, sub: 'Q&A' },
    { label: '매뉴얼', value: boardPosts.filter((p) => p.tab === 'manual').length, unit: '건', delta: '도입 가이드', deltaTone: 'muted', bar: 35, sub: '모델 도입 문의' },
  ],
  7: [
    { label: '감사 로그', value: auditLogs.length, unit: '건', delta: '1년+ 보관', deltaTone: 'muted', spark: S.wave, sub: '행위 추적' },
    { label: '권한 정책', value: accessPolicies.length, unit: '건', delta: '역할별', deltaTone: 'muted', bar: 60, sub: '기본 deny' },
    { label: '콘솔 세션', value: auditLogs.filter((a) => a.action.includes('콘솔') || a.action.includes('접속') || a.action.includes('세션')).length, unit: '건', delta: '추적', deltaTone: 'ok', spark: S.up, sub: '워크스페이스' },
    { label: '보관 준수', value: 100, unit: '%', delta: '규정', deltaTone: 'ok', gauge: 100, sub: '1년+ 보존' },
  ],
  8: [
    { label: '노드', value: agents.length, unit: '대', delta: `온라인 ${onlineAgents}`, deltaTone: 'ok', gauge: (onlineAgents / agents.length) * 100, sub: '에이전트' },
    { label: '인프라 연동', value: infraIntegrations.length, unit: '개', delta: `정상 ${infraUp}`, deltaTone: infraUp === infraIntegrations.length ? 'ok' : 'danger', bar: (infraUp / infraIntegrations.length) * 100, sub: 'DCGM·Prom' },
    { label: '기능 플래그', value: flags, unit: '개', delta: 'MIG·재탐지', deltaTone: 'muted', spark: S.flat, sub: '능력 탐지' },
    { label: '사용자', value: users.length, unit: '명', delta: `호스팅 ${users.filter((u) => u.hasHosting).length}`, deltaTone: 'ok', bar: (users.filter((u) => u.hasHosting).length / users.length) * 100, sub: '역할 관리' },
  ],
}

const STEP_BY_SCREEN: Record<string, number> = {
  '4.2': 1, '4.3': 1, '4.4': 1, '4.5': 2, '4.6': 2, '4.8': 3, '4.11': 3,
  '4.9': 4, '4.10': 4, '4.12': 5, '4.13': 5, '4.14': 6, '4.15': 6, '4.16': 7,
  '4.17': 8, '4.18': 8, '4.19': 9, '4.20': 9, '4.21': 10, '4.22': 10,
  '4.7': 11, '4.23': 12, '4.24': 13, '4.25': 13, '4.26': 13, '4.27': 13, '4.28': 13,
}

const ACCESS_LABEL: Record<string, string> = { A: '최종관리자', B: '실무관리자', C: '사용자' }
const TAB_LABEL: Record<BoardPost['tab'], string> = { notice: '공지', qna: '문의', manual: '매뉴얼' }

// 셀 내부 막대(작업률/사용량) — 영역 안정·우정렬 수치
function CellBar({ pct, tone = 'accent' }: { pct: number; tone?: 'accent' | 'ok' | 'warn' | 'danger' }) {
  const color =
    tone === 'ok' ? 'var(--c-ok)' : tone === 'warn' ? 'var(--c-warn)' : tone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="rounded-full overflow-hidden shrink" style={{ height: 6, background: 'var(--c-soft)', flex: 1, minWidth: 0 }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
      </div>
      <span className="shrink-0 tabular-nums" style={{ fontSize: 14, width: 38, textAlign: 'right' }}>{Math.round(pct)}%</span>
    </div>
  )
}

// 그룹별 실시드 메인 테이블(밀도 핵심 — 단일 안내 카드 금지)
function PreviewTable({ group }: { group: number }) {
  if (group === 1) {
    const cols: Column<GpuServer>[] = [
      { key: 'name', header: '서버', width: '24%', render: (r) => <span className="font-semibold">{r.name}</span> },
      { key: 'health', header: '헬스', width: '18%', render: (r) => <HealthBadge health={r.health} /> },
      { key: 'cpu', header: 'CPU', width: '29%', render: (r) => <CellBar pct={r.cpuUtil} tone={r.cpuUtil > 85 ? 'warn' : 'accent'} /> },
      { key: 'mem', header: 'MEM', width: '29%', render: (r) => <CellBar pct={r.memUtil} tone={r.memUtil > 85 ? 'warn' : 'accent'} /> },
    ]
    return <Table title="서버 현황 (실시드)" columns={cols} rows={servers.slice(0, 6)} rowKey={(r) => r.id} />
  }
  if (group === 2) {
    const cols: Column<GpuRequest>[] = [
      { key: 'who', header: '신청자', width: '26%', render: (r) => <span className="font-semibold truncate">{userById(r.requesterUserId)?.name ?? r.requesterUserId}</span> },
      { key: 'cap', header: '용량', width: '22%', render: (r) => `${r.capacity}${r.capacityUnit === 'card' ? '장' : ' 슬라이스'}` },
      { key: 'st', header: '상태', width: '20%', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'at', header: '신청일', width: '32%', render: (r) => <span className="text-muted">{r.createdAt}</span> },
    ]
    return <Table title="GPU 신청 (실시드)" columns={cols} rows={gpuRequests.slice(0, 6)} rowKey={(r) => r.id} />
  }
  if (group === 3) {
    const cols: Column<Model>[] = [
      { key: 'name', header: '모델', width: '34%', render: (r) => <span className="font-semibold truncate">{r.name}</span> },
      { key: 'kind', header: '종류', width: '22%', render: (r) => <span className="text-muted">{r.kind}</span> },
      { key: 'rank', header: '순위', width: '14%', render: (r) => `#${r.usageRank}` },
      { key: 'use', header: '사용량', width: '30%', render: (r) => <CellBar pct={(r.usageCount / maxModelUsage) * 100} /> },
    ]
    return <Table title="모델 카탈로그 (실시드)" columns={cols} rows={[...models].sort((a, b) => a.usageRank - b.usageRank).slice(0, 7)} rowKey={(r) => r.id} />
  }
  if (group === 4) {
    const cols: Column<Service>[] = [
      { key: 'name', header: '서비스', width: '28%', render: (r) => <span className="font-semibold truncate">{r.name}</span> },
      { key: 'model', header: '모델', width: '26%', render: (r) => <span className="text-muted truncate">{modelById(r.model)?.name ?? r.model}</span> },
      { key: 'api', header: 'API', width: '16%', render: (r) => <Badge tone={r.hasApi ? 'ok' : 'neutral'} dot={false}>{r.hasApi ? '제공' : '없음'}</Badge> },
      { key: 'use', header: '사용량', width: '30%', render: (r) => <CellBar pct={(r.usageCount / maxSvcUsage) * 100} /> },
    ]
    return <Table title="마켓 서비스 (실시드)" columns={cols} rows={[...services].sort((a, b) => a.usageRank - b.usageRank)} rowKey={(r) => r.id} />
  }
  if (group === 5) {
    const cols: Column<EventLog>[] = [
      { key: 'sev', header: '심각도', width: '20%', render: (r) => <SeverityBadge severity={r.severity} /> },
      { key: 'msg', header: '메시지', width: '52%', render: (r) => <span className="truncate">{r.message}</span> },
      { key: 'st', header: '상태', width: '28%', render: (r) => <Badge tone={r.status === 'resolved' ? 'ok' : 'warn'} dot={false}>{r.status === 'resolved' ? '해결' : '진행'}</Badge> },
    ]
    return <Table title="최근 이벤트 (실시드)" columns={cols} rows={events.slice(0, 6)} rowKey={(r) => r.id} />
  }
  if (group === 6) {
    const cols: Column<BoardPost>[] = [
      { key: 'tab', header: '구분', width: '16%', render: (r) => <span className="text-muted">{TAB_LABEL[r.tab]}</span> },
      { key: 'title', header: '제목', width: '46%', render: (r) => <span className="font-semibold truncate">{r.title}</span> },
      { key: 'who', header: '작성자', width: '20%', render: (r) => <span className="text-muted truncate">{userById(r.authorId)?.name ?? r.authorId}</span> },
      { key: 'st', header: '상태', width: '18%', render: (r) => (r.tab === 'qna' ? <Badge tone={r.answered ? 'ok' : 'warn'} dot={false}>{r.answered ? '답변됨' : '대기'}</Badge> : <span className="text-muted">—</span>) },
    ]
    return <Table title="게시판 글 (실시드)" columns={cols} rows={boardPosts.slice(0, 6)} rowKey={(r) => r.id} />
  }
  if (group === 7) {
    const cols: Column<AuditLog>[] = [
      { key: 'at', header: '시각', width: '26%', render: (r) => <span className="text-muted truncate">{r.createdAt}</span> },
      { key: 'who', header: '사용자', width: '20%', render: (r) => <span className="font-semibold truncate">{userById(r.actorUserId)?.name ?? r.actorUserId}</span> },
      { key: 'act', header: '행위', width: '30%', render: (r) => <span className="truncate">{r.action}</span> },
      { key: 'tgt', header: '대상', width: '24%', render: (r) => <span className="text-muted truncate">{r.target}</span> },
    ]
    return <Table title="감사 로그 (실시드)" columns={cols} rows={auditLogs.slice(0, 6)} rowKey={(r) => r.id} />
  }
  const cols: Column<InfraIntegration>[] = [
    { key: 'name', header: '연동', width: '30%', render: (r) => <span className="font-semibold truncate">{r.name}</span> },
    { key: 'kind', header: '종류', width: '20%', render: (r) => <span className="text-muted uppercase">{r.kind}</span> },
    { key: 'st', header: '상태', width: '22%', render: (r) => <Badge tone={r.status === 'connected' ? 'ok' : 'danger'}>{r.status === 'connected' ? '정상' : '끊김'}</Badge> },
    { key: 'ep', header: '엔드포인트', width: '28%', render: (r) => <span className="text-muted truncate font-mono" style={{ fontSize: 14 }}>{r.endpoint}</span> },
  ]
  return <Table title="인프라 연동 (실시드)" columns={cols} rows={infraIntegrations} rowKey={(r) => r.id} />
}

interface FoundationPageProps {
  screen: string
  title: string
  desc: string
  group: number
  planned: string[]
  roles?: ('A' | 'B' | 'C')[]
}

// G0 기반 데모 — PageShell 밀도 템플릿이 above-fold를 빈틈없이 채울 수 있음을 실시드로 시연.
// KPI행(게이지/스파크/보조수치) + [구성 + 실시드 테이블] 메인 2패널 + [역할·시드요약·최근이벤트] 보조 3패널.
export function FoundationPage({ screen, title, desc, group, planned, roles }: FoundationPageProps) {
  const { access } = useRole()
  const kpis = KPIS_BY_GROUP[group] ?? KPIS_BY_GROUP[1]
  const step = STEP_BY_SCREEN[screen]
  const recentEvents = events.slice(0, 5)

  return (
    <PageShell
      screen={screen}
      title={title}
      desc={desc}
      actions={step != null ? <Badge tone="info" dot={false}>STEP {step} 구현 예정</Badge> : undefined}
      kpis={kpis.map((k) => (
        <KpiStat
          key={k.label}
          label={k.label}
          value={k.value}
          unit={k.unit}
          delta={k.delta}
          deltaTone={k.deltaTone}
          spark={k.spark}
          bar={k.bar}
          gauge={k.gauge}
          sub={k.sub}
        />
      ))}
    >
      <SectionGrid
        main={
          <>
            <Card title={`화면 구성${step != null ? ` · STEP ${step}` : ''}`}>
              <p className="text-muted mb-3" style={{ fontSize: 14 }}>
                G0 기반(셸·아코디언 사이드바·PageShell·공통 컴포넌트) 위에 아래 구성요소가 더미 데이터로 올라갑니다.
              </p>
              <div className="grid" style={{ gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {planned.map((p, i) => (
                  <div
                    key={p}
                    className="flex items-center gap-3 border border-line rounded-lg hover-lift"
                    style={{ padding: '10px 12px', background: 'var(--c-soft)' }}
                  >
                    <span
                      className="flex items-center justify-center rounded-md shrink-0 font-bold"
                      style={{ width: 22, height: 22, fontSize: 12, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate" style={{ fontSize: 14 }}>{p}</span>
                  </div>
                ))}
              </div>
            </Card>
            <PreviewTable group={group} />
          </>
        }
        side={
          <>
            <Card title="역할 · 접근">
              <div className="flex flex-col" style={{ gap: 10 }}>
                <Row k="현재 역할" v={<Badge tone="info" dot={false}>{access} · {ACCESS_LABEL[access]}</Badge>} />
                <Row k="접근 가능" v={roles && roles.length ? roles.join(' · ') : '공통'} />
                <Row k="화면 번호" v={screen} />
                <Row k="구현 단계" v={step != null ? `STEP ${step}` : '—'} />
              </div>
            </Card>
            <Card title="기반 시드 요약">
              <div className="grid grid-cols-2" style={{ gap: 8 }}>
                <Mini k="서버" v={`${servers.length}대`} />
                <Mini k="GPU" v={`${allGpus.length}장`} />
                <Mini k="모델" v={`${models.length}종`} />
                <Mini k="서비스" v={`${services.length}개`} />
                <Mini k="사용자" v={`${users.length}명`} />
                <Mini k="이벤트" v={`${events.length}건`} />
              </div>
            </Card>
            <Card title="최근 이벤트">
              <ul className="flex flex-col" style={{ gap: 8 }}>
                {recentEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-2.5 min-w-0">
                    <span
                      className="rounded-full shrink-0 mt-1.5"
                      style={{ width: 8, height: 8, background: sevColor(e.severity) }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate" style={{ fontSize: 14 }}>{e.message}</span>
                      <span className="text-muted block" style={{ fontSize: 14 }}>{e.createdAt}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        }
      />
    </PageShell>
  )
}

function sevColor(sev: EventLog['severity']): string {
  return sev === 'critical'
    ? 'var(--c-danger)'
    : sev === 'warn'
      ? 'var(--c-warn)'
      : sev === 'recovered'
        ? 'var(--c-ok)'
        : 'var(--c-accent)'
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-muted shrink-0" style={{ fontSize: 14 }}>{k}</span>
      <span className="truncate font-semibold" style={{ fontSize: 14 }}>{v}</span>
    </div>
  )
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-line rounded-lg hover-lift" style={{ padding: '8px 10px', background: 'var(--c-soft)' }}>
      <div className="text-muted" style={{ fontSize: 14 }}>{k}</div>
      <div className="font-bold" style={{ fontSize: 16 }}>{v}</div>
    </div>
  )
}

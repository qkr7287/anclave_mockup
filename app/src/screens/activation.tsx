import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  KeyIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { PageShell } from '../components/PageShell'
import { Card, KpiStat, Table, StatusBadge } from '../components/ui'
import type { Column } from '../components/ui'
import { modelById, serviceById, services, userById } from '../data'
import type { Status } from '../data/types'
import { useRole } from '../lib/role'
import { listApiRequests, type ApiRecord } from './api-store'
import { QaPolish } from './qa-polish'

// G8 · 4.19 API 신청 관리 (B · 소유자) — 내가 올린 서비스에 온 API 키 신청을 5188 자원 신청현황 톤 테이블로.
// 상세 → 4.19a 심사 페이지(키 발급 → 명세서 검토 → 승인). 상태는 api-store 세션 사본 공유.

const STATUS_FROM_KO: Record<string, Status> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' }
const STATUS_FILTERS = ['전체', '대기', '승인', '반려'] as const

function StatIcon({ Icon, box, color }: { Icon: typeof ClockIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

export function ApiApprovals() {
  const navigate = useNavigate()
  const { user } = useRole()

  // 내가 소유한(올린) API 서비스 → 그 서비스에 온 API 키 신청만.
  const myServiceIds = useMemo(() => new Set(services.filter((s) => s.ownerUserId === user.id && s.hasApi).map((s) => s.id)), [user.id])
  // 목록은 backend(REST)에서 로드 후 소유자 서비스로 필터.
  const [rows, setRows] = useState<ApiRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let alive = true
    listApiRequests()
      .then((all) => { if (alive) { setRows(all.filter((r) => myServiceIds.has(r.serviceId))); setLoadError(false) } })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [myServiceIds])
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('전체')

  const counts = useMemo(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      today: rows.filter((r) => r.processedAt?.startsWith(today)).length,
    }
  }, [rows])

  const shown = filter === '전체' ? rows : rows.filter((r) => r.status === STATUS_FROM_KO[filter])
  const goDetail = (id: string) => navigate(`/api-approvals/${id}`)

  const columns: Column<ApiRecord>[] = [
    {
      key: 'requester',
      header: '요청자',
      width: '20%',
      render: (r) => {
        const u = userById(r.requesterUserId)
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate" style={{ fontSize: 14 }}>{u?.name ?? r.requesterUserId}</span>
            <span className="text-muted truncate" style={{ fontSize: 14 }}>{u?.email ?? ''}</span>
          </div>
        )
      },
    },
    {
      key: 'service',
      header: '대상 서비스',
      width: '22%',
      render: (r) => {
        const s = serviceById(r.serviceId)
        return (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate" style={{ fontSize: 14 }}>{s?.name ?? r.serviceId}</span>
            <span className="text-muted truncate" style={{ fontSize: 14 }}>{[s?.kind, modelById(r.model)?.name ?? r.model].filter(Boolean).join(' · ')}</span>
          </div>
        )
      },
    },
    {
      key: 'url',
      header: '사용처 URL',
      width: '24%',
      render: (r) => <span className="text-muted truncate inline-block max-w-full" style={{ fontSize: 14 }} title={r.targetServiceUrl}>{r.targetServiceUrl}</span>,
    },
    {
      key: 'created',
      header: '신청일',
      width: '14%',
      render: (r) => <span className="text-muted" style={{ fontSize: 14 }}>{r.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '10%',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'action',
      header: '',
      width: '10%',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goDetail(r.id) }}
          className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color] duration-100 active:scale-95 whitespace-nowrap hover:bg-[var(--accent-soft)] hover:text-[color:var(--c-accent)]"
          style={{ fontSize: 14, padding: '5px 10px', background: r.status === 'pending' ? 'var(--accent-soft)' : 'var(--c-soft)', color: r.status === 'pending' ? 'var(--c-accent)' : 'var(--c-muted)' }}
        >
          {r.status === 'pending' ? <KeyIcon style={{ width: 14, height: 14 }} /> : <EyeIcon style={{ width: 14, height: 14 }} />}
          {r.status === 'pending' ? '심사' : '상세'}
        </button>
      ),
    },
  ]

  return (
    <div data-qa className="h-full min-h-0">
      <QaPolish />
      <PageShell
      fill
      screen="4.19"
      title="API 신청 관리"
      desc="마켓플레이스에 게시된 내 서비스에 들어온 API 키 신청을 검토하고, 키를 발급(승인)하거나 반려해요. (소유자)"
      kpis={
        <>
          <div style={{ color: 'var(--c-warn)' }}>
            <KpiStat label="대기" value={counts.pending} unit="건" delta={counts.pending > 0 ? '검토 필요' : undefined} deltaTone="warn" sub="키 발급 대기 중" icon={<StatIcon Icon={ClockIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
          </div>
          <KpiStat label="발급" value={counts.approved} unit="건" sub="키 발급(승인) 완료" icon={<StatIcon Icon={CheckCircleIcon} box="var(--ok-soft)" color="var(--c-ok)" />} />
          <KpiStat label="반려" value={counts.rejected} unit="건" sub="반려한 신청 건" icon={<StatIcon Icon={XCircleIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
          <KpiStat label="오늘 처리" value={counts.today} unit="건" sub="오늘 검토 처리한 건" icon={<StatIcon Icon={BoltIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
        </>
      }
    >
      <Card
        flush
        fill
        title={
          <span className="flex items-center gap-2">
            받은 API 키 신청
            <span className="rounded-full" style={{ padding: '1px 9px', fontSize: 14, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{shown.length}</span>
          </span>
        }
        action={
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map((f) => {
              const on = filter === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="rounded-lg whitespace-nowrap transition-colors"
                  style={{ padding: '4px 11px', fontSize: 14, fontWeight: 600, color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}` }}
                >
                  {f}
                </button>
              )
            })}
          </div>
        }
      >
        <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => goDetail(r.id)} empty={loading ? 'API 키 신청을 불러오는 중…' : loadError ? '목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.' : '아직 받은 API 키 신청이 없어요.'} />
      </Card>
      </PageShell>
    </div>
  )
}

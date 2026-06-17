import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  RectangleStackIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { PageShell } from '../components/PageShell'
import { Card, KpiStat, Table, StatusBadge } from '../components/ui'
import type { Column } from '../components/ui'
import { modelById, serviceById } from '../data'
import type { Status } from '../data/types'
import { useRole } from '../lib/role'
import { listApiRequests, type ApiRecord } from './api-store'
import { QaPolish } from './qa-polish'

// G8 · 4.19b 내 API 신청 — 내가 보낸 API 키 신청 현황(조회 전용, A·B·C 공통).
// API 신청 관리(4.19, 소유자=받은 신청)의 대칭: requesterUserId === 나로 필터. 심사 권한 없음.

const STATUS_FROM_KO: Record<string, Status> = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' }
const STATUS_FILTERS = ['전체', '대기', '승인', '반려'] as const

function StatIcon({ Icon, box, color }: { Icon: typeof ClockIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

export function MyApiRequests() {
  const navigate = useNavigate()
  const { user } = useRole()

  // 내가 보낸 API 키 신청만 — backend 로드 후 requesterUserId 필터.
  const [rows, setRows] = useState<ApiRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    let alive = true
    listApiRequests()
      .then((all) => { if (alive) { setRows(all.filter((r) => r.requesterUserId === user.id)); setLoadError(false) } })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [user.id])
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('전체')

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows])

  const shown = filter === '전체' ? rows : rows.filter((r) => r.status === STATUS_FROM_KO[filter])
  const goDetail = (id: string) => navigate(`/api-approvals/${id}`)

  const columns: Column<ApiRecord>[] = [
    {
      key: 'client',
      header: '사용 서비스',
      width: '26%',
      render: (r) => (
        <div className="flex flex-col min-w-0">
          <span className="font-semibold truncate" style={{ fontSize: 14 }}>{r.clientServiceName || '미지정'}</span>
          <span className="text-muted truncate" style={{ fontSize: 14 }} title={r.targetServiceUrl}>{r.targetServiceUrl}</span>
        </div>
      ),
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
      key: 'created',
      header: '신청일',
      width: '16%',
      render: (r) => <span className="text-muted" style={{ fontSize: 14 }}>{r.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '12%',
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
          style={{ fontSize: 14, padding: '5px 10px', background: 'var(--c-soft)', color: 'var(--c-muted)' }}
        >
          <EyeIcon style={{ width: 14, height: 14 }} />
          상세
        </button>
      ),
    },
  ]

  return (
    <div data-qa className="h-full min-h-0">
      <QaPolish />
      <PageShell
        fill
        screen="4.19b"
        title="내 API 신청"
        desc="내가 보낸 API 키 신청의 진행 상태를 확인해요. 소유자가 승인하면 키가 발급됩니다."
        kpis={
          <>
            <div style={{ color: 'var(--c-warn)' }}>
              <KpiStat label="대기" value={counts.pending} unit="건" delta={counts.pending > 0 ? '검토 중' : undefined} deltaTone="warn" sub="소유자 검토 대기" icon={<StatIcon Icon={ClockIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
            </div>
            <KpiStat label="발급" value={counts.approved} unit="건" sub="키 발급(승인) 완료" icon={<StatIcon Icon={CheckCircleIcon} box="var(--ok-soft)" color="var(--c-ok)" />} />
            <KpiStat label="반려" value={counts.rejected} unit="건" sub="반려된 신청 건" icon={<StatIcon Icon={XCircleIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
            <KpiStat label="전체" value={rows.length} unit="건" sub="내 전체 신청 건" icon={<StatIcon Icon={RectangleStackIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
          </>
        }
      >
        <Card
          flush
          fill
          title={
            <span className="flex items-center gap-2">
              내 API 키 신청
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
          <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => goDetail(r.id)} empty={loading ? 'API 키 신청을 불러오는 중…' : loadError ? '목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.' : '아직 보낸 API 키 신청이 없어요. 마켓플레이스에서 API 키를 요청해보세요.'} />
        </Card>
      </PageShell>
    </div>
  )
}

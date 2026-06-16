import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClockIcon, EyeIcon, GlobeAltIcon, MegaphoneIcon, PlusIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { PageShell } from '../components/PageShell'
import { Card, KpiStat, Table, Button, StatusBadge, EmptyState } from '../components/ui'
import type { Column } from '../components/ui'
import { services } from '../data'
import type { Status } from '../data/types'
import { listPublishRequests, type PubRecord } from './publish-store'
import { QaPolish } from './qa-polish'

// G8 · 4.29 서비스 게시 신청 (B=C) — 내가 배포한 AI 서비스를 마켓플레이스에 게시 신청.
// 신규 신청은 전용 마법사 페이지(4.29a /marketplace/publish/new)로 진입. 목록·상태는 publish-store 공유.

// 서비스명 → 카테고리(kind) — 게시 목록에 마켓 톤의 라벨 보강.
const kindByName = (name: string) => services.find((s) => s.name === name)?.kind

const STATUS_FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
]

export function PublishRequest() {
  const navigate = useNavigate()
  // 목록은 세션 스토어에서 로드 — 마법사에서 제출하면 목록 복귀 시 재마운트로 반영.
  const [items] = useState<PubRecord[]>(() => listPublishRequests())
  const [filter, setFilter] = useState<'all' | Status>('all')

  const counts = {
    all: items.length,
    pending: items.filter((p) => p.status === 'pending').length,
    approved: items.filter((p) => p.status === 'approved').length,
    rejected: items.filter((p) => p.status === 'rejected').length,
  }
  const shown = filter === 'all' ? items : items.filter((p) => p.status === filter)

  const goNew = () => navigate('/marketplace/publish/new')
  const goView = (id: string) => navigate(`/marketplace/publish/${id}`)

  const columns: Column<PubRecord>[] = [
    {
      key: 'service',
      header: '서비스',
      width: '24%',
      render: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            <MegaphoneIcon width={16} height={16} />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate" style={{ fontSize: 14 }}>{p.serviceName}</span>
            <span className="text-muted truncate" style={{ fontSize: 14 }}>{kindByName(p.serviceName) ?? '서비스'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'meta',
      header: '게시 정보',
      width: '30%',
      render: (p) => <span className="text-muted truncate" style={{ fontSize: 14 }}>{p.meta}</span>,
    },
    {
      key: 'created',
      header: '신청일',
      width: '14%',
      render: (p) => <span className="text-muted" style={{ fontSize: 14 }}>{p.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '10%',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'note',
      header: '비고',
      width: '12%',
      render: (p) =>
        p.status === 'rejected' && p.rejectReason ? (
          <span className="text-danger truncate inline-block max-w-full" style={{ fontSize: 14 }} title={p.rejectReason}>반려 사유</span>
        ) : p.status === 'approved' ? (
          <span className="text-muted" style={{ fontSize: 14 }}>마켓 노출</span>
        ) : (
          <span className="text-muted" style={{ fontSize: 14 }}>검토 중</span>
        ),
    },
    {
      key: 'action',
      header: '',
      width: '10%',
      align: 'right',
      render: (p) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goView(p.id) }}
          className="inline-flex items-center gap-1 font-medium rounded-[8px] transition-[transform,background-color] duration-100 active:scale-95 whitespace-nowrap hover:bg-[var(--accent-soft)] hover:text-[color:var(--c-accent)]"
          style={{ fontSize: 14, padding: '5px 10px', background: 'var(--c-soft)', color: 'var(--c-muted)' }}
        >
          <EyeIcon style={{ width: 14, height: 14, opacity: 0.9 }} /> 상세보기
        </button>
      ),
    },
  ]

  return (
    <div data-qa className="h-full min-h-0">
      <QaPolish />
      <PageShell
      fill
      screen="4.29"
      title="서비스 게시 신청"
      desc="내가 배포한 AI 서비스를 마켓플레이스에 게시 신청해요. 관리자 검토(게시 승인) 후 마켓에 노출됩니다."
      actions={
        <Button variant="primary" onClick={goNew}>
          <PlusIcon width={15} height={15} /> 신규 게시 신청
        </Button>
      }
      kpis={
        <>
          <div style={{ color: 'var(--c-warn)' }}>
            <KpiStat label="검토 대기" value={counts.pending} unit="건" delta={counts.pending > 0 ? '검토 중' : undefined} deltaTone="warn" sub="게시 승인 대기 중" icon={<StatIcon Icon={ClockIcon} box="var(--warn-soft)" color="var(--c-warn)" />} />
          </div>
          <KpiStat label="승인 · 노출" value={counts.approved} unit="건" sub="마켓 노출 중인 서비스" icon={<StatIcon Icon={GlobeAltIcon} box="var(--ok-soft)" color="var(--c-ok)" />} />
          <KpiStat label="반려" value={counts.rejected} unit="건" sub="반려된 게시 신청" icon={<StatIcon Icon={XCircleIcon} box="var(--danger-soft)" color="var(--c-danger)" />} />
          <KpiStat label="전체 신청" value={counts.all} unit="건" sub="전체 게시 신청 건" icon={<StatIcon Icon={MegaphoneIcon} box="var(--accent-soft)" color="var(--c-accent)" />} />
        </>
      }
    >
      <Card
        flush
        fill
        title={
          <span className="flex items-center gap-2">
            내 게시 신청
            <span className="rounded-full" style={{ padding: '1px 9px', fontSize: 14, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{shown.length}</span>
          </span>
        }
        action={
          <div className="flex items-center gap-1.5">
            {STATUS_FILTERS.map((fopt) => {
              const on = filter === fopt.key
              return (
                <button
                  key={fopt.key}
                  type="button"
                  onClick={() => setFilter(fopt.key)}
                  className="rounded-lg whitespace-nowrap transition-colors"
                  style={{ padding: '4px 11px', fontSize: 14, fontWeight: 600, color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}` }}
                >
                  {fopt.label}
                </button>
              )
            })}
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState
            title="신청 내역이 없어요"
            description="배포한 서비스를 골라 첫 게시 신청을 보내보세요."
            cta={<Button variant="primary" onClick={goNew}><PlusIcon width={15} height={15} /> 신규 게시 신청</Button>}
          />
        ) : (
          <Table columns={columns} rows={shown} rowKey={(p) => p.id} onRowClick={(p) => goView(p.id)} />
        )}
      </Card>
      </PageShell>
    </div>
  )
}

// KpiStat 아이콘 — soft 배경 박스(API 신청 관리 4.19와 동일 외형: 30px·radius9·semantic soft).
function StatIcon({ Icon, box, color }: { Icon: typeof ClockIcon; box: string; color: string }) {
  return (
    <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: box, color }}>
      <Icon style={{ width: 17, height: 17 }} />
    </span>
  )
}

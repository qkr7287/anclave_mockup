import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MegaphoneIcon, PlusIcon } from '@heroicons/react/24/outline'
import { PageShell } from '../components/PageShell'
import { Card, Table, Button, StatusBadge, EmptyState } from '../components/ui'
import type { Column } from '../components/ui'
import { services } from '../data'
import type { Status } from '../data/types'
import { listPublishRequests, type PubRecord } from './publish-store'

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

  const columns: Column<PubRecord>[] = [
    {
      key: 'service',
      header: '서비스',
      width: '26%',
      render: (p) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: 'var(--accent-soft)', color: 'var(--c-accent)' }}>
            <MegaphoneIcon width={16} height={16} />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate">{p.serviceName}</span>
            <span className="text-muted truncate" style={{ fontSize: 12.5 }}>{kindByName(p.serviceName) ?? '서비스'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'meta',
      header: '게시 정보',
      width: '34%',
      render: (p) => <span className="text-muted truncate" style={{ fontSize: 13.5 }}>{p.meta}</span>,
    },
    {
      key: 'created',
      header: '신청일',
      width: '16%',
      render: (p) => <span className="text-muted" style={{ fontSize: 13 }}>{p.createdAt}</span>,
    },
    {
      key: 'status',
      header: '상태',
      width: '12%',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'note',
      header: '비고',
      width: '12%',
      align: 'right',
      render: (p) =>
        p.status === 'rejected' && p.rejectReason ? (
          <span className="text-danger truncate inline-block max-w-full" style={{ fontSize: 13 }} title={p.rejectReason}>반려 사유</span>
        ) : p.status === 'approved' ? (
          <span className="text-muted" style={{ fontSize: 13 }}>마켓 노출</span>
        ) : (
          <span className="text-muted" style={{ fontSize: 13 }}>검토 중</span>
        ),
    },
  ]

  return (
    <PageShell
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
          <StatTile label="전체 신청" value={counts.all} tone="accent" active={filter === 'all'} onClick={() => setFilter('all')} />
          <StatTile label="검토 대기" value={counts.pending} tone="warn" active={filter === 'pending'} onClick={() => setFilter('pending')} />
          <StatTile label="승인 · 노출" value={counts.approved} tone="ok" active={filter === 'approved'} onClick={() => setFilter('approved')} />
          <StatTile label="반려" value={counts.rejected} tone="danger" active={filter === 'rejected'} onClick={() => setFilter('rejected')} />
        </>
      }
    >
      <Card
        flush
        title={
          <span className="flex items-center gap-2">
            내 게시 신청
            <span className="rounded-full" style={{ padding: '1px 8px', fontSize: 12, fontWeight: 700, color: 'var(--c-accent)', background: 'var(--accent-soft)' }}>{shown.length}</span>
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
                  style={{ padding: '4px 11px', fontSize: 13, fontWeight: 600, color: on ? 'var(--c-accent)' : 'var(--c-muted)', background: on ? 'var(--accent-soft)' : 'transparent', border: `1px solid ${on ? 'var(--c-accent)' : 'var(--c-border)'}` }}
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
          <Table columns={columns} rows={shown} rowKey={(p) => p.id} />
        )}
      </Card>
    </PageShell>
  )
}

// 4.6 톤의 클릭 가능한 요약 stat 타일 — 값 + 라벨 + 상태 점, 필터 토글.
function StatTile({ label, value, tone, active, onClick }: { label: string; value: number; tone: 'accent' | 'warn' | 'ok' | 'danger'; active: boolean; onClick: () => void }) {
  const color = tone === 'ok' ? 'var(--c-ok)' : tone === 'warn' ? 'var(--c-warn)' : tone === 'danger' ? 'var(--c-danger)' : 'var(--c-accent)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card2 rounded-xl text-left transition-colors flex flex-col justify-center hover-lift"
      style={{ padding: '14px 16px', gap: 4, minHeight: 84, border: `1px solid ${active ? color : 'var(--c-border)'}`, boxShadow: 'var(--shadow-card)' }}
    >
      <span className="flex items-center gap-1.5 text-muted font-semibold" style={{ fontSize: 14 }}>
        <span className="rounded-full" style={{ width: 7, height: 7, background: color }} /> {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{value}<span className="text-muted" style={{ fontSize: 14, fontWeight: 600 }}> 건</span></span>
    </button>
  )
}

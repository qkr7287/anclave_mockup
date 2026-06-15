import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { Badge, Button, Drawer, KpiStat, Table } from '../components/ui'
import type { Column } from '../components/ui'
import { userById } from '../data'
import type { ModelRequest } from '../data/types'
import { useRole } from '../lib/role'
import { STAGE_META, useModelRequests } from './model-requests-shared'

// G5 · 4.14 모델 신청 관리 — A·B·C 공유 테이블.
// 사용자(B/C)는 등록 신청만, 관리자(A)가 검토→반입(드래그·보안스캔)→명세 등록→배포.
// 데이터: 시드 modelRequests + 로컬(신규 신청·단계 patch) 병합(model-requests-shared).

const userName = (id: string): string => userById(id)?.name ?? id

// 컨트롤 토큰 — 카탈로그 컨트롤과 톤 일치(테마 자동).
const ctrl: React.CSSProperties = {
  background: 'var(--c-bg)',
  border: '1px solid var(--c-border)',
  borderRadius: 8,
  height: 36,
  fontSize: 14,
  color: 'var(--c-text)',
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex items-center gap-2 min-w-0" style={{ ...ctrl, padding: '0 12px', width: 240 }}>
      <MagnifyingGlassIcon style={{ width: 16, height: 16, opacity: 0.55, flexShrink: 0 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="모델명 · 사유 검색"
        aria-label="모델 신청 검색"
        className="bg-transparent outline-none w-full min-w-0"
        style={{ fontSize: 14, color: 'var(--c-text)' }}
      />
    </span>
  )
}

function Select({ value, onChange, options, width, label }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  width: number
  label: string
}) {
  return (
    <span className="relative inline-flex items-center" style={{ ...ctrl }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none bg-transparent outline-none cursor-pointer truncate"
        style={{ color: 'var(--c-text)', fontSize: 14, padding: '0 30px 0 12px', height: 36, width, minWidth: width }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: 'var(--c-card2)', color: 'var(--c-text)' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="absolute pointer-events-none" style={{ right: 9, width: 15, height: 15, color: 'var(--c-muted)' }} />
    </span>
  )
}

function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{ ...ctrl, padding: '0 10px', width: 142, colorScheme: 'inherit' }}
    />
  )
}

// 단계 분포 미니 바(전체 KPI 보조요소) — neutral/info/warn/ok/danger 토큰.
function StageBar({ counts }: { counts: Record<string, number> }) {
  const order: { k: string; c: string }[] = [
    { k: 'requested', c: 'var(--c-muted)' },
    { k: 'scanning', c: 'var(--c-accent)' },
    { k: 'scanned', c: 'var(--c-warn)' },
    { k: 'deployed', c: 'var(--c-ok)' },
    { k: 'rejected', c: 'var(--c-danger)' },
  ]
  const total = Math.max(1, order.reduce((a, o) => a + (counts[o.k] ?? 0), 0))
  return (
    <span className="flex w-full overflow-hidden" style={{ height: 6, borderRadius: 3, background: 'var(--c-track)' }}>
      {order.map((o) => {
        const w = ((counts[o.k] ?? 0) / total) * 100
        return w > 0 ? <span key={o.k} style={{ width: `${w}%`, background: o.c }} /> : null
      })}
    </span>
  )
}

function SpecLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3" style={{ padding: '10px 0', borderBottom: '1px dashed var(--c-border-s)' }}>
      <span className="shrink-0" style={{ width: 78, color: 'var(--c-muted)' }}>{label}</span>
      <div className="flex-1 min-w-0" style={{ color: 'var(--c-text)', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

// 읽기전용 상세(B/C 행 클릭 · 배포/반려 공통) — 라우트 비의존 Drawer.
function DetailDrawer({ req, open, onClose }: { req: ModelRequest | null; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  if (!req) return null
  const meta = STAGE_META[req.stage]
  return (
    <Drawer open={open} onClose={onClose} title="모델 신청 상세" width={420}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12 }}>
        <span className="font-bold truncate" style={{ fontSize: 15, color: 'var(--c-text)' }}>{req.modelName}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <SpecLine label="신청자">{userName(req.requesterUserId)}</SpecLine>
      <SpecLine label="종류">{req.kind ?? '—'}</SpecLine>
      <SpecLine label="출처">{req.source ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{req.source}</span> : '—'}</SpecLine>
      <SpecLine label="사유">{req.reason}</SpecLine>
      <SpecLine label="신청일">{req.createdAt}</SpecLine>
      {req.fileName && <SpecLine label="반입 파일"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{req.fileName}</span></SpecLine>}
      {req.scan && (
        <SpecLine label="보안 점검">
          <span style={{ color: req.scan === 'pass' ? 'var(--c-ok)' : req.scan === 'fail' ? 'var(--c-danger)' : 'var(--c-warn)' }}>
            {req.scan === 'pass' ? '통과' : req.scan === 'fail' ? '실패' : '진행 중'}
          </span>
        </SpecLine>
      )}
      {req.checksum && <SpecLine label="체크섬"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{req.checksum}</span></SpecLine>}
      {req.processedAt && <SpecLine label="처리일">{req.processedAt}</SpecLine>}
      {req.rejectReason && (
        <div className="rounded-[10px]" style={{ marginTop: 12, padding: '11px 13px', background: 'var(--danger-soft)', color: 'var(--c-danger)', fontSize: 14, lineHeight: 1.5 }}>
          {req.rejectReason}
        </div>
      )}
      {req.stage === 'deployed' && req.registeredModelId && (
        <Button variant="outline" onClick={() => navigate(`/models/${req.registeredModelId}`)} className="w-full justify-center" style={{ marginTop: 16 }}>
          <ArrowTopRightOnSquareIcon style={{ width: 15, height: 15 }} />
          카탈로그에서 보기
        </Button>
      )}
    </Drawer>
  )
}

export function ModelRequests() {
  const navigate = useNavigate()
  const { isAdmin } = useRole()
  const requests = useModelRequests()

  const [query, setQuery] = useState('')
  const [requester, setRequester] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<ModelRequest | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    requests.forEach((r) => { c[r.stage] = (c[r.stage] ?? 0) + 1 })
    return c
  }, [requests])
  const pending = (counts.requested ?? 0) + (counts.scanning ?? 0) + (counts.scanned ?? 0)

  const requesterOpts = useMemo(() => {
    const ids = Array.from(new Set(requests.map((r) => r.requesterUserId)))
    return [{ value: 'all', label: '전체 신청자' }, ...ids.map((id) => ({ value: id, label: userName(id) }))]
  }, [requests])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return requests.filter((r) => {
      if (q && !(`${r.modelName} ${r.reason}`.toLowerCase().includes(q))) return false
      if (requester !== 'all' && r.requesterUserId !== requester) return false
      const day = r.createdAt.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [requests, query, requester, from, to])

  // 신규: 관리자=반입(model-import), 사용자=신청(model-request-new).
  const onNew = () => navigate(isAdmin ? '/admin/models/requests/new' : '/models/request/new')
  // 행 진입: 관리자=검토/반입 진입, 사용자=읽기전용 Drawer.
  const onRow = (r: ModelRequest) => {
    if (isAdmin) navigate(`/admin/models/requests/new?id=${r.id}`)
    else setDetail(r)
  }
  const actionLabel = (r: ModelRequest): string => {
    if (!isAdmin) return '상세'
    return r.stage === 'requested' ? '반입 검토'
      : r.stage === 'scanning' ? '진행 보기'
        : r.stage === 'scanned' ? '명세 등록'
          : '상세'
  }

  const columns: Column<ModelRequest>[] = [
    {
      key: 'name',
      header: '모델명',
      width: '21%',
      render: (r) => <span className="font-bold truncate" style={{ color: 'var(--c-text)' }}>{r.modelName}</span>,
    },
    { key: 'requester', header: '신청자', width: '11%', render: (r) => <span className="truncate" style={{ color: 'var(--c-muted)' }}>{userName(r.requesterUserId)}</span> },
    { key: 'kind', header: '종류', width: '11%', render: (r) => <span style={{ color: 'var(--c-muted)' }}>{r.kind ?? '—'}</span> },
    { key: 'reason', header: '사유', width: '24%', render: (r) => <span className="truncate" style={{ color: 'var(--c-text)' }}>{r.reason}</span> },
    { key: 'createdAt', header: '신청일', width: '13%', render: (r) => <span className="tabular-nums" style={{ color: 'var(--c-muted)' }}>{r.createdAt.slice(0, 10)}</span> },
    {
      key: 'stage',
      header: '단계',
      width: '10%',
      render: (r) => {
        const m = STAGE_META[r.stage]
        return <Badge tone={m.tone}>{m.label}</Badge>
      },
    },
    {
      key: 'action',
      header: '액션',
      width: '10%',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRow(r) }}
          className="font-semibold hover:underline whitespace-nowrap"
          style={{ fontSize: 14, color: 'var(--c-accent)' }}
        >
          {actionLabel(r)}
        </button>
      ),
    },
  ]

  return (
    <div className="anim-fade flex flex-col min-w-0" style={{ gap: 18, minHeight: '100%' }}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
          <h2 className="font-bold truncate" style={{ fontSize: 22, letterSpacing: '-0.4px' }}>모델 신청 관리</h2>
          <p style={{ fontSize: 14, color: 'var(--c-muted)' }}>
            {isAdmin
              ? '사용자 모델 등록 신청을 검토하고, 반입·보안점검·명세 등록을 거쳐 카탈로그에 배포합니다.'
              : '카탈로그에 없는 모델 등록을 신청합니다. 반입·보안점검·배포는 관리자가 처리합니다.'}
          </p>
        </div>
        <Button onClick={onNew} className="shrink-0">
          <PlusIcon style={{ width: 16, height: 16 }} />
          신규 모델 신청
        </Button>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <KpiStat label="전체 신청" value={requests.length} unit="건" sub="신청 누계" aux={<StageBar counts={counts} />} />
        <KpiStat label="대기 · 진행" value={pending} unit="건" deltaTone="warn" sub="신청됨 · 스캔중 · 스캔완료" />
        <KpiStat label="배포" value={counts.deployed ?? 0} unit="건" deltaTone="ok" sub="카탈로그 등록 완료" />
        <KpiStat label="반려" value={counts.rejected ?? 0} unit="건" deltaTone="danger" sub="보안점검 실패 등" />
      </div>

      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10 }}>
        <h3 className="font-bold shrink-0" style={{ fontSize: 15 }}>
          신청 목록 <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>({rows.length})</span>
        </h3>
        <div className="flex items-center flex-wrap justify-end" style={{ gap: 8 }}>
          <SearchBox value={query} onChange={setQuery} />
          <Select value={requester} onChange={setRequester} options={requesterOpts} width={130} label="신청자 필터" />
          <DateInput value={from} onChange={setFrom} label="신청일 시작" />
          <span style={{ color: 'var(--c-muted)', fontSize: 14 }}>~</span>
          <DateInput value={to} onChange={setTo} label="신청일 종료" />
        </div>
      </div>

      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRow}
        empty="조건에 맞는 신청이 없어요."
      />

      <DetailDrawer req={detail} open={detail != null} onClose={() => setDetail(null)} />
    </div>
  )
}

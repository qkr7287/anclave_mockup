// 자원 신청(4.6/4.6a/4.6b) 공유 데이터 — DB(/api/gpu-requests) + 시드 폴백 + 로컬 신규 신청 병합.
// backend 응답엔 확장 필드(period/priority/adminMemo/processedAt/allocated*)가 아직 없어
// 전부 optional — 같은 id의 시드로 백필하고, 없으면 화면에서 '—' 폴백.
// (src/data/** 는 STEP 병렬 소유권 보호로 잠겨 있어 screens 측에 둔다.)
import { useMemo } from 'react'
import type { GpuRequest, Status } from '../data/types'
import { gpuRequests } from '../data/requests'
import { services } from '../data/services'
import { servers } from '../data/servers'
import { userById } from '../data/users'
import { useGpuRequests, type GpuRequestRow } from '../data/hooks/usePolling'

export type RequestItem = Omit<GpuRequest, 'capacity' | 'env' | 'addons' | 'period'> & {
  capacity: number | string
  env?: string
  addons?: string[]
  period?: string
  // 4.6b 신규 신청 상세 설정 확장(목업 로컬 저장) — backend 미반영이라 optional
  team?: string
  startDate?: string
  security?: string
  scale?: string
  remark?: string
}

// 반려 더미는 황상곤(u-hwang) 1건만 노출 — 기존 반려 시드(gr-11·gr-12)는 신청현황/상세에서 숨김.
const HIDDEN_IDS = new Set(['gr-11', 'gr-12'])
const SYNTH_REQUESTS: GpuRequest[] = [
  {
    id: 'gr-13',
    requesterUserId: 'u-hwang',
    capacity: 2,
    capacityUnit: 'card',
    models: ['m1'],
    env: 'Ubuntu 22.04 · CUDA 12.4',
    addons: ['주피터', 'API'],
    serviceName: 'doc-llm-tuning',
    purpose: 'Llama 3 70B 사내 문서 도메인 파인튜닝 — 사규·매뉴얼 특화 모델 구축',
    status: 'rejected',
    rejectReason: '70B 파인튜닝은 H100 ×2 이상이 필요해요. 현재 함대(소비자 GPU · RTX PRO 4500)로는 수용할 수 없어, H100 증설 후 재신청해 주세요.',
    createdAt: '2026-06-09 14:20',
    period: '3개월',
    priority: 'high',
    processedAt: '2026-06-10 10:40',
    processedBy: 'u-admin',
    adminMemo: 'H100 증설 일정(3분기) 확정 후 우선 배정을 검토하겠습니다.',
  } as GpuRequest,
]
// 신청현황/상세에서 쓰는 시드 집합 — 숨김 제외 + 합성 추가.
const ALL_SEED: GpuRequest[] = [...SYNTH_REQUESTS, ...gpuRequests.filter((g) => !HIDDEN_IDS.has(g.id))]
const seedById = (id: string): GpuRequest | undefined => ALL_SEED.find((r) => r.id === id)

// 시드엔 신규 신청 확장 필드(소속·보안 등급·예상 규모·희망 시작일·비고)가 없으므로
// 명세서/상세가 완성도 있게 보이도록 데모 더미로 채운다. (목업)
const DEMO_DETAIL: Record<string, { team?: string; security?: string; scale?: string; startDate?: string; remark?: string }> = {
  'gr-01': { team: '서비스 기술개발팀', security: '대외비', scale: '중규모', startDate: '2026-05-23', remark: 'Qwen2.5-7B 업무 자동화 에이전트 운영. 영업시간 위주 트래픽이며 점진 확장을 검토합니다.' },
  'gr-03': { team: '서비스 기술개발팀', security: '대외비', scale: '대규모', startDate: '2026-05-26', remark: '사내 문서 RAG 검색 임베딩. 야간 색인 배치가 포함됩니다.' },
  'gr-04': { team: '서비스 기술개발팀', security: '일반', scale: '중규모', startDate: '2026-05-27', remark: 'SDXL 이미지 생성 워크스페이스. 디자인팀 협업 용도입니다.' },
  'gr-06': { team: '서비스 기술개발팀', security: '일반', scale: '중규모', startDate: '2026-05-31', remark: '코드 어시스턴트 사내 베타. IDE 플러그인 연동 예정입니다.' },
  'gr-08': { team: '기술개발본부', security: '대외비', scale: '소규모', startDate: '2026-06-05', remark: 'Mistral Small 24B 시범 도입 검토용. 소규모 트래픽으로 시작합니다.' },
  'gr-10': { team: '시스템 통합개발팀', security: '기밀', scale: '대규모', startDate: '2026-06-10', remark: 'DeepSeek-V3 추론 정확도 검증. 배치 위주로 운영할 예정입니다.' },
  'gr-13': { team: '기술개발본부', security: '대외비', scale: '대규모', startDate: '2026-06-20', remark: 'Llama 3 70B 사내 문서 도메인 파인튜닝 PoC. 야간 학습 배치 위주이며 대용량 체크포인트 보관이 필요합니다.' },
}

// 시드 GpuRequest → 명세서용 RequestItem. 확장 필드는 데모 더미(DEMO_DETAIL)·소속(부서)으로 채움.
function seedItem(g: GpuRequest): RequestItem {
  const base = g as unknown as RequestItem
  const d = DEMO_DETAIL[g.id] ?? {}
  return {
    ...base,
    team: base.team ?? d.team ?? userById(g.requesterUserId)?.department,
    security: base.security ?? d.security ?? '일반',
    scale: base.scale ?? d.scale ?? '중규모',
    startDate: base.startDate ?? d.startDate,
    remark: base.remark ?? d.remark,
  }
}

// GpuRequestRow 타입(usePolling, 잠금)이 확장 필드를 노출 안 해 캐스팅으로 DB 실값을 읽는다.
type DbRowExt = GpuRequestRow & {
  env?: string | null; addons?: string[] | null; attachmentUrl?: string | null
  period?: string | null; priority?: string | null; adminMemo?: string | null
  processedAt?: string | null; processedBy?: string | null
  allocatedServerId?: string | null; allocatedGpuId?: string | null; allocatedSliceId?: string | null
  team?: string | null; startDate?: string | null; security?: string | null; scale?: string | null; remark?: string | null
}

// ISO timestamptz → 'YYYY-MM-DD HH:mm' (시드와 표시 일관). 빈값/파싱불가면 undefined/원본.
function fmtTs(v?: string | null): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// DB 행 → RequestItem. DB 실값 우선, null 확장필드는 시드/데모로 백필(기존 시드 13건 표시 완성도).
function fromDbRow(r: GpuRequestRow): RequestItem {
  const x = r as DbRowExt
  const seed = seedById(r.id)
  const sd = seed ? seedItem(seed) : undefined
  return {
    id: r.id,
    requesterUserId: r.requesterUserId,
    capacity: r.capacity,
    capacityUnit: r.capacityUnit,
    models: r.models ?? [],
    serviceName: r.serviceName ?? seed?.serviceName ?? '',
    purpose: r.purpose ?? seed?.purpose ?? '',
    status: r.status as Status,
    rejectReason: r.rejectReason ?? seed?.rejectReason,
    createdAt: fmtTs(r.createdAt) ?? r.createdAt,
    env: x.env ?? seed?.env,
    addons: x.addons ?? seed?.addons,
    attachmentUrl: x.attachmentUrl ?? seed?.attachmentUrl,
    period: x.period ?? seed?.period,
    priority: (x.priority ?? seed?.priority) as RequestItem['priority'],
    adminMemo: x.adminMemo ?? seed?.adminMemo,
    processedAt: fmtTs(x.processedAt) ?? seed?.processedAt,
    processedBy: x.processedBy ?? seed?.processedBy,
    allocatedServerId: x.allocatedServerId ?? seed?.allocatedServerId,
    allocatedGpuId: x.allocatedGpuId ?? seed?.allocatedGpuId,
    allocatedSliceId: x.allocatedSliceId ?? seed?.allocatedSliceId,
    team: x.team ?? sd?.team ?? userById(r.requesterUserId)?.department,
    security: x.security ?? sd?.security,
    scale: x.scale ?? sd?.scale,
    startDate: x.startDate ?? sd?.startDate,
    remark: x.remark ?? sd?.remark,
  }
}

// 신청 목록 — DB(backend)에서만 조회. backend 미기동(error) 시 시드 폴백(데모 안전망).
// isLoading: 첫 fetch가 아직 끝나지 않음(data·error 모두 없음) — 빈 상태/로딩 구분용.
export function useRequests(userId?: string): { items: RequestItem[]; isLoading: boolean } {
  const { data, error, isLoading } = useGpuRequests(userId)
  return useMemo(() => {
    const db: RequestItem[] = data
      ? data.map(fromDbRow)
      : error
        ? ALL_SEED.filter((r) => !userId || r.requesterUserId === userId).map(seedItem)
        : []
    return { items: db, isLoading: isLoading && !data && !error }
  }, [data, error, isLoading, userId])
}

// 승인 신청 → '자원 보기' 이동 경로. 관리자는 자원맵 딥링크(전체 서버 현황),
// 사용자(B/C)는 자원맵 접근권이 없어 본인 할당 화면(4.5 내 할당 자원)으로.
//  - 관리자: 할당 도출 가능 시 /resource-map/:serverId/:gpuId, 불가 시 null(비활성)
//  - 사용자: 승인이면 항상 /dashboard
export function allocationLink(item: RequestItem, isAdmin: boolean): string | null {
  if (item.status !== 'approved') return null
  if (!isAdmin) return '/dashboard'
  const alloc = deriveAllocation(item)
  return alloc ? `/resource-map/${alloc.serverId}/${alloc.gpuId}` : null
}

// 단건 조회(4.6a 상세) — DB 우선, backend 미기동 시 시드 폴백.
export function useRequestItem(id?: string): { item: RequestItem | null; isLoading: boolean } {
  const { data, error } = useGpuRequests()
  return useMemo(() => {
    if (!id) return { item: null, isLoading: false }
    if (data) {
      const row = data.find((r) => r.id === id)
      return { item: row ? fromDbRow(row) : null, isLoading: false }
    }
    if (error) {
      const s = seedById(id)
      return { item: s ? seedItem(s) : null, isLoading: false }
    }
    return { item: null, isLoading: true }
  }, [id, data, error])
}

// 재신청 프리필(4.6b ?from=) — 동기 조회(시드). 신규 DB 신청은 프리필 대상 아님.
export function findRequestSync(id: string): RequestItem | null {
  const s = seedById(id)
  return s ? seedItem(s) : null
}

// 승인 신청 → 할당 자원(/resource-map/:serverId/:gpuId 딥링크) 파생.
// 1) allocated* 명시값 → 2) MIG slice.requestId 역링크 → 3) serviceName→service→assigned GPU.
export function deriveAllocation(item: RequestItem): { serverId: string; gpuId: string } | null {
  if (item.status !== 'approved') return null
  if (item.allocatedServerId && item.allocatedGpuId)
    return { serverId: item.allocatedServerId, gpuId: item.allocatedGpuId }
  for (const srv of servers) {
    const g = srv.gpus.find((gpu) => gpu.slices?.some((sl) => sl.requestId === item.id))
    if (g) return { serverId: srv.id, gpuId: g.id }
  }
  const svc = services.find((s) => s.name === item.serviceName)
  if (svc) {
    for (const srv of servers) {
      const g = srv.gpus.find((gpu) => gpu.assignedServiceId === svc.id)
      if (g) return { serverId: srv.id, gpuId: g.id }
    }
  }
  return null
}

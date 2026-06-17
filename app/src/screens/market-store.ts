import { apiGet } from '../lib/api'
import type { Service } from '../data/types'

// 배포된 서비스 목록(GET /api/services) — 게시 신청 대상. listed=true면 이미 마켓에 게시됨.
// data/types Service 확장(models[]·listed는 정본에 없어 여기서). owner=ownerUserId 기준 내 서비스 필터.
export interface DeployedService extends Service {
  models?: string[]
  listed?: boolean
}
export const listServices = () => apiGet<DeployedService[]>('/api/services')

// G8 · 4.17 마켓플레이스 서비스 — backend market_services(GET /api/market-services) 로드.
// icon은 heroicon 컴포넌트명 문자열(market.tsx의 ICON_MAP으로 매핑). hue 0~360.
// serviceUrl 비어 있으면 화면이 id로 합성(http://svc.anclave.local/{id}).
export interface MarketService {
  id: string
  name: string
  kind: string
  provider: string
  model: string
  api: string
  owner: string
  ownerUserId: string
  serviceId?: string | null // 배포 서비스(svc-*) 연결 키 — 마켓 id와 체계가 다름.
  rating: number
  status: string
  hue: number
  icon: string
  responseTime: string
  tier: string
  monthlyReq: string
  usage: string
  usageNum: number
  delta: string
  up: boolean
  reqFull: string
  success: string
  deltaPct: string
  lastCall: string
  tags: string[]
  desc: string
  overview: string
  apiDesc: string
  features: string[]
  opsNotes: string[]
  serviceUrl: string
  demoUrl: string
  thumbnail: string
  screenshots: string[]
  // 게시 신청서 입력값(승인 시 복사) — backend market_services 미제공 시 undefined → 화면에서 숨김.
  visibility?: string
  demoNote?: string
}

// Postgres numeric(rating)은 JSON에서 문자열로 직렬화 → 숫자로 정규화.
const normalize = (s: MarketService): MarketService => ({ ...s, rating: Number(s.rating) })

// 목록(usage_num desc 정렬은 서버에서) · 단건(404 시 reject).
export const listMarketServices = () => apiGet<MarketService[]>('/api/market-services').then((d) => d.map(normalize))
export const getMarketService = (id: string) => apiGet<MarketService>(`/api/market-services/${id}`).then(normalize)

// 서비스 사용량(랭킹 요약 + 사용량 추이) — raw 집계. 색·비율·축 스케일은 화면에서 계산.
export interface UsageRow { keyId: string; owner: string; tag: string; serviceName?: string; team: string; teamHue: number; requests: number; tokens: number; deltaPct: number; spark: number[] }
export interface UsageDay { label: string; perKey: number[]; total: number; concurrent: number }
export interface MarketServiceUsage { keyCount: number; rows: UsageRow[]; days: UsageDay[] }
export const getMarketServiceUsage = (id: string) => apiGet<MarketServiceUsage>(`/api/market-services/${id}/usage`)

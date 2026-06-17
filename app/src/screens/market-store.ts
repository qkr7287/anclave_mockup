import { apiGet } from '../lib/api'

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
}

// Postgres numeric(rating)은 JSON에서 문자열로 직렬화 → 숫자로 정규화.
const normalize = (s: MarketService): MarketService => ({ ...s, rating: Number(s.rating) })

// 목록(usage_num desc 정렬은 서버에서) · 단건(404 시 reject).
export const listMarketServices = () => apiGet<MarketService[]>('/api/market-services').then((d) => d.map(normalize))
export const getMarketService = (id: string) => apiGet<MarketService>(`/api/market-services/${id}`).then(normalize)

// 서비스 사용량(랭킹 요약 + 사용량 추이) — raw 집계. 색·비율·축 스케일은 화면에서 계산.
export interface UsageRow { keyId: string; owner: string; tag: string; team: string; teamHue: number; requests: number; tokens: number; deltaPct: number; spark: number[] }
export interface UsageDay { label: string; perKey: number[]; total: number; concurrent: number }
export interface MarketServiceUsage { keyCount: number; rows: UsageRow[]; days: UsageDay[] }
export const getMarketServiceUsage = (id: string) => apiGet<MarketServiceUsage>(`/api/market-services/${id}/usage`)

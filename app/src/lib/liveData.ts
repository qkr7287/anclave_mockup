// 런타임 표시명 캐시 — users/services/gpu-requests 를 DB(/api/*)로 채우고,
// 미적재/백엔드 다운 시 seed 로 graceful degrade(빈칸 금지). DB=SoT, seed 는 폴백용.
// 순수 lookup 함수(metrics 등)가 React 없이 읽을 수 있게 모듈 레벨로 둔다.
// 하이드레이션은 useLiveData() 훅이 setLive*() 로 수행.
import type { Service, User } from '../data/types'
import { users as seedUsers } from '../data/users'
import { services as seedServices } from '../data/services'
import { gpuRequests as seedRequests } from '../data/requests'

// 슬롯 서비스 역추적에 필요한 최소 형태(seed GpuRequest · DB GpuRequestRow 양쪽 호환)
export interface RequestLike {
  id: string
  serviceName: string | null
}

let liveUsers: User[] = seedUsers
let liveServices: Service[] = seedServices
let liveRequests: RequestLike[] = seedRequests

const filled = <T,>(a: T[] | null | undefined): a is T[] => Array.isArray(a) && a.length > 0

// DB 응답으로 교체(비었거나 없으면 seed 유지 — 폴백 정책)
export function setLiveUsers(u: User[] | null | undefined) { liveUsers = filled(u) ? u : seedUsers }
export function setLiveServices(s: Service[] | null | undefined) { liveServices = filled(s) ? s : seedServices }
export function setLiveRequests(r: RequestLike[] | null | undefined) { liveRequests = filled(r) ? r : seedRequests }

export const liveUserById = (id?: string | null): User | undefined =>
  id ? liveUsers.find((u) => u.id === id) : undefined
export const liveServiceById = (id?: string | null): Service | undefined =>
  id ? liveServices.find((s) => s.id === id) : undefined
export const liveRequestById = (id?: string | null): RequestLike | undefined =>
  id ? liveRequests.find((r) => r.id === id) : undefined
export const getLiveServices = (): Service[] => liveServices

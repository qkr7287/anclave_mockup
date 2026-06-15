import { apiRequests } from '../data'
import type { ApiRequest } from '../data/types'
import { nowStamp } from './approval-store'

// API 키 신청 세션 스토어 — backend 미연동(g8). 요청 마법사(4.20)와 소유자 신청관리(4.19)·심사 상세가
// 상태(대기·승인·반려, 발급키)를 공유하도록 인메모리 사본. 새로고침 시 시드로 초기화(목업).
// purpose·processedAt·processedBy는 ApiRequest에 없어 여기서 확장.
export interface ApiRecord extends ApiRequest {
  purpose?: string
  processedAt?: string
  processedBy?: string
}

let store: ApiRecord[] = apiRequests.map((r) => ({ ...r }))
let seq = 1

export function listApiRequests(): ApiRecord[] {
  return store.map((r) => ({ ...r }))
}

export function getApiRequest(id: string): ApiRecord | undefined {
  const r = store.find((p) => p.id === id)
  return r ? { ...r } : undefined
}

// 사용자 신규 API 키 요청 — 대기 상태로 선두 추가. 대상 서비스 소유자의 신청관리(4.19) 대상이 된다.
export function createApiRequest(input: { requesterUserId: string; serviceId: string; model: string; targetServiceUrl: string; purpose?: string }): ApiRecord {
  const rec: ApiRecord = {
    id: `ar-new-${seq++}`,
    requesterUserId: input.requesterUserId,
    serviceId: input.serviceId,
    model: input.model,
    targetServiceUrl: input.targetServiceUrl,
    purpose: input.purpose,
    status: 'pending',
    createdAt: nowStamp(),
  }
  store = [rec, ...store]
  return rec
}

function mutate(id: string, patch: Partial<ApiRecord>): ApiRecord | undefined {
  const idx = store.findIndex((p) => p.id === id)
  if (idx < 0) return undefined
  store[idx] = { ...store[idx], ...patch }
  return { ...store[idx] }
}

// 승인 = 소유자가 자체 발급한 API 키를 기입해 승인. 이미 처리된 건은 재처리하지 않는다.
export function approveApiRequest(id: string, processedBy: string, apiKey: string): ApiRecord | undefined {
  return mutate(id, { status: 'approved', apiKey, processedBy, processedAt: nowStamp(), rejectReason: undefined })
}

export function rejectApiRequest(id: string, processedBy: string, rejectReason: string): ApiRecord | undefined {
  return mutate(id, { status: 'rejected', rejectReason, processedBy, processedAt: nowStamp() })
}

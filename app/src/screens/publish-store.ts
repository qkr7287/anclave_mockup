import { publishRequests } from '../data'
import type { PublishRequest } from '../data/types'
import { nowStamp } from './approval-store'

// 게시 승인 세션 스토어 — 게시 트랙은 backend 미연동(g8). 목록(ApprovalsPublish)과
// 심사 페이지(PublishDetail)가 처리 상태(승인·반려)를 공유하도록 인메모리 사본을 둔다.
// 새로고침 시 시드로 초기화(목업). 처리 메타(processedAt·By·memo)는 PublishRequest에 없어 여기서 확장.
export interface PubRecord extends PublishRequest {
  processedAt?: string
  processedBy?: string
  adminMemo?: string
}

let store: PubRecord[] = publishRequests.map((p) => ({ ...p }))
let seq = 1

export function listPublishRequests(): PubRecord[] {
  return store.map((r) => ({ ...r }))
}

// 사용자 신규 게시 신청(4.29 마법사) — 대기 상태로 목록 선두에 추가. 관리자 심사(4.9a) 대상이 된다.
export function createPublishRequest(input: { requesterUserId: string; serviceName: string; serviceUrl: string; demoUrl: string; meta: string }): PubRecord {
  const rec: PubRecord = {
    id: `pr-new-${seq++}`,
    requesterUserId: input.requesterUserId,
    serviceName: input.serviceName,
    serviceUrl: input.serviceUrl,
    demoUrl: input.demoUrl,
    meta: input.meta,
    status: 'pending',
    createdAt: nowStamp(),
  }
  store = [rec, ...store]
  return rec
}

export function getPublishRequest(id: string): PubRecord | undefined {
  const r = store.find((p) => p.id === id)
  return r ? { ...r } : undefined
}

function mutate(id: string, patch: Partial<PubRecord>): PubRecord | undefined {
  const idx = store.findIndex((p) => p.id === id)
  if (idx < 0) return undefined
  store[idx] = { ...store[idx], ...patch }
  return { ...store[idx] }
}

// 승인 = 마켓 노출. 이미 처리된 건은 재처리하지 않는다(가드는 호출부에서도 수행).
export function approvePublishRequest(id: string, processedBy: string, adminMemo?: string): PubRecord | undefined {
  return mutate(id, { status: 'approved', processedBy, adminMemo, processedAt: nowStamp(), rejectReason: undefined })
}

export function rejectPublishRequest(id: string, processedBy: string, rejectReason: string, adminMemo?: string): PubRecord | undefined {
  return mutate(id, { status: 'rejected', processedBy, rejectReason, adminMemo, processedAt: nowStamp() })
}

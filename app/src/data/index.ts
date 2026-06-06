export * from './types'
export * from './users'
export * from './models'
export * from './services'
export * from './servers'
export * from './requests'
export * from './events'
export * from './audit'
export * from './admin'

import { users } from './users'
import { models } from './models'
import { services } from './services'
import { allGpus, allSlices, servers } from './servers'
import {
  apiRequests,
  gpuChangeRequests,
  gpuRequests,
  publishRequests,
} from './requests'
import { activationStats, auditLogs } from './audit'
import { events } from './events'

// §5 참조 무결성 검증 — 끊긴 FK 0 이어야 한다 (DoD 검증 대상).
// 순수 함수: 문제 목록을 반환만 한다(빌드/렌더에 부작용 없음).
export function verifyIntegrity(): string[] {
  const issues: string[] = []
  const uids = new Set(users.map((u) => u.id))
  const mids = new Set(models.map((m) => m.id))
  const sids = new Set(services.map((s) => s.id))
  const gids = new Set(allGpus.map((g) => g.id))
  const srvIds = new Set(servers.map((s) => s.id))

  allSlices.forEach((s) => {
    if (s.ownerUserId && !uids.has(s.ownerUserId))
      issues.push(`slice ${s.id} ownerUserId ${s.ownerUserId} 없음`)
    if (s.modelId && !mids.has(s.modelId))
      issues.push(`slice ${s.id} modelId ${s.modelId} 없음`)
  })
  allGpus.forEach((g) => {
    if (g.assignedUserId && !uids.has(g.assignedUserId))
      issues.push(`gpu ${g.id} assignedUserId 없음`)
    if (g.assignedServiceId && !sids.has(g.assignedServiceId))
      issues.push(`gpu ${g.id} assignedServiceId 없음`)
  })
  services.forEach((s) => {
    if (!mids.has(s.model)) issues.push(`service ${s.id} model ${s.model} 없음`)
    if (!uids.has(s.ownerUserId)) issues.push(`service ${s.id} owner 없음`)
  })
  gpuRequests.forEach((r) => {
    if (!uids.has(r.requesterUserId))
      issues.push(`gpuRequest ${r.id} requester 없음`)
    r.models.forEach((m) => {
      if (!mids.has(m)) issues.push(`gpuRequest ${r.id} model ${m} 없음`)
    })
  })
  apiRequests.forEach((r) => {
    if (!uids.has(r.requesterUserId))
      issues.push(`apiRequest ${r.id} requester 없음`)
    if (!sids.has(r.serviceId))
      issues.push(`apiRequest ${r.id} service 없음`)
  })
  publishRequests.forEach((r) => {
    if (!uids.has(r.requesterUserId))
      issues.push(`publishRequest ${r.id} requester 없음`)
  })
  gpuChangeRequests.forEach((r) => {
    if (!uids.has(r.requesterUserId))
      issues.push(`changeRequest ${r.id} requester 없음`)
  })
  events.forEach((e) => {
    if (e.gpuId && !gids.has(e.gpuId)) issues.push(`event ${e.id} gpuId 없음`)
    if (e.serverId && !srvIds.has(e.serverId))
      issues.push(`event ${e.id} serverId 없음`)
  })
  auditLogs.forEach((a) => {
    if (!uids.has(a.actorUserId)) issues.push(`audit ${a.id} actor 없음`)
  })
  activationStats.forEach((a, i) => {
    if (!sids.has(a.serviceId)) issues.push(`activation[${i}] service 없음`)
    if (!mids.has(a.modelId)) issues.push(`activation[${i}] model 없음`)
    if (!uids.has(a.consumerUserId))
      issues.push(`activation[${i}] consumer 없음`)
  })
  return issues
}

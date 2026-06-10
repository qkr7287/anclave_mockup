import type { EventLog, Notification, Service } from './types'
import { servers, allGpus } from './servers'
import { services } from './services'
import { gpuRequests } from './requests'

// §5 이벤트/알림 — 배포 상태(servers·services·requests)에서 결정적 생성(수기 X). 모든 참조는 실제 id.

// 배포 = (서비스, 서버, GPU, MIG여부, 사용률) — 단일=assignedServiceId · MIG=슬라이스 owner+model 역추적
interface Deployment { service: Service; serverId: string; gpuId: string; mig: boolean; usage: number }
const deployments: Deployment[] = []
servers.forEach((srv) =>
  srv.gpus.forEach((g) => {
    if (g.assignedServiceId) {
      const s = services.find((x) => x.id === g.assignedServiceId)
      if (s) deployments.push({ service: s, serverId: srv.id, gpuId: g.id, mig: false, usage: g.smUtil })
    }
    g.slices?.forEach((sl) => {
      if (!sl.ownerUserId || !sl.modelId) return
      const s = services.find((x) => x.ownerUserId === sl.ownerUserId && x.model === sl.modelId)
      if (s) deployments.push({ service: s, serverId: srv.id, gpuId: g.id, mig: true, usage: sl.usage })
    })
  })
)
deployments.sort((a, b) => b.usage - a.usage)

const serverOfGpu = (gpuId: string) => servers.find((s) => s.gpus.some((g) => g.id === gpuId))
// 결정적 타임스탬프 풀(최근순) — Date.now 미사용
const TS = [
  '2026-06-06 15:02', '2026-06-06 14:30', '2026-06-06 14:10', '2026-06-06 13:25',
  '2026-06-06 11:40', '2026-06-06 11:25', '2026-06-06 11:05', '2026-06-06 10:30',
  '2026-06-05 17:22', '2026-06-05 16:10', '2026-06-05 13:48', '2026-06-05 11:20',
  '2026-06-04 09:50', '2026-06-03 15:40',
]

const events: EventLog[] = []
const push = (e: Omit<EventLog, 'id' | 'createdAt'>) =>
  events.push({ id: `ev-${String(events.length + 1).padStart(2, '0')}`, createdAt: TS[Math.min(events.length, TS.length - 1)], ...e })

// 1) 장애 GPU(XID) — critical(open)
const xidGpu = allGpus.find((g) => g.xid)
if (xidGpu) {
  push({ severity: 'critical', status: 'open', serverId: serverOfGpu(xidGpu.id)?.id, gpuId: xidGpu.id, read: false, assignee: 'admin', action: '드라이버 재설치 예정', message: `${xidGpu.xid} — ${xidGpu.model} 응답 없음(드라이버). 점검 모드 전환` })
}
// 2) 고온 GPU(>75°C, 비장애) — warn(open)
const hotGpu = allGpus.find((g) => !g.xid && g.temp > 75)
if (hotGpu) {
  push({ severity: 'warn', status: 'open', serverId: serverOfGpu(hotGpu.id)?.id, gpuId: hotGpu.id, read: false, message: `${hotGpu.model} 온도 ${hotGpu.temp}°C — 경고 임계 근접` })
}
// 3) 최다 사용 배포 모니터링 — warn(open)
const busiest = deployments[0]
if (busiest) {
  push({ severity: 'warn', status: 'open', serverId: busiest.serverId, gpuId: busiest.gpuId, read: true, message: `${busiest.service.name} ${busiest.mig ? '· 16GB 인스턴스 ' : ''}부하 ${busiest.usage}% — 모니터링` })
}
// 4) 배포 완료 — info(resolved) · 사용률순
deployments.forEach((d) => {
  push({ severity: 'info', status: 'resolved', serverId: d.serverId, gpuId: d.gpuId, read: true, message: `${d.service.name}(${d.mig ? 'MIG 16GB 인스턴스' : 'GPU 단일'}) 배포 완료` })
})
// 5) 유휴 회수 — recovered(resolved)
const idleSrv = servers.find((s) => s.health === 'inactive')
if (idleSrv) {
  push({ severity: 'recovered', status: 'resolved', serverId: idleSrv.id, gpuId: idleSrv.gpus[0]?.id, read: true, resolution: '관리자 회수 → 가용', message: `${idleSrv.gpus[0]?.model} 유휴 전환 — 미할당(가용)` })
}

// ── 알림 8 — 배포 상태 기반(health·alloc·reclaim) · 읽음/안읽음 혼합 ──
const notifications: Notification[] = []
const npush = (n: Omit<Notification, 'id'>) =>
  notifications.push({ id: `nt-${String(notifications.length + 1).padStart(2, '0')}`, ...n })

if (xidGpu) npush({ category: 'health', read: false, createdAt: TS[0], link: '/events', message: `${serverOfGpu(xidGpu.id)?.id} GPU ${xidGpu.xid} 장애가 발생했어요. 점검이 필요해요.` })
if (hotGpu) npush({ category: 'health', read: false, createdAt: TS[1], link: `/resource-map/${serverOfGpu(hotGpu.id)?.id}`, message: `${serverOfGpu(hotGpu.id)?.id}(${hotGpu.model}) 온도 경고가 감지됐어요.` })
gpuRequests.filter((r) => r.status === 'pending').slice(0, 3).forEach((r, i) =>
  npush({ category: 'alloc', read: i === 0 ? false : true, createdAt: TS[3 + i], link: '/admin/approvals/gpu', message: `GPU 신청(${r.serviceName})이 승인 대기예요.` })
)
if (idleSrv) npush({ category: 'reclaim', read: false, createdAt: TS[8], link: '/requests/gpu-change', message: `${idleSrv.id} 유휴 GPU 회수를 권고해요.` })
const approvedGr = gpuRequests.find((r) => r.status === 'approved')
if (approvedGr) npush({ category: 'alloc', read: true, createdAt: TS[10], link: '/requests/status', message: `GPU 신청(${approvedGr.serviceName})이 승인됐어요.` })
npush({ category: 'alloc', read: true, createdAt: TS[12], link: '/api-approvals', message: 'API 키가 발급됐어요 — doc-search 연동.' })

export { events, notifications }

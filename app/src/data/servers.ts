import type { Gpu, GpuHealth, GpuServer, MigProfile, MigSlice, ServerHealth } from './types'
import { services } from './services'
import { gpuRequests } from './requests'
import seed from './seed.json'

// ── seed.json fleet 스펙 → 타입드 GpuServer[] 빌드(단일 진실원) ──
interface FleetInstance { profile: string; gb: number; serviceId: string | null; usage: number }
interface FleetGpu {
  model: string; arch: string; vramGb: number; migCapable: boolean
  temp: number; power: number; interconnect: string; serial: string
  instances?: FleetInstance[]
  serviceId?: string | null; smUtil?: number; vramUtil?: number; health?: string; xid?: string
}
interface FleetNode {
  id: string; host: string; cpu: string; ramGb: number
  cpuUtil: number; memUtil: number; network: string; gpus: FleetGpu[]
}

const svcById = (id?: string | null) => (id ? services.find((s) => s.id === id) : undefined)
// 서비스명 → 그 서비스를 올린 승인 GPU 신청 id(slice.requestId 연결)
const reqByService = (name?: string): string | undefined =>
  gpuRequests.find((r) => r.serviceName === name && r.status === 'approved')?.id

function buildSlices(gpuId: string, instances: FleetInstance[]): MigSlice[] {
  return instances.map((inst, i) => {
    const s = svcById(inst.serviceId)
    const used = inst.usage > 0 || !!s
    return {
      id: `${gpuId}-s${i + 1}`,
      profile: inst.profile as MigProfile,
      units: 1,
      gb: inst.gb,
      usage: inst.usage,
      vramUtil: used ? Math.max(8, inst.usage - 6) : 0,
      ownerUserId: s?.ownerUserId,
      modelId: s?.model,
      containerId: s ? `cont-${s.id.slice(4)}-01` : undefined,
      health: !s ? 'inactive' : inst.usage >= 80 ? 'warn' : 'normal',
      requestId: s ? reqByService(s.name) : undefined,
    }
  })
}

function buildGpu(serverId: string, fg: FleetGpu, gi: number): Gpu {
  const gpuId = `${serverId}-gpu${gi}`
  const slices = fg.instances ? buildSlices(gpuId, fg.instances) : undefined
  const usedSlices = slices?.filter((s) => s.usage > 0) ?? []
  const s = svcById(fg.serviceId)
  const smUtil = fg.migCapable
    ? usedSlices.length ? Math.round(usedSlices.reduce((a, x) => a + x.usage, 0) / usedSlices.length) : 0
    : fg.smUtil ?? 0
  const vramUtil = fg.migCapable
    ? usedSlices.length ? Math.round(usedSlices.reduce((a, x) => a + x.vramUtil, 0) / usedSlices.length) : 0
    : fg.vramUtil ?? 0
  return {
    id: gpuId,
    name: fg.model,
    model: fg.model,
    arch: fg.arch,
    vramGb: fg.vramGb,
    migCapable: fg.migCapable,
    serial: fg.serial,
    smUtil,
    vramUtil,
    temp: fg.temp,
    power: fg.power,
    health: (fg.xid ? 'danger' : (fg.health ?? 'normal')) as GpuHealth,
    allocMode: fg.migCapable ? 'mig' : 'cluster',
    assignedUserId: s?.ownerUserId,
    assignedServiceId: fg.serviceId ?? undefined,
    interconnect: fg.interconnect,
    xid: fg.xid,
    slices,
    recentActivities: undefined,
  }
}

function buildServer(node: FleetNode): GpuServer {
  const gpus = node.gpus.map((fg, gi) => buildGpu(node.id, fg, gi))
  // 호스팅 서비스·사용자 집계(단일=assignedServiceId · MIG=슬라이스 owner+model 역추적)
  const serviceIds = new Set<string>()
  const userIds = new Set<string>()
  gpus.forEach((g) => {
    if (g.assignedUserId) userIds.add(g.assignedUserId)
    if (g.assignedServiceId) serviceIds.add(g.assignedServiceId)
    g.slices?.forEach((sl) => {
      if (sl.ownerUserId) userIds.add(sl.ownerUserId)
      const sv = services.find((x) => x.ownerUserId === sl.ownerUserId && x.model === sl.modelId)
      if (sv) serviceIds.add(sv.id)
    })
  })
  const anyXid = gpus.some((g) => g.xid)
  const allIdle = gpus.every((g) => g.health === 'inactive')
  const maxTemp = Math.max(...gpus.map((g) => g.temp))
  const health: ServerHealth = anyXid ? 'danger' : allIdle ? 'inactive' : maxTemp > 75 ? 'warn' : 'normal'
  const note = anyXid ? '장애 GPU · 점검'
    : allIdle ? '유휴 노드(미할당)'
    : gpus.length > 1 ? `GPU ${gpus.length}장`
    : gpus[0].migCapable ? 'MIG 분할 노드'
    : `${gpus[0].model} · 단일 할당`
  return {
    id: node.id,
    name: node.host,
    rack: node.host,
    host: node.host,
    temp: maxTemp,
    network: node.network,
    cpuUtil: node.cpuUtil,
    memUtil: node.memUtil,
    health,
    note,
    hostedServiceIds: [...serviceIds],
    hostedUserIds: [...userIds],
    gpus,
  }
}

export const servers: GpuServer[] = (seed.fleet as unknown as FleetNode[]).map(buildServer)
export const allGpus: Gpu[] = servers.flatMap((s) => s.gpus)
export const allSlices: MigSlice[] = allGpus.flatMap((g) => g.slices ?? [])

export const serverById = (id: string): GpuServer | undefined => servers.find((s) => s.id === id)
export const gpuById = (id: string): Gpu | undefined => allGpus.find((g) => g.id === id)

import type { Gpu, GpuServer, GpuHealth, MigProfile, MigSlice, ServerHealth } from './types'
import { services } from './services'
import { gpuRequests } from './requests'

// 소유자 → 그 사용자의 GPU 신청 id(없으면 첫 신청) — slice.requestId 연결용
const svc = (id: string) => services.find((s) => s.id === id)!
const reqByOwner = (ownerUserId?: string): string =>
  (gpuRequests.find((g) => g.requesterUserId === ownerUserId) ?? gpuRequests[0]).id

// ── NVIDIA RTX PRO 4500 Blackwell(32GB) MIG — 16GB 인스턴스 2개(1 할당 / 1 가용) ──
function proRtxSlices(gpuId: string, serviceId = 'svc-llama', usage = 71): MigSlice[] {
  const mk = (i: number, profile: MigProfile, units: number, gb: number, sid?: string, use = 0): MigSlice => {
    const s = sid ? svc(sid) : undefined
    return {
      id: `${gpuId}-s${i}`,
      profile, units, gb,
      usage: use,
      vramUtil: use ? Math.max(8, use - 6) : 0,
      ownerUserId: s?.ownerUserId,
      modelId: s?.model,
      containerId: sid ? `cont-${sid.slice(4)}-01` : undefined,
      health: !sid ? 'inactive' : use >= 80 ? 'warn' : 'normal',
      requestId: sid ? reqByOwner(s?.ownerUserId) : undefined,
    }
  }
  return [
    mk(1, '1g.16gb', 1, 16, serviceId, usage),
    mk(2, '1g.16gb', 1, 16),
  ]
}

// ── 7대 단일 GPU 노드 — 실제 모델/아키텍처/VRAM/MIG 지원여부 반영(MIG는 GB300뿐) ──
interface NodeSpec {
  model: string
  arch: string
  vramGb: number
  migCapable: boolean
  smUtil: number
  vramUtil: number
  temp: number
  power: number
  gpuHealth: GpuHealth // 'normal' | 'danger' | 'inactive'
  serviceId?: string // cluster(통째) 할당 서비스
  xid?: string
  cpuUtil: number
  memUtil: number
  network: string
}

const FLEET: NodeSpec[] = [
  { model: 'NVIDIA RTX PRO 4500 Blackwell', arch: 'Blackwell', vramGb: 32, migCapable: true, smUtil: 0, vramUtil: 0, temp: 61, power: 200, gpuHealth: 'normal', cpuUtil: 38, memUtil: 44, network: '25 Gbps' },
  { model: 'RTX 5070', arch: 'Blackwell', vramGb: 12, migCapable: false, smUtil: 58, vramUtil: 61, temp: 67, power: 220, gpuHealth: 'normal', serviceId: 'svc-sd', cpuUtil: 44, memUtil: 49, network: '10 Gbps' },
  { model: 'RTX 2060 SUPER', arch: 'Turing', vramGb: 8, migCapable: false, smUtil: 44, vramUtil: 52, temp: 63, power: 158, gpuHealth: 'normal', serviceId: 'svc-code', cpuUtil: 33, memUtil: 41, network: '10 Gbps' },
  { model: 'RTX 2070 SUPER', arch: 'Turing', vramGb: 8, migCapable: false, smUtil: 71, vramUtil: 68, temp: 78, power: 205, gpuHealth: 'normal', serviceId: 'svc-doc', cpuUtil: 62, memUtil: 70, network: '10 Gbps' },
  { model: 'RTX 2060', arch: 'Turing', vramGb: 6, migCapable: false, smUtil: 0, vramUtil: 0, temp: 41, power: 16, gpuHealth: 'inactive', cpuUtil: 12, memUtil: 18, network: '1 Gbps' },
  { model: 'RTX 3060 Ti', arch: 'Ampere', vramGb: 8, migCapable: false, smUtil: 39, vramUtil: 47, temp: 61, power: 162, gpuHealth: 'normal', serviceId: 'svc-vqa', cpuUtil: 29, memUtil: 38, network: '10 Gbps' },
  { model: 'GTX 1070', arch: 'Pascal', vramGb: 8, migCapable: false, smUtil: 0, vramUtil: 0, temp: 88, power: 0, gpuHealth: 'danger', xid: 'XID 79', cpuUtil: 8, memUtil: 14, network: '1 Gbps' },
]

function buildServer(n: NodeSpec, i: number): GpuServer {
  const id = `srv-${String(i + 1).padStart(2, '0')}`
  const host = `gpu-a${String(i + 1).padStart(2, '0')}`
  const name = host // 서버명 = 호스트네임(gpu-a01 …)
  const gpuId = `${id}-gpu0`
  const slices = n.migCapable ? proRtxSlices(gpuId) : undefined
  const usedSlices = slices?.filter((s) => s.usage > 0) ?? []
  const smUtil = n.migCapable
    ? (usedSlices.length ? Math.round(usedSlices.reduce((a, s) => a + s.usage, 0) / usedSlices.length) : 0)
    : n.smUtil
  const vramUtil = n.migCapable
    ? (usedSlices.length ? Math.round(usedSlices.reduce((a, s) => a + s.vramUtil, 0) / usedSlices.length) : 0)
    : n.vramUtil
  const service = n.serviceId ? svc(n.serviceId) : undefined
  const gpu: Gpu = {
    id: gpuId,
    name: n.model,
    model: n.model,
    arch: n.arch,
    vramGb: n.vramGb,
    migCapable: n.migCapable,
    serial: `GPU-A${String(i + 1).padStart(2, '0')}-${1000 + i}`,
    smUtil,
    vramUtil,
    temp: n.temp,
    power: n.power,
    health: n.gpuHealth,
    allocMode: n.migCapable ? 'mig' : 'cluster',
    assignedUserId: service?.ownerUserId,
    assignedServiceId: n.serviceId,
    interconnect: 'PCIe 5.0',
    xid: n.xid,
    slices,
    recentActivities: undefined,
  }

  // 호스팅 사용자·서비스 집계
  const userIds = new Set<string>()
  const serviceIds = new Set<string>()
  if (gpu.assignedUserId) userIds.add(gpu.assignedUserId)
  if (gpu.assignedServiceId) serviceIds.add(gpu.assignedServiceId)
  slices?.forEach((s) => {
    if (s.ownerUserId) userIds.add(s.ownerUserId)
    const sv = services.find((x) => x.ownerUserId === s.ownerUserId && x.model === s.modelId)
    if (sv) serviceIds.add(sv.id)
  })

  // 서버 헬스: 장애 GPU=danger · 유휴=inactive · 고온(>75)=warn · 그 외 normal
  const health: ServerHealth = n.gpuHealth === 'danger' ? 'danger'
    : n.gpuHealth === 'inactive' ? 'inactive'
    : n.temp > 75 ? 'warn' : 'normal'
  const note = n.xid ? '장애 GPU · 점검'
    : n.gpuHealth === 'inactive' ? '유휴 노드(미할당)'
    : n.migCapable ? 'MIG 분할 노드'
    : `${n.model} · 단일 할당`

  return {
    id, name, rack: name, host,
    temp: n.temp,
    network: n.network,
    cpuUtil: n.cpuUtil,
    memUtil: n.memUtil,
    health,
    note,
    hostedServiceIds: [...serviceIds],
    hostedUserIds: [...userIds],
    gpus: [gpu],
  }
}

// ── 멀티 GPU 노드 데모 — RTX PRO 4500 Blackwell(MIG 2분할) + RTX 2070(단일) 혼합 ──
function buildMultiServer(): GpuServer {
  const id = 'srv-08'
  const host = 'gpu-a08'
  const gpu0Id = `${id}-gpu0`
  const slices0 = proRtxSlices(gpu0Id, 'svc-qwen', 64) // 16GB 인스턴스 2개(1 할당=qwen / 1 가용)
  const used0 = slices0.filter((s) => s.usage > 0)
  const migGpu: Gpu = {
    id: gpu0Id,
    name: 'NVIDIA RTX PRO 4500 Blackwell',
    model: 'NVIDIA RTX PRO 4500 Blackwell',
    arch: 'Blackwell',
    vramGb: 32,
    migCapable: true,
    serial: 'GPU-A08-2000',
    smUtil: used0.length ? Math.round(used0.reduce((a, s) => a + s.usage, 0) / used0.length) : 0,
    vramUtil: used0.length ? Math.round(used0.reduce((a, s) => a + s.vramUtil, 0) / used0.length) : 0,
    temp: 62,
    power: 200,
    health: 'normal',
    allocMode: 'mig',
    assignedUserId: undefined,
    assignedServiceId: undefined,
    interconnect: 'PCIe 5.0',
    slices: slices0,
    recentActivities: undefined,
  }
  const rtxGpu: Gpu = {
    id: `${id}-gpu1`,
    name: 'RTX 2070',
    model: 'RTX 2070',
    arch: 'Turing',
    vramGb: 8,
    migCapable: false,
    serial: 'GPU-A08-2001',
    smUtil: 47,
    vramUtil: 51,
    temp: 66,
    power: 176,
    health: 'normal',
    allocMode: 'cluster',
    assignedUserId: svc('svc-stt').ownerUserId,
    assignedServiceId: 'svc-stt',
    interconnect: 'PCIe 4.0',
    slices: undefined,
    recentActivities: undefined,
  }
  const gpus = [migGpu, rtxGpu]
  // 호스팅 서비스·사용자 집계(슬라이스 owner+model → 서비스 역추적, 단일=assignedServiceId)
  const serviceIds = new Set<string>()
  const userIds = new Set<string>()
  gpus.forEach((g) => {
    if (g.assignedUserId) userIds.add(g.assignedUserId)
    if (g.assignedServiceId) serviceIds.add(g.assignedServiceId)
    g.slices?.forEach((s) => {
      if (s.ownerUserId) userIds.add(s.ownerUserId)
      const sv = services.find((x) => x.ownerUserId === s.ownerUserId && x.model === s.modelId)
      if (sv) serviceIds.add(sv.id)
    })
  })
  const maxTemp = Math.max(...gpus.map((g) => g.temp))
  return {
    id, name: host, rack: host, host,
    temp: maxTemp,
    network: '25 Gbps',
    cpuUtil: 52,
    memUtil: 60,
    health: maxTemp > 75 ? 'warn' : 'normal',
    note: 'RTX PRO 4500(MIG) + RTX 2070',
    hostedServiceIds: [...serviceIds],
    hostedUserIds: [...userIds],
    gpus,
  }
}

export const servers: GpuServer[] = [...FLEET.map(buildServer), buildMultiServer()]
export const allGpus: Gpu[] = servers.flatMap((s) => s.gpus)
export const allSlices: MigSlice[] = allGpus.flatMap((g) => g.slices ?? [])

export const serverById = (id: string): GpuServer | undefined => servers.find((s) => s.id === id)
export const gpuById = (id: string): Gpu | undefined => allGpus.find((g) => g.id === id)

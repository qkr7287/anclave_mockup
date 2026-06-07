import type { Gpu, GpuServer, GpuHealth, MigSlice, ServerHealth } from './types'
import { services } from './services'

// ── helpers ────────────────────────────────────────────────
const ABBR: Record<string, string> = {
  'svc-qwen': 'qwen',
  'svc-llama': 'llama',
  'svc-code': 'code',
  'svc-doc': 'doc',
  'svc-sd': 'sd',
  'svc-stt': 'stt',
  'svc-vqa': 'vqa',
}
const contCount: Record<string, number> = {}
const svc = (id: string) => services.find((s) => s.id === id)!

function nextContainer(serviceId: string): string {
  const a = ABBR[serviceId]
  contCount[a] = (contCount[a] ?? 0) + 1
  return `cont-${a}-${String(contCount[a]).padStart(2, '0')}`
}

interface SliceCfg {
  profile: string
  units: number
  usage: number
  vram: number
  serviceId?: string // 지정 시 service owner/model/container 자동
  // service 없는 개인 워크로드(예: manager 직접 할당) — 명시 owner/model
  ownerUserId?: string
  modelId?: string
  container?: string
}
interface GpuCfg {
  mode: 'cluster' | 'mig'
  health?: GpuHealth
  xid?: string
  sm: number
  vram: number
  temp: number
  power: number
  serviceId?: string // cluster GPU 할당
  slices?: SliceCfg[]
  activities?: { time: string; type: string; message: string }[]
}
interface ServerCfg {
  id: string
  name: string
  rack: string
  host: string
  health: ServerHealth
  note: string
  temp: number
  network: string
  cpuUtil: number
  memUtil: number
  gpus: GpuCfg[]
}

let gpuGlobal = 0
function buildGpu(serverId: string, idx: number, c: GpuCfg): Gpu {
  gpuGlobal += 1
  const id = `${serverId}-gpu${idx}`
  const slices: MigSlice[] | undefined = c.slices?.map((s, i) => {
    const service = s.serviceId ? svc(s.serviceId) : undefined
    return {
      id: `${id}-s${i + 1}`,
      profile: s.profile,
      units: s.units,
      usage: s.usage,
      vramUtil: s.vram,
      ownerUserId: service?.ownerUserId ?? s.ownerUserId,
      modelId: service?.model ?? s.modelId,
      containerId: s.serviceId ? nextContainer(s.serviceId) : s.container,
    }
  })
  const service = c.serviceId ? svc(c.serviceId) : undefined
  return {
    id,
    name: `H100-${String(gpuGlobal).padStart(2, '0')}`,
    serial: `GPU-${serverId.slice(-2)}${idx}-${1000 + gpuGlobal}`,
    smUtil: c.sm,
    vramUtil: c.vram,
    temp: c.temp,
    power: c.power,
    health: c.health ?? 'normal',
    allocMode: c.mode,
    assignedUserId: service?.ownerUserId,
    assignedServiceId: c.serviceId,
    interconnect: c.mode === 'cluster' ? 'NVLink' : undefined,
    xid: c.xid,
    slices,
    recentActivities: c.activities,
  }
}

// ── §5 서버 8대 구성 (위치·상태 정본 반영) ──────────────────
const CFG: ServerCfg[] = [
  {
    id: 'srv-01', name: '랙A-01', rack: '랙A-01', host: 'gpu-a01',
    health: 'normal', note: '클러스터(4장→1팀, 대형 학습)', temp: 64, network: '12.4 Gbps', cpuUtil: 71, memUtil: 66,
    gpus: [
      { mode: 'cluster', sm: 94, vram: 91, temp: 72, power: 638, serviceId: 'svc-llama', activities: [{ time: '14:22', type: 'load', message: 'Llama 3 70B 샤드 로드 완료' }, { time: '13:50', type: 'alloc', message: '클러스터 4장 점유 시작' }] },
      { mode: 'cluster', sm: 92, vram: 90, temp: 71, power: 624, serviceId: 'svc-llama' },
      { mode: 'cluster', sm: 90, vram: 89, temp: 70, power: 611, serviceId: 'svc-llama' },
      { mode: 'cluster', sm: 91, vram: 90, temp: 71, power: 629, serviceId: 'svc-llama' },
    ],
  },
  {
    id: 'srv-02', name: '랙A-02', rack: '랙A-02', host: 'gpu-a02',
    health: 'normal', note: 'MIG 분할(1g·2g·3g 혼합)', temp: 58, network: '8.1 Gbps', cpuUtil: 54, memUtil: 61,
    gpus: [
      { mode: 'mig', sm: 76, vram: 72, temp: 63, power: 402, slices: [
        { profile: '3g', units: 3, usage: 81, vram: 78, serviceId: 'svc-qwen' },
        { profile: '2g', units: 2, usage: 64, vram: 60, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 68, vram: 70, temp: 61, power: 388, slices: [
        { profile: '3g', units: 3, usage: 73, vram: 71, serviceId: 'svc-code' },
        { profile: '1g', units: 1, usage: 44, vram: 40, serviceId: 'svc-stt' },
        { profile: '1g', units: 1, usage: 38, vram: 35, serviceId: 'svc-vqa' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 59, vram: 55, temp: 59, power: 351, slices: [
        { profile: '2g', units: 2, usage: 57, vram: 52, serviceId: 'svc-llama' },
        { profile: '2g', units: 2, usage: 49, vram: 46, serviceId: 'svc-doc' },
        { profile: '3g', units: 3, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 64, vram: 60, temp: 60, power: 366, slices: [
        { profile: '1g', units: 1, usage: 41, vram: 38, serviceId: 'svc-sd' },
        { profile: '3g', units: 3, usage: 70, vram: 66, serviceId: 'svc-qwen' },
        { profile: '3g', units: 3, usage: 0, vram: 0 },
      ] },
    ],
  },
  {
    id: 'srv-03', name: '랙A-03', rack: '랙A-03', host: 'gpu-a03',
    health: 'normal', note: 'MIG 분할(다수 소형 슬라이스)', temp: 56, network: '6.7 Gbps', cpuUtil: 48, memUtil: 57,
    gpus: [
      { mode: 'mig', sm: 62, vram: 58, temp: 58, power: 333, slices: [
        { profile: '1g', units: 1, usage: 52, vram: 48, serviceId: 'svc-stt' },
        { profile: '1g', units: 1, usage: 47, vram: 44, serviceId: 'svc-vqa' },
        { profile: '1g', units: 1, usage: 39, vram: 36, serviceId: 'svc-sd' },
        { profile: '1g', units: 1, usage: 33, vram: 30, serviceId: 'svc-doc' },
        { profile: '3g', units: 3, usage: 61, vram: 57, serviceId: 'svc-qwen' },
      ] },
      { mode: 'mig', sm: 55, vram: 52, temp: 57, power: 321, slices: [
        { profile: '1g', units: 1, usage: 44, vram: 41, serviceId: 'svc-vqa' },
        { profile: '1g', units: 1, usage: 36, vram: 33, serviceId: 'svc-stt' },
        { profile: '2g', units: 2, usage: 58, vram: 54, serviceId: 'svc-code' },
        { profile: '3g', units: 3, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 51, vram: 49, temp: 56, power: 310, slices: [
        { profile: '2g', units: 2, usage: 50, vram: 47, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 43, vram: 40, serviceId: 'svc-llama' },
        { profile: '3g', units: 3, usage: 55, vram: 51, serviceId: 'svc-qwen' },
      ] },
      { mode: 'mig', sm: 46, vram: 44, temp: 55, power: 298, slices: [
        { profile: '1g', units: 1, usage: 31, vram: 28, serviceId: 'svc-sd' },
        { profile: '1g', units: 1, usage: 28, vram: 25, serviceId: 'svc-vqa' },
        { profile: '1g', units: 1, usage: 0, vram: 0 },
        { profile: '1g', units: 1, usage: 0, vram: 0 },
        { profile: '3g', units: 3, usage: 49, vram: 46, serviceId: 'svc-code' },
      ] },
    ],
  },
  {
    id: 'srv-04', name: '랙B-01', rack: '랙B-01', host: 'gpu-b01',
    health: 'normal', note: '혼재(2장 클러스터 + 2장 MIG)', temp: 61, network: '9.3 Gbps', cpuUtil: 63, memUtil: 60,
    gpus: [
      { mode: 'cluster', sm: 86, vram: 84, temp: 69, power: 588, serviceId: 'svc-qwen', activities: [{ time: '12:10', type: 'alloc', message: '2장 클러스터 점유' }] },
      { mode: 'cluster', sm: 84, vram: 83, temp: 68, power: 571, serviceId: 'svc-qwen' },
      { mode: 'mig', sm: 60, vram: 56, temp: 60, power: 344, slices: [
        { profile: '3g', units: 3, usage: 66, vram: 62, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 51, vram: 48, serviceId: 'svc-stt' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 53, vram: 50, temp: 58, power: 327, slices: [
        { profile: '2g', units: 2, usage: 47, vram: 44, serviceId: 'svc-vqa' },
        { profile: '2g', units: 2, usage: 42, vram: 39, serviceId: 'svc-sd' },
        { profile: '3g', units: 3, usage: 58, vram: 54, serviceId: 'svc-code' },
      ] },
    ],
  },
  {
    id: 'srv-05', name: '랙B-02', rack: '랙B-02', host: 'gpu-b02',
    health: 'warn', note: 'MIG 분할(추론 서비스 다수) · 응답 지연', temp: 74, network: '4.2 Gbps', cpuUtil: 88, memUtil: 83,
    gpus: [
      { mode: 'mig', sm: 91, vram: 88, temp: 78, power: 441, slices: [
        { profile: '3g', units: 3, usage: 93, vram: 90, serviceId: 'svc-llama' },
        { profile: '2g', units: 2, usage: 87, vram: 84, serviceId: 'svc-qwen' },
        { profile: '2g', units: 2, usage: 82, vram: 80, serviceId: 'svc-code' },
      ] },
      { mode: 'mig', sm: 88, vram: 85, temp: 77, power: 433, slices: [
        { profile: '2g', units: 2, usage: 84, vram: 81, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 79, vram: 76, serviceId: 'svc-vqa' },
        { profile: '3g', units: 3, usage: 90, vram: 87, serviceId: 'svc-stt' },
      ] },
      { mode: 'mig', sm: 85, vram: 82, temp: 76, power: 421, slices: [
        { profile: '1g', units: 1, usage: 76, vram: 72, serviceId: 'svc-sd' },
        { profile: '3g', units: 3, usage: 89, vram: 86, serviceId: 'svc-qwen' },
        { profile: '3g', units: 3, usage: 83, vram: 80, serviceId: 'svc-code' },
      ] },
      { mode: 'mig', sm: 82, vram: 80, temp: 75, power: 414, slices: [
        { profile: '2g', units: 2, usage: 80, vram: 77, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 74, vram: 70, serviceId: 'svc-llama' },
        { profile: '3g', units: 3, usage: 86, vram: 83, serviceId: 'svc-qwen' },
      ] },
    ],
  },
  {
    id: 'srv-06', name: '랙B-03', rack: '랙B-03', host: 'gpu-b03',
    health: 'normal', note: '일부 유휴(빈 슬라이스 = 가용)', temp: 49, network: '3.1 Gbps', cpuUtil: 32, memUtil: 41,
    gpus: [
      { mode: 'mig', sm: 38, vram: 34, temp: 53, power: 288, slices: [
        { profile: '2g', units: 2, usage: 46, vram: 42, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
        { profile: '3g', units: 3, usage: 39, vram: 36, ownerUserId: 'u-manager', modelId: 'm4', container: 'cont-mgr-03' },
      ] },
      { mode: 'mig', sm: 22, vram: 18, temp: 48, power: 241, slices: [
        { profile: '1g', units: 1, usage: 29, vram: 26, serviceId: 'svc-vqa' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
        { profile: '1g', units: 1, usage: 0, vram: 0 },
        { profile: '3g', units: 3, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', health: 'inactive', sm: 0, vram: 0, temp: 39, power: 78, slices: [
        { profile: '7g', units: 7, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 31, vram: 27, temp: 50, power: 262, slices: [
        { profile: '3g', units: 3, usage: 41, vram: 38, serviceId: 'svc-code' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
      ] },
    ],
  },
  {
    id: 'srv-07', name: '랙C-01', rack: '랙C-01', host: 'gpu-c01',
    health: 'danger', note: '1장 XID 에러(드라이버) · 점검', temp: 81, network: '5.6 Gbps', cpuUtil: 59, memUtil: 64,
    gpus: [
      { mode: 'mig', health: 'danger', xid: 'XID 79', sm: 0, vram: 0, temp: 88, power: 96, activities: [{ time: '15:02', type: 'error', message: 'XID 79 — GPU 응답 없음(드라이버)' }, { time: '15:03', type: 'health', message: '헬스 danger 전환, 점검 모드' }], slices: [
        { profile: '7g', units: 7, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 67, vram: 63, temp: 66, power: 372, slices: [
        { profile: '3g', units: 3, usage: 68, vram: 64, serviceId: 'svc-qwen' },
        { profile: '2g', units: 2, usage: 55, vram: 51, serviceId: 'svc-doc' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 61, vram: 58, temp: 64, power: 351, slices: [
        { profile: '2g', units: 2, usage: 52, vram: 49, serviceId: 'svc-stt' },
        { profile: '2g', units: 2, usage: 48, vram: 45, serviceId: 'svc-vqa' },
        { profile: '3g', units: 3, usage: 60, vram: 56, serviceId: 'svc-code' },
      ] },
      { mode: 'cluster', sm: 79, vram: 76, temp: 70, power: 542, serviceId: 'svc-code' },
    ],
  },
  {
    id: 'srv-08', name: '랙C-02', rack: '랙C-02', host: 'gpu-c02',
    health: 'normal', note: 'MIG 분할 + 신규 할당 대기', temp: 57, network: '7.4 Gbps', cpuUtil: 51, memUtil: 55,
    gpus: [
      { mode: 'mig', sm: 64, vram: 60, temp: 61, power: 358, slices: [
        { profile: '3g', units: 3, usage: 63, vram: 59, serviceId: 'svc-qwen' },
        { profile: '2g', units: 2, usage: 50, vram: 47, serviceId: 'svc-llama' },
        { profile: '2g', units: 2, usage: 58, vram: 55, ownerUserId: 'u-manager', modelId: 'm1', container: 'cont-mgr-01' },
      ] },
      { mode: 'mig', sm: 57, vram: 54, temp: 60, power: 340, slices: [
        { profile: '2g', units: 2, usage: 49, vram: 46, serviceId: 'svc-doc' },
        { profile: '3g', units: 3, usage: 58, vram: 55, serviceId: 'svc-code' },
        { profile: '2g', units: 2, usage: 47, vram: 44, ownerUserId: 'u-manager', modelId: 'm7', container: 'cont-mgr-02' },
      ] },
      { mode: 'mig', sm: 44, vram: 41, temp: 57, power: 305, slices: [
        { profile: '1g', units: 1, usage: 36, vram: 33, serviceId: 'svc-stt' },
        { profile: '1g', units: 1, usage: 32, vram: 29, serviceId: 'svc-vqa' },
        { profile: '2g', units: 2, usage: 0, vram: 0 },
        { profile: '3g', units: 3, usage: 0, vram: 0 },
      ] },
      { mode: 'mig', sm: 12, vram: 9, temp: 47, power: 198, slices: [
        { profile: '7g', units: 7, usage: 0, vram: 0 },
      ] },
    ],
  },
]

// ── build servers ──────────────────────────────────────────
export const servers: GpuServer[] = CFG.map((cfg) => {
  const gpus = cfg.gpus.map((g, i) => buildGpu(cfg.id, i, g))
  const userIds = new Set<string>()
  const serviceIds = new Set<string>()
  gpus.forEach((g) => {
    if (g.assignedUserId) userIds.add(g.assignedUserId)
    if (g.assignedServiceId) serviceIds.add(g.assignedServiceId)
    g.slices?.forEach((s) => {
      if (s.ownerUserId) userIds.add(s.ownerUserId)
      if (s.containerId) {
        const sid = services.find((sv) => sv.ownerUserId === s.ownerUserId && sv.model === s.modelId)
        if (sid) serviceIds.add(sid.id)
      }
    })
  })
  return {
    id: cfg.id,
    name: cfg.name,
    rack: cfg.rack,
    host: cfg.host,
    temp: cfg.temp,
    network: cfg.network,
    cpuUtil: cfg.cpuUtil,
    memUtil: cfg.memUtil,
    health: cfg.health,
    note: cfg.note,
    hostedUserIds: [...userIds],
    hostedServiceIds: [...serviceIds],
    gpus,
  }
})

export const allGpus: Gpu[] = servers.flatMap((s) => s.gpus)
export const allSlices: MigSlice[] = allGpus.flatMap((g) => g.slices ?? [])

export const serverById = (id: string): GpuServer | undefined =>
  servers.find((s) => s.id === id)
export const gpuById = (id: string): Gpu | undefined =>
  allGpus.find((g) => g.id === id)

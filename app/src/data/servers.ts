import type { Gpu, GpuServer, GpuHealth, MigProfile, MigSlice, ServerHealth } from './types'
import { MIG_PROFILES } from './types'
import { services } from './services'
import { gpuRequests } from './requests'

// 소유자 → 그 사용자의 GPU 신청 id(없으면 첫 신청) — slice.requestId 연결용
const reqByOwner = (ownerUserId?: string): string => {
  const r = gpuRequests.find((g) => g.requesterUserId === ownerUserId) ?? gpuRequests[0]
  return r.id
}

// ── 결정적 PRNG(빌드·렌더 안정 — Math.random 미사용) ──
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260607)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const rint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))

const ABBR: Record<string, string> = {
  'svc-qwen': 'qwen', 'svc-llama': 'llama', 'svc-code': 'code', 'svc-doc': 'doc', 'svc-sd': 'sd', 'svc-stt': 'stt', 'svc-vqa': 'vqa',
}
const contCount: Record<string, number> = {}
const nextContainer = (serviceId: string): string => {
  const a = ABBR[serviceId]
  contCount[a] = (contCount[a] ?? 0) + 1
  return `cont-${a}-${String(contCount[a]).padStart(2, '0')}`
}
const svc = (id: string) => services.find((s) => s.id === id)!

// ── H100 MIG 분할 믹스(현실적) — units 합 ≤7 · gb 합 ≤80 ──
const PATTERNS: MigProfile[][] = [
  ['7g.80gb'], // 미분할
  ['1g.10gb', '1g.10gb', '1g.10gb', '1g.10gb', '1g.10gb', '1g.10gb', '1g.10gb'], // 7분할
  ['2g.20gb', '2g.20gb', '1g.10gb', '1g.10gb', '1g.10gb'], // 5분할
  ['3g.40gb', '2g.20gb', '1g.10gb', '1g.10gb'], // 4분할
  ['4g.40gb', '3g.40gb'], // 2분할(컴퓨트 가득)
  ['1g.20gb', '1g.20gb', '1g.20gb', '1g.20gb'], // 메모리형 4분할
  ['2g.20gb', '2g.20gb', '2g.20gb', '1g.10gb'], // 4분할
  ['3g.40gb', '3g.40gb'], // 2×3g
]

let gpuGlobal = 0

interface GpuSpec {
  mode: 'cluster' | 'mig'
  health?: GpuHealth
  xid?: string
  serviceId?: string // cluster GPU 할당
  pattern?: MigProfile[]
  fill: number // 슬라이스 점유 비율(0~1)
  baseUtil: number // 사용률 기준
  activities?: { time: string; type: string; message: string }[]
}

function buildSlices(gpuId: string, pattern: MigProfile[], fill: number, baseUtil: number): MigSlice[] {
  return pattern.map((profile, i) => {
    const cap = MIG_PROFILES[profile]
    const used = rnd() < fill
    const service = used ? svc(pick(services).id) : undefined
    const usage = used ? Math.max(8, Math.min(99, Math.round(baseUtil + rint(-12, 12)))) : 0
    const health: ServerHealth = !used ? 'inactive' : usage >= 90 ? 'danger' : usage >= 80 ? 'warn' : 'normal'
    return {
      id: `${gpuId}-s${i + 1}`,
      profile,
      units: cap.units,
      gb: cap.gb,
      usage,
      vramUtil: used ? Math.max(6, usage - rint(0, 8)) : 0,
      ownerUserId: service?.ownerUserId,
      modelId: service?.model,
      containerId: service ? nextContainer(service.id) : undefined,
      health,
      requestId: used ? reqByOwner(service?.ownerUserId) : undefined,
    }
  })
}

function buildGpu(serverId: string, idx: number, c: GpuSpec): Gpu {
  gpuGlobal += 1
  const id = `${serverId}-gpu${idx}`
  const slices = c.mode === 'mig' ? buildSlices(id, c.pattern ?? ['7g.80gb'], c.fill, c.baseUtil) : undefined
  const usedSlices = slices?.filter((s) => s.usage > 0) ?? []
  const smUtil = c.xid ? 0 : c.mode === 'cluster' ? c.baseUtil : usedSlices.length ? Math.round(usedSlices.reduce((a, s) => a + s.usage, 0) / usedSlices.length) : 0
  const vramUtil = c.xid ? 0 : c.mode === 'cluster' ? Math.max(0, smUtil - rint(0, 6)) : usedSlices.length ? Math.round(usedSlices.reduce((a, s) => a + s.vramUtil, 0) / usedSlices.length) : 0
  const service = c.serviceId ? svc(c.serviceId) : undefined
  return {
    id,
    name: `H100-${String(gpuGlobal).padStart(2, '0')}`,
    serial: `GPU-${serverId.slice(-2)}${idx}-${1000 + gpuGlobal}`,
    smUtil,
    vramUtil,
    temp: c.xid ? 88 : Math.round(46 + smUtil * 0.34),
    power: c.xid ? 92 : Math.round(160 + smUtil * 5.4),
    health: c.health ?? (smUtil === 0 && c.mode === 'mig' && !usedSlices.length ? 'inactive' : 'normal'),
    allocMode: c.mode,
    assignedUserId: service?.ownerUserId,
    assignedServiceId: c.serviceId,
    interconnect: c.mode === 'cluster' ? 'NVLink' : undefined,
    xid: c.xid,
    slices,
    recentActivities: c.activities,
  }
}

// ── 서버 헬스 분포 + GPU 수(2/4/8) ──
// srv-01~08: events/audit가 참조하는 GPU 보존 위해 4장 고정 · 특정 상태 유지.
const RACK = ['A', 'B', 'C', 'D', 'E', 'F']
const SERVER_N = 30

// 위험 3 (srv-07·16·24) · 경고 다수 · 나머지 정상 — 더 다양하게
const DANGER_SERVERS = new Set([6, 15, 23])
const WARN_SERVERS = new Set([4, 10, 18, 26])
function serverHealth(i: number): ServerHealth {
  if (DANGER_SERVERS.has(i)) return 'danger'
  if (WARN_SERVERS.has(i)) return 'warn'
  const r = rnd()
  if (r < 0.12) return 'warn'
  return 'normal'
}
function gpuCount(i: number): 2 | 4 | 8 {
  if (i < 8) return 4 // srv-01~08 고정
  return pick([2, 4, 4, 4, 8, 8]) as 2 | 4 | 8
}

function buildServer(i: number): GpuServer {
  const id = `srv-${String(i + 1).padStart(2, '0')}`
  const rack = RACK[Math.floor(i / 5) % RACK.length]
  const num = String((i % 5) + 1).padStart(2, '0')
  const name = `랙${rack}-${num}`
  const host = `gpu-${rack.toLowerCase()}${num}`
  const health = serverHealth(i)
  const count = gpuCount(i)

  // 서버 부하 성향 — 더 다양하게(낮음~높음 폭 넓게)
  const loadBase = health === 'warn' ? rint(86, 96) : health === 'danger' ? rint(20, 45) : rint(14, 82)
  const cpuUtil = Math.min(98, health === 'warn' ? rint(85, 95) : rint(22, 80))
  const memUtil = Math.min(98, Math.max(10, cpuUtil - rint(-8, 12)))
  const XIDS = ['XID 79', 'XID 48', 'XID 63']
  const xidCode = XIDS[[6, 15, 23].indexOf(i)] ?? 'XID 79'

  const gpus: Gpu[] = []
  for (let g = 0; g < count; g++) {
    // 클러스터/MIG/유휴/장애 믹스
    let spec: GpuSpec
    if (health === 'danger' && g === 0) {
      spec = { mode: 'mig', health: 'danger', xid: xidCode, pattern: ['7g.80gb'], fill: 0, baseUtil: 0, activities: [{ time: '15:02', type: 'error', message: `${xidCode} — GPU 응답 없음(드라이버)` }, { time: '15:03', type: 'health', message: '헬스 danger 전환, 점검 모드' }] }
    } else if (i === 0) {
      // srv-01 = 4장 클러스터(대형 학습)
      spec = { mode: 'cluster', serviceId: 'svc-llama', fill: 1, baseUtil: rint(88, 95), activities: g === 0 ? [{ time: '14:22', type: 'load', message: 'Llama 3 70B 샤드 로드 완료' }, { time: '13:50', type: 'alloc', message: '클러스터 4장 점유 시작' }] : undefined }
    } else if (i === 5 && g === 2) {
      // srv-06 유휴 GPU
      spec = { mode: 'mig', health: 'inactive', pattern: ['7g.80gb'], fill: 0, baseUtil: 0 }
    } else {
      const cluster = rnd() < 0.18
      if (cluster) {
        spec = { mode: 'cluster', serviceId: pick(services.filter((s) => s.hasApi)).id, fill: 1, baseUtil: Math.min(96, loadBase + rint(-4, 8)) }
      } else {
        const idle = health === 'normal' && rnd() < 0.18
        spec = { mode: 'mig', pattern: pick(PATTERNS), fill: idle ? rint(0, 1) / 2 + 0.15 : health === 'warn' ? 0.95 : 0.72, baseUtil: idle ? rint(8, 24) : loadBase }
      }
    }
    gpus.push(buildGpu(id, g, spec))
  }

  const userIds = new Set<string>()
  const serviceIds = new Set<string>()
  gpus.forEach((gp) => {
    if (gp.assignedUserId) userIds.add(gp.assignedUserId)
    if (gp.assignedServiceId) serviceIds.add(gp.assignedServiceId)
    gp.slices?.forEach((s) => {
      if (s.ownerUserId) userIds.add(s.ownerUserId)
      if (s.ownerUserId && s.modelId) {
        const sv = services.find((x) => x.ownerUserId === s.ownerUserId && x.model === s.modelId)
        if (sv) serviceIds.add(sv.id)
      }
    })
  })

  const avgUtil = Math.round(gpus.reduce((a, gp) => a + gp.smUtil, 0) / gpus.length)
  const note =
    health === 'danger' ? '장애 GPU 포함 · 점검' : health === 'warn' ? '추론 부하 높음 · 응답 지연' : count === 8 ? '고밀도 노드(8 GPU)' : count === 2 ? '소형 노드(2 GPU)' : 'MIG·클러스터 혼재'

  return {
    id, name, rack: name, host,
    temp: Math.round(48 + avgUtil * 0.3),
    network: `${(rint(30, 124) / 10).toFixed(1)} Gbps`,
    cpuUtil, memUtil, health, note,
    hostedUserIds: [...userIds], hostedServiceIds: [...serviceIds],
    gpus,
  }
}

export const servers: GpuServer[] = Array.from({ length: SERVER_N }, (_, i) => buildServer(i))
export const allGpus: Gpu[] = servers.flatMap((s) => s.gpus)
export const allSlices: MigSlice[] = allGpus.flatMap((g) => g.slices ?? [])

export const serverById = (id: string): GpuServer | undefined => servers.find((s) => s.id === id)
export const gpuById = (id: string): Gpu | undefined => allGpus.find((g) => g.id === id)

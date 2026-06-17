import type { Gpu, GpuServer, MigSlice, Service } from '../data/types'
import { services } from '../data/services'
import { gpuRequests } from '../data/requests'
import { events } from '../data/events'

// H100 80GB HBM3 — VRAM 총량(MB). 자원맵 표기 기준.
export const H100_VRAM_MB = 81920
export const MIG_UNITS = 7 // H100 MIG 최대 분할 단위

export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtTemp = (t: number) => `${Math.round(t)}°C` // 공백 없음(Q20)
export const fmtPower = (p: number) => `${Math.round(p)} W` // 공백 있음(Q20)
// VRAM 총량/사용량 — GPU별 실제 용량(vramGb) 기준
export const vramTotalMb = (g: Gpu) => g.vramGb * 1024
export const vramUsedMb = (g: Gpu) => Math.round((g.vramUtil / 100) * g.vramGb * 1024)

// 서버 집계
export const serverAvgUtil = (s: GpuServer) =>
  Math.round(s.gpus.reduce((a, g) => a + g.smUtil, 0) / s.gpus.length)
export const serverAvgVram = (s: GpuServer) =>
  Math.round(s.gpus.reduce((a, g) => a + g.vramUtil, 0) / s.gpus.length)
export const serverActiveGpus = (s: GpuServer) =>
  s.gpus.filter((g) => g.health !== 'inactive' && !g.xid).length

// 슬라이스 → 서비스 매핑. requestId(서비스별 고유 신청) 우선 — 같은 owner+model
// 서비스가 여럿일 때(예: jhs+m5 이미지캣·바이오캣) 역추적 충돌을 피한다.
export function serviceOfSlice(s: MigSlice): Service | undefined {
  if (s.requestId) {
    const name = gpuRequests.find((r) => r.id === s.requestId)?.serviceName
    const byReq = name ? services.find((sv) => sv.name === name) : undefined
    if (byReq) return byReq
  }
  if (!s.ownerUserId || !s.modelId) return undefined
  return services.find((sv) => sv.ownerUserId === s.ownerUserId && sv.model === s.modelId)
}
export const sliceUsed = (s: MigSlice) => s.usage > 0 || !!s.ownerUserId

// GPU에 올라간 서비스 목록(클러스터=assigned, MIG=슬라이스별)
export function gpuServices(g: Gpu): Service[] {
  const ids = new Set<string>()
  if (g.assignedServiceId) ids.add(g.assignedServiceId)
  g.slices?.forEach((s) => {
    const sv = serviceOfSlice(s)
    if (sv) ids.add(sv.id)
  })
  return [...ids].map((id) => services.find((s) => s.id === id)!).filter(Boolean)
}

// 서버/GPU 관련 이벤트(최신순)
export const serverEvents = (serverId: string) =>
  events.filter((e) => e.serverId === serverId)
export const gpuEvents = (gpuId: string) => events.filter((e) => e.gpuId === gpuId)

// 결정적 추이 시리즈(렌더마다 흔들리지 않게 — Math.random 미사용)
export function trend(base: number, n = 24, amp = 12, seed = 1): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const wob =
      Math.sin((i + seed) * 0.55) * amp * 0.5 +
      Math.sin((i + seed) * 1.7) * amp * 0.28 +
      (((i * 9301 + seed * 49297) % 233) / 233 - 0.5) * amp * 0.5
    out.push(Math.max(0, Math.min(100, Math.round(base + wob))))
  }
  return out
}

// 24시간 시각 라벨(차트 x축용, 정적)
export const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

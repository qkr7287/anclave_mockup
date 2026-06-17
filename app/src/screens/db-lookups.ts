// 표시명·할당 조회 — SoT=DB(라이브 /api/*). miss/백엔드 다운 시 seed 폴백, 그래도 없으면 id 노출.
// usePolling.ts(data/**)는 잠금이라 래퍼를 여기(screens) 모은다. usePolling 자체는 import 사용.
import { useMemo } from 'react'
import { usePolling } from '../data/hooks/usePolling'
import { userById, serverById, gpuById, modelById } from '../data'

// ── 사용자: id → 이름/부서 ──
interface UserRow { id: string; name: string; department?: string }
export function useUserLookup() {
  const { data } = usePolling<UserRow[]>('/api/users')
  return useMemo(() => {
    const m = new Map((data ?? []).map((u) => [u.id, u]))
    return {
      name: (id?: string): string | undefined =>
        id ? (m.get(id)?.name ?? userById(id)?.name ?? id) : undefined,
      dept: (id?: string): string | undefined =>
        id ? (m.get(id)?.department ?? userById(id)?.department) : undefined,
    }
  }, [data])
}

// ── 모델: id → 이름 ──
interface ModelRow { id: string; name: string }
export function useModelLookup() {
  const { data } = usePolling<ModelRow[]>('/api/models')
  return useMemo(() => {
    const m = new Map((data ?? []).map((x) => [x.id, x.name]))
    return (id?: string): string | undefined =>
      id ? (m.get(id) ?? modelById(id)?.name ?? id) : undefined
  }, [data])
}

// ── 서버/GPU/슬라이스 할당 식별 (정적 seed 대신 라이브) ──
export interface AllocServer { host?: string; network?: string }
export interface AllocGpu {
  model?: string; arch?: string; vramGb?: number; serial?: string
  interconnect?: string; allocMode?: string; migCapable?: boolean
  slices?: { id: string; gb?: number; requestId?: string }[]
}
interface SrvGpuRow extends AllocGpu { id: string }
interface SrvRow { id: string; host?: string; network?: string; gpus?: SrvGpuRow[] }

export function useServerLookup() {
  const { data } = usePolling<SrvRow[]>('/api/servers')
  return useMemo(() => {
    const live = data ?? null
    return {
      server: (id?: string): AllocServer | undefined => {
        if (!id) return undefined
        const s = live?.find((x) => x.id === id)
        if (s) return { host: s.host, network: s.network }
        const seed = serverById(id)
        return seed ? { host: seed.host, network: seed.network } : undefined
      },
      gpu: (serverId?: string, gpuId?: string): AllocGpu | undefined => {
        if (!gpuId) return undefined
        const g = live?.find((s) => s.id === serverId)?.gpus?.find((x) => x.id === gpuId)
        if (g) return g
        const seed = gpuById(gpuId)
        return seed
          ? { model: seed.model, arch: seed.arch, vramGb: seed.vramGb, serial: seed.serial, interconnect: seed.interconnect, allocMode: seed.allocMode, migCapable: seed.migCapable, slices: seed.slices }
          : undefined
      },
    }
  }, [data])
}

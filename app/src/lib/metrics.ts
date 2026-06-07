import type { Gpu, GpuServer, MigSlice } from '../data/types'

export const avg = (nums: number[]): number =>
  nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length

// 서버 종합 사용률 = GPU SM 평균(헥사곤 밴드색·KPI용).
export const serverUsage = (s: GpuServer): number =>
  Math.round(avg(s.gpus.map((g) => g.smUtil)))

export const gpuUsage = (g: Gpu): number => g.smUtil

// MIG 슬라이스 프로파일별 단위(H100 = 7 units).
export const PROFILE_UNITS: Record<string, number> = {
  '1g': 1,
  '2g': 2,
  '3g': 3,
  '7g': 7,
}

export const isSliceFree = (s: MigSlice): boolean => !s.containerId

// 전체/서버별 슬라이스 현황 — 프로파일별 (사용/가용) 집계.
export interface SliceSummary {
  profile: string
  used: number
  free: number
}
export function summarizeSlices(slices: MigSlice[]): SliceSummary[] {
  const order = ['1g', '2g', '3g', '7g']
  return order.map((profile) => {
    const of = slices.filter((s) => s.profile === profile)
    return {
      profile,
      used: of.filter((s) => !isSliceFree(s)).length,
      free: of.filter((s) => isSliceFree(s)).length,
    }
  })
}

// 결정적 시계열(렌더마다 흔들리지 않게) — seed 기반 사인+노이즈.
export function series(seed: number, n: number, min: number, max: number): number[] {
  const out: number[] = []
  let x = seed % 97
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    const noise = (x / 0x7fffffff) * 0.5
    const wave = (Math.sin(i / 1.7 + seed) + 1) / 2
    const v = min + (max - min) * (wave * 0.6 + noise * 0.4)
    out.push(Math.round(v))
  }
  return out
}

// 포맷터(Q20)
export const fmtNum = (n: number): string => n.toLocaleString('en-US')
export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
export const fmtPct = (n: number): string => `${Math.round(n)}%`

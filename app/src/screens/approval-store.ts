import { gpuRequests } from '../data'
import type { GpuRequest } from '../data/types'

// 4.10 승인 처리 목업 store — 시드(src/data)는 읽기 전용이라 세션 사본을 화면 계층에서 공유.
// 리스트(approvals.tsx)와 심사 상세(approval-detail.tsx)가 같은 처리 결과를 본다.
// 새로고침 시 시드 상태로 복원(목업 의도).
let sessionRequests: GpuRequest[] = gpuRequests.map((r) => ({ ...r }))

export function getGpuRequests(): GpuRequest[] {
  return sessionRequests
}

export function getGpuRequestById(id: string): GpuRequest | undefined {
  return sessionRequests.find((r) => r.id === id)
}

export function patchGpuRequest(id: string, patch: Partial<GpuRequest>): GpuRequest | undefined {
  sessionRequests = sessionRequests.map((r) => (r.id === id ? { ...r, ...patch } : r))
  return getGpuRequestById(id)
}

// 처리일시 포맷 — 시드와 동일한 'YYYY-MM-DD HH:mm'
export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

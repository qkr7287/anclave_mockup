import type {
  ApiKeyUsage,
  ApiRequest,
  GpuChangeRequest,
  GpuRequest,
  ModelRequest,
  PublishRequest,
} from './types'
import seed from './seed.json'

// 시드 정본(seed.json)에서 로드 — GPU 신청 12 · API 6 · 게시 4 · 변경 3.
export const gpuRequests: GpuRequest[] = seed.gpuRequests as unknown as GpuRequest[]
export const modelRequests: ModelRequest[] = seed.modelRequests as unknown as ModelRequest[]
export const apiRequests: ApiRequest[] = seed.apiRequests as unknown as ApiRequest[]
export const publishRequests: PublishRequest[] = seed.publishRequests as unknown as PublishRequest[]
export const gpuChangeRequests: GpuChangeRequest[] = seed.gpuChangeRequests as unknown as GpuChangeRequest[]
export const apiKeyUsages: ApiKeyUsage[] = seed.apiKeyUsages as unknown as ApiKeyUsage[]

export const allRequestCount =
  gpuRequests.length +
  apiRequests.length +
  publishRequests.length +
  gpuChangeRequests.length

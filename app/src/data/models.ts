import type { Model } from './types'
import seed from './seed.json'

// 시드 정본(seed.json)에서 로드 — 배포 소형 모델(상위) + 대형 카탈로그(H100 필요·미배포).
export const models: Model[] = seed.models as unknown as Model[]

export const modelById = (id: string): Model | undefined =>
  models.find((m) => m.id === id)

import type { Service } from './types'
import seed from './seed.json'

// 시드 정본(seed.json)에서 로드 — 배포된 서비스 7(함대 적합 모델로 재배치).
export const services: Service[] = seed.services as unknown as Service[]

// 올린 사용자(deployer) = 소유자(시드). 4.3 "올라간 서비스" 패널에서 누가·사용량 표시.
services.forEach((s) => { s.deployerUserId = s.ownerUserId })

export const serviceById = (id: string): Service | undefined =>
  services.find((s) => s.id === id)

import type { User } from './types'
import seed from './seed.json'

// 시드 정본(seed.json)에서 로드 — users 10.
export const users: User[] = seed.users as unknown as User[]

// 데모 로그인 계정 3종 (공통 비번 가정 · 더미)
export const demoAccounts = ['u-admin', 'u-manager', 'u-user'] as const

export const userById = (id: string): User | undefined =>
  users.find((u) => u.id === id)

export const hostingUserIds = users.filter((u) => u.hasHosting).map((u) => u.id)

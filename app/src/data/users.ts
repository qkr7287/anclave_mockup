import type { User } from './types'

// §5 Canonical 시드 정본 (users 10) — id·name·role·hosting·initialRoute 그대로.
export const users: User[] = [
  { id: 'u-admin', username: 'admin', name: 'admin', role: 'admin', email: 'admin@anclave.local', hasHosting: true, initialRoute: '/resource-map' },
  { id: 'u-manager', username: 'user1', name: 'user1', role: 'user', email: 'user1@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
  { id: 'u-user', username: 'user2', name: 'user2', role: 'user', email: 'user2@anclave.local', hasHosting: false, initialRoute: '/marketplace' },
  { id: 'u-kim', username: 'kim', name: '김민준', role: 'user', email: 'kim@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
  { id: 'u-lee', username: 'lee', name: '이서연', role: 'user', email: 'lee@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
  { id: 'u-park', username: 'park', name: '박지훈', role: 'user', email: 'park@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
  { id: 'u-choi', username: 'choi', name: '최수아', role: 'user', email: 'choi@anclave.local', hasHosting: false, initialRoute: '/marketplace' },
  { id: 'u-jung', username: 'jung', name: '정도윤', role: 'user', email: 'jung@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
  { id: 'u-han', username: 'han', name: '한예린', role: 'user', email: 'han@anclave.local', hasHosting: false, initialRoute: '/marketplace' },
  { id: 'u-yoon', username: 'yoon', name: '윤서진', role: 'user', email: 'yoon@anclave.local', hasHosting: true, initialRoute: '/dashboard' },
]

// 데모 로그인 계정 3종 (공통 비번 가정 · 더미)
export const demoAccounts = ['u-admin', 'u-manager', 'u-user'] as const

export const userById = (id: string): User | undefined =>
  users.find((u) => u.id === id)

export const hostingUserIds = users.filter((u) => u.hasHosting).map((u) => u.id)

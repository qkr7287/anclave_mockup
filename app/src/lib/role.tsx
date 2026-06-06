import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { userById, users } from '../data/users'
import type { User } from '../data/types'

// 권한은 실질 2종(A / B=C). 화면은 호스팅 유무로 B/C가 갈린다.
//  A = admin · B = user + 호스팅 보유 · C = user + 호스팅 전
export type Access = 'A' | 'B' | 'C'

export function accessOf(user: User): Access {
  if (user.role === 'admin') return 'A'
  return user.hasHosting ? 'B' : 'C'
}

interface RoleCtx {
  user: User
  access: Access
  isAdmin: boolean
  setUserId: (id: string) => void
}

const Ctx = createContext<RoleCtx | null>(null)

const KEY = 'anclave-user'

export function RoleProvider({ children }: { children: ReactNode }) {
  // 기본 진입 = admin(A). 헤더에서 manager(B)/user(C)로 전환해 여정 시연.
  // 새로고침/직접 URL 진입에도 역할 유지(§9.2 접근 가드가 reload에도 동작).
  const [userId, setUserIdState] = useState<string>(
    () => localStorage.getItem(KEY) ?? 'u-admin',
  )
  const setUserId = (id: string) => {
    localStorage.setItem(KEY, id)
    setUserIdState(id)
  }
  const user = userById(userId) ?? users[0]

  const value = useMemo<RoleCtx>(
    () => ({
      user,
      access: accessOf(user),
      isAdmin: user.role === 'admin',
      setUserId,
    }),
    [user],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRole(): RoleCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRole must be used within RoleProvider')
  return v
}

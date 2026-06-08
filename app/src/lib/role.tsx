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
  authed: boolean
  setUserId: (id: string) => void
  login: (id: string) => void
  logout: () => void
}

const Ctx = createContext<RoleCtx | null>(null)

const KEY = 'anclave-user'
const AUTH_KEY = 'anclave-authed'

export function RoleProvider({ children }: { children: ReactNode }) {
  // 로그인 후 역할 유지(새로고침·직접 URL에도). authed=false면 /login으로 게이트(App.tsx).
  const [userId, setUserIdState] = useState<string>(
    () => localStorage.getItem(KEY) ?? 'u-admin',
  )
  const [authed, setAuthed] = useState<boolean>(
    () => localStorage.getItem(AUTH_KEY) === '1',
  )
  const setUserId = (id: string) => {
    localStorage.setItem(KEY, id)
    setUserIdState(id)
  }
  const login = (id: string) => {
    localStorage.setItem(KEY, id)
    localStorage.setItem(AUTH_KEY, '1')
    setUserIdState(id)
    setAuthed(true)
  }
  const logout = () => {
    localStorage.removeItem(AUTH_KEY)
    setAuthed(false)
  }
  const user = userById(userId) ?? users[0]

  const value = useMemo<RoleCtx>(
    () => ({
      user,
      access: accessOf(user),
      isAdmin: user.role === 'admin',
      authed,
      setUserId,
      login,
      logout,
    }),
    [user, authed],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRole(): RoleCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRole must be used within RoleProvider')
  return v
}

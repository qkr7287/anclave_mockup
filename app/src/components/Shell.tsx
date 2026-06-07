import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { useRole } from '../lib/role'

// 공통 셸(Figma) — 좌: 사이드바(로고+메뉴, 전체 높이) / 우: 헤더 + 메인. GNB 없음.
export function Shell() {
  const { access } = useRole()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-full">
      <Sidebar access={access} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 min-w-0 overflow-auto" style={{ padding: '18px 22px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

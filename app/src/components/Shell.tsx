import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { useRole } from '../lib/role'

// 공통 셸 — 헤더(위) + 사이드바 + 메인(Outlet). GNB 없음.
export function Shell() {
  const { access } = useRole()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <Header onToggleSidebar={() => setCollapsed((v) => !v)} />
      <div className="flex flex-1 min-h-0">
        <Sidebar access={access} collapsed={collapsed} />
        <main className="flex-1 min-w-0 overflow-auto" style={{ padding: '18px 22px 76px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

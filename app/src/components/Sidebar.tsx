import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Squares2X2Icon,
  ServerStackIcon,
  CubeIcon,
  ShoppingBagIcon,
  BellAlertIcon,
  MegaphoneIcon,
  LockClosedIcon,
  Cog6ToothIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronDoubleLeftIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { buildSidebar, sidebarHighlightKey } from '../lib/routes'
import type { Access } from '../lib/role'
import logoUrl from '../assets/anclave-logo.svg'

type IconType = ComponentType<SVGProps<SVGSVGElement>>
// 그룹(1depth)별 아이콘 — Figma 사이드바 매칭
const GROUP_ICON: Record<number, IconType> = {
  1: Squares2X2Icon,
  2: ServerStackIcon,
  3: CubeIcon,
  4: ShoppingBagIcon,
  5: BellAlertIcon,
  6: MegaphoneIcon,
  7: LockClosedIcon,
  8: Cog6ToothIcon,
}

interface SidebarProps {
  access: Access
  collapsed: boolean
  onToggle: () => void
}

// Q2 아코디언 사이드바(Figma node 0-1) — OVERVIEW/SETTING 섹션, 1depth(아이콘+caret)·2depth(accent+가이드라인).
// 기능 유지: 아코디언·역할필터·GNB 없음. 비주얼은 Figma 그대로.
export function Sidebar({ access, collapsed, onToggle }: SidebarProps) {
  const groups = buildSidebar(access)
  const { pathname } = useLocation()
  const activeKey = sidebarHighlightKey(pathname)
  const activeGroupId = groups.find((g) => g.items.some((it) => it.key === activeKey))?.group.id

  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})
  const isOpen = (gid: number) => openMap[gid] ?? gid === activeGroupId
  const toggle = (gid: number) => setOpenMap((m) => ({ ...m, [gid]: !isOpen(gid) }))

  const overview = groups.filter((g) => g.group.id <= 7)
  const setting = groups.filter((g) => g.group.id === 8)

  const renderGroup = (g: (typeof groups)[number]) => {
    const Icon = GROUP_ICON[g.group.id] ?? CubeIcon
    const groupActive = g.items.some((it) => it.key === activeKey)
    if (collapsed) {
      return (
        <NavLink key={g.group.id} to={g.items[0]?.path ?? '#'} title={g.group.label}
          className="flex items-center justify-center rounded-md"
          style={{ height: 40, color: groupActive ? 'var(--c-text)' : 'var(--c-muted)', background: groupActive ? 'var(--c-active)' : 'transparent' }}>
          <Icon width={20} height={20} />
        </NavLink>
      )
    }
    const open = isOpen(g.group.id)
    return (
      <div key={g.group.id}>
        <button type="button" onClick={() => toggle(g.group.id)} aria-expanded={open}
          className="flex w-full items-center justify-between rounded-md transition-colors"
          style={{ padding: '10px 12px', background: groupActive ? 'var(--c-active)' : 'transparent' }}>
          <span className="flex items-center min-w-0" style={{ gap: 8 }}>
            <Icon width={18} height={18} className="shrink-0" style={{ color: groupActive ? 'var(--c-text)' : 'var(--c-muted)' }} />
            <span className="truncate" style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.4px', color: groupActive ? 'var(--c-text)' : 'var(--c-muted)' }}>{g.group.label}</span>
          </span>
          {open ? <ChevronUpIcon width={16} height={16} style={{ color: 'var(--c-muted)' }} className="shrink-0" />
            : <ChevronDownIcon width={16} height={16} style={{ color: 'var(--c-muted)' }} className="shrink-0" />}
        </button>
        {open && (
          <div className="flex flex-col" style={{ paddingLeft: 22, marginTop: 2 }}>
            {g.items.map((it) => {
              const active = it.key === activeKey
              return (
                <NavLink key={it.key} to={it.path} end={it.path === '/resource-map'}
                  className="flex items-center" style={{ gap: 10, paddingLeft: 24, padding: '8px 0 8px 24px', borderLeft: active ? '2px solid var(--c-accent)' : '1px solid var(--c-border)', marginLeft: active ? -0.5 : 0 }}>
                  <span className="truncate" style={{ fontSize: 14, fontWeight: active ? 600 : 400, letterSpacing: '-0.4px', color: active ? 'var(--c-accent)' : 'var(--c-muted)' }}>{it.title}</span>
                </NavLink>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="shrink-0 h-full overflow-y-auto flex flex-col relative" aria-label="주 메뉴"
      style={{ width: collapsed ? 64 : 270, background: 'var(--c-card2)', padding: '24px 0', gap: 36, transition: 'width .15s' }}>
      {/* 로고 */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '0 16px' }}>
        {!collapsed && (
          <NavLink to="/" aria-label="홈으로" className="shrink-0" title="홈으로">
            <img src={logoUrl} alt="ANCLAVE" style={{ height: 24, display: 'block' }} />
          </NavLink>
        )}
        <button type="button" onClick={onToggle} aria-label="사이드바 접기/펴기"
          className="flex items-center justify-center text-muted hover:text-text" style={{ width: 28, height: 28 }}>
          <ChevronDoubleLeftIcon width={18} height={18} style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {/* OVERVIEW */}
      <div className="flex flex-col" style={{ padding: '0 16px', gap: collapsed ? 4 : 8 }}>
        {!collapsed && <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--c-muted)' }}>OVERVIEW</span>}
        {overview.map(renderGroup)}
      </div>

      <div style={{ borderTop: '1px solid var(--c-line)', margin: '0 16px' }} />

      {/* SETTING */}
      <div className="flex flex-col" style={{ padding: '0 16px', gap: collapsed ? 4 : 8 }}>
        {!collapsed && <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--c-muted)' }}>SETTING</span>}
        {setting.map(renderGroup)}
      </div>
    </nav>
  )
}

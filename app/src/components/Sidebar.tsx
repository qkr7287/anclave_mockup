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
  ChevronDownIcon,
  ChevronDoubleLeftIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { buildSidebar, sidebarHighlightKey } from '../lib/routes'
import { servers } from '../data'
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

  // 전체 서버 현황 하위: 단일 서버 현황 / GPU 상세 현황 (현재 드릴다운 위치 또는 첫 서버·GPU로 링크)
  const segs = pathname.split('/')
  const inRm = segs[1] === 'resource-map'
  const curServerId = inRm ? segs[2] : undefined
  const curGpuId = inRm ? segs[3] : undefined
  const drillServer = (curServerId && servers.find((s) => s.id === curServerId)) || servers[0]
  const drillSid = drillServer?.id
  const drillGid =
    curGpuId && drillServer?.gpus.some((g) => g.id === curGpuId) ? curGpuId : drillServer?.gpus[0]?.id
  const resourceSubs =
    drillSid && drillGid
      ? [
          { key: 'rm-server', title: '단일 서버 현황', path: `/resource-map/${drillSid}`, active: !!curServerId && !curGpuId },
          { key: 'rm-gpu', title: 'GPU 상세 현황', path: `/resource-map/${drillSid}/${drillGid}`, active: !!curGpuId },
        ]
      : []

  // 사이드바 펼침은 전부 수동 — 자동 펼침/접힘 없음. 사용자가 토글한 그룹만 열림.
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})
  const isOpen = (gid: number) => openMap[gid] ?? false
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
          <ChevronDownIcon width={16} height={16} className="shrink-0 acc-caret"
            style={{ color: 'var(--c-muted)', transition: 'transform .26s cubic-bezier(0.4,0,0.2,1)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>
        {/* 아코디언 펼침 — grid-rows 0fr↔1fr 로 높이 트랜지션(스르륵) */}
        <div className="acc-panel" style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows .26s cubic-bezier(0.4,0,0.2,1)' }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div className="flex flex-col" style={{ paddingLeft: 22, paddingTop: 2 }}>
              {g.items.map((it) => {
                const active = it.key === 'resource-map' ? pathname === '/resource-map' : it.key === activeKey
                return (
                  <div key={it.key}>
                    <NavLink to={it.path} end={it.path === '/resource-map'} tabIndex={open ? 0 : -1}
                      className="flex items-center" style={{ gap: 10, paddingLeft: 24, padding: '8px 0 8px 24px', borderLeft: active ? '2px solid var(--c-accent)' : '1px solid var(--c-border)', marginLeft: active ? -0.5 : 0 }}>
                      <span className="truncate" style={{ fontSize: 14, fontWeight: active ? 600 : 400, letterSpacing: '-0.4px', color: active ? 'var(--c-accent)' : 'var(--c-muted)' }}>{it.title}</span>
                    </NavLink>
                    {it.key === 'resource-map' && resourceSubs.map((sub) => (
                      <NavLink key={sub.key} to={sub.path} tabIndex={open ? 0 : -1}
                        className="flex items-center" style={{ gap: 10, padding: '7px 0 7px 40px', borderLeft: sub.active ? '2px solid var(--c-accent)' : '1px solid var(--c-border)', marginLeft: sub.active ? -0.5 : 0 }}>
                        <span className="truncate" style={{ fontSize: 14, fontWeight: sub.active ? 600 : 400, letterSpacing: '-0.4px', color: sub.active ? 'var(--c-accent)' : 'var(--c-muted)' }}>{sub.title}</span>
                      </NavLink>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <nav className="shrink-0 h-full overflow-y-auto flex flex-col relative no-select" aria-label="주 메뉴"
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

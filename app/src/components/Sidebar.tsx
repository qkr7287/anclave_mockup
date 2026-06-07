import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  BellIcon,
  BoltIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  CpuChipIcon,
  CubeIcon,
  DocumentPlusIcon,
  ExclamationTriangleIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  LockClosedIcon,
  MegaphoneIcon,
  PlusCircleIcon,
  RectangleStackIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  UsersIcon,
} from '@heroicons/react/24/solid'
import type { ComponentType, SVGProps } from 'react'
import { buildSidebar, sidebarHighlightKey } from '../lib/routes'
import type { Access } from '../lib/role'

type IconType = ComponentType<SVGProps<SVGSVGElement>>
const ICONS: Record<string, IconType> = {
  cpu: CpuChipIcon,
  home: HomeIcon,
  clipboard: ClipboardDocumentListIcon,
  chart: ChartBarIcon,
  'doc-plus': DocumentPlusIcon,
  megaphone: MegaphoneIcon,
  'check-badge': CheckBadgeIcon,
  arrows: ArrowsRightLeftIcon,
  cube: CubeIcon,
  'plus-circle': PlusCircleIcon,
  stack: RectangleStackIcon,
  server: ServerStackIcon,
  bag: ShoppingBagIcon,
  key: KeyIcon,
  bolt: BoltIcon,
  alert: ExclamationTriangleIcon,
  bell: BellIcon,
  chat: ChatBubbleLeftRightIcon,
  shield: ShieldCheckIcon,
  lock: LockClosedIcon,
  adjust: AdjustmentsHorizontalIcon,
  users: UsersIcon,
  link: LinkIcon,
}

interface SidebarProps {
  access: Access
  collapsed: boolean
}

const itemStyle = (isActive: boolean, collapsed: boolean, indented: boolean) => ({
  gap: 10,
  padding: collapsed ? '8px' : indented ? '8px 11px 8px 14px' : '8px 11px',
  justifyContent: collapsed ? 'center' : 'flex-start',
  fontSize: 14,
  color: isActive ? 'var(--c-text)' : 'var(--c-muted)',
  background: isActive ? 'var(--accent-soft)' : 'transparent',
})

// Q2 아코디언 사이드바 — IA 8 대분류를 접기/펴기 그룹으로. 활성 배경칠. 상단 가로 GNB 없음.
// 펼침 모드 = 아코디언(현재 라우트 그룹만 기본 펼침), 접힘 모드 = 아이콘 플랫.
export function Sidebar({ access, collapsed }: SidebarProps) {
  const groups = buildSidebar(access)
  const { pathname } = useLocation()
  const activeKey = sidebarHighlightKey(pathname)

  // 현재 라우트가 속한 그룹 id(기본 펼침 대상)
  const activeGroupId = groups.find((g) =>
    g.items.some((it) => it.key === activeKey),
  )?.group.id

  // 사용자가 토글한 그룹 펼침 상태(미설정이면 활성 그룹만 펼침)
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})
  const isOpen = (gid: number) =>
    openMap[gid] ?? gid === activeGroupId
  const toggle = (gid: number) =>
    setOpenMap((m) => ({ ...m, [gid]: !isOpen(gid) }))

  return (
    <nav
      className="shrink-0 h-full overflow-y-auto border-r border-line bg-soft"
      style={{ width: collapsed ? 56 : 200, padding: collapsed ? '14px 8px' : '14px 10px', transition: 'width .15s' }}
      aria-label="주 메뉴"
    >
      {groups.map((g) => {
        const groupActive = g.items.some((it) => it.key === activeKey)
        // 접힘(아이콘) 모드: 그룹 헤더 없이 아이콘만 평면 나열
        if (collapsed) {
          return (
            <div key={g.group.id} className="flex flex-col mb-2" style={{ gap: 2 }}>
              {g.items.map((it) => (
                <MenuItem key={it.key} it={it} active={it.key === activeKey} collapsed indented={false} />
              ))}
            </div>
          )
        }
        const open = isOpen(g.group.id)
        return (
          <div key={g.group.id} className="mb-1">
            <button
              type="button"
              onClick={() => toggle(g.group.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between rounded-lg hover:bg-[var(--accent-soft)] transition-colors"
              style={{
                padding: '8px 11px',
                color: groupActive ? 'var(--c-text)' : 'var(--c-muted)',
              }}
            >
              <span className="font-bold uppercase tracking-wide truncate" style={{ fontSize: 11, letterSpacing: '.5px' }}>
                {g.group.id}. {g.group.label}
              </span>
              <ChevronRightIcon
                width={14}
                height={14}
                className="shrink-0 transition-transform"
                style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--c-muted)' }}
              />
            </button>
            {open && (
              <div className="flex flex-col mt-0.5 mb-1" style={{ gap: 2 }}>
                {g.items.map((it) => (
                  <MenuItem key={it.key} it={it} active={it.key === activeKey} collapsed={false} indented />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function MenuItem({
  it,
  active,
  collapsed,
  indented,
}: {
  it: ReturnType<typeof buildSidebar>[number]['items'][number]
  active: boolean
  collapsed: boolean
  indented: boolean
}) {
  const Icon = it.icon ? ICONS[it.icon] : CubeIcon
  return (
    <NavLink
      to={it.path}
      title={it.title}
      end={it.path === '/resource-map'}
      className="flex items-center rounded-lg transition-colors"
      style={itemStyle(active, collapsed, indented)}
    >
      <Icon
        width={18}
        height={18}
        className="shrink-0"
        style={{ color: active ? 'var(--c-accent)' : 'var(--c-muted)' }}
      />
      {!collapsed && <span className="truncate">{it.title}</span>}
    </NavLink>
  )
}

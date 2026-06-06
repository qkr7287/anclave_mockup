import { NavLink } from 'react-router-dom'
import {
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  BellIcon,
  BoltIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
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
import { buildSidebar } from '../lib/routes'
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

// Q2 플랫 사이드바 — IA 8 대분류(그룹 라벨)·역할 노출 필터·활성 배경칠. 상단 가로 GNB 없음.
export function Sidebar({ access, collapsed }: SidebarProps) {
  const groups = buildSidebar(access)
  return (
    <nav
      className="shrink-0 h-full overflow-y-auto border-r border-line bg-soft"
      style={{ width: collapsed ? 56 : 200, padding: collapsed ? '14px 8px' : '14px 10px', transition: 'width .15s' }}
      aria-label="주 메뉴"
    >
      {groups.map((g) => (
        <div key={g.group.id} className="mb-3">
          {!collapsed && (
            <div
              className="text-muted font-bold uppercase tracking-wide px-2 mb-1"
              style={{ fontSize: 11, letterSpacing: '.5px' }}
            >
              {g.group.id}. {g.group.label}
            </div>
          )}
          <div className="flex flex-col" style={{ gap: 2 }}>
            {g.items.map((it) => {
              const Icon = it.icon ? ICONS[it.icon] : CubeIcon
              return (
                <NavLink
                  key={it.key}
                  to={it.path}
                  title={it.title}
                  end={it.path === '/resource-map'}
                  className="flex items-center rounded-lg transition-colors"
                  style={({ isActive }) => ({
                    gap: 10,
                    padding: collapsed ? '8px' : '8px 11px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    fontSize: 14,
                    color: isActive ? 'var(--c-text)' : 'var(--c-muted)',
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        width={18}
                        height={18}
                        className="shrink-0"
                        style={{ color: isActive ? 'var(--c-accent)' : 'var(--c-muted)' }}
                      />
                      {!collapsed && <span className="truncate">{it.title}</span>}
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

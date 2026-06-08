import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BellIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  PlayIcon,
} from '@heroicons/react/24/solid'
import { useTheme } from '../lib/theme'
import { accessOf, useRole } from '../lib/role'
import { userById } from '../data/users'
import { notifications } from '../data/events'
import { IA_GROUPS, ROUTES } from '../lib/routes'
import { serverById } from '../data'

const DEMO_IDS = ['u-admin', 'u-manager', 'u-user']
const ACCESS_LABEL: Record<string, string> = {
  A: '최종 관리자',
  B: '실무 관리자',
  C: '사용자',
}

interface Crumb { label: string; to?: string }

// 현재 경로 → 브레드크럼(클릭 이동, 현재는 비활성). 자원맵은 전체 서버 > 서버 > GPU 드릴다운.
function useCrumbs(): Crumb[] {
  const { pathname } = useLocation()
  if (pathname.startsWith('/resource-map')) {
    const [, , serverId, gpuId] = pathname.split('/')
    const crumbs: Crumb[] = [{ label: '전체 서버', to: '/resource-map' }]
    if (serverId) {
      const s = serverById(serverId)
      crumbs.push({ label: s?.name ?? serverId, to: `/resource-map/${serverId}` })
      if (gpuId) {
        const g = s?.gpus.find((x) => x.id === gpuId)
        crumbs.push({ label: g?.name ?? gpuId, to: `/resource-map/${serverId}/${gpuId}` })
      }
    }
    crumbs[crumbs.length - 1] = { label: crumbs[crumbs.length - 1].label } // 현재 = 비활성
    return crumbs
  }
  const route = [...ROUTES].filter((r) => r.path !== '/' && pathname.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0]
  const group = route ? IA_GROUPS.find((g) => g.id === route.group) : undefined
  return [{ label: group?.label ?? '대시보드' }, { label: route?.title ?? '전체 서버 모니터링' }]
}

// Q2/Q18 헤더(Figma) — 좌: 브레드크럼 / 우: 검색·알림·테마·프로필. GNB 없음.
export function Header() {
  const { theme, toggle } = useTheme()
  const { user, access, setUserId, logout } = useRole()
  const navigate = useNavigate()
  const [bellOpen, setBellOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length
  const crumbs = useCrumbs()

  const close = () => {
    setBellOpen(false)
    setRoleOpen(false)
  }

  return (
    <header
      className="flex items-center justify-between shrink-0 relative z-20"
      style={{ height: 64, padding: '0 16px', gap: 14, background: 'var(--c-card2)' }}
    >
      {/* 좌: 브레드크럼(헤더 통합·단계 클릭 이동, 현재=비활성) */}
      <nav className="flex items-center min-w-0" style={{ gap: 8 }} aria-label="브레드크럼">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={i} className="flex items-center min-w-0" style={{ gap: 8 }}>
              {i > 0 && <PlayIcon width={11} height={11} style={{ color: 'var(--c-muted)' }} className="shrink-0" />}
              {c.to && !last ? (
                <button type="button" onClick={() => navigate(c.to!)} className="truncate hover:underline" style={{ fontSize: 16, fontWeight: 500, color: 'var(--c-muted)' }}>{c.label}</button>
              ) : (
                <span className="truncate" style={{ fontSize: 16, fontWeight: 500, color: last ? 'var(--c-text)' : 'var(--c-muted)' }}>{c.label}</span>
              )}
            </span>
          )
        })}
      </nav>

      {/* 우: 검색 · 알림 · 테마 · 프로필 */}
      <div className="flex items-center" style={{ gap: 20 }}>
        <div
          className="flex items-center gap-2 rounded-md min-w-0"
          style={{ width: 240, height: 40, padding: '0 12px', background: 'var(--c-soft)', border: '1px solid var(--c-border)' }}
        >
          <MagnifyingGlassIcon width={16} height={16} className="shrink-0" style={{ color: 'var(--c-muted)', opacity: 0.5 }} />
          <input
            className="bg-transparent outline-none w-full min-w-0 text-text"
            style={{ fontSize: 14 }}
            placeholder="서비스 · 모델 검색"
            aria-label="검색"
          />
        </div>

        {/* 알림 벨 */}
        <button
          type="button"
          aria-label="알림"
          onClick={() => { setRoleOpen(false); setBellOpen((v) => !v) }}
          className="flex items-center justify-center text-muted hover:text-text relative"
          style={{ width: 24, height: 24 }}
        >
          <BellIcon width={20} height={20} />
          {unread > 0 && (
            <span className="absolute rounded-full" style={{ top: 0, right: 1, width: 7, height: 7, background: 'var(--c-danger)', border: '1.5px solid var(--c-card2)' }} />
          )}
        </button>

        {/* 테마 토글 */}
        <button
          type="button"
          onClick={toggle}
          aria-label="테마 전환"
          className="flex items-center justify-center text-muted hover:text-text"
          style={{ width: 24, height: 24 }}
        >
          {theme === 'dark' ? <SunIcon width={20} height={20} /> : <MoonIcon width={20} height={20} />}
        </button>

        {/* 프로필 (아바타 + 이름/역할) */}
        <button
          type="button"
          onClick={() => { setBellOpen(false); setRoleOpen((v) => !v) }}
          className="flex items-center" style={{ gap: 12 }}
        >
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--c-accent)', color: 'var(--c-onaccent)', fontSize: 15, fontWeight: 800 }}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex flex-col items-start" style={{ gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)' }}>{user.name}</span>
            <span style={{ fontSize: 14, color: 'var(--c-muted)' }}>{ACCESS_LABEL[access]}</span>
          </span>
        </button>
      </div>

      {(bellOpen || roleOpen) && (
        <div className="fixed inset-0 z-10" onClick={close} role="presentation" />
      )}

      {bellOpen && (
        <div
          className="absolute bg-card2 border border-line rounded-xl overflow-hidden z-20"
          style={{ top: 60, right: 16, width: 300, boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="font-bold" style={{ fontSize: 14 }}>알림</span>
            <button type="button" className="text-accent" style={{ fontSize: 14 }}>모두 읽음</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 6).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  close()
                  if (n.link) navigate(n.link)
                }}
                className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--accent-soft)] border-b border-line last:border-0"
              >
                <span
                  className="rounded-full shrink-0 mt-1.5"
                  style={{ width: 7, height: 7, background: n.read ? 'var(--c-inactive)' : 'var(--c-accent)' }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ fontSize: 14 }}>{n.message}</span>
                  <span className="text-muted block" style={{ fontSize: 14 }}>{n.createdAt}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {roleOpen && (
        <div
          className="absolute bg-card2 border border-line rounded-xl overflow-hidden z-20"
          style={{ top: 60, right: 16, width: 240, boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="px-4 pt-3 pb-1 text-muted uppercase" style={{ fontSize: 14, letterSpacing: '.5px' }}>
            역할 전환 (A / B=C)
          </div>
          {DEMO_IDS.map((id) => {
            const u = userById(id)!
            const a = accessOf(u)
            const on = u.id === user.id
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setUserId(id)
                  close()
                  navigate(u.initialRoute)
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-[var(--accent-soft)]"
                style={{ fontSize: 14 }}
              >
                <span
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 22, height: 22, background: 'var(--c-accent)', color: 'var(--c-onaccent)', fontSize: 14, fontWeight: 800 }}
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{u.name}</span>
                  <span className="text-muted block" style={{ fontSize: 14 }}>{ACCESS_LABEL[a]}</span>
                </span>
                {on && <CheckIcon width={15} height={15} className="text-accent shrink-0" />}
              </button>
            )
          })}
          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => {
                close()
                logout()
                navigate('/login')
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--accent-soft)]"
              style={{ fontSize: 14, color: 'var(--c-danger)' }}
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

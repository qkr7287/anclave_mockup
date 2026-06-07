import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bars3Icon,
  BellIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/solid'
import { useTheme } from '../lib/theme'
import { accessOf, useRole } from '../lib/role'
import { userById } from '../data/users'
import { notifications } from '../data/events'

const DEMO_IDS = ['u-admin', 'u-manager', 'u-user']
const ACCESS_LABEL: Record<string, string> = {
  A: 'A · 최종관리자',
  B: 'B · 실무관리자',
  C: 'C · 사용자',
}

interface HeaderProps {
  onToggleSidebar: () => void
}

// Q2/Q18 미니 헤더 — 로고 · 검색 인풋(상시) · 벨 · 테마 · 역할 전환. 메뉴 항목 없음(GNB 금지).
export function Header({ onToggleSidebar }: HeaderProps) {
  const { theme, toggle } = useTheme()
  const { user, access, setUserId } = useRole()
  const navigate = useNavigate()
  const [bellOpen, setBellOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length

  const close = () => {
    setBellOpen(false)
    setRoleOpen(false)
  }

  return (
    <header
      className="flex items-center border-b border-line bg-bg shrink-0 relative z-20"
      style={{ height: 52, padding: '0 14px', gap: 14 }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="사이드바 접기/펴기"
        className="flex items-center justify-center rounded-lg border border-line text-muted hover:text-text"
        style={{ width: 32, height: 32 }}
      >
        <Bars3Icon width={17} height={17} />
      </button>

      <div className="font-extrabold" style={{ fontSize: 16 }}>
        <span className="shiny">Anclave</span>
        <span className="text-accent">.</span>
      </div>

      {/* Q18-A 상시 검색 인풋 (탐색 전용) */}
      <div
        className="flex items-center gap-2 bg-soft border border-line rounded-lg min-w-0"
        style={{ flex: 1, maxWidth: 300, height: 34, padding: '0 11px' }}
      >
        <MagnifyingGlassIcon width={15} height={15} className="text-muted shrink-0" />
        <input
          className="bg-transparent outline-none w-full min-w-0 text-text placeholder:text-muted"
          style={{ fontSize: 14 }}
          placeholder="서비스 · 모델 검색…"
          aria-label="검색"
        />
      </div>

      <div className="flex items-center" style={{ gap: 9, marginLeft: 'auto' }}>
        {/* 알림 벨 */}
        <div className="relative">
          <button
            type="button"
            aria-label="알림"
            onClick={() => {
              setRoleOpen(false)
              setBellOpen((v) => !v)
            }}
            className="flex items-center justify-center rounded-lg border border-line text-muted hover:text-text relative"
            style={{ width: 34, height: 34 }}
          >
            <BellIcon width={17} height={17} />
            {unread > 0 && (
              <span
                className="absolute rounded-full"
                style={{ top: 6, right: 7, width: 7, height: 7, background: 'var(--c-danger)', border: '1.5px solid var(--c-bg)' }}
              />
            )}
          </button>
        </div>

        {/* 테마 토글 */}
        <button
          type="button"
          onClick={toggle}
          aria-label="테마 전환"
          className="flex items-center justify-center rounded-lg border border-line text-muted hover:text-text"
          style={{ width: 34, height: 34 }}
        >
          {theme === 'dark' ? <SunIcon width={17} height={17} /> : <MoonIcon width={17} height={17} />}
        </button>

        {/* 역할/프로필 칩 */}
        <button
          type="button"
          onClick={() => {
            setBellOpen(false)
            setRoleOpen((v) => !v)
          }}
          className="flex items-center gap-2 rounded-lg border border-line hover:border-accent"
          style={{ height: 34, padding: '0 11px' }}
        >
          <span
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 20, height: 20, background: 'var(--c-accent)', color: 'var(--c-onaccent)', fontSize: 10, fontWeight: 800 }}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ fontSize: 14 }}>{ACCESS_LABEL[access]}</span>
        </button>
      </div>

      {(bellOpen || roleOpen) && (
        <div className="fixed inset-0 z-10" onClick={close} role="presentation" />
      )}

      {bellOpen && (
        <div
          className="absolute bg-card2 border border-line rounded-xl overflow-hidden z-20"
          style={{ top: 50, right: 14, width: 300, boxShadow: 'var(--shadow-pop)' }}
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
                  <span className="text-muted block" style={{ fontSize: 11 }}>{n.createdAt}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {roleOpen && (
        <div
          className="absolute bg-card2 border border-line rounded-xl overflow-hidden z-20"
          style={{ top: 50, right: 14, width: 240, boxShadow: 'var(--shadow-pop)' }}
        >
          <div className="px-4 pt-3 pb-1 text-muted uppercase" style={{ fontSize: 11, letterSpacing: '.5px' }}>
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
                  style={{ width: 20, height: 20, background: 'var(--c-accent)', color: 'var(--c-onaccent)', fontSize: 10, fontWeight: 800 }}
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{u.name}</span>
                  <span className="text-muted block" style={{ fontSize: 11 }}>{ACCESS_LABEL[a]}</span>
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

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: number
}

// Q29 우측 슬라이드 드로어 — 이벤트 로그·상세. 현재 화면 위로 슬라이드.
export function Drawer({ open, onClose, title, children, width = 380 }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: 'var(--dim)' }}
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="absolute top-0 right-0 bottom-0 bg-card2 border-l border-line flex flex-col"
        style={{ width, boxShadow: 'var(--shadow-pop)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line shrink-0">
          <h3 className="text-[14px] font-bold truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-muted hover:text-text">
            <XMarkIcon width={18} height={18} />
          </button>
        </header>
        <div className="p-4 overflow-y-auto min-w-0" style={{ fontSize: 14 }}>
          {children}
        </div>
      </aside>
    </div>
  )
}

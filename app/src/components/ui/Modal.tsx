import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}

// Q6 센터 모달 — dim + 박스(card2·radius12·shadow) · Esc 닫기.
export function Modal({ open, onClose, title, children, footer, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--dim)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-card2 border border-line rounded-xl w-full anim-fade"
        style={{ maxWidth: width, boxShadow: 'var(--shadow-pop)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <h3 className="text-[14px] font-bold truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-muted hover:text-text">
            <XMarkIcon width={18} height={18} />
          </button>
        </header>
        <div className="p-4 min-w-0" style={{ fontSize: 14 }}>
          {children}
        </div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

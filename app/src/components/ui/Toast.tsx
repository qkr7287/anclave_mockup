import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'
import type { Tone } from './Badge'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

interface ToastCtx {
  push: (message: string, tone?: Tone) => void
}

const Ctx = createContext<ToastCtx | null>(null)

const ICONS: Record<Tone, typeof CheckCircleIcon> = {
  ok: CheckCircleIcon,
  info: InformationCircleIcon,
  neutral: InformationCircleIcon,
  warn: ExclamationTriangleIcon,
  danger: ExclamationTriangleIcon,
}
const COLOR: Record<Tone, string> = {
  ok: 'var(--c-ok)',
  info: 'var(--c-accent)',
  neutral: 'var(--c-muted)',
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
}

// Q12 토스트 — 우상단 · live region.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = ++seq.current
      setItems((cur) => [...cur, { id, message, tone }])
      window.setTimeout(() => remove(id), 4200)
    },
    [remove],
  )

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        className="fixed z-[70] flex flex-col"
        style={{ top: 12, right: 12, width: 280, gap: 9 }}
        aria-live="polite"
      >
        {items.map((t) => {
          const Icon = ICONS[t.tone]
          return (
            <div
              key={t.id}
              className="flex items-start gap-2.5 border border-line rounded-[10px] anim-fade"
              style={{ background: 'var(--toast-bg)', padding: '11px 12px', boxShadow: 'var(--shadow-pop)' }}
            >
              <Icon width={18} height={18} style={{ color: COLOR[t.tone] }} className="shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0" style={{ fontSize: 14 }}>
                {t.message}
              </span>
              <button type="button" onClick={() => remove(t.id)} aria-label="닫기" className="text-muted hover:text-text shrink-0">
                <XMarkIcon width={15} height={15} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used within ToastProvider')
  return v
}

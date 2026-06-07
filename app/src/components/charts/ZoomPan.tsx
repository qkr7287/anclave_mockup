import { useRef, useState } from 'react'
import type { ReactNode, WheelEvent, PointerEvent } from 'react'
import { MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid'

interface ZoomPanProps {
  children: ReactNode
  /** 뷰포트 높이(px 또는 '100%') — 영역 고정(Q25) */
  height?: number | string
  minScale?: number
  maxScale?: number
  /** 콘텐츠가 패널 폭을 꽉 채움(grid 1fr 등) — 기본은 max-content */
  fit?: boolean
}

// Q10 자원맵 줌/팬 — 휠 줌(.6~2.2)·드래그 팬·리셋. 뷰포트 overflow:hidden(영역 고정).
export function ZoomPan({ children, height = 360, minScale = 0.6, maxScale = 2.2, fit = false }: ZoomPanProps) {
  const [s, setS] = useState(1)
  const [t, setT] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const next = Math.min(maxScale, Math.max(minScale, s - Math.sign(e.deltaY) * 0.12))
    setS(Number(next.toFixed(2)))
  }
  const onDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return
    setT({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })
  }
  const onUp = () => (drag.current = null)
  const reset = () => {
    setS(1)
    setT({ x: 0, y: 0 })
  }
  const zoom = (d: number) => setS((v) => Number(Math.min(maxScale, Math.max(minScale, v + d)).toFixed(2)))

  const ctrlBtn =
    'flex items-center justify-center rounded-md border border-line bg-card2 text-muted hover:text-text hover:border-accent transition-colors'

  return (
    <div
      className="relative rounded-lg border border-line overflow-hidden"
      style={{ height, background: 'var(--c-bg)', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <div
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${s})`, transformOrigin: '0 0', transition: drag.current ? 'none' : 'transform .12s', padding: 14, width: fit ? '100%' : 'max-content' }}
      >
        {children}
      </div>
      <div className="absolute z-10 flex flex-col gap-1" style={{ right: 10, bottom: 10 }}>
        <button type="button" aria-label="확대" onClick={() => zoom(0.2)} className={ctrlBtn} style={{ width: 28, height: 28 }}>
          <MagnifyingGlassPlusIcon width={15} height={15} />
        </button>
        <button type="button" aria-label="축소" onClick={() => zoom(-0.2)} className={ctrlBtn} style={{ width: 28, height: 28 }}>
          <MagnifyingGlassMinusIcon width={15} height={15} />
        </button>
        <button type="button" aria-label="원위치" onClick={reset} className={ctrlBtn} style={{ width: 28, height: 28 }}>
          <ArrowsPointingOutIcon width={15} height={15} />
        </button>
      </div>
      <div
        className="absolute z-10 text-muted border border-line rounded-md pointer-events-none"
        style={{ left: 10, bottom: 10, fontSize: 14, padding: '2px 8px', background: 'var(--c-card2)' }}
      >
        휠 줌 · 드래그 팬 · {Math.round(s * 100)}%
      </div>
    </div>
  )
}

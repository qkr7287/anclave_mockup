import { useRef, useState } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import { defineHex, Grid, rectangle, Orientation } from 'honeycomb-grid'
import { MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid'

// honeycomb-grid가 벌집 좌표를 계산(tessellation·간격 0) → SVG polygon 렌더.
const DIM = 30
const Hex = defineHex({ dimensions: DIM, orientation: Orientation.POINTY })

// 사용률 밴드(블루→퍼플) 대표색 — 슬라이스 세그먼트용
const BAND = ['#475067', '#5a82e0', '#6b72db', '#8a63d8', '#b25fd0']
export const bandColor = (u: number) => (u <= 0 ? '#2b3342' : BAND[u < 25 ? 0 : u < 50 ? 1 : u < 75 ? 2 : u < 90 ? 3 : 4])

export interface SliceSeg { units: number; usage: number; free?: boolean }
export interface HexCell {
  id: string
  /** 그룹 id(4.2 서버) — hover 시 같은 그룹 강조 */
  groupId?: string
  /** 단색 채움(4.2 서버 헬스색) */
  fill?: string
  /** 슬라이스 세그먼트(4.3·4.4 GPU>슬라이스 분할) */
  segments?: SliceSeg[]
  danger?: boolean
  free?: boolean
  /** 빈/미사용 슬롯 — faint outline만(데이터 없음) */
  empty?: boolean
  label?: string
  tip?: string
  onClick?: () => void
}

interface HexFieldProps {
  cells: HexCell[]
  /** 열 수(미지정 시 자동) */
  cols?: number
  scale?: number
  showLabel?: boolean
  selectedId?: string
  controls?: boolean
}

export function HexField({ cells, cols, scale = 1, showLabel = false, selectedId, controls = true }: HexFieldProps) {
  const [hover, setHover] = useState<{ x: number; y: number; tip: string; group?: string } | null>(null)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const n = cells.length
  const C = cols ?? Math.max(1, Math.round(Math.sqrt(n * 1.9)))
  const R = Math.ceil(n / C)

  const grid = new Grid(Hex, rectangle({ width: C, height: R }))
  const raw: { i: number; x: number; y: number; corners: { x: number; y: number }[] }[] = []
  let k = 0
  grid.forEach((h) => { raw.push({ i: k, x: h.x, y: h.y, corners: h.corners.map((c) => ({ x: c.x, y: c.y })) }); k++ })
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  raw.slice(0, n).forEach((h) => h.corners.forEach((c) => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y) }))
  const sc = (v: number, m: number) => (v - m) * scale
  const fieldW = (maxX - minX) * scale
  const fieldH = (maxY - minY) * scale
  const pad = DIM * scale
  const hexH = DIM * 2 * scale // pointy hex height

  const onWheel = (e: WheelEvent) => { e.preventDefault(); setView((v) => ({ ...v, s: Math.min(2.2, Math.max(0.6, Number((v.s - Math.sign(e.deltaY) * 0.12).toFixed(2)))) })) }
  const onDown = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y }; (e.currentTarget as Element).setPointerCapture(e.pointerId) }
  const onMove = (e: PointerEvent) => { if (drag.current) setView((v) => ({ ...v, x: drag.current!.ox + (e.clientX - drag.current!.x), y: drag.current!.oy + (e.clientY - drag.current!.y) })) }
  const onUp = () => (drag.current = null)
  const zoom = (d: number) => setView((v) => ({ ...v, s: Math.min(2.2, Math.max(0.6, Number((v.s + d).toFixed(2)))) }))
  const reset = () => setView({ s: 1, x: 0, y: 0 })
  const ctrl = 'flex items-center justify-center rounded-md border border-line bg-card2 text-muted hover:text-text hover:border-accent transition-colors'

  return (
    <div className={`relative w-full h-full overflow-hidden ${controls ? 'rounded-lg border border-line' : ''}`} style={{ background: controls ? 'var(--c-bg)' : 'transparent', cursor: controls ? (drag.current ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
      onWheel={controls ? onWheel : undefined} onPointerDown={controls ? onDown : undefined} onPointerMove={controls ? onMove : undefined} onPointerUp={controls ? onUp : undefined} onPointerLeave={() => { onUp(); setHover(null) }}>
      <svg viewBox={`${-pad} ${-pad} ${fieldW + pad * 2} ${fieldH + pad * 2}`} style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label="자원맵 벌집">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--c-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.10)" strokeWidth="2.5" />
          </pattern>
          {cells.map((c, i) => {
            if (!c.segments) return null
            const h = raw[i]; if (!h) return null
            const pts = h.corners.map((p) => `${sc(p.x, minX).toFixed(1)},${sc(p.y, minY).toFixed(1)}`).join(' ')
            return <clipPath key={c.id} id={`clip-${c.id}`}><polygon points={pts} /></clipPath>
          })}
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.s})`} style={{ transition: drag.current ? 'none' : 'transform .12s' }}>
          {cells.map((c, i) => {
            const h = raw[i]
            if (!h) return null
            const cx = sc(h.x, minX), cy = sc(h.y, minY)
            const pts = h.corners.map((p) => `${sc(p.x, minX).toFixed(1)},${sc(p.y, minY).toFixed(1)}`).join(' ')
            if (c.empty) return <polygon key={c.id} points={pts} fill="none" stroke="var(--c-border)" strokeWidth={1} />
            const sel = selectedId === c.id
            const grpHi = hover?.group && c.groupId === hover.group
            const top = cy - hexH / 2
            // 세그먼트 누적 높이(units 합 기준, 7=전체)
            let acc = 0
            const totalU = c.segments ? Math.max(7, c.segments.reduce((a, s) => a + s.units, 0)) : 7
            return (
              <g key={c.id} className="hexcell" style={{ cursor: c.onClick ? 'pointer' : 'default', transformOrigin: `${cx}px ${cy}px`, transformBox: 'fill-box' }}
                onClick={c.onClick}
                onMouseEnter={(e) => c.tip && setHover({ x: e.clientX, y: e.clientY, tip: c.tip, group: c.groupId })}
                onMouseMove={(e) => c.tip && setHover({ x: e.clientX, y: e.clientY, tip: c.tip, group: c.groupId })}
                onMouseLeave={() => setHover(null)}>
                {c.segments ? (
                  <g clipPath={`url(#clip-${c.id})`}>
                    {c.segments.map((s, si) => {
                      const y0 = top + (acc / totalU) * hexH
                      const hgt = (s.units / totalU) * hexH
                      acc += s.units
                      return <rect key={si} x={cx - hexH} y={y0} width={hexH * 2} height={hgt + 0.6} fill={s.free ? 'url(#hatch)' : bandColor(s.usage)} />
                    })}
                    {totalU > c.segments.reduce((a, s) => a + s.units, 0) && (
                      <rect x={cx - hexH} y={top + (c.segments.reduce((a, s) => a + s.units, 0) / totalU) * hexH} width={hexH * 2} height={hexH} fill="url(#hatch)" />
                    )}
                  </g>
                ) : (
                  <polygon points={pts} fill={c.free ? 'url(#hatch)' : c.fill ?? '#2b3342'} />
                )}
                <polygon points={pts} fill="none"
                  stroke={sel ? 'rgba(170,200,255,.95)' : grpHi ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.32)'}
                  strokeWidth={sel ? 2.5 : grpHi ? 2 : 1}
                  filter={sel ? 'drop-shadow(0 0 8px rgba(170,200,255,.65))' : undefined} />
                {c.danger && <text x={cx} y={cy + 6 * scale} textAnchor="middle" style={{ fontSize: 17 * scale, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}>!</text>}
                {showLabel && c.label && !c.danger && <text x={cx} y={cy + 4 * scale} textAnchor="middle" style={{ fontSize: 12 * scale, fontWeight: 800, fill: '#fff', paintOrder: 'stroke', stroke: 'rgba(0,0,0,.35)', strokeWidth: 2 * scale, pointerEvents: 'none' }}>{c.label}</text>}
              </g>
            )
          })}
        </g>
      </svg>

      {controls && (
        <>
          <div className="absolute z-10 flex flex-col gap-1" style={{ right: 10, top: 10 }}>
            <button type="button" aria-label="확대" onClick={() => zoom(0.2)} className={ctrl} style={{ width: 28, height: 28 }}><MagnifyingGlassPlusIcon width={15} height={15} /></button>
            <button type="button" aria-label="축소" onClick={() => zoom(-0.2)} className={ctrl} style={{ width: 28, height: 28 }}><MagnifyingGlassMinusIcon width={15} height={15} /></button>
            <button type="button" aria-label="원위치" onClick={reset} className={ctrl} style={{ width: 28, height: 28 }}><ArrowsPointingOutIcon width={15} height={15} /></button>
          </div>
          <div className="absolute z-10 text-muted border border-line rounded-md pointer-events-none" style={{ left: 10, bottom: 10, fontSize: 14, padding: '2px 8px', background: 'var(--c-card2)' }}>
            휠 줌 · 드래그 팬 · {Math.round(view.s * 100)}%
          </div>
        </>
      )}
      {hover && (
        <div className="fixed z-50 pointer-events-none bg-card2 border border-line rounded-md" style={{ left: hover.x + 12, top: hover.y + 12, padding: '5px 9px', fontSize: 14, boxShadow: 'var(--shadow-pop)', whiteSpace: 'nowrap' }}>{hover.tip}</div>
      )}
      <style>{`.hexcell{transition:transform .15s, filter .15s}.hexcell:hover{transform:scale(1.06);filter:brightness(1.13) drop-shadow(0 0 6px rgba(170,200,255,.4))}`}</style>
    </div>
  )
}

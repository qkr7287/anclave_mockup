import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import { defineHex, Grid, spiral, Orientation } from 'honeycomb-grid'
import { MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid'

// 단일 블루 히트맵 벌집(Figma node 0-1 정본) — 슬라이스를 중심부터 spiral로 채워 육각 덩어리.
// 색=부하 6단계(Figma) · 평상시 클린 · 호버 시 주황 테두리+틴트+라벨.
const DIM = 14
const Hex = defineHex({ dimensions: DIM, orientation: Orientation.POINTY })
// Figma 사용률 6단계: 0-15 회색 → 16-30 밝은 블루 → 76-100 짙은 남청(부하↑ 진함)
export const LOAD_BANDS = [
  { max: 16, color: '#1E222A', label: '0 - 15' },
  { max: 31, color: '#C1DDFA', label: '16 - 30' },
  { max: 46, color: '#5C9FFA', label: '31 - 45' },
  { max: 61, color: '#206DE7', label: '46 - 60' },
  { max: 76, color: '#1B3A91', label: '61 - 75' },
  { max: 101, color: '#142153', label: '76 - 100' },
]
const blueShade = (load: number) => (LOAD_BANDS.find((b) => load < b.max) ?? LOAD_BANDS[5]).color
const HOVER_ORANGE = '#F59B02'

export interface Bay {
  util: number
  fill?: string // 직접 색(4.3 슬라이스 헬스색). 없으면 util band(blue→purple)
  danger?: boolean
  idle?: boolean // 미할당(빗금)
  tip: string
}
export interface ServerRegion {
  id: string
  label: string
  health: 'normal' | 'warn' | 'danger' | 'inactive'
  outline: string
  regionTip: string // 호버 시 서버명·요약 툴팁
  bays: Bay[]
  onClick?: () => void
}

interface ServerHexMapProps {
  regions: ServerRegion[]
  /** 클린 모드(Figma 단일 서버) — 줌 버튼·미니맵 숨김, 팬/줌 비활성(fit 고정) */
  bare?: boolean
}

export function ServerHexMap({ regions, bare = false }: ServerHexMapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 520 })
  const [hover, setHover] = useState<{ x: number; y: number; ri: number; bayTip: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ x: number; y: number } | null>(null) // null = 미초기화(중앙)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  // ── spiral 중앙집중 packing: 슬라이스를 중심부터 나선으로 채워 육각형 덩어리(직사각형·행 ❌) ──
  const totalBays = regions.reduce((s, r) => s + r.bays.length, 0)
  let R = 1
  while (3 * R * R + 3 * R + 1 < Math.ceil(totalBays * 1.32)) R++
  type Cell = { key: string; cx: number; cy: number; corners: { x: number; y: number }[] }
  const grid = new Grid(Hex, spiral({ radius: R }))
  const cells: Cell[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  grid.forEach((h) => {
    cells.push({ key: `${h.q},${h.r}`, cx: h.x, cy: h.y, corners: h.corners.map((c) => ({ x: c.x, y: c.y })) })
    h.corners.forEach((c) => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y) })
  })
  // 서버별 슬라이스를 인접 연속 클러스터로 배정(region-growing) — 흩어짐 없이 한 덩어리
  const cellByKey = new Map(cells.map((c) => [c.key, c]))
  const neighborsOf = (key: string) => {
    const [q, r] = key.split(',').map(Number)
    return [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]]
      .map(([a, b]) => `${a},${b}`).filter((k) => cellByKey.has(k))
  }
  const axDist = (key: string, oq = 0, or = 0) => {
    const [q, r] = key.split(',').map(Number)
    return (Math.abs(q - oq) + Math.abs(r - or) + Math.abs(q + r - oq - or)) / 2
  }
  const assign = new Map<string, { ri: number; bay: number }>()
  const free = new Set(cells.map((c) => c.key))
  regions.forEach((reg, ri) => {
    const n = reg.bays.length
    if (n <= 0) return
    // 시드: 첫 서버=중심, 이후=이미 배정된 영역에 인접한 빈 셀 중 중심에 가장 가까운 것(전체 둥글게)
    let seed: string | undefined
    if (assign.size === 0) seed = free.has('0,0') ? '0,0' : undefined
    else {
      let bd = Infinity
      for (const k of free) {
        if (neighborsOf(k).some((nk) => assign.has(nk))) { const d = axDist(k); if (d < bd) { bd = d; seed = k } }
      }
    }
    if (!seed) { let bd = Infinity; for (const k of free) { const d = axDist(k); if (d < bd) { bd = d; seed = k } } }
    if (!seed) return
    const [sq, sr] = seed.split(',').map(Number)
    const grown: string[] = []
    const inFront = new Set([seed])
    const frontier = [seed]
    while (grown.length < n && frontier.length) {
      let bi = 0
      for (let i = 1; i < frontier.length; i++) if (axDist(frontier[i], sq, sr) < axDist(frontier[bi], sq, sr)) bi = i
      const k = frontier.splice(bi, 1)[0]
      if (!free.has(k)) continue
      free.delete(k); grown.push(k)
      neighborsOf(k).forEach((nk) => { if (free.has(nk) && !inFront.has(nk)) { inFront.add(nk); frontier.push(nk) } })
    }
    grown.forEach((k, i) => assign.set(k, { ri, bay: i }))
  })
  const at = (c: Cell) => assign.get(c.key)
  const X = (v: number) => v - minX
  const Y = (v: number) => v - minY
  const gW = maxX - minX, gH = maxY - minY
  const pts = (c: Cell) => c.corners.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')

  // 데이터 영역 px 범위 → fit(데이터를 컨테이너에 맞춤) + 중앙 pan
  const dataCells = cells.filter((c) => at(c))
  let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity
  dataCells.forEach((c) => c.corners.forEach((p) => { dMinX = Math.min(dMinX, X(p.x)); dMinY = Math.min(dMinY, Y(p.y)); dMaxX = Math.max(dMaxX, X(p.x)); dMaxY = Math.max(dMaxY, Y(p.y)) }))
  const dataW = dMaxX - dMinX || 1, dataH = dMaxY - dMinY || 1
  const { w, h } = size
  const fit = Math.min((w * 0.9) / dataW, (h * 0.84) / dataH)
  // bare(단일 서버): 헥사 크기 상한 — GPU 적은 서버에서 과확대 방지(서버 간 헥사 크기 일관)
  const BARE_HEX_CAP = 2.6
  const S = (bare ? Math.min(fit, BARE_HEX_CAP) : fit) * zoom
  const dataCx = (dMinX + dMaxX) / 2, dataCy = (dMinY + dMaxY) / 2

  // pan 클램프 — 그리드가 늘 뷰포트를 덮게(가장자리 안 보이게)
  const clamp = (p: { x: number; y: number }) => {
    const minPx = w - gW * S, minPy = h - gH * S
    return {
      x: gW * S <= w ? (w - gW * S) / 2 : Math.min(0, Math.max(minPx, p.x)),
      y: gH * S <= h ? (h - gH * S) / 2 : Math.min(0, Math.max(minPy, p.y)),
    }
  }
  const cur = pan ?? { x: w / 2 - dataCx * S, y: h / 2 - dataCy * S }
  const view = clamp(cur)

  const setZ = (nz: number) => setZoom(Math.max(0.55, Math.min(2.6, Number(nz.toFixed(2)))))
  const onWheel = (e: WheelEvent) => { e.preventDefault(); setZ(zoom - Math.sign(e.deltaY) * 0.12) }
  const onDown = (e: PointerEvent) => { const t = e.target as HTMLElement; if (t.closest('[data-hex]')) return; drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y }; (e.currentTarget as Element).setPointerCapture(e.pointerId) }
  const onMove = (e: PointerEvent) => { if (drag.current) setPan(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) })) }
  const onUp = () => (drag.current = null)
  const reset = () => { setZoom(1); setPan(null) }
  const ctrl = 'flex items-center justify-center rounded-md border border-line bg-card2 text-muted hover:text-text hover:border-accent transition-colors'

  // 외곽선 + 라벨
  const overlays = regions.map((reg, ri) => {
    const mine = dataCells.filter((c) => at(c)?.ri === ri)
    const edges = new Map<string, { a: { x: number; y: number }; b: { x: number; y: number }; count: number }>()
    mine.forEach((cell) => {
      for (let i = 0; i < 6; i++) {
        const a = cell.corners[i], b = cell.corners[(i + 1) % 6]
        const ka = `${a.x.toFixed(1)},${a.y.toFixed(1)}`, kb = `${b.x.toFixed(1)},${b.y.toFixed(1)}`
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        const e = edges.get(key)
        if (e) e.count++
        else edges.set(key, { a, b, count: 1 })
      }
    })
    const boundary = [...edges.values()].filter((e) => e.count === 1)
    const cx = mine.length ? mine.reduce((s, c) => s + X(c.cx), 0) / mine.length : 0
    const cy = mine.length ? mine.reduce((s, c) => s + Y(c.cy), 0) / mine.length : 0
    return { reg, boundary, cx, cy }
  })
  const hoverO = hover ? overlays[hover.ri] : null

  return (
    <div ref={ref} className="relative w-full h-full overflow-hidden" style={{ background: 'transparent', cursor: bare ? 'default' : drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onWheel={bare ? undefined : onWheel} onPointerDown={bare ? undefined : onDown} onPointerMove={bare ? undefined : onMove} onPointerUp={bare ? undefined : onUp} onPointerLeave={() => { if (!bare) onUp(); setHover(null) }}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} role="img" aria-label="자원맵 단일 벌집">
        <defs>
          <pattern id="shm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--c-soft)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${S})`}>
          {/* 1) 단일 블루 히트맵 벌집 — 부하 음영, 미할당 빗금, faint 빈 헥사로 육각 모양 */}
          {cells.map((c) => {
            const a = at(c)
            if (!a) return <polygon key={c.key} points={pts(c)} fill="none" stroke="var(--c-border)" strokeWidth={0.7} />
            const reg = regions[a.ri]
            const bay = reg.bays[a.bay]
            const fill = bay.idle ? 'url(#shm-hatch)' : bay.fill ?? blueShade(bay.util)
            return (
              <polygon key={c.key} data-hex points={pts(c)} fill={fill}
                stroke="rgba(13,17,23,.55)" strokeWidth={0.4}
                style={{ cursor: reg.onClick ? 'pointer' : 'default' }}
                onClick={reg.onClick}
                onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, ri: a.ri, bayTip: bay.tip })}
                onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, ri: a.ri, bayTip: bay.tip })}
                onMouseLeave={() => setHover(null)} />
            )
          })}
          {cells.map((c) => {
            const a = at(c)
            const bay = a ? regions[a.ri].bays[a.bay] : null
            if (!bay?.danger) return null
            return <text key={`d${c.key}`} x={X(c.cx)} y={Y(c.cy) + 5} textAnchor="middle" style={{ fontSize: 14, fontWeight: 800, fill: '#fff', pointerEvents: 'none' }}>!</text>
          })}
          {/* 2) 호버 시에만(Figma) — 그 서버 영역 주황 틴트 + 주황 테두리 + 태그 라벨 (평상시 클린) */}
          {hover && hoverO && (
            <g style={{ pointerEvents: 'none' }}>
              {dataCells.filter((c) => at(c)?.ri === hover.ri).map((c) => (
                <polygon key={`t${c.key}`} points={pts(c)} fill="rgba(245,155,2,0.4)" />
              ))}
              {hoverO.boundary.map((e, i) => (
                <line key={i} x1={X(e.a.x)} y1={Y(e.a.y)} x2={X(e.b.x)} y2={Y(e.b.y)} stroke={HOVER_ORANGE} strokeWidth={2.6} strokeLinecap="round" filter="drop-shadow(0 0 4px rgba(245,155,2,0.6))" />
              ))}
              {(() => {
                const txt = hoverO.reg.label
                const tw = txt.length * 6 + 20
                return (
                  <g transform={`translate(${hoverO.cx}, ${hoverO.cy})`}>
                    <rect x={-tw / 2} y={-9} width={tw} height={18} rx={6} fill="rgba(0,0,0,0.6)" />
                    <circle cx={-tw / 2 + 9} cy={0} r={3} fill={HOVER_ORANGE} />
                    <text x={-tw / 2 + 15} y={3} style={{ fontSize: 9, fontWeight: 700, fill: '#fff' }}>{txt}</text>
                  </g>
                )
              })()}
            </g>
          )}
        </g>
      </svg>

      {/* 중앙→가장자리 fade(vignette) — 컨테이너 고정, 팬/줌 무관 유지 */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 55%, var(--c-bg) 100%)' }} />

      {!bare && <div className="absolute z-10 flex flex-col gap-1" style={{ right: 10, top: 10 }}>
        <button type="button" aria-label="확대" onClick={() => setZ(zoom + 0.2)} className={ctrl} style={{ width: 28, height: 28 }}><MagnifyingGlassPlusIcon width={15} height={15} /></button>
        <button type="button" aria-label="축소" onClick={() => setZ(zoom - 0.2)} className={ctrl} style={{ width: 28, height: 28 }}><MagnifyingGlassMinusIcon width={15} height={15} /></button>
        <button type="button" aria-label="원위치" onClick={reset} className={ctrl} style={{ width: 28, height: 28 }}><ArrowsPointingOutIcon width={15} height={15} /></button>
      </div>}
      {/* 좌하단 미니맵 — 전체 blob 개요 + 현재 뷰포트 사각형 */}
      {!bare && <div className="absolute z-10 rounded-md border border-line overflow-hidden pointer-events-none" style={{ left: 10, bottom: 10, width: 116, height: 78, background: 'var(--c-card2)' }}>
        <svg viewBox={`0 0 ${gW} ${gH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
          {dataCells.map((c) => {
            const a = at(c)!
            const bay = regions[a.ri].bays[a.bay]
            return <circle key={`m${c.key}`} cx={X(c.cx)} cy={Y(c.cy)} r={DIM * 0.5} fill={bay.idle ? 'var(--c-inactive)' : bay.fill ?? blueShade(bay.util)} />
          })}
          <rect x={-view.x / S} y={-view.y / S} width={w / S} height={h / S} fill="none" stroke="var(--c-accent)" strokeWidth={Math.max(2, gW / 90)} />
        </svg>
      </div>}
      {/* 사용률 6단계 범례 — 맵 하단 중앙 floating(Figma) */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 flex items-center rounded-lg pointer-events-none" style={{ bottom: 12, gap: 18, padding: '8px 16px', background: 'rgba(27,35,64,0.5)', backdropFilter: 'blur(10px)' }}>
        {LOAD_BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center" style={{ gap: 6 }}>
            <svg width="14" height="13" viewBox="0 0 14 13" aria-hidden><polygon points="7,0 13,3.5 13,9.5 7,13 1,9.5 1,3.5" fill={b.color} /></svg>
            <span style={{ fontSize: 12, color: '#949DC4' }}>{b.label}</span>
          </span>
        ))}
      </div>
      {hover && hoverO && (
        <div className="fixed z-50 pointer-events-none bg-card2 border border-line rounded-md" style={{ left: hover.x + 12, top: hover.y + 12, padding: '6px 10px', boxShadow: 'var(--shadow-pop)', whiteSpace: 'nowrap', maxWidth: 340 }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 14, fontWeight: 700 }}>
            <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: HOVER_ORANGE }} />
            {hoverO.reg.regionTip}
          </div>
          <div className="text-muted" style={{ fontSize: 14, marginTop: 1 }}>{hover.bayTip}</div>
        </div>
      )}
    </div>
  )
}

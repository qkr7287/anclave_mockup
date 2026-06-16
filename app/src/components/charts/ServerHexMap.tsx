import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import { defineHex, Grid, spiral, Orientation } from 'honeycomb-grid'
import { MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid'

// 단일 블루 히트맵 벌집(Figma node 0-1 정본) — 슬라이스를 중심부터 spiral로 채워 육각 덩어리.
// 색=부하 6단계(Figma) · 평상시 클린 · 호버 시 주황 테두리+틴트+라벨.
const DIM = 14
const Hex = defineHex({ dimensions: DIM, orientation: Orientation.POINTY })
// 부하 온도 스펙트럼 — 낮음(청록)→녹→황→주황→빨강. 부하↑일수록 뜨겁게(빨강).
// 관제 GPU 히트맵과 같은 heat 계열로 통일. 구간 사이를 RGB 보간 → 그라데이션에 가깝게.
const HEAT_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [45, 125, 200] }, // 한랭(저부하) — 블루
  { at: 16, rgb: [33, 170, 196] }, // 시안
  { at: 34, rgb: [54, 180, 90] }, // 녹색
  { at: 52, rgb: [173, 198, 38] }, // 황녹
  { at: 68, rgb: [231, 193, 28] }, // 황색
  { at: 84, rgb: [232, 119, 30] }, // 주황
  { at: 100, rgb: [226, 46, 40] }, // 고온(고부하) — 레드
]
export function heatColor(load: number): string {
  const u = Math.max(0, Math.min(100, load))
  let a = HEAT_STOPS[0]
  let b = HEAT_STOPS[HEAT_STOPS.length - 1]
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (u <= HEAT_STOPS[i].at) { a = HEAT_STOPS[i - 1]; b = HEAT_STOPS[i]; break }
  }
  const t = b.at === a.at ? 0 : (u - a.at) / (b.at - a.at)
  const m = (j: number) => Math.round(a.rgb[j] + (b.rgb[j] - a.rgb[j]) * t)
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`
}
// 하단 범례 6단계 — 대표색은 heat 램프 구간 중간값 샘플(채움과 동일 스펙트럼).
export const LOAD_BANDS = [
  { color: heatColor(8), label: '0 - 15' },
  { color: heatColor(23), label: '16 - 30' },
  { color: heatColor(38), label: '31 - 45' },
  { color: heatColor(53), label: '46 - 60' },
  { color: heatColor(68), label: '61 - 75' },
  { color: heatColor(90), label: '76 - 100' },
]
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
  // 헥사를 중심 쪽으로 약간 축소해 셀 사이 간격 — 빈틈없이 맞붙어 '너무 가깝게' 보이던 문제 완화.
  const HEX_INSET = 0.88 // 1=맞붙음, ↓일수록 간격 넓음
  const pts = (c: Cell) => c.corners.map((p) => `${X(c.cx + (p.x - c.cx) * HEX_INSET).toFixed(1)},${Y(c.cy + (p.y - c.cy) * HEX_INSET).toFixed(1)}`).join(' ')

  // 배경 honeycomb 격자 — 데이터 헥사와 동일 좌표계(같은 Hex·중심)로 빈 육각을 깔아 패널 모티프와 정확히 일치.
  // 데이터보다 큰 spiral로 뷰포트를 덮고(가장자리는 vignette가 페이드), inset 없이 연속 격자. pan과 무관해 memo.
  const bgCells = useMemo(() => {
    const bg = new Grid(Hex, spiral({ radius: R + 9 }))
    const out: string[] = []
    bg.forEach((hx) => out.push(hx.corners.map((c) => `${(c.x - minX).toFixed(1)},${(c.y - minY).toFixed(1)}`).join(' ')))
    return out
  }, [R, minX, minY])

  // 데이터 영역 px 범위 → fit(데이터를 컨테이너에 맞춤) + 중앙 pan
  const dataCells = cells.filter((c) => at(c))
  let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity
  dataCells.forEach((c) => c.corners.forEach((p) => { dMinX = Math.min(dMinX, X(p.x)); dMinY = Math.min(dMinY, Y(p.y)); dMaxX = Math.max(dMaxX, X(p.x)); dMaxY = Math.max(dMaxY, Y(p.y)) }))
  const dataW = dMaxX - dMinX || 1, dataH = dMaxY - dMinY || 1
  const { w, h } = size
  // 헥사 클러스터를 컨테이너에 맞춤 — 가장자리 여백을 넉넉히 둬 멀리서 보는 줌(과확대 방지).
  const fit = Math.min((w * 0.62) / dataW, (h * 0.58) / dataH)
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
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--hex-hatch)" strokeWidth="2" />
          </pattern>
        </defs>
        <g transform={`translate(${view.x}, ${view.y}) scale(${S})`}>
          {/* 0) 배경 honeycomb 격자 — 데이터 헥사와 동일 좌표계의 빈 육각(패널 모티프 일치). 헥사 뒤에 깔림 */}
          {bgCells.map((p, i) => (
            <polygon key={`bg${i}`} points={p} fill="none" stroke="var(--hex-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {/* 1) 단일 히트맵 벌집 — 부하 음영(온도색), 미할당 빗금. 빈 격자는 위 배경이 담당 */}
          {cells.map((c) => {
            const a = at(c)
            if (!a) return null
            const reg = regions[a.ri]
            const bay = reg.bays[a.bay]
            const fill = bay.idle ? 'url(#shm-hatch)' : bay.fill ?? heatColor(bay.util)
            return (
              <polygon key={c.key} data-hex points={pts(c)} fill={fill}
                stroke="var(--hex-stroke)" strokeWidth={0.4}
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
            return <text key={`d${c.key}`} x={X(c.cx)} y={Y(c.cy) + 6} textAnchor="middle" style={{ fontSize: 18, fontWeight: 900, fill: 'var(--c-danger)', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, pointerEvents: 'none' }}>!</text>
          })}
          {/* 1.5) 서버 영역 테두리 — 항시 얇게 표시(같은 서버 헥사 묶음을 늘 구분). 서버별 hue. */}
          {overlays.map((o, i) => (
            <g key={`ob${i}`} style={{ pointerEvents: 'none' }}>
              {o.boundary.map((e, j) => (
                <line key={j} x1={X(e.a.x)} y1={Y(e.a.y)} x2={X(e.b.x)} y2={Y(e.b.y)}
                  stroke={o.reg.outline} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.6} />
              ))}
            </g>
          ))}
          {/* 2) 호버 시에만(Figma) — 그 서버 영역 주황 틴트 + 주황 테두리 + 태그 라벨 (평상시 클린) */}
          {hover && hoverO && (
            <g style={{ pointerEvents: 'none' }}>
              {dataCells.filter((c) => at(c)?.ri === hover.ri).map((c) => (
                <polygon key={`t${c.key}`} points={pts(c)} fill="rgba(245,155,2,0.4)" />
              ))}
              {hoverO.boundary.map((e, i) => (
                <line key={i} x1={X(e.a.x)} y1={Y(e.a.y)} x2={X(e.b.x)} y2={Y(e.b.y)} stroke={HOVER_ORANGE} strokeWidth={1.4} strokeLinecap="round" filter="drop-shadow(0 0 4px rgba(245,155,2,0.6))" />
              ))}
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
            return <circle key={`m${c.key}`} cx={X(c.cx)} cy={Y(c.cy)} r={DIM * 0.5} fill={bay.idle ? 'var(--c-inactive)' : bay.fill ?? heatColor(bay.util)} />
          })}
          <rect x={-view.x / S} y={-view.y / S} width={w / S} height={h / S} fill="none" stroke="var(--c-accent)" strokeWidth={Math.max(2, gW / 90)} />
        </svg>
      </div>}
      {/* 사용률 6단계 범례 — 맵 하단 중앙 floating(Figma) */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 flex items-center rounded-lg pointer-events-none" style={{ bottom: 12, gap: 18, padding: '9px 18px', background: 'rgba(13,17,32,0.72)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
        {LOAD_BANDS.map((b) => (
          <span key={b.label} className="inline-flex items-center" style={{ gap: 7 }}>
            <svg width="16" height="15" viewBox="0 0 14 13" aria-hidden><polygon points="7,0 13,3.5 13,9.5 7,13 1,9.5 1,3.5" fill={b.color} /></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#eef2fb' }}>{b.label}</span>
          </span>
        ))}
      </div>
      {hover && hoverO && (
        <div className="fixed z-50 pointer-events-none bg-card2 border border-line rounded-lg" style={{ left: hover.x + 14, top: hover.y + 14, padding: '11px 15px', boxShadow: 'var(--shadow-pop)', whiteSpace: 'nowrap', maxWidth: 420 }}>
          <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 700 }}>
            <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: HOVER_ORANGE }} />
            {hoverO.reg.regionTip}
          </div>
          <div className="text-muted" style={{ fontSize: 14.5, marginTop: 3 }}>{hover.bayTip}</div>
        </div>
      )}
    </div>
  )
}

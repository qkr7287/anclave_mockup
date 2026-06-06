import type { ReactNode } from 'react'
import { bandGradient, hatchBackground } from './bands'

const HEX_CLIP = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)'

interface HexTileProps {
  usage: number
  free?: boolean
  width?: number
  height?: number
  selected?: boolean
  dim?: boolean
  onClick?: () => void
  children?: ReactNode
  title?: string
}

// Q10/Q27 헥사 타일 — 입체 그라데(155deg 밴드)·빈=빗금·hover scale·선택 발광.
export function HexTile({
  usage,
  free,
  width = 70,
  height = 80,
  selected,
  dim,
  onClick,
  children,
  title,
}: HexTileProps) {
  return (
    <div
      onClick={onClick}
      title={title}
      role={onClick ? 'button' : undefined}
      className="relative flex items-center justify-center text-center transition-transform"
      style={{
        width,
        height,
        clipPath: HEX_CLIP,
        background: free ? 'var(--c-soft)' : bandGradient(usage),
        backgroundImage: free ? hatchBackground : bandGradient(usage),
        color: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        transform: selected ? 'scale(1.12)' : 'scale(1)',
        filter: selected
          ? 'drop-shadow(0 0 9px rgba(170,200,255,.6)) brightness(1.1)'
          : dim
            ? 'opacity(.6) saturate(.82)'
            : 'none',
        opacity: dim ? 0.6 : 1,
      }}
    >
      {children}
    </div>
  )
}

interface HexItem {
  id: string
  usage: number
  free?: boolean
  label?: string
  sublabel?: string
}

interface HexagonProps {
  items: HexItem[]
  perRow?: number
  tileWidth?: number
  tileHeight?: number
  selectedId?: string
  onSelect?: (id: string) => void
}

// honeycomb 배치 — 행마다 -15px overlap, 홀수행 30px offset.
export function Hexagon({
  items,
  perRow = 4,
  tileWidth = 70,
  tileHeight = 80,
  selectedId,
  onSelect,
}: HexagonProps) {
  const rows: HexItem[][] = []
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow))
  }
  return (
    <div className="flex flex-col items-start">
      {rows.map((row, ri) => (
        <div
          key={ri}
          className="flex"
          style={{ gap: 6, marginTop: ri === 0 ? 0 : -15, marginLeft: ri % 2 === 1 ? 30 : 0 }}
        >
          {row.map((it) => (
            <HexTile
              key={it.id}
              usage={it.usage}
              free={it.free}
              width={tileWidth}
              height={tileHeight}
              selected={selectedId === it.id}
              dim={selectedId != null && selectedId !== it.id}
              onClick={onSelect ? () => onSelect(it.id) : undefined}
              title={it.label}
            >
              {(it.label || it.sublabel) && (
                <div className="leading-tight px-1">
                  {it.label && <div style={{ fontSize: 14, fontWeight: 700 }}>{it.label}</div>}
                  {it.sublabel && <div style={{ fontSize: 14, fontWeight: 800 }}>{it.sublabel}</div>}
                </div>
              )}
            </HexTile>
          ))}
        </div>
      ))}
    </div>
  )
}

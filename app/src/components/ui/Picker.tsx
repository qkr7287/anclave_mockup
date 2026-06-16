import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid'

// 인플레이스 엔티티 스위처 — 헤더 이름을 클릭형 셀렉터로(미니 검색 포함).
// 자원맵 4.3 서버 전환 · 4.4 서버/GPU 전환에 공용. Header의 popover 패턴 차용
// (fixed 오버레이로 바깥 클릭 닫기 · absolute 메뉴로 레이아웃 영향 0).

export interface PickerOption {
  id: string
  label: string
  hint?: string // 우측 보조 수치(예: "68%")
  status?: string // 상태 라벨(예: "정상") — dotColor 색으로 표기
  dotColor?: string // 좌측 상태 dot 색(토큰/hex)
}

interface PickerProps {
  value: string
  options: PickerOption[]
  onSelect: (id: string) => void
  size?: 'sm' | 'lg' // lg=제목룩(18px) · sm=칩룩(14px)
  align?: 'left' | 'right' // 메뉴 정렬(우측 헤더 액션은 'right' — 화면 밖 잘림 방지)
  searchable?: boolean // 미니 검색 입력
  searchPlaceholder?: string
  ariaLabel?: string
  menuWidth?: number // 드롭다운 메뉴 폭(default 240)
}

export function Picker({
  value,
  options,
  onSelect,
  size = 'sm',
  align = 'left',
  searchable = false,
  searchPlaceholder = '검색',
  ariaLabel,
  menuWidth = 240,
}: PickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = options.find((o) => o.id === value)

  // 닫힐 때 검색어 리셋(다음 오픈 시 전체 목록부터)
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q),
    )
  }, [options, query])

  const lg = size === 'lg'

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center min-w-0 transition-colors hover:bg-[var(--c-soft)]"
        style={{
          gap: lg ? 8 : 6,
          padding: lg ? '3px 9px 3px 8px' : '4px 9px',
          borderRadius: 8,
          border: lg ? '1px solid var(--c-border)' : '1px solid var(--c-border)',
          background: lg ? 'transparent' : 'var(--c-soft)',
        }}
      >
        {current?.dotColor && (
          <span className="rounded-full shrink-0" style={{ width: lg ? 9 : 8, height: lg ? 9 : 8, background: current.dotColor }} />
        )}
        <span className="truncate" style={{ fontSize: lg ? 18 : 14, fontWeight: lg ? 700 : 600 }}>
          {current?.label ?? value}
        </span>
        <ChevronDownIcon
          width={lg ? 16 : 14}
          height={lg ? 16 : 14}
          className="text-muted shrink-0"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
        />
      </button>

      {open && (
        <>
          {/* 바깥 클릭 닫기 — Header 패턴 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} role="presentation" />
          <div
            className="absolute z-20 bg-card2 border border-line rounded-xl overflow-hidden"
            style={{ top: 'calc(100% + 6px)', [align]: 0, width: menuWidth, boxShadow: 'var(--shadow-pop)' }}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-line" style={{ padding: '8px 10px' }}>
                <MagnifyingGlassIcon width={14} height={14} className="text-muted shrink-0" style={{ opacity: 0.6 }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false)
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="bg-transparent outline-none w-full min-w-0 text-text"
                  style={{ fontSize: 13 }}
                />
              </div>
            )}
            <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
              {filtered.length === 0 ? (
                <div className="text-muted text-center" style={{ fontSize: 13, padding: '14px 10px' }}>결과 없음</div>
              ) : (
                filtered.map((o) => {
                  const on = o.id === value
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onSelect(o.id)
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-2.5 text-left hover:bg-[var(--accent-soft)] border-b border-line last:border-0"
                      style={{ padding: '8px 10px', background: on ? 'var(--accent-soft)' : undefined }}
                    >
                      {o.dotColor && <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: o.dotColor }} />}
                      <span className="flex-1 min-w-0 truncate font-semibold" style={{ fontSize: 13 }}>{o.label}</span>
                      {o.hint && <span className="text-muted tabular-nums shrink-0" style={{ fontSize: 12 }}>{o.hint}</span>}
                      {o.status && <span className="shrink-0" style={{ fontSize: 12, color: o.dotColor ?? 'var(--c-muted)' }}>{o.status}</span>}
                      {on && <CheckIcon width={14} height={14} className="text-accent shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

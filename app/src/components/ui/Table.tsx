import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  width?: string // 예: '120px' | '20%'
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  title?: ReactNode
  action?: ReactNode
  onRowClick?: (row: T) => void
  empty?: ReactNode
}

// Q3·Q11·Q25 — table-layout:fixed · 헤더 nowrap 고정 · zebra · 행 hover · 셀 ellipsis.
export function Table<T>({
  columns,
  rows,
  rowKey,
  title,
  action,
  onRowClick,
  empty,
}: TableProps<T>) {
  return (
    <div className="bg-card2 border border-line rounded-xl overflow-hidden min-w-0">
      {(title != null || action != null) && (
        <header
          className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line"
          style={{ background: 'var(--th-bg)' }}
        >
          {title != null && <h3 className="text-[14px] font-bold truncate">{title}</h3>}
          {action}
        </header>
      )}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--th-bg)' }}>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="font-bold whitespace-nowrap"
                  style={{
                    textAlign: c.align ?? 'left',
                    fontSize: 14,
                    color: 'var(--c-muted)',
                    padding: '9px 12px',
                    borderBottom: '2px solid var(--c-border)',
                  }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted text-center" style={{ padding: '28px 16px', fontSize: 14 }}>
                  {empty ?? '표시할 항목이 없어요.'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  style={{ background: i % 2 === 1 ? 'var(--zebra)' : 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-soft)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = i % 2 === 1 ? 'var(--zebra)' : 'transparent')
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className="truncate"
                      style={{
                        textAlign: c.align ?? 'left',
                        fontSize: 14,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--c-border-s)',
                      }}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

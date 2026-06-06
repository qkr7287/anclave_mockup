import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

// Q4 버튼 — 14px(Q28)·padding 8x16·radius8.
const STYLE: Record<Variant, string> = {
  primary: 'bg-accent text-onaccent border border-transparent',
  outline: 'bg-transparent text-text border border-line',
  ghost: 'bg-transparent text-muted border border-transparent',
  danger: 'border border-transparent',
}

export function Button({ variant = 'primary', children, className = '', ...rest }: ButtonProps) {
  const danger =
    variant === 'danger'
      ? { background: 'var(--danger-soft)', color: 'var(--c-danger)' }
      : undefined
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${STYLE[variant]} ${className}`}
      style={{ padding: '8px 16px', fontSize: 14, ...danger }}
      {...rest}
    >
      {children}
    </button>
  )
}

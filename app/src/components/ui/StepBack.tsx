import { ArrowLeftIcon } from '@heroicons/react/24/solid'
import { Link } from 'react-router-dom'

interface StepBackProps {
  to: string
  label: string
}

// Q29 ← Step 뒤로가기 (전체 → 단일 → GPU 상세) · 상단 좌측.
export function StepBack({ to, label }: StepBackProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-muted hover:text-text transition-colors"
      style={{ fontSize: 14 }}
    >
      <ArrowLeftIcon width={15} height={15} />
      {label}
    </Link>
  )
}

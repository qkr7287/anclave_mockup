import { Badge } from './Badge'
import type { Tone } from './Badge'
import type {
  GpuHealth,
  ServerHealth,
  Severity,
  Status,
} from '../../data/types'

const STATUS: Record<Status, { tone: Tone; label: string }> = {
  pending: { tone: 'warn', label: '대기' },
  approved: { tone: 'ok', label: '승인' },
  rejected: { tone: 'danger', label: '반려' },
}
const HEALTH: Record<ServerHealth, { tone: Tone; label: string }> = {
  normal: { tone: 'ok', label: '정상' },
  warn: { tone: 'warn', label: '경고' },
  danger: { tone: 'danger', label: '장애' },
  inactive: { tone: 'neutral', label: '유휴' },
}
const SEVERITY: Record<Severity, { tone: Tone; label: string }> = {
  critical: { tone: 'danger', label: '위험' },
  warn: { tone: 'warn', label: '경고' },
  info: { tone: 'info', label: '정보' },
  recovered: { tone: 'ok', label: '복구' },
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function HealthBadge({ health }: { health: ServerHealth | GpuHealth }) {
  const s = HEALTH[health]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

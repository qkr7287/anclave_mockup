import { ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { Button } from './Button'

interface CriticalAlertProps {
  open: boolean
  serverName: string
  message: string
  onGo: () => void
  onClose: () => void
}

// Q26 크리티컬 알람 — 정중앙 센터 경고 오버레이(토스트 아님).
export function CriticalAlert({ open, serverName, message, onGo, onClose }: CriticalAlertProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'var(--dim)' }}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="bg-card2 rounded-xl anim-fade text-center"
        style={{
          border: '1px solid var(--c-danger)',
          boxShadow: 'var(--shadow-pop)',
          padding: 18,
          maxWidth: 420,
        }}
      >
        <div
          className="mx-auto flex items-center justify-center"
          style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--danger-soft)', color: 'var(--c-danger)' }}
        >
          <ExclamationTriangleIcon width={28} height={28} />
        </div>
        <div className="font-bold mt-3" style={{ fontSize: 18, color: 'var(--c-danger)' }}>
          {serverName} 위험 경고
        </div>
        <p className="text-muted mt-1.5" style={{ fontSize: 14 }}>
          {message}
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={onGo}>
            해당 서버 이동
          </Button>
        </div>
      </div>
    </div>
  )
}

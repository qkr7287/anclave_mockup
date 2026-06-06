import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LockClosedIcon } from '@heroicons/react/24/solid'
import { useRole } from '../lib/role'
import type { Access } from '../lib/role'
import { EmptyState, Button } from './ui'

interface RequireAccessProps {
  access: Access[]
  children: ReactNode
}

// §9.2 역할 접근 가드 — 직접 URL 진입 시 권한없음 화면(Q12).
export function RequireAccess({ access, children }: RequireAccessProps) {
  const { access: cur } = useRole()
  const navigate = useNavigate()
  if (access.includes(cur)) return <>{children}</>
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
      <EmptyState
        tone="danger"
        icon={<LockClosedIcon width={26} height={26} />}
        title="권한이 없어요"
        description="이 화면은 현재 역할로는 접근할 수 없어요. 관리자에게 권한을 요청하거나 다른 메뉴로 이동해 주세요."
        cta={
          <Button variant="outline" onClick={() => navigate('/marketplace')}>
            마켓플레이스로 이동
          </Button>
        }
      />
    </div>
  )
}

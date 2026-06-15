import type { ComponentType } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { RequireAccess } from './components/RequireAccess'
import { EmptyState, Button } from './components/ui'
import { appRoutes } from './lib/routes'
import { useRole } from './lib/role'

import { Login } from './screens/auth/Login'
import { ResourceMap, ServerDetail, GpuDetail } from './screens/resourcemap'
import { MyResources, RequestStatus } from './screens/dashboard'
import { RequestDetail } from './screens/request-detail'
import { RequestNew } from './screens/request-new'
import { AdminMonitoring } from './screens/monitoring'
import { Requests, GpuChange } from './screens/allocation'
import { ApprovalsPublish, ApprovalsGpu } from './screens/approvals'
import { PublishDetail, PublishView } from './screens/publish-detail'
import { ApprovalDetail } from './screens/approval-detail'
import { ModelCatalog, ModelDetail } from './screens/catalog'
import { ModelRequests } from './screens/model-requests'
import { Marketplace, ServiceDetail } from './screens/market'
import { ApiApprovals } from './screens/activation'
import { ApiRequestNew } from './screens/api-request-new'
import { ApiApprovalDetail } from './screens/api-approval-detail'
import { PublishRequest } from './screens/publish-request'
import { PublishNew } from './screens/publish-new'
import { Events, Notifications } from './screens/events'
import { Board } from './screens/board'
import { AuditLogScreen, AccessControl } from './screens/audit'
import { Capabilities, UsersAdmin, InfraIntegrationScreen } from './screens/system'

// 화면 레지스트리 — routes.ts의 key ↔ 컴포넌트.
const REGISTRY: Record<string, ComponentType> = {
  'resource-map': ResourceMap,
  'resource-map-server': ServerDetail,
  'resource-map-gpu': GpuDetail,
  dashboard: MyResources,
  'requests-status': RequestStatus,
  'requests-status-detail': RequestDetail,
  'requests-new': RequestNew,
  'admin-monitoring': AdminMonitoring,
  requests: Requests,
  'approvals-publish': ApprovalsPublish,
  'publish-detail': PublishDetail,
  'publish-view': PublishView,
  'approvals-gpu': ApprovalsGpu,
  'approvals-gpu-detail': ApprovalDetail,
  'gpu-change': GpuChange,
  models: ModelCatalog,
  'model-detail': ModelDetail,
  'model-requests': ModelRequests,
  marketplace: Marketplace,
  'service-detail': ServiceDetail,
  'api-approvals': ApiApprovals,
  'api-request': ApiRequestNew,
  'api-approval-detail': ApiApprovalDetail,
  'publish-request': PublishRequest,
  'publish-new': PublishNew,
  events: Events,
  notifications: Notifications,
  board: Board,
  audit: AuditLogScreen,
  access: AccessControl,
  caps: Capabilities,
  users: UsersAdmin,
  infra: InfraIntegrationScreen,
}

function HomeRedirect() {
  const { user } = useRole()
  return <Navigate to={user.initialRoute} replace />
}

// 로그인 안 했으면 /login으로. 했으면 셸(사이드바·헤더 + Outlet) 렌더.
function RequireAuth() {
  const { authed } = useRole()
  return authed ? <Shell /> : <Navigate to="/login" replace />
}

function NotFound() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 360 }}>
      <EmptyState
        title="페이지를 찾을 수 없어요"
        description="주소가 올바른지 확인해 주세요."
        cta={
          <Button variant="outline" onClick={() => window.history.back()}>
            뒤로 가기
          </Button>
        }
      />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        {appRoutes.map((r) => {
          const Screen = REGISTRY[r.key]
          return (
            <Route
              key={r.key}
              path={r.path.slice(1)}
              element={
                <RequireAccess access={r.access}>
                  <Screen />
                </RequireAccess>
              }
            />
          )
        })}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

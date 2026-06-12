import type { Access } from './role'

// IA 8 대분류 (시스템정리 §IA / §11 · 사이드바 순서)
export interface IaGroup {
  id: number
  label: string
}
export const IA_GROUPS: IaGroup[] = [
  { id: 1, label: '대시보드 · 관제' },
  { id: 2, label: '할당 관리' },
  { id: 3, label: '모델 관리' },
  { id: 4, label: '마켓플레이스' },
  { id: 5, label: '이벤트 · 알림' },
  { id: 6, label: '게시판' },
  { id: 7, label: '감사 · 보안' },
  { id: 8, label: '시스템 설정' },
]

export interface RouteDef {
  key: string // 화면 식별자 = 컴포넌트 레지스트리 키
  path: string
  screen: string // 4.x 번호
  title: string
  access: Access[] // 진입 가능 역할(가드)
  group?: number // 사이드바 IA 그룹(없으면 상세/서브 라우트)
  menu?: Access[] // 사이드바에 노출되는 역할(없으면 미노출)
  icon?: string // 아이콘 키(Sidebar에서 매핑)
}

// §10 라우팅/페이지 맵 순서 그대로 = IA.xlsx 화면 IA 순서. 28화면(4.1~4.28).
export const ROUTES: RouteDef[] = [
  { key: 'login', path: '/login', screen: '4.1', title: '로그인', access: ['A', 'B', 'C'] },

  // ① 대시보드 · 관제
  { key: 'resource-map', path: '/resource-map', screen: '4.2', title: '전체 서버 현황', access: ['A'], group: 1, menu: ['A'], icon: 'cpu' },
  { key: 'resource-map-server', path: '/resource-map/:serverId', screen: '4.3', title: '단일 서버 현황', access: ['A'] },
  { key: 'resource-map-gpu', path: '/resource-map/:serverId/:gpuId', screen: '4.4', title: 'GPU 상세 현황', access: ['A'] },
  { key: 'dashboard', path: '/dashboard', screen: '4.5', title: '내 할당 자원', access: ['A', 'B', 'C'], group: 1, menu: ['B', 'C'], icon: 'home' },
  { key: 'requests-status', path: '/requests/status', screen: '4.6', title: '자원 신청현황', access: ['A', 'B', 'C'], group: 1, menu: ['B', 'C'], icon: 'clipboard' },
  { key: 'requests-status-detail', path: '/requests/status/:id', screen: '4.6a', title: '신청 상세', access: ['A', 'B', 'C'], group: 1, icon: 'clipboard' },
  { key: 'requests-new', path: '/requests/new', screen: '4.6b', title: '신규 신청', access: ['B', 'C'], group: 1, icon: 'clipboard' },
  { key: 'admin-monitoring', path: '/admin/monitoring', screen: '4.7', title: '관제 모니터링', access: ['A'], group: 1, menu: ['A'], icon: 'chart' },

  // ② 할당 관리
  // 4.8 신청 관리 — 4.6 자원 신청현황(신규 신청 마법사 포함)과 중복 → 사이드바 메뉴 제외(라우트는 유지, 직접 URL 접근 가능).
  { key: 'requests', path: '/requests', screen: '4.8', title: '신청 관리', access: ['A', 'B', 'C'], group: 2, icon: 'doc-plus' },
  // 4.10 GPU 자원 승인 = 할당 관리 '승인 관리'. (게시 승인 4.9는 마켓플레이스 그룹으로 이동 — 아래 ④ 참고)
  { key: 'approvals-gpu', path: '/admin/approvals/gpu', screen: '4.10', title: '승인 관리', access: ['A'], group: 2, menu: ['A'], icon: 'check-badge' },
  { key: 'approvals-gpu-detail', path: '/admin/approvals/gpu/:id', screen: '4.10a', title: '신청 상세 심사', access: ['A'], group: 2, icon: 'check-badge' },
  // 4.11 변경·확장·이전·회수 — 사용자(B=C)는 '자원 신청현황 상세보기'에서 진입(메뉴 제외). 관리자는 메뉴 유지(승인 측).
  { key: 'gpu-change', path: '/requests/gpu-change', screen: '4.11', title: '변경 · 확장 · 이전 · 회수', access: ['A', 'B', 'C'], group: 2, menu: ['A'], icon: 'arrows' },

  // ③ 모델 관리
  { key: 'models', path: '/models', screen: '4.12', title: '모델 카탈로그', access: ['A', 'B', 'C'], group: 3, menu: ['A', 'B', 'C'], icon: 'cube' },
  { key: 'model-detail', path: '/models/:id', screen: '4.13', title: '모델 상세', access: ['A', 'B', 'C'] },
  { key: 'models-new', path: '/admin/models/new', screen: '4.14', title: '신규 모델 반입', access: ['A'], group: 3, menu: ['A'], icon: 'plus-circle' },
  { key: 'agents', path: '/admin/agents', screen: '4.16', title: '데몬 · 에이전트 관리', access: ['A'], group: 3, menu: ['A'], icon: 'server' },

  // ④ 마켓플레이스 — 메뉴 순서: 둘러보기(4.17) → 게시 신청(4.29) → API 신청 관리(4.19) → 게시 승인 관리(4.9, 관리자)
  { key: 'marketplace', path: '/marketplace', screen: '4.17', title: '마켓플레이스', access: ['A', 'B', 'C'], group: 4, menu: ['A', 'B', 'C'], icon: 'bag' },
  { key: 'service-detail', path: '/marketplace/:id', screen: '4.18', title: '서비스 상세', access: ['A', 'B', 'C'] },
  // 4.29 서비스 게시 신청 — 사용자가 자기 배포 서비스를 마켓 게시 신청(→ 4.9 게시 승인). 소유자 액션.
  { key: 'publish-request', path: '/marketplace/publish', screen: '4.29', title: '서비스 게시 신청', access: ['A', 'B', 'C'], group: 4, menu: ['B', 'C'], icon: 'megaphone' },
  // 4.19 API 신청 관리 — 내 마켓 서비스에 온 타인의 API key 신청 관리 + 발급 요약. 소유자(B) 전용.
  { key: 'api-approvals', path: '/api-approvals', screen: '4.19', title: 'API 신청 관리', access: ['A', 'B'], group: 4, menu: ['B'], icon: 'key' },
  // 4.9 게시 승인 관리 — 마켓 게시(서비스 노출) 신청 승인. 관리자(A) 전용. (할당관리→마켓플레이스 그룹으로 이동)
  { key: 'approvals-publish', path: '/admin/approvals/publish', screen: '4.9', title: '게시 승인 관리', access: ['A'], group: 4, menu: ['A'], icon: 'megaphone' },

  // ⑤ 이벤트 · 알림
  { key: 'events', path: '/events', screen: '4.21', title: '에러 · 이벤트 관제', access: ['A', 'B', 'C'], group: 5, menu: ['A', 'B', 'C'], icon: 'alert' },
  { key: 'notifications', path: '/notifications', screen: '4.22', title: '알림 센터', access: ['A', 'B', 'C'], group: 5, menu: ['A', 'B', 'C'], icon: 'bell' },

  // ⑥ 게시판
  { key: 'board', path: '/board', screen: '4.23', title: '게시판 · 공지', access: ['A', 'B', 'C'], group: 6, menu: ['A', 'B', 'C'], icon: 'chat' },

  // ⑦ 감사 · 보안 (A 전용)
  { key: 'audit', path: '/admin/audit', screen: '4.24', title: '감사 로그', access: ['A'], group: 7, menu: ['A'], icon: 'shield' },
  { key: 'access', path: '/admin/access', screen: '4.25', title: '접근통제 · 권한', access: ['A'], group: 7, menu: ['A'], icon: 'lock' },

  // ⑧ 시스템 설정 (A 전용)
  { key: 'caps', path: '/admin/settings/capabilities', screen: '4.26', title: '능력 탐지 · 기능 플래그', access: ['A'], group: 8, menu: ['A'], icon: 'adjust' },
  { key: 'users', path: '/admin/settings/users', screen: '4.27', title: '사용자 · 역할 관리', access: ['A'], group: 8, menu: ['A'], icon: 'users' },
  { key: 'infra', path: '/admin/settings/infra', screen: '4.28', title: '인프라 연동', access: ['A'], group: 8, menu: ['A'], icon: 'link' },
]

// 사이드바: 역할(access)에 맞는 메뉴만, IA 8 그룹으로.
export interface SidebarGroup {
  group: IaGroup
  items: RouteDef[]
}
export function buildSidebar(access: Access): SidebarGroup[] {
  return IA_GROUPS.map((group) => ({
    group,
    items: ROUTES.filter(
      (r) => r.group === group.id && r.menu?.includes(access),
    ),
  })).filter((g) => g.items.length > 0)
}

export const appRoutes = ROUTES.filter((r) => r.key !== 'login')
export const routeByKey = (key: string) => ROUTES.find((r) => r.key === key)

// pathname → RouteDef (동적 세그먼트 :param 매칭). 가장 구체적인(세그먼트 많은) 매치 우선.
function pathMatches(pattern: string, pathname: string): boolean {
  const pa = pattern.split('/').filter(Boolean)
  const pb = pathname.split('/').filter(Boolean)
  if (pa.length !== pb.length) return false
  return pa.every((seg, i) => seg.startsWith(':') || seg === pb[i])
}
export function matchRoute(pathname: string): RouteDef | undefined {
  const matches = ROUTES.filter((r) => pathMatches(r.path, pathname))
  if (matches.length <= 1) return matches[0]
  // 동률이면 정적 세그먼트가 많은 쪽(덜 모호한) 우선
  return matches.sort(
    (a, b) =>
      b.path.split('/').filter((s) => !s.startsWith(':')).length -
      a.path.split('/').filter((s) => !s.startsWith(':')).length,
  )[0]
}

// 드릴다운(상세) 라우트에서도 사이드바 부모 메뉴가 하이라이트되도록 매핑.
const HIGHLIGHT_PARENT: Record<string, string> = {
  'resource-map-server': 'resource-map',
  'resource-map-gpu': 'resource-map',
  'model-detail': 'models',
  'service-detail': 'marketplace',
  'approvals-gpu-detail': 'approvals-gpu',
  'requests-status-detail': 'requests-status',
  'requests-new': 'requests-status',
}
export function sidebarHighlightKey(pathname: string): string | undefined {
  const m = matchRoute(pathname)
  if (!m) return undefined
  return HIGHLIGHT_PARENT[m.key] ?? m.key
}

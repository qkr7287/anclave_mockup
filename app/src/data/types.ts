// §13 더미 데이터 스키마 — 정본 Anclave-시스템정리 §13 기준.
// enum 금지(erasableSyntaxOnly) → union 타입으로.

export type Role = 'admin' | 'user'
export type Status = 'pending' | 'approved' | 'rejected'
export type GpuHealth = 'normal' | 'danger' | 'inactive' // 🟢 / 🔴 / ⚪
export type ServerHealth = 'normal' | 'warn' | 'danger' | 'inactive' // 🟢 / 🟡 / 🔴 / ⚪
export type AllocMode = 'cluster' | 'mig'
export type Severity = 'critical' | 'warn' | 'info' | 'recovered'
export type EventStatus = 'open' | 'resolved'
export type NotiCategory = 'alloc' | 'health' | 'reclaim'
export type ChangeType = 'migrate' | 'change' | 'expand' | 'reclaim'
export type ModelKind =
  | 'LLM'
  | 'Code'
  | 'Vision-Language'
  | 'Image'
  | 'STT'
  | 'Embedding'

export interface User {
  id: string
  username: string // 'admin' | 'manager' | 'user' | 그 외 표시명용 슬러그
  name: string
  role: Role
  email: string
  hasHosting: boolean
  initialRoute: string
  department?: string // 조직도 소속(대표이사·기술개발본부 등)
}

export interface Model {
  id: string
  name: string
  kind: ModelKind
  description: string
  usageGuide?: string // 사용법(호출 방법·예시) — 없으면 모델명 기반 자동 생성으로 폴백
  addons: string[]
  license: string
  recommendedGpu: string
  params: string
  usageRank: number
  usageCount: number
  // 모델별 권장 자원 요건(4.10a 심사 "자원 제한" 추천 기준) — GB·코어 단위.
  // recommendedGpu·params 와 모순 없게(예: H100 ×4 → reqVramGb≈320). MoE(m3)는 실제 배치 기준.
  reqVramGb: number
  reqRamGb: number
  reqStorageGb: number
  reqCpuCores: number
}

export interface Service {
  id: string
  name: string
  kind: string
  hasApi: boolean
  model: string // modelId
  serviceUrl: string
  testUrl: string
  description: string
  manualUrl?: string
  ownerUserId: string
  deployerUserId?: string // 올린 사용자(4.3 올라간 서비스) — 기본 ownerUserId
  tags: string[]
  usageCount: number
  usageRank: number
}

// MIG 프로필 — units(컴퓨트 슬라이스, GPU당 최대 7) + gb(메모리). H100 80GB / GB300(Blackwell) 288GB.
export type MigProfile =
  | '1g.10gb' | '1g.20gb' | '2g.20gb' | '3g.40gb' | '4g.40gb' | '7g.80gb'
  | '1g.36gb' | '2g.72gb' | '3g.144gb' | '4g.144gb' | '7g.288gb'
  | '1g.16gb' | '2g.45gb' | '3g.90gb'
export const MIG_PROFILES: Record<MigProfile, { units: number; gb: number }> = {
  '1g.10gb': { units: 1, gb: 10 },
  '1g.20gb': { units: 1, gb: 20 },
  '2g.20gb': { units: 2, gb: 20 },
  '3g.40gb': { units: 3, gb: 40 },
  '4g.40gb': { units: 4, gb: 40 },
  '7g.80gb': { units: 7, gb: 80 },
  // GB300 NVL72(Blackwell · 288GB) MIG 프로필
  '1g.36gb': { units: 1, gb: 36 },
  '2g.72gb': { units: 2, gb: 72 },
  '3g.144gb': { units: 3, gb: 144 },
  '4g.144gb': { units: 4, gb: 144 },
  '7g.288gb': { units: 7, gb: 288 },
  // RTX PRO 4500 Blackwell(32GB) — 16GB 인스턴스 2개
  '1g.16gb': { units: 1, gb: 16 },
  // RTX PRO 4500 Blackwell MIG(목업 가정값 — 물리 용량 초과는 의도)
  '2g.45gb': { units: 2, gb: 45 },
  '3g.90gb': { units: 3, gb: 90 },
}

export interface MigSlice {
  id: string
  profile: MigProfile
  units: number // 컴퓨트 슬라이스(프로필대로)
  gb: number // 메모리 GB(프로필대로)
  usage: number // 사용률 %
  vramUtil: number
  ownerUserId?: string
  modelId?: string
  containerId?: string
  health?: ServerHealth // 4.3 슬라이스 색(헬스 스펙트럼)
  requestId?: string // gpuRequests 연결 — 4.3 호버(신청명·사용자)
}

export interface GpuActivity {
  time: string
  type: string
  message: string
}

export interface Gpu {
  id: string
  name: string // 표시명 = GPU 모델(예: 'RTX 2060 SUPER', 'GB300 NVL72')
  model: string // GPU 모델명
  arch: string // 아키텍처(Turing·Ampere·Pascal·Blackwell 등)
  vramGb: number // VRAM 용량(GB)
  migCapable: boolean // MIG 분할 지원 여부(데이터센터 GPU만 true)
  serial: string
  smUtil: number
  vramUtil: number
  temp: number
  power: number
  health: GpuHealth
  allocMode: AllocMode // 'mig'(슬라이스 분할) | 'cluster'(GPU 통째 할당)
  assignedUserId?: string
  assignedServiceId?: string
  interconnect?: string
  xid?: string // 장애(XID) 코드
  slices?: MigSlice[]
  recentActivities?: GpuActivity[]
}

export interface GpuServer {
  id: string
  name: string
  rack: string
  host: string
  temp: number
  network: string
  cpuUtil: number
  memUtil: number
  health: ServerHealth
  note: string
  hostedServiceIds: string[]
  hostedUserIds: string[]
  gpus: Gpu[]
}

export interface ApiRequest {
  id: string
  requesterUserId: string
  serviceId: string
  model: string
  targetServiceUrl: string
  status: Status
  apiKey?: string
  rejectReason?: string
  createdAt: string
}

export interface GpuRequest {
  id: string
  requesterUserId: string
  capacity: number
  capacityUnit: 'card' | 'slice'
  models: string[]
  env: string
  addons: string[]
  serviceName: string
  purpose: string
  attachmentUrl?: string
  status: Status
  rejectReason?: string
  createdAt: string
  // 신청 상세·심사 페이지(4.6a/4.10a) 확장 — 기존 데이터 호환 위해 전부 optional
  period?: '1개월' | '3개월' | '6개월' | '무기한'
  priority?: 'low' | 'normal' | 'high'
  adminMemo?: string // 관리자 처리 메모(신청자에게 표시)
  processedAt?: string
  processedBy?: string // 처리자 userId
  allocatedServerId?: string // 승인 시 할당 자원
  allocatedGpuId?: string
  allocatedSliceId?: string
  // 승인 시 관리자가 확정한 자원 제한(4.10a 조회 모드 표시) — GB·코어. VRAM 은 할당 GPU 로 결정.
  allocatedRamGb?: number
  allocatedStorageGb?: number
  allocatedCpuCores?: number
}

export interface GpuChangeRequest {
  id: string
  requesterUserId: string
  type: ChangeType
  reason: string
  status: Status
  rejectReason?: string
  createdAt: string
}

export interface PublishRequest {
  id: string
  requesterUserId: string
  serviceName: string
  serviceUrl: string
  demoUrl: string
  meta: string
  status: Status
  rejectReason?: string
  createdAt: string
}

export interface ApiKeyUsage {
  keyId: string
  serviceId: string
  calls: number[]
  connections: number
}

export interface EventLog {
  id: string
  severity: Severity
  status: EventStatus
  gpuId?: string
  serverId?: string
  message: string
  createdAt: string
  read: boolean
  assignee?: string
  action?: string
  resolution?: string
}

export interface Notification {
  id: string
  category: NotiCategory
  message: string
  createdAt: string
  read: boolean
  link?: string
}

// 4.14 모델 신청 진행 단계. 카탈로그는 'deployed'(Model 등록)만 노출,
// 그 외(미배포)는 모델 신청 관리 테이블에만 보인다.
export type ModelStage =
  | 'requested' // 신청됨 — 관리자 검토/반입 전
  | 'scanning' // 반입 파일 보안 점검 중(서버 비동기)
  | 'scanned' // 점검 완료 — 명세 작성/등록 대기
  | 'deployed' // 카탈로그(+마켓) 등록 완료 = 배포
  | 'rejected' // 반려

// 4.14 모델 신청 관리 — 사용자는 등록 신청만, 관리자가 반입·보안점검·등록.
// 한 엔티티에 신청 단계 + 관리자 처리(반입) 단계를 함께 담는다(GpuRequest 패턴).
export interface ModelRequest {
  id: string
  // 신청 단계 (사용자 B/C)
  requesterUserId: string
  modelName: string // 요청 모델명(예: 'Qwen2.5-72B')
  kind?: ModelKind // 모델 종류(선택)
  source?: string // 출처(HuggingFace URL 등, 선택)
  // 신청 명세 → 반입 시 카탈로그 Model 로 매핑(전부 optional, 기존 데이터 호환)
  description?: string // 모델 소개
  usageGuide?: string // 사용법(호출 방법·예시)
  license?: string // 라이선스
  addons?: string[] // 태그/애드온
  reason: string // 신청 사유
  status: Status // 큰 분류(대기/승인/반려) — 필터·배지용
  stage: ModelStage // 세부 진행 단계
  createdAt: string
  rejectReason?: string
  // 관리자 처리(반입) 단계 — 승인 진행 시 채워짐
  processedAt?: string
  processedBy?: string
  fileName?: string // 반입 파일명
  format?: 'safetensors' | 'other'
  scan?: 'pass' | 'fail' | 'pending' // 보안 점검 결과
  checksum?: string
  registeredModelId?: string // 등록 완료된 카탈로그 모델 id
}

export interface ActivationStat {
  serviceId: string
  modelId: string
  consumerUserId: string
  tokens: number
  calls: number
  period: string
}

export interface AuditLog {
  id: string
  actorUserId: string
  action: string
  target: string
  ip?: string
  createdAt: string
}

export interface BoardPost {
  id: string
  tab: 'notice' | 'qna' | 'manual'
  title: string
  body: string
  authorId: string
  answered: boolean
  createdAt: string
}

export interface AccessPolicy {
  id: string
  role: Role
  resource: string
  allow: boolean
}

export interface Capability {
  gpuGen: string
  migSupported: boolean
  orchestrator: string
  enabledFeatures: string[]
}

export interface InfraIntegration {
  id: string
  kind: 'dcgm' | 'prometheus' | 'metrics' | 'orchestrator'
  name: string
  endpoint: string
  status: 'connected' | 'down'
}

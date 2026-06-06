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
}

export interface Model {
  id: string
  name: string
  kind: ModelKind
  description: string
  addons: string[]
  license: string
  recommendedGpu: string
  params: string
  usageRank: number
  usageCount: number
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
  tags: string[]
  usageCount: number
  usageRank: number
}

export interface MigSlice {
  id: string
  profile: string // '1g' | '2g' | '3g' | '7g'
  units: number // MIG 단위(H100 = 7)
  usage: number // 사용률 %
  vramUtil: number
  ownerUserId?: string
  modelId?: string
  containerId?: string
}

export interface GpuActivity {
  time: string
  type: string
  message: string
}

export interface Gpu {
  id: string
  name: string
  serial: string
  smUtil: number
  vramUtil: number
  temp: number
  power: number
  health: GpuHealth
  allocMode: AllocMode
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

export interface ModelImport {
  id: string
  fileName: string
  format: 'safetensors' | 'other'
  scan: 'pass' | 'fail' | 'pending'
  checksum: string
  status: Status
  createdAt: string
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

export interface Agent {
  id: string
  nodeId: string
  serverId: string
  version: string
  status: 'active' | 'stale' | 'down'
  deployedAt: string
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
